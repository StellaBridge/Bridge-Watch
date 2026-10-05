import { useMemo, useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAssetsWithHealth } from "../hooks/useAssets";
import { useBridges } from "../hooks/useBridges";
import {
  isTimestampInRange,
  useDashboardFilters,
  type DashboardFilters,
} from "../hooks/useDashboardFilters";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import DashboardLayoutCustomizer from "../components/dashboard/DashboardLayoutCustomizer";
import BridgeStatusCard from "../components/BridgeStatusCard";
import WatchlistWidget from "../components/watchlist/WatchlistWidget";
import ExternalDependencyPanel from "../components/dashboard/ExternalDependencyPanel";
import PullToRefresh from "../components/PullToRefresh";
import ComparativeSparklineGrid from "../components/analytics/ComparativeSparklineGrid";
import { SummaryCard } from "../components/SummaryCard";
import AssetDiscoverySection from "../components/dashboard/AssetDiscoverySection";
import FavoriteTagChip from "../components/favorites/FavoriteTagChip";
import AssetFilterPanel from "../components/Filters/AssetFilterPanel";
import FilterPresetsMenu from "../components/Filters/FilterPresetsMenu";
import DashboardTour from "../components/dashboard/DashboardTour";
import { useDashboardTour, type TourStep } from "../hooks/useDashboardTour";
import { LiveUpdatePill } from "../components/LiveUpdatePill";
import { useFavorites } from "../hooks/useFavorites";
import ExportPickerDialog from "../components/ExportPickerDialog";
import { Tabs, TabList, Tab, TabPanel } from "../components/Tabs";
import { RecentActivityTimeline } from "../components/timeline";
import KpiBanner, { type KpiBannerItem } from "../components/dashboard/KpiBanner";
import DrilldownDrawer, {
  type DrilldownContext,
} from "../components/dashboard/DrilldownDrawer";
import InlineStatusCards from "../components/dashboard/InlineStatusCards";
import MetricsInspectorDrawer, {
  type MetricInspectorMetadata,
} from "../components/dashboard/MetricsInspectorDrawer";
import DashboardSharingModal from "../components/dashboard/DashboardSharingModal";
import AssetInsightsTray from "../components/asset/AssetInsightsTray";
import { useUIStore } from "../stores/uiStore";
import type { AssetWithHealth, Bridge, FilterStatus } from "../types";

type DashboardView = "overview" | "assets" | "bridges";
type BridgeStatusFilter = "all" | "healthy" | "degraded" | "down" | "unknown";

const VIEW_PARAM = "dashboard_view";
const BRIDGE_STATUS_PARAM = "dashboard_bridge_status";
const DRILLDOWN_PARAM = "drilldown";

const dashboardTourSteps: TourStep[] = [
  {
    id: "toolbar",
    target: '[data-tour="toolbar"]',
    title: "Toolbar actions",
    body: "Save filter presets, refresh data, export, and share the current view from here.",
    placement: "bottom",
  },
  {
    id: "filters",
    target: '[data-tour="filters"]',
    title: "Filters",
    body: "Narrow the dashboard by assets, bridges, status, and time range. Active filters are encoded in the URL.",
    placement: "right",
  },
  {
    id: "kpis",
    target: '[data-tour="kpis"]',
    title: "Key metrics",
    body: "Live KPIs summarise total value locked, monitored assets, active bridges, and system health. Inspect any card to drill down.",
    placement: "bottom",
  },
  {
    id: "status-cards",
    target: '[data-tour="status-cards"]',
    title: "Status at a glance",
    body: "These cards highlight the assets and bridges that need attention right now.",
    placement: "top",
  },
];

const dashboardViews: Array<{ id: DashboardView; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Assets and bridges together" },
  { id: "assets", label: "Assets", description: "Asset health and watchlist focus" },
  { id: "bridges", label: "Bridges", description: "Bridge health focus" },
];

const bridgeStatusOptions: Array<{ id: BridgeStatusFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "healthy", label: "Healthy" },
  { id: "degraded", label: "Degraded" },
  { id: "down", label: "Down" },
  { id: "unknown", label: "Unknown" },
];

function parseDashboardView(value: string | null): DashboardView {
  if (value === "assets" || value === "bridges") {
    return value;
  }
  return "overview";
}

