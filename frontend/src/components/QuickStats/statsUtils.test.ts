import { describe, it, expect } from "vitest";
import { computeStats, formatTVL, getHealthLabel } from "./statsUtils";
import type { AssetData, BridgeData } from "./types";

const mockAssets: AssetData[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    health: {
      overallScore: 92,
      factors: { liquidityDepth: 90, priceStability: 95, bridgeUptime: 88, reserveBacking: 94, volumeTrend: 93 },
      trend: "improving",
      lastUpdated: "2024-03-29T12:00:00Z",
    },
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    health: {
      overallScore: 65,
      factors: { liquidityDepth: 60, priceStability: 70, bridgeUptime: 75, reserveBacking: 55, volumeTrend: 65 },
      trend: "stable",
      lastUpdated: "2024-03-29T12:00:00Z",
    },
  },
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    health: {
      overallScore: 40,
      factors: { liquidityDepth: 35, priceStability: 45, bridgeUptime: 50, reserveBacking: 30, volumeTrend: 40 },
      trend: "deteriorating",
      lastUpdated: "2024-03-29T12:00:00Z",
    },
  },
  {
    symbol: "PYUSD",
    name: "PayPal USD",
    health: null,
  },
];

const mockBridges: BridgeData[] = [
  { name: "Circle", status: "healthy", totalValueLocked: 500_000_000, supplyOnStellar: 400_000_000, supplyOnSource: 400_000_000, mismatchPercentage: 0 },
  { name: "Wormhole", status: "degraded", totalValueLocked: 200_000_000, supplyOnStellar: 180_000_000, supplyOnSource: 190_000_000, mismatchPercentage: 5.26 },
  { name: "OldBridge", status: "down", totalValueLocked: 10_000, supplyOnStellar: 0, supplyOnSource: 10_000, mismatchPercentage: 100 },
];

describe("formatTVL", () => {
  it("formats billions", () => {
    expect(formatTVL(1_500_000_000)).toBe("$1.50B");
  });

  it("formats millions", () => {
    expect(formatTVL(250_000_000)).toBe("$250.00M");
  });

  it("formats thousands", () => {
    expect(formatTVL(45_000)).toBe("$45.00K");
  });

  it("formats small numbers", () => {
    expect(formatTVL(123.45)).toBe("$123.45");
  });

  it("formats zero", () => {
    expect(formatTVL(0)).toBe("$0.00");
  });
});

describe("getHealthLabel", () => {
  it("returns healthy for score >= 80", () => {
    expect(getHealthLabel(80)).toBe("healthy");
    expect(getHealthLabel(100)).toBe("healthy");
  });

  it("returns warning for score >= 50 and < 80", () => {
    expect(getHealthLabel(50)).toBe("warning");
    expect(getHealthLabel(79)).toBe("warning");
  });

  it("returns critical for score < 50", () => {
    expect(getHealthLabel(49)).toBe("critical");
    expect(getHealthLabel(0)).toBe("critical");
  });
});

describe("computeStats", () => {
  it("computes correct number of stats", () => {
    const stats = computeStats(mockAssets, mockBridges);
    expect(stats).toHaveLength(6);
  });

  it("computes total TVL", () => {
    const stats = computeStats(mockAssets, mockBridges);
    const tvlStat = stats.find((s) => s.id === "tvl");
    expect(tvlStat).toBeDefined();
    // 500M + 200M + 10K = 700.01M
    expect(tvlStat!.value).toBe("$700.01M");
  });

  it("counts active assets (with health data)", () => {
    const stats = computeStats(mockAssets, mockBridges);
    const assetStat = stats.find((s) => s.id === "assets");
    expect(assetStat).toBeDefined();
    expect(assetStat!.value).toBe("3"); // PYUSD has null health
  });

  it("counts active bridges (not down)", () => {
    const stats = computeStats(mockAssets, mockBridges);
    const bridgeStat = stats.find((s) => s.id === "bridges");
    expect(bridgeStat).toBeDefined();
    expect(bridgeStat!.value).toBe("2 / 3");
  });

  it("computes average health score", () => {
    const stats = computeStats(mockAssets, mockBridges);
    const healthStat = stats.find((s) => s.id === "health");
    expect(healthStat).toBeDefined();
    // (92 + 65 + 40) / 3 = 65.67 → 66%
    expect(healthStat!.value).toBe("66%");
    expect(healthStat!.status).toBe("warning");
  });

  it("computes trend summary", () => {
    const stats = computeStats(mockAssets, mockBridges);
    const trendStat = stats.find((s) => s.id === "trend");
    expect(trendStat).toBeDefined();
    expect(trendStat!.value).toContain("1↑");
    expect(trendStat!.value).toContain("1↓");
  });

  it("counts bridges at risk", () => {
    const stats = computeStats(mockAssets, mockBridges);
    const alertStat = stats.find((s) => s.id === "alerts");
    expect(alertStat).toBeDefined();
    expect(alertStat!.value).toBe("2"); // degraded + down
    expect(alertStat!.status).toBe("critical");
  });

  it("handles empty data", () => {
    const stats = computeStats([], []);
    const tvlStat = stats.find((s) => s.id === "tvl");
    expect(tvlStat!.value).toBe("$0.00");
    const healthStat = stats.find((s) => s.id === "health");
    expect(healthStat!.value).toBe("0%");
  });

  it("handles all healthy bridges", () => {
    const healthyBridges: BridgeData[] = [
      { name: "BridgeA", status: "healthy", totalValueLocked: 100, supplyOnStellar: 100, supplyOnSource: 100, mismatchPercentage: 0 },
    ];
    const stats = computeStats([], healthyBridges);
    const alertStat = stats.find((s) => s.id === "alerts");
    expect(alertStat!.value).toBe("0");
    expect(alertStat!.status).toBe("healthy");
  });

  it("provides navigation hrefs for drill-down", () => {
    const stats = computeStats(mockAssets, mockBridges);
    const tvlStat = stats.find((s) => s.id === "tvl");
    expect(tvlStat!.href).toBe("/bridges");
    const assetStat = stats.find((s) => s.id === "assets");
    expect(assetStat!.href).toBe("/assets");
  });
});
