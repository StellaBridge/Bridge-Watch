/**
 * Unit tests for `useBridgeHealthTimeline` (#1501).
 *
 * The hook powers the bridge health chart: it fetches a time-series of health
 * scores for a bridge over a selectable period and exposes the processed
 * points that the chart renders.
 *
 * Covered behaviour:
 *  - time-range (period) changes re-query the API
 *  - bucket aggregation for the different time ranges
 *  - empty time windows do not blow up the chart
 *  - the processed timeline is memoized between renders
 */
import React, { type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import {
  useBridgeHealthTimeline,
  type HealthPeriod,
} from "./useBridgeHealthTimeline";

/** Bucket size (ms) the hook uses when it aggregates a period into points. */
const PERIOD_BUCKETS: Record<HealthPeriod, { steps: number; stepMs: number }> = {
  "24h": { steps: 24, stepMs: 60 * 60 * 1000 },
  "7d": { steps: 42, stepMs: 4 * 60 * 60 * 1000 },
  "30d": { steps: 30, stepMs: 24 * 60 * 60 * 1000 },
};

function createWrapper(client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function healthHandler(
  points: Array<{ timestamp: string; score: number; annotation?: string }>,
  onRequest?: (url: URL) => void
) {
  return http.get("/api/v1/bridges/:bridgeName/health/history", ({ request }) => {
    const url = new URL(request.url);
    onRequest?.(url);
    return HttpResponse.json({
      bridge: url.pathname.split("/").at(-3),
      period: url.searchParams.get("period"),
      points,
    });
  });
}

function serverPoint(score: number, minutesAgo: number) {
  return {
    timestamp: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
    score,
  };
}

describe("useBridgeHealthTimeline", () => {
  it("requests the health history for the selected bridge and period", async () => {
    const points = [serverPoint(91, 10), serverPoint(88, 5), serverPoint(84, 0)];
    const requested: URL[] = [];
    server.use(healthHandler(points, (url) => requested.push(url)));

    const { result } = renderHook(() => useBridgeHealthTimeline("Stellar Bridge"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(requested).toHaveLength(1);
    expect(requested[0].pathname).toBe("/api/v1/bridges/Stellar%20Bridge/health/history");
    expect(requested[0].searchParams.get("period")).toBe("7d");
    expect(result.current.points).toEqual(points);
    expect(result.current.isMockData).toBe(false);
  });

  it("re-queries the API when the time range changes", async () => {
    const requested: URL[] = [];
    server.use(
      healthHandler([serverPoint(70, 0)], (url) => {
        requested.push(url);
      })
    );

    const { result, rerender } = renderHook(
      ({ period }: { period: HealthPeriod }) =>
        useBridgeHealthTimeline("Stellar Bridge", period),
      { wrapper: createWrapper(), initialProps: { period: "24h" as HealthPeriod } }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requested[0].searchParams.get("period")).toBe("24h");

    rerender({ period: "30d" });

    await waitFor(() => expect(requested).toHaveLength(2));
    expect(requested[1].searchParams.get("period")).toBe("30d");
    expect(result.current.isSuccess).toBe(true);
  });

  it("keeps separate cache entries per bridge so switching bridges re-queries", async () => {
    const requested: string[] = [];
    server.use(
      http.get("/api/v1/bridges/:bridgeName/health/history", ({ params, request }) => {
        const url = new URL(request.url);
        requested.push(`${params.bridgeName}:${url.searchParams.get("period")}`);
        return HttpResponse.json({
          bridge: params.bridgeName,
          period: url.searchParams.get("period"),
          points: [serverPoint(80, 0)],
        });
      })
    );

    const { result, rerender } = renderHook(
      ({ bridgeName }: { bridgeName: string }) => useBridgeHealthTimeline(bridgeName),
      { wrapper: createWrapper(), initialProps: { bridgeName: "Stellar Bridge" } }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ bridgeName: "Stellar Classic" });
    await waitFor(() => expect(requested).toHaveLength(2));

    expect(requested).toEqual(["Stellar Bridge:7d", "Stellar Classic:7d"]);
  });

  it("uses period-sized buckets for fallback data", async () => {
    server.use(
      http.get("/api/v1/bridges/:bridgeName/health/history", () => HttpResponse.json(null))
    );

    for (const period of ["24h", "7d", "30d"] as HealthPeriod[]) {
      const { result, unmount } = renderHook(
        ({ p }: { p: HealthPeriod }) => useBridgeHealthTimeline("Stellar Bridge", p),
        { wrapper: createWrapper(), initialProps: { p: period } }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const { steps, stepMs } = PERIOD_BUCKETS[period];
      const points = result.current.points;

      // One point per bucket plus the anchor point at the start of the window.
      expect(points).toHaveLength(steps + 1);
      expect(result.current.isMockData).toBe(true);

      // Every consecutive pair of points is exactly one bucket apart, so the
      // chart never renders overlapping or gapped buckets.
      for (let index = 1; index < points.length; index += 1) {
        const previous = new Date(points[index - 1].timestamp).getTime();
        const current = new Date(points[index].timestamp).getTime();
        expect(current - previous).toBe(stepMs);
      }

      // Scores stay inside the 0-100 health range so charts cannot overflow.
      for (const point of points) {
        expect(point.score).toBeGreaterThanOrEqual(0);
        expect(point.score).toBeLessThanOrEqual(100);
      }

      unmount();
    }
  });

  it("preserves API aggregation granularity instead of re-bucketing points", async () => {
    const fiveMinutePoints = [serverPoint(90, 10), serverPoint(85, 5), serverPoint(80, 0)];
    server.use(healthHandler(fiveMinutePoints));

    const { result } = renderHook(
      () => useBridgeHealthTimeline("Stellar Bridge", "24h"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.points).toEqual(fiveMinutePoints);
    expect(
      new Date(result.current.points[1].timestamp).getTime() -
        new Date(result.current.points[0].timestamp).getTime()
    ).toBe(5 * 60 * 1000);
    expect(result.current.isMockData).toBe(false);
  });

  it("uses the server-side aggregation when the API returns points", async () => {
    const points = [serverPoint(95, 30), serverPoint(90, 15), serverPoint(85, 0)];
    server.use(healthHandler(points));

    const { result } = renderHook(
      () => useBridgeHealthTimeline("Stellar Bridge", "24h"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The API already buckets the series, so the hook must not re-bucket it.
    expect(result.current.points).toEqual(points);
    expect(result.current.points).toHaveLength(3);
    expect(result.current.isMockData).toBe(false);
  });

  it("returns an empty timeline for an empty time window without erroring", async () => {
    server.use(healthHandler([]));

    const { result } = renderHook(() => useBridgeHealthTimeline("Stellar Bridge", "24h"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.points).toEqual([]);
    expect(result.current.isMockData).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("returns no points when the bridge name is empty", () => {
    const { result } = renderHook(() => useBridgeHealthTimeline("", "24h"), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.points).toEqual([]);
    expect(result.current.isMockData).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("memoizes the processed timeline between renders", async () => {
    server.use(healthHandler([serverPoint(77, 0)]));

    const { result, rerender } = renderHook(() => useBridgeHealthTimeline("Stellar Bridge"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const firstPoints = result.current.points;
    const firstData = result.current.data;

    rerender();
    rerender();

    // Same references => the chart does not re-process (and re-animate) the
    // timeline on every unrelated re-render.
    expect(result.current.points).toBe(firstPoints);
    expect(result.current.data).toBe(firstData);
  });

  it("surfaces an API failure instead of silently showing mock data", async () => {
    server.use(
      http.get("/api/v1/bridges/:bridgeName/health/history", () =>
        HttpResponse.json({ error: "unavailable" }, { status: 503 })
      )
    );

    const { result } = renderHook(() => useBridgeHealthTimeline("Stellar Bridge"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain("503");
  });
});
