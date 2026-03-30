import { useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getAssetsWithHealth, getBridges, getBridgeStats } from "../services/api";

// ─── Period / comparison types ────────────────────────────────────────────────

export type Period = "7D" | "30D" | "90D";
export type ComparisonMode = "none" | "wow" | "mom";

export function periodToDays(p: Period): number {
  return p === "7D" ? 7 : p === "30D" ? 30 : 90;
}

// ─── Deterministic seeded PRNG ────────────────────────────────────────────────
// Used to generate stable "historical" values that don't change on re-render.
function seededRng(seed: string): () => number {
  let s = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return () => {
    s = ((s * 1103515245 + 12345) >>> 0) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Generate a daily time-series backwards from `currentValue` over `days` days.
 * Uses a seeded random walk so values are stable across re-renders.
 */
export function generateDailySeries(
  currentValue: number,
  days: number,
  seedStr: string,
  volatility = 3.5
): { date: string; value: number }[] {
  const rng = seededRng(seedStr + days);
  const values = new Array<number>(days);
  values[days - 1] = currentValue;
  for (let i = days - 2; i >= 0; i--) {
    const delta = (rng() - 0.5) * volatility * 2;
    values[i] = Math.max(0, Math.min(100, values[i + 1] - delta));
  }

  const now = new Date();
  return values.map((v, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: Math.round(v * 10) / 10,
    };
  });
}

// ─── Derived types ─────────────────────────────────────────────────────────────

export interface BridgeAnalytics {
  name: string;
  status: string;
  tvl: number;
  volume24h: number;
  volume7d: number;
  volume30d: number;
  uptime30d: number;
  mismatchPercentage: number;
}

export interface TopMover {
  symbol: string;
  currentScore: number;
  previousScore: number;
  change: number;
  direction: "up" | "down";
}

export interface HealthDistributionItem {
  name: "Healthy" | "Warning" | "Critical";
  value: number;
  color: string;
}

export interface HealthTimeSeriesPoint {
  date: string;
  [symbol: string]: string | number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseAnalyticsReturn {
  // Controls
  period: Period;
  setPeriod: (p: Period) => void;
  comparisonMode: ComparisonMode;
  setComparisonMode: (m: ComparisonMode) => void;

  // Loading
  isLoading: boolean;

  // Protocol-wide KPIs
  totalTVL: number;
  totalBridges: number;
  totalAssets: number;
  avgHealthScore: number | null;
  tvlChange: number;
  healthScoreChange: number;
  totalVolume24h: number;
  totalVolume7d: number;

  // Derived datasets
  bridgeData: BridgeAnalytics[];
  topMovers: TopMover[];
  healthDistribution: HealthDistributionItem[];
  healthTimeSeries: HealthTimeSeriesPoint[];
  volumeTimeSeries: { date: string; [bridge: string]: string | number }[];
}

export function useAnalytics(): UseAnalyticsReturn {
  const [period, setPeriod] = useState<Period>("30D");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("mom");

  const days = periodToDays(period);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ["assets-with-health"],
    queryFn: getAssetsWithHealth,
    staleTime: 60_000,
  });

  const { data: bridgesData, isLoading: bridgesLoading } = useQuery({
    queryKey: ["bridges"],
    queryFn: getBridges,
    staleTime: 60_000,
  });

  const bridgeNames = bridgesData?.bridges.map((b) => b.name) ?? [];

  const bridgeStatsResults = useQueries({
    queries: bridgeNames.map((name) => ({
      queryKey: ["bridge-stats", name],
      queryFn: () => getBridgeStats(name),
      staleTime: 60_000,
    })),
  });

  const statsLoading = bridgeStatsResults.some((r) => r.isLoading);
  const isLoading = assetsLoading || bridgesLoading || statsLoading;

  // ── Derived data ─────────────────────────────────────────────────────────────
  const bridgeData = useMemo<BridgeAnalytics[]>(() => {
    if (!bridgesData) return [];
    return bridgesData.bridges.map((bridge, i) => {
      const stats = bridgeStatsResults[i]?.data;
      return {
        name: bridge.name,
        status: bridge.status,
        tvl: bridge.totalValueLocked,
        volume24h: stats?.volume24h ?? 0,
        volume7d: stats?.volume7d ?? 0,
        volume30d: stats?.volume30d ?? 0,
        uptime30d: stats?.uptime30d ?? 100,
        mismatchPercentage: bridge.mismatchPercentage,
      };
    });
  }, [bridgesData, bridgeStatsResults]);

  const totalTVL = useMemo(
    () => bridgeData.reduce((sum, b) => sum + b.tvl, 0),
    [bridgeData]
  );

  const totalVolume24h = useMemo(
    () => bridgeData.reduce((sum, b) => sum + b.volume24h, 0),
    [bridgeData]
  );

  const totalVolume7d = useMemo(
    () => bridgeData.reduce((sum, b) => sum + b.volume7d, 0),
    [bridgeData]
  );

  const avgHealthScore = useMemo<number | null>(() => {
    if (!assetsData || assetsData.length === 0) return null;
    const scored = assetsData.filter((a) => a.health?.overallScore != null);
    if (scored.length === 0) return null;
    return (
      scored.reduce((s, a) => s + (a.health!.overallScore ?? 0), 0) /
      scored.length
    );
  }, [assetsData]);

  // Synthetic period-over-period change using seeded rng for stability
  const tvlChange = useMemo(() => {
    const rng = seededRng("tvl" + period);
    return Math.round((rng() * 20 - 5) * 10) / 10; // -5% to +15%
  }, [period]);

  const healthScoreChange = useMemo(() => {
    const rng = seededRng("health" + period);
    return Math.round((rng() * 10 - 3) * 10) / 10; // -3 to +7 pts
  }, [period]);

  // Health distribution buckets
  const healthDistribution = useMemo<HealthDistributionItem[]>(() => {
    if (!assetsData) return [];
    let healthy = 0, warning = 0, critical = 0;
    for (const a of assetsData) {
      const s = a.health?.overallScore ?? null;
      if (s === null) continue;
      if (s >= 80) healthy++;
      else if (s >= 50) warning++;
      else critical++;
    }
    return [
      { name: "Healthy" as const, value: healthy, color: "#22c55e" },
      { name: "Warning" as const, value: warning, color: "#eab308" },
      { name: "Critical" as const, value: critical, color: "#ef4444" },
    ].filter((d) => d.value > 0);
  }, [assetsData]);

  // Top movers – synthetic previous-period scores derived from current
  const topMovers = useMemo<TopMover[]>(() => {
    if (!assetsData) return [];
    return assetsData
      .filter((a) => a.health?.overallScore != null)
      .map((a) => {
        const rng = seededRng(a.symbol + period);
        const currentScore = a.health!.overallScore;
        const delta = (rng() - 0.5) * 20; // ±10 pts
        const previousScore = Math.max(0, Math.min(100, currentScore - delta));
        const change = currentScore - previousScore;
        return {
          symbol: a.symbol,
          currentScore: Math.round(currentScore * 10) / 10,
          previousScore: Math.round(previousScore * 10) / 10,
          change: Math.round(change * 10) / 10,
          direction: change >= 0 ? "up" : "down",
        } as TopMover;
      })
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }, [assetsData, period]);

  // Health time-series (one line per asset)
  const healthTimeSeries = useMemo<HealthTimeSeriesPoint[]>(() => {
    if (!assetsData) return [];
    const scored = assetsData.filter((a) => a.health?.overallScore != null);
    if (scored.length === 0) return [];

    // Build per-asset series
    const seriesMap = new Map<string, number[]>();
    for (const asset of scored) {
      const series = generateDailySeries(
        asset.health!.overallScore,
        days,
        asset.symbol
      );
      seriesMap.set(asset.symbol, series.map((p) => p.value));
    }

    // Pivot into {date, asset1: v, asset2: v, ...}
    const firstAsset = scored[0];
    const dates = generateDailySeries(
      firstAsset.health!.overallScore,
      days,
      firstAsset.symbol
    ).map((p) => p.date);

    return dates.map((date, i) => {
      const point: HealthTimeSeriesPoint = { date };
      for (const asset of scored) {
        point[asset.symbol] = seriesMap.get(asset.symbol)![i];
      }
      return point;
    });
  }, [assetsData, days]);

  // Volume time-series (one line per bridge)
  const volumeTimeSeries = useMemo(() => {
    if (bridgeData.length === 0) return [];

    // Use volume7d / 7 as daily average base for each bridge
    const seriesMap = new Map<string, number[]>();
    for (const bridge of bridgeData) {
      const dailyAvg = bridge.volume7d > 0 ? bridge.volume7d / 7 : bridge.volume24h;
      const series = generateDailySeries(dailyAvg, days, bridge.name, dailyAvg * 0.15);
      seriesMap.set(bridge.name, series.map((p) => p.value));
    }

    const firstBridge = bridgeData[0];
    const dailyAvg =
      firstBridge.volume7d > 0 ? firstBridge.volume7d / 7 : firstBridge.volume24h;
    const dates = generateDailySeries(dailyAvg, days, firstBridge.name, dailyAvg * 0.15).map(
      (p) => p.date
    );

    return dates.map((date, i) => {
      const point: { date: string; [k: string]: string | number } = { date };
      for (const bridge of bridgeData) {
        point[bridge.name] = Math.round(seriesMap.get(bridge.name)![i]);
      }
      return point;
    });
  }, [bridgeData, days]);

  return {
    period,
    setPeriod,
    comparisonMode,
    setComparisonMode,
    isLoading,
    totalTVL,
    totalBridges: bridgeData.length,
    totalAssets: assetsData?.length ?? 0,
    avgHealthScore,
    tvlChange,
    healthScoreChange,
    totalVolume24h,
    totalVolume7d,
    bridgeData,
    topMovers,
    healthDistribution,
    healthTimeSeries,
    volumeTimeSeries,
  };
}
