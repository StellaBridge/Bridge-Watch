import React, { type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import {
  calculateTrendPercentageChange,
  useAnomalyTrends,
  type AnomalyEvent,
} from "./useAnomalyTrends";

function createWrapper(client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})) {
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

function event(id: string, daysAgo: number, severity: AnomalyEvent["severity"] = "high"): AnomalyEvent {
  const timestamp = new Date();
  timestamp.setDate(timestamp.getDate() - daysAgo);
  return {
    id,
    assetCode: id === "three" ? "XLM" : "USDC",
    bridgeName: "Stellar",
    anomalyType: "price_deviation",
    severity,
    detected: true,
    suppressed: false,
    detectedAt: timestamp.toISOString(),
  };
}

describe("useAnomalyTrends (#1499)", () => {
  it("builds daily buckets for 24-hour, 7-day, and 30-day windows", async () => {
    const records = [event("one", 0), event("two", 5, "low"), event("three", 20, "critical")];
    server.use(http.get("/api/v1/anomaly-detection/events", () =>
      HttpResponse.json({ events: records })));

    for (const days of [1, 7, 30]) {
      const { result, unmount } = renderHook(() => useAnomalyTrends({ days }), {
        wrapper: createWrapper(),
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const data = result.current.data!;
      expect(data.trendPoints).toHaveLength(days);
      expect(data.trendPoints.reduce((sum, point) => sum + point.total, 0))
        .toBe(days === 1 ? 1 : days === 7 ? 2 : 3);
      expect(data.trendPoints.at(-1)?.high).toBe(1);
      unmount();
    }
  });

  it("groups totals by asset and severity without losing empty days", async () => {
    server.use(http.get("/api/v1/anomaly-detection/events", () =>
      HttpResponse.json({ events: [event("one", 0), event("two", 0, "low"), event("three", 0, "critical")] })));

    const { result } = renderHook(() => useAnomalyTrends({ days: 7, assetCode: "USDC" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.totalEvents).toBe(3);
    expect(result.current.data?.bySeverity).toEqual({ low: 1, medium: 0, high: 1, critical: 1 });
    expect(result.current.data?.byAsset).toEqual({ USDC: 2, XLM: 1 });
    expect(result.current.data?.trendPoints.filter(point => point.total === 0)).toHaveLength(6);
  });

  it("handles percentage changes including a zero baseline safely", () => {
    expect(calculateTrendPercentageChange(0, 0)).toBe(0);
    expect(calculateTrendPercentageChange(7, 0)).toBe(100);
    expect(calculateTrendPercentageChange(30, 20)).toBe(50);
    expect(calculateTrendPercentageChange(10, 20)).toBe(-50);
  });

  it("provides an aggregate change comparing halves of the chosen window", async () => {
    server.use(http.get("/api/v1/anomaly-detection/events", () =>
      HttpResponse.json({ events: [event("one", 5), event("two", 0), event("three", 0)] })));
    const { result } = renderHook(() => useAnomalyTrends({ days: 7 }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.percentageChange).toBe(100);
  });

  it("shows loading then surfaces an API failure", async () => {
    server.use(http.get("/api/v1/anomaly-detection/events", () =>
      HttpResponse.json({ error: "unavailable" }, { status: 503 })));
    const { result } = renderHook(() => useAnomalyTrends(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Failed to fetch anomaly events");
  });

  it("reuses cached trend results for the same query key", async () => {
    let requests = 0;
    server.use(http.get("/api/v1/anomaly-detection/events", () => {
      requests += 1;
      return HttpResponse.json({ events: [event("one", 0)] });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = createWrapper(client);
    const first = renderHook(() => useAnomalyTrends({ days: 7 }), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useAnomalyTrends({ days: 7 }), { wrapper });
    expect(second.result.current.data).toEqual(first.result.current.data);
    expect(requests).toBe(1);
    first.unmount();
    second.unmount();
    client.clear();
  });
});
