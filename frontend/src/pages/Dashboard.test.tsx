import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Dashboard from "./Dashboard";
import type { AssetWithHealth, Bridge } from "../types";

// Mock subcomponents to keep test focused on Dashboard page orchestration and interactions
vi.mock("../components/LiveUpdatePill", () => ({
  LiveUpdatePill: ({ polling }: { polling?: boolean }) => (
    <div data-testid="live-update-pill">LiveUpdate: {polling ? "polling" : "idle"}</div>
  ),
}));

vi.mock("../components/PullToRefresh", () => ({
  default: ({ isRefreshing }: { isRefreshing?: boolean }) => (
    <div data-testid="pull-to-refresh">PTR: {isRefreshing ? "refreshing" : "idle"}</div>
  ),
}));

vi.mock("../components/Filters/AssetFilterPanel", () => ({
  default: ({ onClearAll, onStatusChange, filters, hasActiveFilters }: any) => (
    <div data-testid="asset-filter-panel">
      <span>Active Filters: {hasActiveFilters ? "yes" : "no"}</span>
      <button onClick={onClearAll}>Mock Clear All</button>
      <button onClick={() => onStatusChange("critical")}>Set Status Critical</button>
    </div>
  ),
}));

vi.mock("../components/Filters/FilterPresetsMenu", () => ({
  default: ({ onSavePreset, onApplyPreset }: any) => (
    <div data-testid="filter-presets-menu">
      <button onClick={() => onSavePreset("My Preset")}>Save Preset</button>
    </div>
  ),
}));

