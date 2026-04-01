import { useState, useMemo, useCallback, Suspense } from "react";
import { Link } from "react-router-dom";
import { useAssetsWithHealth, useHealthUpdater } from "../hooks/useAssets";
import { useBridges } from "../hooks/useBridges";
import { useWebSocket } from "../hooks/useWebSocket";
import { useRefreshControls } from "../hooks/useRefreshControls";
import HealthScoreCard from "../components/HealthScoreCard";
import BridgeStatusCard from "../components/BridgeStatusCard";
import { QuickStatsWidget } from "../components/QuickStats";
import OnboardingDialog from "../components/OnboardingDialog";
import RefreshControls from "../components/RefreshControls";
import { SkeletonCard, ErrorBoundary } from "../components/Skeleton";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import type {
  AssetWithHealth,
  SortField,
  SortOrder,
  FilterStatus,
  HealthScore,
} from "../types";

function getHealthStatus(score: number | null): FilterStatus {
  if (score === null) return "all";
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function sortAssets(assets: AssetWithHealth[], field: SortField, order: SortOrder): AssetWithHealth[] {
  return [...assets].sort((a, b) => {
    let comparison = 0;
    if (field === "symbol") {
      comparison = a.symbol.localeCompare(b.symbol);
    } else if (field === "score") {
      const scoreA = a.health?.overallScore ?? -1;
      const scoreB = b.health?.overallScore ?? -1;
      comparison = scoreA - scoreB;
    }
    return order === "asc" ? comparison : -comparison;
  });
}

function filterAssets(assets: AssetWithHealth[], status: FilterStatus): AssetWithHealth[] {
  if (status === "all") return assets;
  return assets.filter((asset) => {
    const assetStatus = getHealthStatus(asset.health?.overallScore ?? null);
    return assetStatus === status;
  });
}

export default function Dashboard() {
  const refreshControls = useRefreshControls({
    viewId: "dashboard",
    targets: [
      { id: "assets", label: "Assets", queryKey: ["assets-with-health"] },
      { id: "bridges", label: "Bridges", queryKey: ["bridges"] },
    ],
    defaultIntervalMs: 30_000,
  });

  const {
    data: assetsData,
    isLoading: assetsLoading,
    error: assetsError,
    refetch: refetchAssets,
  } = useAssetsWithHealth({
    refetchInterval: refreshControls.preferences.autoRefreshEnabled
      ? refreshControls.preferences.refreshIntervalMs
      : false,
    refetchOnWindowFocus: refreshControls.preferences.refreshOnFocus,
  });
  const { data: bridgesData, isLoading: bridgesLoading, refetch: refetchBridges } = useBridges({
    refetchInterval: refreshControls.preferences.autoRefreshEnabled
      ? refreshControls.preferences.refreshIntervalMs
      : false,
    refetchOnWindowFocus: refreshControls.preferences.refreshOnFocus,
  });
  const { updateHealth } = useHealthUpdater();

  const [sortField, setSortField] = useState<SortField>("score");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const [onboardingCompleted, setOnboardingCompleted] = useLocalStorageState(
    "bridge-watch:onboarding:v1",
    false
  );
  const [onboardingOpen, setOnboardingOpen] = useState(!onboardingCompleted);

  const handleHealthUpdate = useCallback(
    (data: unknown) => {
      const healthData = data as { channel: string } & HealthScore;
      if (healthData.symbol) {
        updateHealth(healthData);
      }
    },
    [updateHealth]
  );

  useWebSocket("health-updates", handleHealthUpdate);

  const refreshTargets = [
    { id: "assets", label: "Assets", refetch: refetchAssets },
    { id: "bridges", label: "Bridges", refetch: refetchBridges },
  ];

  const processedAssets = useMemo(() => {
    if (!assetsData) return [];
    const filtered = filterAssets(assetsData, filterStatus);
    return sortAssets(filtered, sortField, sortOrder);
  }, [assetsData, filterStatus, sortField, sortOrder]);

  const statusCounts = useMemo(() => {
    if (!assetsData) return { healthy: 0, warning: 0, critical: 0 };
    return assetsData.reduce(
      (acc, asset) => {
        const status = getHealthStatus(asset.health?.overallScore ?? null);
        if (status !== "all") {
          acc[status]++;
        }
        return acc;
      },
      { healthy: 0, warning: 0, critical: 0 }
    );
  }, [assetsData]);

  return (
    <div className="space-y-8">
      <OnboardingDialog
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onComplete={() => {
          setOnboardingCompleted(true);
          setOnboardingOpen(false);
        }}
      />

      <header>
        <h1 className="text-3xl font-bold text-stellar-text-primary">Dashboard</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Real-time monitoring of bridged assets on the Stellar network
        </p>
        {!onboardingOpen && !onboardingCompleted && (
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="mt-4 text-sm text-stellar-blue hover:underline focus:outline-none focus:ring-2 focus:ring-stellar-blue rounded-md px-2 py-1"
          >
            Continue onboarding
          </button>
        )}
        {onboardingCompleted && (
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="mt-4 text-sm text-stellar-text-secondary hover:text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue rounded-md px-2 py-1"
          >
            Show onboarding
          </button>
        )}
      </header>

      <RefreshControls
        autoRefreshEnabled={refreshControls.preferences.autoRefreshEnabled}
        onAutoRefreshEnabledChange={refreshControls.setAutoRefreshEnabled}
        refreshIntervalMs={refreshControls.preferences.refreshIntervalMs}
        onRefreshIntervalChange={refreshControls.setRefreshIntervalMs}
        refreshOnFocus={refreshControls.preferences.refreshOnFocus}
        onRefreshOnFocusChange={refreshControls.setRefreshOnFocus}
        targets={refreshTargets}
        selectedTargetIds={refreshControls.preferences.selectedTargetIds}
        onSelectedTargetIdsChange={refreshControls.setSelectedTargetIds}
        onRefresh={refreshControls.refreshNow}
        onCancelRefresh={refreshControls.cancelRefresh}
        isRefreshing={refreshControls.isRefreshing}
        lastUpdatedAt={refreshControls.lastUpdatedAt}
      />

      <section aria-labelledby="asset-health-heading">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 id="asset-health-heading" className="text-xl font-semibold text-stellar-text-primary">
            Asset Health
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="filter-status" className="sr-only">
                Filter by status
              </label>
              <select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                className="bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                <option value="all">All Assets</option>
                <option value="healthy">Healthy ({statusCounts.healthy})</option>
                <option value="warning">Warning ({statusCounts.warning})</option>
                <option value="critical">Critical ({statusCounts.critical})</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="sort-field" className="sr-only">
                Sort by
              </label>
              <select
                id="sort-field"
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                <option value="score">Sort by Score</option>
                <option value="symbol">Sort by Name</option>
              </select>

              <button
                type="button"
                onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                className="bg-stellar-card border border-stellar-border rounded-lg px-3 py-2 text-sm text-stellar-text-primary hover:bg-stellar-border focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                aria-label={`Sort ${sortOrder === "asc" ? "descending" : "ascending"}`}
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>
        </div>

        <ErrorBoundary onRetry={() => window.location.reload()}>
          <Suspense
            fallback={
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <SkeletonCard key={i} rows={4} ariaLabel={`Loading asset ${i}`} />
                ))}
              </div>
            }
          >
            {assetsError ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center" role="alert">
                <p className="text-red-400 font-medium">Failed to load asset data</p>
                <p className="text-sm text-red-400/80 mt-1">Please check your connection and try again.</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-3 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-400"
                >
                  Retry
                </button>
              </div>
            ) : assetsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5].map((i) => (
                  <SkeletonCard key={i} rows={5} ariaLabel={`Loading asset ${i}`} />
                ))}
              </div>
            ) : processedAssets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {processedAssets.map((asset) => (
                  <Link
                    key={asset.symbol}
                    to={`/assets/${asset.symbol}`}
                    className="block focus:outline-none focus:ring-2 focus:ring-stellar-blue rounded-lg"
                  >
                    <HealthScoreCard
                      symbol={asset.symbol}
                      name={asset.name}
                      overallScore={asset.health?.overallScore ?? null}
                      factors={asset.health?.factors ?? null}
                      trend={asset.health?.trend ?? null}
                    />
                  </Link>
                ))}
              </div>
            ) : filterStatus !== "all" ? (
              <div className="bg-stellar-card border border-stellar-border rounded-lg p-8 text-center">
                <p className="text-stellar-text-secondary">No assets match the selected filter.</p>
                <button type="button" onClick={() => setFilterStatus("all")} className="mt-3 text-sm text-stellar-blue hover:underline">
                  Clear filter
                </button>
              </div>
            ) : (
              <div className="bg-stellar-card border border-stellar-border rounded-lg p-8 text-center">
                <p className="text-stellar-text-secondary">
                  No monitored assets yet. Configure assets in the backend to get started.
                </p>
              </div>
            )}
          </Suspense>
        </ErrorBoundary>
      </section>

      <section aria-labelledby="bridge-status-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="bridge-status-heading" className="text-xl font-semibold text-stellar-text-primary">
            Bridge Status
          </h2>
          <Link to="/bridges" className="text-sm text-stellar-blue hover:underline">
            View all
          </Link>
        </div>
        <ErrorBoundary onRetry={() => window.location.reload()}>
          <Suspense
            fallback={
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <SkeletonCard key={i} rows={5} ariaLabel={`Loading bridge ${i}`} />
                ))}
              </div>
            }
          >
            {bridgesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <SkeletonCard key={i} rows={5} ariaLabel={`Loading bridge ${i}`} />
                ))}
              </div>
            ) : bridgesData && bridgesData.bridges.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bridgesData.bridges.map((bridge) => (
                  <BridgeStatusCard key={bridge.name} {...bridge} />
                ))}
              </div>
            ) : (
              <div className="bg-stellar-card border border-stellar-border rounded-lg p-8 text-center">
                <p className="text-stellar-text-secondary">No bridge data available yet.</p>
              </div>
            )}
          </Suspense>
        </ErrorBoundary>
      </section>
    </div>
  );
}
