/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAnalytics, periodToDays, generateDailySeries } from "./useAnalytics";
import { getAssetsWithHealth, getBridges, getBridgeStats } from "../services/api";

vi.mock("../services/api", () => ({
  getAssetsWithHealth: vi.fn(),
  getBridges: vi.fn(),
  getBridgeStats: vi.fn(),
}));

const mockAssets = vi.mocked(getAssetsWithHealth);
const mockBridges = vi.mocked(getBridges);
const mockStats = vi.mocked(getBridgeStats);

const assets = [
  { symbol: "USDC", health: { overallScore: 90 } },
  { symbol: "EURC", health: { overallScore: 60 } },
  { symbol: "PYUSD", health: { overallScore: 30 } },
  { symbol: "XLM", health: null },
] as any;

const bridges = {
  bridges: [
    { name: "Circle", status: "healthy", totalValueLocked: 1_000_000, mismatchPercentage: 0.1 },
    { name: "Wormhole", status: "degraded", totalValueLocked: 500_000, mismatchPercentage: 1.2 },
  ],
} as any;

const statsByBridge: Record<string, any> = {
  Circle: { volume24h: 100, volume7d: 700, volume30d: 3000, uptime30d: 99.9 },
  Wormhole: { volume24h: 50, volume7d: 350, volume30d: 1500, uptime30d: 98.5 },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("periodToDays", () => {
  it("maps each period to its number of days", () => {
    expect(periodToDays("7D")).toBe(7);
    expect(periodToDays("30D")).toBe(30);
    expect(periodToDays("90D")).toBe(90);
  });
});

describe("generateDailySeries", () => {
  it("returns one point per day ending at the current value", () => {
    const series = generateDailySeries(75, 7, "USDC");

    expect(series).toHaveLength(7);
    expect(series[6].value).toBe(75);
  });

  it("is deterministic for the same seed", () => {
    expect(generateDailySeries(75, 30, "USDC")).toEqual(generateDailySeries(75, 30, "USDC"));
  });

  it("clamps values to the 0-100 range", () => {
    const series = generateDailySeries(99, 90, "EDGE", 50);

    for (const point of series) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });
});

describe("useAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssets.mockResolvedValue(assets);
    mockBridges.mockResolvedValue(bridges);
    mockStats.mockImplementation(async (name: string) => statsByBridge[name]);
  });

  it("defaults to a 30D period with month-over-month comparison", () => {
    const { result } = renderHook(() => useAnalytics(), { wrapper: createWrapper() });

    expect(result.current.period).toBe("30D");
    expect(result.current.comparisonMode).toBe("mom");
    expect(result.current.isLoading).toBe(true);
  });

  it("aggregates bridge totals from bridges and per-bridge stats", async () => {
    const { result } = renderHook(() => useAnalytics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.totalVolume24h).toBe(150));

    expect(mockStats).toHaveBeenCalledWith("Circle");
    expect(mockStats).toHaveBeenCalledWith("Wormhole");
    expect(result.current.totalBridges).toBe(2);
    expect(result.current.totalTVL).toBe(1_500_000);
    expect(result.current.totalVolume7d).toBe(1050);
    expect(result.current.bridgeData[1]).toMatchObject({
      name: "Wormhole",
      status: "degraded",
      uptime30d: 98.5,
    });
  });

  it("computes average health and health distribution from scored assets", async () => {
    const { result } = renderHook(() => useAnalytics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalAssets).toBe(4);
    expect(result.current.avgHealthScore).toBe(60);
    expect(result.current.healthDistribution.map((d) => [d.name, d.value])).toEqual([
      ["Healthy", 1],
      ["Warning", 1],
      ["Critical", 1],
    ]);
  });

  it("sorts top movers by absolute change and skips unscored assets", async () => {
    const { result } = renderHook(() => useAnalytics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const movers = result.current.topMovers;
    expect(movers.map((m) => m.symbol)).not.toContain("XLM");
    expect(movers).toHaveLength(3);
    for (let i = 1; i < movers.length; i++) {
      expect(Math.abs(movers[i - 1].change)).toBeGreaterThanOrEqual(Math.abs(movers[i].change));
    }
  });

  it("resizes the time series when the period changes", async () => {
    const { result } = renderHook(() => useAnalytics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.healthTimeSeries).toHaveLength(30);

    act(() => result.current.setPeriod("7D"));

    expect(result.current.period).toBe("7D");
    expect(result.current.healthTimeSeries).toHaveLength(7);
    expect(result.current.volumeTimeSeries).toHaveLength(7);
    expect(Object.keys(result.current.healthTimeSeries[0])).toEqual(
      expect.arrayContaining(["date", "USDC", "EURC", "PYUSD"]),
    );
  });

  it("updates the comparison mode", () => {
    const { result } = renderHook(() => useAnalytics(), { wrapper: createWrapper() });

    act(() => result.current.setComparisonMode("wow"));

    expect(result.current.comparisonMode).toBe("wow");
  });

  it("returns empty-state values when the APIs return no data", async () => {
    mockAssets.mockResolvedValue([]);
    mockBridges.mockResolvedValue({ bridges: [] } as any);

    const { result } = renderHook(() => useAnalytics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.avgHealthScore).toBeNull();
    expect(result.current.totalTVL).toBe(0);
    expect(result.current.bridgeData).toEqual([]);
    expect(result.current.healthDistribution).toEqual([]);
    expect(result.current.healthTimeSeries).toEqual([]);
    expect(result.current.volumeTimeSeries).toEqual([]);
    expect(mockStats).not.toHaveBeenCalled();
  });
});