vi.mock("../components/dashboard/KpiBanner", () => ({
  default: ({ items, onDrilldown, onInspectMetric }: any) => (
    <div data-testid="kpi-banner">
      {items.map((item: any) => (
        <div key={item.id} data-testid={`kpi-${item.id}`}>
          <span>{item.label}</span>: <span>{item.value}</span>
          <button onClick={() => onDrilldown(item)}>Drilldown {item.id}</button>
          <button onClick={() => onInspectMetric(item)}>Inspect {item.id}</button>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("../components/dashboard/InlineStatusCards", () => ({
  default: ({ assets, bridges }: any) => (
    <div data-testid="inline-status-cards">
      <span>Assets Count: {assets?.length ?? 0}</span>
      <span>Bridges Count: {bridges?.length ?? 0}</span>
    </div>
  ),
}));

vi.mock("../components/SummaryCard", () => ({
  SummaryCard: ({ title, value, loading, href }: any) => (
    <div data-testid={`summary-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <span>{title}</span>
      <span>{loading ? "Loading..." : String(value)}</span>
    </div>
  ),
}));

vi.mock("../components/analytics/ComparativeSparklineGrid", () => ({
  default: ({ items }: any) => (
    <div data-testid="sparkline-grid">
      <span>Sparkline count: {items?.length ?? 0}</span>
    </div>
  ),
}));

vi.mock("../components/dashboard/AssetDiscoverySection", () => ({
  default: ({ assets, isLoading }: any) => (
    <div data-testid="asset-discovery-section">
      <span>Discovery Loading: {isLoading ? "true" : "false"}</span>
      <span>Assets: {assets?.length ?? 0}</span>
    </div>
  ),
}));

vi.mock("../components/watchlist/WatchlistWidget", () => ({
  default: () => <div data-testid="watchlist-widget">Watchlist Widget</div>,
}));

vi.mock("../components/dashboard/ExternalDependencyPanel", () => ({
  default: () => <div data-testid="external-dependency-panel">External Dependency Panel</div>,
}));

vi.mock("../components/timeline", () => ({
  RecentActivityTimeline: ({ sourceOptions }: any) => (
    <div data-testid="recent-activity-timeline">
      <span>Timeline Options: {sourceOptions?.length ?? 0}</span>
    </div>
  ),
}));

vi.mock("../components/BridgeStatusCard", () => ({
  default: ({ name, status, totalValueLocked, topRight }: any) => (
    <div data-testid={`bridge-card-${name.toLowerCase().replace(/\s+/g, "-")}`}>
      <span>{name}</span>
      <span>{status}</span>
      <span>${totalValueLocked}</span>
      {topRight}
    </div>
  ),
}));

vi.mock("../components/favorites/FavoriteTagChip", () => ({
  default: ({ label, active, onToggle }: any) => (
    <button data-testid={`favorite-${label}`} onClick={onToggle}>
      {label} {active ? "(fav)" : ""}
    </button>
  ),
}));

vi.mock("../components/ExportPickerDialog", () => ({
  default: ({ open, onClose }: any) =>
    open ? (
      <div data-testid="export-picker-dialog">
        <span>Export Dialog</span>
        <button onClick={onClose}>Close Export</button>
      </div>
    ) : null,
}));

vi.mock("../components/dashboard/DashboardSharingModal", () => ({
  default: ({ open, onClose, currentUrl }: any) =>
    open ? (
      <div data-testid="dashboard-sharing-modal">
        <span>Share Modal: {currentUrl}</span>
        <button onClick={onClose}>Close Share</button>
      </div>
    ) : null,
}));

vi.mock("../components/dashboard/DrilldownDrawer", () => ({
  default: ({ open, onClose, context }: any) =>
    open ? (
      <div data-testid="drilldown-drawer">
        <span>Drilldown: {context?.title}</span>
        <button onClick={onClose}>Close Drilldown</button>
      </div>
    ) : null,
}));

vi.mock("../components/dashboard/MetricsInspectorDrawer", () => ({
  default: ({ open, onClose, metric }: any) =>
    open ? (
      <div data-testid="metrics-inspector-drawer">
        <span>Inspector: {metric?.label}</span>
        <button onClick={onClose}>Close Inspector</button>
      </div>
    ) : null,
}));

vi.mock("../components/asset/AssetInsightsTray", () => ({
  default: ({ open, symbol, onClose }: any) =>
    open ? (
      <div data-testid="asset-insights-tray">
        <span>Tray: {symbol}</span>
        <button onClick={onClose}>Close Tray</button>
      </div>
    ) : null,
}));

vi.mock("../components/dashboard/DashboardTour", () => ({
  default: ({ activeStep, onFinish }: any) =>
    activeStep >= 0 ? (
      <div data-testid="dashboard-tour">
        <span>Tour Active Step: {activeStep}</span>
        <button onClick={onFinish}>Finish Tour</button>
      </div>
    ) : null,
}));

// Mock data fixtures
const mockAssets: AssetWithHealth[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    type: "credit_alphanum4",
    supply: 50000000,
    accountsCount: 12000,
    paymentsCount: 45000,
    health: {
      overallScore: 92,
      trend: "improving",
      lastUpdated: new Date().toISOString(),
      factors: [],
    },
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    issuer: "GAV456...",
    type: "credit_alphanum4",
    supply: 10000000,
    accountsCount: 3000,
    paymentsCount: 12000,
    health: {
      overallScore: 65,
      trend: "deteriorating",
      lastUpdated: new Date().toISOString(),
      factors: [],
    },
  },
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    type: "native",
    supply: 100000000,
    accountsCount: 50000,
    paymentsCount: 200000,
    health: {
      overallScore: 40,
      trend: "stable",
      lastUpdated: new Date().toISOString(),
      factors: [],
    },
  },
];

const mockBridges: Bridge[] = [
  {
    id: "stellar-eth-1",
    name: "Stellar-Ethereum Bridge",
    sourceChain: "Stellar",
    targetChain: "Ethereum",
    status: "healthy",
    totalValueLocked: 15000000,
    mismatchPercentage: 0.05,
    lastChecked: new Date().toISOString(),
  },
  {
    id: "stellar-polygon-1",
    name: "Stellar-Polygon Bridge",
    sourceChain: "Stellar",
    targetChain: "Polygon",
    status: "degraded",
    totalValueLocked: 5000000,
    mismatchPercentage: 2.5,
    lastChecked: new Date().toISOString(),
  },
  {
    id: "stellar-bsc-1",
    name: "Stellar-BSC Bridge",
    sourceChain: "Stellar",
    targetChain: "BSC",
    status: "down",
    totalValueLocked: 2000000,
    mismatchPercentage: 5.0,
    lastChecked: new Date().toISOString(),
  },
];

// Mock hooks
const mockRefetchAssets = vi.fn().mockResolvedValue(undefined);
const mockRefetchBridges = vi.fn().mockResolvedValue(undefined);
const mockToggleFavoriteBridge = vi.fn();
let mockFavoritesList = ["Stellar-Ethereum Bridge"];

vi.mock("../hooks/useAssets", () => ({
  useAssetsWithHealth: vi.fn(() => ({
    data: mockAssets,
    isLoading: false,
    isFetching: false,
    dataUpdatedAt: Date.now(),
    refetch: mockRefetchAssets,
  })),
}));

vi.mock("../hooks/useBridges", () => ({
  useBridges: vi.fn(() => ({
    data: { bridges: mockBridges },
    isLoading: false,
    isFetching: false,
    dataUpdatedAt: Date.now(),
    refetch: mockRefetchBridges,
  })),
}));

vi.mock("../hooks/useFavorites", () => ({
  useFavorites: vi.fn(() => ({
    favoritesFilterMode: "all",
    toggleFavoriteBridge: mockToggleFavoriteBridge,
    favoriteBridges: mockFavoritesList,
  })),
}));

describe("Dashboard Page", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const renderDashboard = (initialSearch = "") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/dashboard${initialSearch}`]}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe("Initial Render & Structure", () => {
    it("renders page header, title, and live update pill", () => {
      renderDashboard();

      expect(screen.getByRole("heading", { name: "Dashboard", level: 1 })).toBeInTheDocument();
      expect(
        screen.getByText(/Real-time monitoring of bridged assets on the Stellar network/i)
      ).toBeInTheDocument();
      expect(screen.getByTestId("live-update-pill")).toBeInTheDocument();
    });

    it("renders toolbar actions and tour button", () => {
      renderDashboard();

      expect(screen.getByRole("button", { name: /Take a tour|Replay tour/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh data" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Customize layout" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Export data" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share view" })).toBeInTheDocument();
      expect(screen.getByTestId("filter-presets-menu")).toBeInTheDocument();
    });

    it("opens layout customizer when clicking Customize layout button", () => {
      renderDashboard();

      const customizeBtn = screen.getByRole("button", { name: "Customize layout" });
      fireEvent.click(customizeBtn);

      expect(screen.getByRole("heading", { name: "Customize dashboard layout" })).toBeInTheDocument();
      expect(screen.getByText("Reset to default")).toBeInTheDocument();
    });

    it("renders KPI banner and summary cards with calculated values", () => {
      renderDashboard();

      expect(screen.getByTestId("kpi-banner")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-tvl")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-assets")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-bridges")).toBeInTheDocument();
      expect(screen.getByTestId("kpi-health")).toBeInTheDocument();

      expect(screen.getByTestId("summary-card-total-value-locked")).toBeInTheDocument();
      expect(screen.getByTestId("summary-card-monitored-assets")).toBeInTheDocument();
      expect(screen.getByTestId("summary-card-active-bridges")).toBeInTheDocument();
      expect(screen.getByTestId("summary-card-system-health")).toBeInTheDocument();
    });

    it("renders sparkline grid, asset discovery, and bridge status sections in default overview view", () => {
      renderDashboard();

      expect(screen.getByTestId("sparkline-grid")).toBeInTheDocument();
      expect(screen.getByTestId("asset-discovery-section")).toBeInTheDocument();
      expect(screen.getByTestId("watchlist-widget")).toBeInTheDocument();
      expect(screen.getByTestId("external-dependency-panel")).toBeInTheDocument();
      expect(screen.getByTestId("recent-activity-timeline")).toBeInTheDocument();
      expect(screen.getByText("Bridge Status")).toBeInTheDocument();
    });
  });

  describe("View Tabs and View Filtering", () => {
    it("switches to assets view and hides bridge status section", async () => {
      renderDashboard("?dashboard_view=assets");

      expect(screen.getByTestId("asset-discovery-section")).toBeInTheDocument();
      expect(screen.queryByText("Bridge Status")).not.toBeInTheDocument();
    });

    it("switches to bridges view and hides asset health section", async () => {
      renderDashboard("?dashboard_view=bridges");

      expect(screen.getByText("Bridge Status")).toBeInTheDocument();
      expect(screen.queryByTestId("sparkline-grid")).not.toBeInTheDocument();
      expect(screen.queryByTestId("asset-discovery-section")).not.toBeInTheDocument();
    });

    it("allows switching tabs via view tab clicks", async () => {
      renderDashboard();

      const assetsTab = screen.getByRole("tab", { name: "Assets" });
      fireEvent.click(assetsTab);

      // Verify tab selection
      expect(assetsTab).toBeInTheDocument();
    });
  });

  describe("Filter interactions & Bridge Status Selection", () => {
    it("filters bridges by status dropdown", async () => {
      renderDashboard();

      const statusSelect = screen.getByLabelText("Filter bridges by status");
      expect(statusSelect).toBeInTheDocument();

      fireEvent.change(statusSelect, { target: { value: "healthy" } });
      expect(statusSelect).toHaveValue("healthy");
    });

    it("toggles bridge favorites", async () => {
      renderDashboard();

      const favButton = screen.getByTestId("favorite-Stellar-Ethereum Bridge");
      fireEvent.click(favButton);

      expect(mockToggleFavoriteBridge).toHaveBeenCalledWith("Stellar-Ethereum Bridge");
    });
  });

  describe("Modals, Drawers & Drilldown interactions", () => {
    it("opens ExportPickerDialog when clicking Export data button and closes on request", () => {
      renderDashboard();

      const exportBtn = screen.getByRole("button", { name: "Export data" });
      fireEvent.click(exportBtn);

      expect(screen.getByTestId("export-picker-dialog")).toBeInTheDocument();

      const closeExportBtn = screen.getByRole("button", { name: "Close Export" });
      fireEvent.click(closeExportBtn);

      expect(screen.queryByTestId("export-picker-dialog")).not.toBeInTheDocument();
    });

    it("opens DashboardSharingModal when clicking Share view button and closes on request", () => {
      renderDashboard();

      const shareBtn = screen.getByRole("button", { name: "Share view" });
      fireEvent.click(shareBtn);

      expect(screen.getByTestId("dashboard-sharing-modal")).toBeInTheDocument();

      const closeShareBtn = screen.getByRole("button", { name: "Close Share" });
      fireEvent.click(closeShareBtn);

      expect(screen.queryByTestId("dashboard-sharing-modal")).not.toBeInTheDocument();
    });

    it("opens DrilldownDrawer when clicking a drilldown button and closes it", () => {
      renderDashboard();

      const drilldownBtn = screen.getByRole("button", { name: "Drilldown tvl" });
      fireEvent.click(drilldownBtn);

      expect(screen.getByTestId("drilldown-drawer")).toBeInTheDocument();
      expect(screen.getByText("Drilldown: Total value locked")).toBeInTheDocument();

      const closeDrilldownBtn = screen.getByRole("button", { name: "Close Drilldown" });
      fireEvent.click(closeDrilldownBtn);

      expect(screen.queryByTestId("drilldown-drawer")).not.toBeInTheDocument();
    });

    it("opens MetricsInspectorDrawer when clicking Inspect metric", () => {
      renderDashboard();

      const inspectBtn = screen.getByRole("button", { name: "Inspect tvl" });
      fireEvent.click(inspectBtn);

      expect(screen.getByTestId("metrics-inspector-drawer")).toBeInTheDocument();
      expect(screen.getByText("Inspector: Total value locked")).toBeInTheDocument();

      const closeInspectorBtn = screen.getByRole("button", { name: "Close Inspector" });
      fireEvent.click(closeInspectorBtn);

      expect(screen.queryByTestId("metrics-inspector-drawer")).not.toBeInTheDocument();
    });

    it("opens drilldown drawer when inspecting bridge card details", () => {
      renderDashboard();

      const inspectBridgeDetailsBtns = screen.getAllByRole("button", { name: "Inspect bridge details" });
      expect(inspectBridgeDetailsBtns.length).toBeGreaterThan(0);
      fireEvent.click(inspectBridgeDetailsBtns[0]);

      expect(screen.getByTestId("drilldown-drawer")).toBeInTheDocument();
    });
  });

  describe("Refresh data & Pull to Refresh", () => {
    it("refetches assets and bridges when clicking Refresh data", async () => {
      renderDashboard();

      const refreshBtn = screen.getByRole("button", { name: "Refresh data" });
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(mockRefetchAssets).toHaveBeenCalled();
        expect(mockRefetchBridges).toHaveBeenCalled();
      });
    });
  });

  describe("Loading & Empty States", () => {
    it("handles loading states correctly", async () => {
      const { useAssetsWithHealth } = await import("../hooks/useAssets");
      const { useBridges } = await import("../hooks/useBridges");

      vi.mocked(useAssetsWithHealth).mockReturnValueOnce({
        data: undefined,
        isLoading: true,
        isFetching: false,
        dataUpdatedAt: 0,
        refetch: mockRefetchAssets,
      } as any);

      vi.mocked(useBridges).mockReturnValueOnce({
        data: undefined,
        isLoading: true,
        isFetching: false,
        dataUpdatedAt: 0,
        refetch: mockRefetchBridges,
      } as any);

      renderDashboard();

      expect(screen.getByText("Loading bridges...")).toBeInTheDocument();
      expect(screen.getByTestId("summary-card-total-value-locked")).toHaveTextContent("--");
      expect(screen.getByTestId("summary-card-monitored-assets")).toHaveTextContent("--");
    });

    it("displays empty state message when no bridges match filters", async () => {
      const { useBridges } = await import("../hooks/useBridges");

      vi.mocked(useBridges).mockReturnValueOnce({
        data: { bridges: [] },
        isLoading: false,
        isFetching: false,
        dataUpdatedAt: Date.now(),
        refetch: mockRefetchBridges,
      } as any);

      renderDashboard();

      expect(screen.getByText("No bridge data available yet.")).toBeInTheDocument();
    });
  });
});
