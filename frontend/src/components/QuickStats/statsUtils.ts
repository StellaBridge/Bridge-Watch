import type { AssetData, BridgeData, StatItem } from "./types";

export function formatTVL(num: number): string {
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export function getHealthLabel(score: number): "healthy" | "warning" | "critical" {
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

export function computeStats(assets: AssetData[], bridges: BridgeData[]): StatItem[] {
  // Total Value Locked
  const totalTVL = bridges.reduce((sum, b) => sum + b.totalValueLocked, 0);

  // Active assets (those with health data)
  const activeAssets = assets.filter((a) => a.health !== null);

  // Active bridges (not down)
  const activeBridges = bridges.filter((b) => b.status !== "down");

  // System health: average overallScore across assets with health
  const scores = activeAssets.map((a) => a.health!.overallScore);
  const avgHealth = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
  const healthStatus = scores.length > 0 ? getHealthLabel(avgHealth) : "neutral";

  // Trend summary: count improving vs deteriorating
  const improving = activeAssets.filter((a) => a.health?.trend === "improving").length;
  const deteriorating = activeAssets.filter((a) => a.health?.trend === "deteriorating").length;
  const trendDirection: "up" | "down" | "neutral" =
    improving > deteriorating ? "up" : deteriorating > improving ? "down" : "neutral";

  // Bridges at risk (degraded or down)
  const atRisk = bridges.filter((b) => b.status === "degraded" || b.status === "down").length;

  return [
    {
      id: "tvl",
      label: "Total Value Locked",
      value: formatTVL(totalTVL),
      icon: "💰",
      href: "/bridges",
      status: "neutral",
    },
    {
      id: "assets",
      label: "Monitored Assets",
      value: `${activeAssets.length}`,
      icon: "📊",
      change: {
        value: `${assets.length} total`,
        direction: "neutral",
      },
      href: "/assets",
      status: "neutral",
    },
    {
      id: "bridges",
      label: "Active Bridges",
      value: `${activeBridges.length} / ${bridges.length}`,
      icon: "🌉",
      href: "/bridges",
      status: atRisk > 0 ? "warning" : "healthy",
    },
    {
      id: "health",
      label: "System Health",
      value: `${avgHealth}%`,
      icon: "❤️",
      change: {
        value: `${improving} improving`,
        direction: trendDirection,
      },
      status: healthStatus as StatItem["status"],
    },
    {
      id: "trend",
      label: "Health Trends",
      value: `${improving}↑ ${deteriorating}↓`,
      icon: "📈",
      change: {
        value: trendDirection === "up" ? "Improving" : trendDirection === "down" ? "Declining" : "Stable",
        direction: trendDirection,
      },
      status: trendDirection === "down" ? "warning" : "healthy",
    },
    {
      id: "alerts",
      label: "Bridges at Risk",
      value: `${atRisk}`,
      icon: "⚠️",
      status: atRisk > 0 ? "critical" : "healthy",
      href: "/bridges",
    },
  ];
}
