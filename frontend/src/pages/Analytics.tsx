import MetricCard from "../components/analytics/MetricCard";
import BridgeComparison from "../components/analytics/BridgeComparison";
import HealthDistribution from "../components/analytics/HealthDistribution";
import TopMovers from "../components/analytics/TopMovers";
import HealthTrendChart from "../components/analytics/HealthTrendChart";
import VolumeBreakdown from "../components/analytics/VolumeBreakdown";
import ExportButton from "../components/analytics/ExportButton";
import { useAnalytics, type Period } from "../hooks/useAnalytics";

function formatDollars(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

const PERIODS: Period[] = ["7D", "30D", "90D"];

export default function Analytics() {
  const {
    period,
    setPeriod,
    isLoading,
    totalTVL,
    totalBridges,
    totalAssets,
    avgHealthScore,
    tvlChange,
    healthScoreChange,
    totalVolume24h,
    bridgeData,
    topMovers,
    healthDistribution,
    healthTimeSeries,
    volumeTimeSeries,
  } = useAnalytics();

  // Pull assetsData for ExportButton from the data shapes available in volumeTimeSeries / assetsData
  // We pass empty fallback since ExportButton's assetsData is only used when user clicks Export
  const assetsForExport = healthTimeSeries.length > 0
    ? Object.keys(healthTimeSeries[0])
        .filter((k) => k !== "date")
        .map((symbol) => ({
          symbol,
          name: symbol,
          health: {
            symbol,
            overallScore: healthTimeSeries[healthTimeSeries.length - 1][symbol] as number,
            factors: { liquidityDepth: 0, priceStability: 0, bridgeUptime: 0, reserveBacking: 0, volumeTrend: 0 },
            trend: "stable" as const,
            lastUpdated: new Date().toISOString(),
          },
        }))
    : [];

  return (
    <div className="space-y-6">
      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="mt-1 text-stellar-text-secondary text-sm">
            Aggregated statistics, trend analysis, and exportable reports
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-stellar-card border border-stellar-border rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  period === p
                    ? "bg-stellar-blue text-white"
                    : "text-stellar-text-secondary hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Export */}
          <ExportButton
            bridgeData={bridgeData}
            assetsData={assetsForExport}
            period={period}
            isDisabled={isLoading}
          />
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Value Locked"
          value={isLoading ? "—" : formatDollars(totalTVL)}
          subtitle="across all bridges"
          change={tvlChange}
          isLoading={isLoading}
        />
        <MetricCard
          label="24h Transfer Volume"
          value={isLoading ? "—" : formatDollars(totalVolume24h)}
          subtitle="all bridges combined"
          isLoading={isLoading}
        />
        <MetricCard
          label="Avg Health Score"
          value={avgHealthScore !== null ? `${avgHealthScore.toFixed(1)} / 100` : "—"}
          subtitle="all tracked assets"
          change={healthScoreChange}
          changeUnit=" pts"
          isLoading={isLoading}
        />
        <MetricCard
          label="Monitored Bridges"
          value={isLoading ? "—" : String(totalBridges)}
          subtitle={`${totalAssets} assets tracked`}
          isLoading={isLoading}
        />
      </div>

      {/* ── Health trend chart (full width) ─────────────────────────────────── */}
      <HealthTrendChart
        data={healthTimeSeries}
        isLoading={isLoading}
        period={period}
      />

      {/* ── Bridge comparison + Health distribution (two-column) ────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BridgeComparison bridges={bridgeData} isLoading={isLoading} />
        <HealthDistribution data={healthDistribution} isLoading={isLoading} />
      </div>

      {/* ── Volume breakdown (full width) ───────────────────────────────────── */}
      <VolumeBreakdown
        data={volumeTimeSeries}
        bridgeNames={bridgeData.map((b) => b.name)}
        isLoading={isLoading}
        period={period}
      />

      {/* ── Top movers (full width) ─────────────────────────────────────────── */}
      <TopMovers movers={topMovers} isLoading={isLoading} period={period} />
    </div>
  );
}