function parseBridgeStatus(value: string | null): BridgeStatusFilter {
  if (
    value === "healthy" ||
    value === "degraded" ||
    value === "down" ||
    value === "unknown"
  ) {
    return value;
  }
  return "all";
}

function getAssetStatus(score: number | null | undefined): FilterStatus | null {
  if (score === null || score === undefined) return null;
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function filterAssets(assets: AssetWithHealth[], filters: DashboardFilters): AssetWithHealth[] {
  const selectedAssets = new Set(filters.assets);

  return assets.filter((asset) => {
    if (selectedAssets.size > 0 && !selectedAssets.has(asset.symbol)) {
      return false;
    }

    if (filters.status !== "all") {
      const status = getAssetStatus(asset.health?.overallScore ?? null);
      if (status !== filters.status) return false;
    }

    return isTimestampInRange(asset.health?.lastUpdated, filters.timeRange);
  });
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function buildBridgeRows(bridges: Bridge[]) {
  return bridges.slice(0, 8).map((bridge) => ({
    label: bridge.name,
    value: formatCurrency(bridge.totalValueLocked),
    status: `${bridge.status} - ${bridge.mismatchPercentage.toFixed(3)}% mismatch`,
  }));
}

function useDashboardUrlState() {
  const location = useLocation();
  const navigate = useNavigate();

  const state = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      view: parseDashboardView(params.get(VIEW_PARAM)),
      bridgeStatus: parseBridgeStatus(params.get(BRIDGE_STATUS_PARAM)),
    };
  }, [location.search]);

  function updateState(next: Partial<{ view: DashboardView; bridgeStatus: BridgeStatusFilter }>) {
    const params = new URLSearchParams(location.search);
    const nextView = next.view ?? state.view;
    const nextBridgeStatus = next.bridgeStatus ?? state.bridgeStatus;

    params.set(VIEW_PARAM, nextView);
    params.set(BRIDGE_STATUS_PARAM, nextBridgeStatus);

    navigate({ search: params.toString() }, { replace: true });
  }

  return {
    state,
    setView: (view: DashboardView) => updateState({ view }),
    setBridgeStatus: (bridgeStatus: BridgeStatusFilter) => updateState({ bridgeStatus }),
  };
}

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [exportPickerOpen, setExportPickerOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  const [inspectedMetricId, setInspectedMetricId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const insightsTrayOpen = useUIStore((s) => s.insightsTrayOpen);
  const insightsTraySymbol = useUIStore((s) => s.selectedAsset);
  const closeInsightsTray = useUIStore((s) => s.closeInsightsTray);
  const {
    data: assetsWithHealth,
    isLoading: assetsLoading,
    isFetching: assetsFetching,
    dataUpdatedAt: assetsUpdatedAt,
    refetch: refetchAssets,
  } = useAssetsWithHealth();
  const { favoritesFilterMode, toggleFavoriteBridge, favoriteBridges } = useFavorites();
  const {
    data: bridgesData,
    isLoading: bridgesLoading,
    isFetching: bridgesFetching,
    dataUpdatedAt: bridgesUpdatedAt,
    refetch: refetchBridges,
  } = useBridges();
  const dashboardUpdatedAt =
    Math.max(assetsUpdatedAt, bridgesUpdatedAt) > 0
      ? Math.max(assetsUpdatedAt, bridgesUpdatedAt)
      : null;
  const dashboard = useDashboardUrlState();
  const {
    filters,
    savedPresets,
    hasActiveFilters,
    toggleAsset,
    toggleBridge,
    setStatus,
    setTimeRange,
    clearAll,
    savePreset,
    applyPreset,
    renamePreset,
    setPresetShared,
    deletePreset,
  } = useDashboardFilters();
  const tour = useDashboardTour({ stepCount: dashboardTourSteps.length });
  const {
    layout,
    isCustomizing,
    setIsCustomizing,
    toggleWidgetVisibility,
    moveWidget,
    resetLayout,
    isWidgetVisible,
  } = useDashboardLayout();
  const pullToRefresh = usePullToRefresh({
    enabled: true,
    onRefresh: async () => {
      await Promise.all([refetchAssets(), refetchBridges()]);
    },
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gridRef.current) return;
      const widgets = Array.from(
        gridRef.current.querySelectorAll("[data-widget-id]")
      ) as HTMLElement[];
      if (widgets.length === 0) return;

      const focused = document.activeElement as HTMLElement;
      const focusedIndex = widgets.indexOf(focused);

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        widgets[(focusedIndex + 1) % widgets.length]?.focus();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        widgets[(focusedIndex - 1 + widgets.length) % widgets.length]?.focus();
      }
    };

    gridRef.current?.addEventListener("keydown", handleKeyDown);
    return () => gridRef.current?.removeEventListener("keydown", handleKeyDown);
  }, []);

  const availableAssets = useMemo(() => {
    if (!assetsWithHealth) return [];
    return [...new Set(assetsWithHealth.map((asset) => asset.symbol))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [assetsWithHealth]);

  const availableBridges = useMemo(() => {
    return [...new Set((bridgesData?.bridges ?? []).map((bridge) => bridge.name))].sort(
      (a, b) => a.localeCompare(b),
    );
  }, [bridgesData?.bridges]);
  const activitySourceOptions = useMemo(
    () => [
      ...availableAssets.map((symbol) => `asset:${symbol}`),
      ...availableBridges.map((name) => `bridge:${name}`),
    ],
    [availableAssets, availableBridges],
  );

  const filteredAssets = useMemo(
    () => filterAssets(assetsWithHealth ?? [], filters),
    [assetsWithHealth, filters],
  );

  const filteredBridges = useMemo(() => {
    let bridges = bridgesData?.bridges ?? [];
    if (dashboard.state.bridgeStatus !== "all") {
      bridges = bridges.filter((bridge) => bridge.status === dashboard.state.bridgeStatus);
    }
    if (filters.bridges.length > 0) {
      const selectedBridgeSet = new Set(filters.bridges);
      bridges = bridges.filter((bridge) => selectedBridgeSet.has(bridge.name));
    }
    if (favoritesFilterMode === "favorites") {
      bridges = bridges.filter((b) => favoriteBridges.includes(b.name));
    }
    return bridges;
  }, [
    bridgesData?.bridges,
    dashboard.state.bridgeStatus,
    favoritesFilterMode,
    favoriteBridges,
    filters.bridges,
  ]);

  const showAssets = dashboard.state.view !== "bridges";
  const showBridges = dashboard.state.view !== "assets";
  const sparklineItems = useMemo(
    () =>
      filteredAssets.slice(0, 6).map((asset) => ({
        symbol: asset.symbol,
        name: asset.name ?? asset.symbol,
        period: "7d" as const,
      })),
    [filteredAssets],
  );
  const showFilteredAssetEmpty =
    !assetsLoading &&
    hasActiveFilters &&
    filteredAssets.length === 0 &&
    (assetsWithHealth ?? []).length > 0;
  const bridgeFiltersActive =
    dashboard.state.bridgeStatus !== "all" ||
    filters.bridges.length > 0 ||
    favoritesFilterMode === "favorites";
  const activeDrilldownId = new URLSearchParams(location.search).get(DRILLDOWN_PARAM);
  const totalTvl = useMemo(
    () => filteredBridges.reduce((sum, bridge) => sum + bridge.totalValueLocked, 0),
    [filteredBridges],
  );
  const activeBridgeCount = filteredBridges.filter((bridge) => bridge.status !== "down").length;
  const averageHealth = useMemo(() => {
    const scores = filteredAssets
      .map((asset) => asset.health?.overallScore)
      .filter((score): score is number => typeof score === "number");
    if (!scores.length) return 0;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }, [filteredAssets]);
  const improvingAssets = filteredAssets.filter((asset) => asset.health?.trend === "improving").length;
  const deterioratingAssets = filteredAssets.filter(
    (asset) => asset.health?.trend === "deteriorating",
  ).length;
  const mismatchBridgeCount = filteredBridges.filter((bridge) => bridge.mismatchPercentage > 1).length;
  const kpiItems = useMemo<KpiBannerItem[]>(
    () => [
      {
        id: "tvl",
        label: "Total value locked",
        value: formatCurrency(totalTvl),
        delta: `${filteredBridges.length} bridges`,
        trend: totalTvl > 0 ? "up" : "neutral",
        description: "Combined TVL for bridges matching the current dashboard filters.",
      },
      {
        id: "assets",
        label: "Monitored assets",
        value: filteredAssets.length,
        delta: `${improvingAssets} improving`,
        trend:
          improvingAssets > deterioratingAssets
            ? "up"
            : deterioratingAssets > improvingAssets
              ? "down"
              : "neutral",
        description: "Assets with health data after asset, status, and time filters are applied.",
      },
      {
        id: "bridges",
        label: "Active bridges",
        value: activeBridgeCount,
        delta: `${filteredBridges.length - activeBridgeCount} down`,
        trend: activeBridgeCount === filteredBridges.length ? "up" : "down",
        description: "Bridges not currently marked down, scoped by bridge and favorite filters.",
      },
      {
        id: "health",
        label: "System health",
        value: formatPercent(averageHealth),
        delta: `${mismatchBridgeCount} mismatches`,
        trend: averageHealth >= 80 ? "up" : averageHealth >= 50 ? "neutral" : "down",
        description: "Average health score across filtered assets with bridge mismatch context.",
      },
    ],
    [
      activeBridgeCount,
      averageHealth,
      deterioratingAssets,
      filteredAssets.length,
      filteredBridges.length,
      improvingAssets,
      mismatchBridgeCount,
      totalTvl,
    ],
  );
  const drilldownContexts = useMemo<Record<string, DrilldownContext>>(
    () => ({
      tvl: {
        id: "tvl",
        title: "Total value locked",
        subtitle: "Bridge TVL ranked by the current dashboard filters.",
        metrics: [
          { label: "Filtered TVL", value: formatCurrency(totalTvl) },
          { label: "Bridge count", value: filteredBridges.length },
        ],
        rows: buildBridgeRows(filteredBridges),
      },
      assets: {
        id: "assets",
        title: "Monitored assets",
        subtitle: "Health trend summary for filtered assets.",
        metrics: [
          { label: "Visible assets", value: filteredAssets.length },
          { label: "Improving", value: improvingAssets },
          { label: "Deteriorating", value: deterioratingAssets },
        ],
        rows: filteredAssets.slice(0, 8).map((asset) => ({
          label: asset.symbol,
          value: asset.health?.overallScore ?? "No score",
          status: asset.health?.trend ?? "No trend",
        })),
      },
      bridges: {
        id: "bridges",
        title: "Active bridges",
        subtitle: "Operational status for filtered bridges.",
        metrics: [
          { label: "Active", value: activeBridgeCount },
          { label: "Down", value: filteredBridges.length - activeBridgeCount },
        ],
        rows: buildBridgeRows(filteredBridges),
      },
      health: {
        id: "health",
        title: "System health",
        subtitle: "Average asset health and high-mismatch bridges.",
        metrics: [
          { label: "Average health", value: formatPercent(averageHealth) },
          { label: "High mismatch", value: mismatchBridgeCount },
        ],
        rows: filteredBridges
          .filter((bridge) => bridge.mismatchPercentage > 1)
          .slice(0, 8)
          .map((bridge) => ({
            label: bridge.name,
            value: `${bridge.mismatchPercentage.toFixed(3)}%`,
            status: bridge.status,
          })),
      },
    }),
    [
      activeBridgeCount,
      averageHealth,
      deterioratingAssets,
      filteredAssets,
      filteredBridges,
      improvingAssets,
      mismatchBridgeCount,
      totalTvl,
    ],
  );
  const metricInspectorMetadata = useMemo<Record<string, MetricInspectorMetadata>>(
    () => ({
      tvl: {
        id: "tvl",
        label: "Total value locked",
        definition:
          "The sum of total value locked across bridges that match the current dashboard bridge, favorite, and view filters.",
        source:
          "Bridge records from the bridges API, using each bridge totalValueLocked field after client-side filters are applied.",
        context: `${filteredBridges.length} bridges are included in the current view for a combined ${formatCurrency(totalTvl)}.`,
        refresh:
          "Bridge data is queried by React Query and refreshes with the dashboard data cycle or manual refresh.",
      },
      assets: {
        id: "assets",
        label: "Monitored assets",
        definition:
          "The number of assets with health records visible after asset, status, and time filters are applied.",
        source:
          "Asset and health-score records from the assets-with-health API, scoped through dashboard filter state.",
        context: `${filteredAssets.length} assets are visible, with ${improvingAssets} improving and ${deterioratingAssets} deteriorating.`,
        refresh:
          "Asset health refreshes automatically and can be refreshed manually from the dashboard toolbar.",
      },
      bridges: {
        id: "bridges",
        label: "Active bridges",
        definition: "The count of filtered bridges that are not currently reported as down.",
        source:
          "Bridge status records from the bridges API, filtered by bridge status, favorites, and selected bridges.",
        context: `${activeBridgeCount} of ${filteredBridges.length} filtered bridges are active.`,
        refresh: "Bridge statuses refresh with the dashboard query cadence and pull-to-refresh action.",
      },
      health: {
        id: "health",
        label: "System health",
        definition:
          "The arithmetic average of visible asset health scores, with bridge mismatch count shown as operational context.",
        source:
          "Health-score payloads from monitored assets, combined with bridge mismatch percentages from bridge records.",
        context: `Average health is ${formatPercent(averageHealth)} and ${mismatchBridgeCount} bridges exceed the mismatch threshold.`,
        refresh: "Health data follows the asset health query cadence and WebSocket updates where available.",
      },
    }),
    [
      activeBridgeCount,
      averageHealth,
      deterioratingAssets,
      filteredAssets.length,
      filteredBridges.length,
      improvingAssets,
      mismatchBridgeCount,
      totalTvl,
    ],
  );
  const activeDrilldown = activeDrilldownId ? drilldownContexts[activeDrilldownId] ?? null : null;
  const inspectedMetric = inspectedMetricId
    ? metricInspectorMetadata[inspectedMetricId] ?? null
    : null;

  function setDrilldown(id: string | null) {
    const params = new URLSearchParams(location.search);
    if (id) {
      params.set(DRILLDOWN_PARAM, id);
    } else {
      params.delete(DRILLDOWN_PARAM);
    }
    navigate({ search: params.toString() }, { replace: false });
  }

  const currentShareUrl =
    typeof window === "undefined"
      ? `https://bridge-watch.local${location.pathname}${location.search}`
      : window.location.href;

  const renderWidget = (id: string) => {
    if (!isWidgetVisible(id)) return null;

    switch (id) {
      case "kpi-banner":
        return (
          <div
            key="kpi-banner"
            data-tour="kpis"
            data-widget-id="kpi-banner"
            tabIndex={0}
            className="focus:ring-2 focus:ring-stellar-blue outline-none"
          >
            <KpiBanner
              items={kpiItems}
              loading={assetsLoading || bridgesLoading}
              layout={dashboard.state.view === "overview" ? "expanded" : "compact"}
              onDrilldown={(item) => setDrilldown(item.id)}
              onInspectMetric={(item) => setInspectedMetricId(item.id)}
            />
          </div>
        );

      case "status-cards":
        return (
          <div key="status-cards" data-tour="status-cards">
            <InlineStatusCards
              assets={filteredAssets}
              bridges={filteredBridges}
              loading={assetsLoading || bridgesLoading}
            />
          </div>
        );

      case "overview-stats":
        return (
          <section key="overview-stats" aria-labelledby="overview-stats">
            <h2 id="overview-stats" className="text-xl font-semibold text-white mb-4">
              Overview
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <SummaryCard
                title="Total Value Locked"
                value={
                  bridgesLoading
                    ? "--"
                    : `$${(bridgesData?.bridges ?? [])
                        .reduce((sum, b) => sum + b.totalValueLocked, 0)
                        .toLocaleString() || "0"}`
                }
                loading={bridgesLoading}
                icon="💰"
                href="/bridges"
              />
              <SummaryCard
                title="Monitored Assets"
                value={assetsLoading ? "--" : assetsWithHealth?.length || 0}
                loading={assetsLoading}
                icon="📊"
                href="/assets"
              />
              <SummaryCard
                title="Active Bridges"
                value={
                  bridgesLoading
                    ? "--"
                    : bridgesData?.bridges.filter((b: { status: string }) => b.status !== "down").length || 0
                }
                loading={bridgesLoading}
                icon="🌉"
                href="/bridges"
              />
              <SummaryCard
                title="System Health"
                value={assetsLoading ? "--" : "85%"}
                trend={{ value: "Improving", direction: "up" }}
                loading={assetsLoading}
                icon="❤️"
                href="/analytics"
              />
            </div>
          </section>
        );

      case "sparkline-grid":
        return showAssets ? (
          <div key="sparkline-grid">
            <ComparativeSparklineGrid items={sparklineItems} />
          </div>
        ) : null;

      case "asset-discovery":
        return showAssets ? (
          <section key="asset-discovery" ref={gridRef}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Asset Health</h2>
            </div>
            {showFilteredAssetEmpty ? (
              <div
                data-widget-id="asset-empty"
                tabIndex={0}
                className="rounded-lg border border-stellar-border bg-stellar-card p-8 text-center focus:ring-2 focus:ring-stellar-blue outline-none"
              >
                <p className="text-stellar-text-secondary">No assets match the selected filters.</p>
                <button
                  type="button"
                  onClick={clearAll}
                  className="mt-3 text-sm text-stellar-blue hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div
                data-widget-id="asset-discovery"
                tabIndex={0}
                className="focus:ring-2 focus:ring-stellar-blue outline-none"
              >
                <AssetDiscoverySection assets={filteredAssets} isLoading={assetsLoading} />
              </div>
            )}
          </section>
        ) : null;

      case "watchlist":
        return showAssets ? (
          <div key="watchlist">
            <WatchlistWidget />
          </div>
        ) : null;

      case "external-dependencies":
        return showAssets ? (
          <div key="external-dependencies">
            <ExternalDependencyPanel />
          </div>
        ) : null;

      case "activity-timeline":
        return (
          <section key="activity-timeline">
            <RecentActivityTimeline
              maxEvents={50}
              defaultMode="compact"
              showFilters={true}
              showHeader={true}
              sourceOptions={activitySourceOptions}
            />
          </section>
        );

      case "bridge-status":
        return showBridges ? (
          <section key="bridge-status">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Bridge Status</h2>
              <Link to="/bridges" className="text-sm text-stellar-blue hover:underline">
                View all
              </Link>
            </div>
            {bridgesLoading ? (
              <p className="text-stellar-text-secondary">Loading bridges...</p>
            ) : filteredBridges.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBridges.map((bridge) => (
                  <div key={bridge.name} className="space-y-2">
                    <BridgeStatusCard
                      {...bridge}
                      topRight={
                        <FavoriteTagChip
                          compact
                          label={bridge.name}
                          active={favoriteBridges.includes(bridge.name)}
                          onToggle={() => toggleFavoriteBridge(bridge.name)}
                        />
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setDrilldown("bridges")}
                      className="w-full rounded-md border border-stellar-border px-3 py-2 text-xs font-medium text-stellar-text-secondary transition-colors hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                    >
                      Inspect bridge details
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-stellar-card border border-stellar-border rounded-lg p-8 text-center">
                <p className="text-stellar-text-secondary">
                  {bridgeFiltersActive
                    ? "No bridges match the selected filters."
                    : "No bridge data available yet."}
                </p>
              </div>
            )}
          </section>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      <PullToRefresh
        isPulling={pullToRefresh.isPulling}
        pullDistance={pullToRefresh.pullDistance}
        progress={pullToRefresh.progress}
        isRefreshing={pullToRefresh.isRefreshing}
      />

      <div className="flex flex-col gap-6 md:flex-row">
        <div data-tour="filters" className="w-full md:w-80 md:shrink-0">
          <AssetFilterPanel
            assets={availableAssets}
            bridges={availableBridges}
            filters={filters}
            savedPresets={savedPresets}
            hasActiveFilters={hasActiveFilters}
            onToggleAsset={toggleAsset}
            onToggleBridge={toggleBridge}
            onStatusChange={setStatus}
            onTimeRangeChange={setTimeRange}
            onClearAll={clearAll}
            onSavePreset={savePreset}
            onApplyPreset={applyPreset}
            onDeletePreset={deletePreset}
          />
        </div>

        <main className="flex-1 space-y-8 min-w-0">
          <div className="space-y-4 rounded-2xl border border-stellar-border bg-gradient-to-br from-stellar-card via-stellar-card to-stellar-dark/40 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-white">Dashboard</h1>
              <LiveUpdatePill
                updatedAt={dashboardUpdatedAt}
                polling={assetsFetching || bridgesFetching}
              />
            </div>
            <p className="mt-2 max-w-2xl text-stellar-text-secondary">
              Real-time monitoring of bridged assets on the Stellar network, with shareable
              views for assets, bridges, and the combined overview.
            </p>
          </div>

          <div data-tour="toolbar" className="flex flex-wrap items-center gap-2">
            <FilterPresetsMenu
              filters={filters}
              presets={savedPresets}
              onSavePreset={savePreset}
              onApplyPreset={applyPreset}
              onRenamePreset={renamePreset}
              onDeletePreset={deletePreset}
              onToggleShared={setPresetShared}
            />
            <button
              type="button"
              onClick={tour.start}
              className="rounded-full border border-stellar-border px-4 py-2 text-sm text-white transition-colors hover:bg-stellar-border"
            >
              {tour.completed ? "Replay tour" : "Take a tour"}
            </button>
            <button
              type="button"
              onClick={() => {
                void pullToRefresh.refresh();
              }}
              className="rounded-full border border-stellar-border px-4 py-2 text-sm text-white transition-colors hover:bg-stellar-border"
            >
              Refresh data
            </button>
            <button
              type="button"
              onClick={() => setIsCustomizing(true)}
              className="rounded-full border border-stellar-border px-4 py-2 text-sm text-white transition-colors hover:bg-stellar-border"
            >
              Customize layout
            </button>
            <button
              type="button"
              onClick={() => setExportPickerOpen(true)}
              className="rounded-full border border-stellar-border px-4 py-2 text-sm text-white transition-colors hover:bg-stellar-border"
            >
              Export data
            </button>
            <button
              type="button"
              onClick={() => setSharingOpen(true)}
              className="rounded-full border border-stellar-border px-4 py-2 text-sm text-white transition-colors hover:bg-stellar-border"
            >
              Share view
            </button>
            <Tabs
              activeTab={dashboard.state.view}
              onTabChange={(id) => dashboard.setView(id as DashboardView)}
            >
              <TabList
                aria-label="Dashboard views"
                className="flex flex-wrap items-center gap-2"
              >
                {dashboardViews.map((view) => (
                  <Tab key={view.id} id={view.id}>
                    {view.label}
                  </Tab>
                ))}
              </TabList>
              {dashboardViews.map((view) => (
                <TabPanel children={<></>} key={view.id} id={view.id} keepMounted />
              ))}
            </Tabs>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-stellar-border/80 bg-stellar-dark/30 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-stellar-text-primary">Bridge status filter</p>
            <p className="text-xs text-stellar-text-secondary">
              The selected filter is encoded in the URL and survives reloads and shared links.
            </p>
          </div>

          <select
            value={dashboard.state.bridgeStatus}
            onChange={(e) => dashboard.setBridgeStatus(e.target.value as BridgeStatusFilter)}
            className="min-w-44 rounded-md border border-stellar-border bg-stellar-card px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            aria-label="Filter bridges by status"
          >
            {bridgeStatusOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {layout.map((item) => renderWidget(item.id))}
        </main>
      </div>
      <ExportPickerDialog
        open={exportPickerOpen}
        onClose={() => setExportPickerOpen(false)}
        availableAssets={assetsWithHealth ?? []}
        availableBridges={bridgesData?.bridges ?? []}
      />
      <DashboardSharingModal
        open={sharingOpen}
        currentUrl={currentShareUrl}
        onClose={() => setSharingOpen(false)}
      />
      <DashboardLayoutCustomizer
        open={isCustomizing}
        onClose={() => setIsCustomizing(false)}
        layout={layout}
        onToggleVisibility={toggleWidgetVisibility}
        onMoveWidget={moveWidget}
        onResetLayout={resetLayout}
      />
      <DrilldownDrawer
        open={Boolean(activeDrilldown)}
        context={activeDrilldown}
        onClose={() => setDrilldown(null)}
        onBack={() => setDrilldown(null)}
      />
      <MetricsInspectorDrawer
        open={Boolean(inspectedMetric)}
        metric={inspectedMetric}
        onClose={() => setInspectedMetricId(null)}
      />
      <AssetInsightsTray
        open={insightsTrayOpen}
        symbol={insightsTraySymbol}
        assetName={
          assetsWithHealth?.find((a) => a.symbol === insightsTraySymbol)?.name ?? null
        }
        onClose={closeInsightsTray}
      />
      <DashboardTour
        steps={dashboardTourSteps}
        activeStep={tour.activeStep}
        onNext={tour.next}
        onPrev={tour.prev}
        onSkip={tour.skip}
        onFinish={tour.finish}
      />
    </div>
  );
}
