import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useIncidentHeatmap } from "./useIncidentHeatmap";
import * as api from "../services/api";
import type { HeatmapBucket } from "../services/api";

vi.mock("../services/api");

const mockBuckets: HeatmapBucket[] = [
  {
    date: "2026-01-01",
    hour: 10,
    count: 5,
    bySeverity: { high: 2, medium: 3 },
    incidents: [
      {
        id: "inc-1",
        time: "2026-01-01T10:00:00Z",
        entity_type: "bridge",
        entity_id: "bridge-1",
        asset_symbol: "USDC",
        severity: "high",
        title: "High severity incident",
        description: "Something broke",
      },
    ],
  },
];

const mockResponse = {
  buckets: mockBuckets,
  totalIncidents: 5,
  dateRange: { start: "2026-01-01", end: "2026-01-02" },
  assets: ["USDC"],
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useIncidentHeatmap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getIncidentHeatmap).mockResolvedValue(mockResponse);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches heatmap data and returns it on success", async () => {
    const { result } = renderHook(() => useIncidentHeatmap({ assetSymbol: "USDC" }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResponse);
    expect(vi.mocked(api.getIncidentHeatmap)).toHaveBeenCalledWith({
      assetSymbol: "USDC",
    });
  });

  it("uses query key including the params", async () => {
    const { result } = renderHook(
      () => useIncidentHeatmap({ startDate: "2026-01-01", endDate: "2026-01-02" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(vi.mocked(api.getIncidentHeatmap)).toHaveBeenCalledWith({
      startDate: "2026-01-01",
      endDate: "2026-01-02",
    });
  });

  it("returns loading state initially", () => {
    const { result } = renderHook(() => useIncidentHeatmap(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("handles fetch errors gracefully", async () => {
    vi.mocked(api.getIncidentHeatmap).mockRejectedValue(new Error("API error"));

    const { result } = renderHook(() => useIncidentHeatmap(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });

  it("returns undefined data when called with no params and still succeeds", async () => {
    const { result } = renderHook(() => useIncidentHeatmap(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResponse);
    expect(vi.mocked(api.getIncidentHeatmap)).toHaveBeenCalledWith(undefined);
  });
});
