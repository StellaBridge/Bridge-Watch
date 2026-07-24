import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { LoadingFallback } from "./components/LoadingFallback";
import { GlobalErrorBoundary } from "./components/ErrorBoundary";
import { NotificationProvider } from "./context/NotificationContext";
import { useNotifications } from "./hooks/useNotifications";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const AssetDetail = lazy(() => import("./pages/AssetDetail"));
const Bridges = lazy(() => import("./pages/Bridges"));
const Incidents = lazy(() => import("./pages/Incidents"));
const IncidentReplay = lazy(() => import("./pages/IncidentReplay"));
const Analytics = lazy(() => import("./pages/Analytics"));
const CustomMetricBuilder = lazy(() => import("./pages/CustomMetricBuilder"));
const Reports = lazy(() => import("./pages/Reports"));
const Landing = lazy(() => import("./pages/Landing"));
const Settings = lazy(() => import("./pages/Settings"));
const WatchlistPage = lazy(() => import("./pages/Watchlist"));
const WatchlistsPage = lazy(() => import("./pages/Watchlists"));
const Transactions = lazy(() => import("./pages/Transactions"));
const ApiKeys = lazy(() => import("./pages/ApiKeys"));
const AlertRoutingAdmin = lazy(() => import("./pages/AlertRoutingAdmin"));
const SupplyChain = lazy(() => import("./pages/SupplyChain"));
const BridgeTopologyExplorer = lazy(() => import("./pages/BridgeTopologyExplorer"));
const Reconciliation = lazy(() => import("./pages/Reconciliation"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const Help = lazy(() => import("./pages/Help"));
const ReleaseNotes = lazy(() => import("./pages/ReleaseNotes"));
const NotificationPreferencesPage = lazy(() => import("./pages/NotificationPreferencesPage"));
const RelationshipExplorer = lazy(() => import("./pages/RelationshipExplorer"));
const SearchResultsPage = lazy(() => import("./pages/SearchResultsPage"));
const Alerts = lazy(() => import("./pages/Alerts"));
const AlertPlaybookViewer = lazy(() => import("./pages/AlertPlaybookViewer"));
const DataProvenanceGraph = lazy(() => import("./pages/DataProvenanceGraph"));
const AlertSimulationSandbox = lazy(() => import("./pages/AlertSimulationSandbox"));
const LiquidityFragmentation = lazy(() => import("./pages/LiquidityFragmentation"));
const LiquidityDashboard = lazy(() => import("./pages/LiquidityDashboard"));
const SchemaDriftMonitor = lazy(() => import("./pages/SchemaDriftMonitor"));
const OperationalAccessAudit = lazy(() => import("./pages/OperationalAccessAudit"));
const BridgeHealthTimeline = lazy(() => import("./pages/BridgeHealthTimeline"));
const ExportScheduler = lazy(() => import("./pages/ExportScheduler"));
const AssetComparison = lazy(() => import("./pages/AssetComparison"));
const MetricsSidebarPage = lazy(() => import("./pages/MetricsSidebar"));
const CrossChainVerification = lazy(() => import("./pages/CrossChainVerification"));
const FreshnessMonitoring = lazy(() => import("./pages/FreshnessMonitoring"));
const ServiceAnnotations = lazy(() => import("./pages/ServiceAnnotations"));
const LiquidityConcentration = lazy(() => import("./pages/LiquidityConcentration"));

function NotificationInitializer() {
  useNotifications();
  return null;
}

function App() {
  return (
    <GlobalErrorBoundary>
      <NotificationProvider>
        <NotificationInitializer />
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />

            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/assets/:symbol" element={<AssetDetail />} />
              <Route path="/bridges" element={<Bridges />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/incidents/replay/:id" element={<IncidentReplay />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/alert-playbooks" element={<AlertPlaybookViewer />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/analytics/metric-builder" element={<CustomMetricBuilder />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route path="/watchlists" element={<WatchlistsPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin/api-keys" element={<ApiKeys />} />
              <Route path="/admin/alert-routing" element={<AlertRoutingAdmin />} />
              <Route path="/admin/access-audit" element={<OperationalAccessAudit />} />
              <Route path="/supply-chain" element={<SupplyChain />} />
              <Route path="/bridge-topology" element={<BridgeTopologyExplorer />} />
              <Route path="/reconciliation" element={<Reconciliation />} />
              <Route path="/api-docs" element={<ApiDocs />} />
              <Route path="/help" element={<Help />} />
              <Route path="/release-notes" element={<ReleaseNotes />} />
              <Route path="/notification-preferences" element={<NotificationPreferencesPage />} />
              <Route path="/relationship-explorer" element={<RelationshipExplorer />} />
              <Route path="/search" element={<SearchResultsPage />} />
              <Route path="/data-provenance" element={<DataProvenanceGraph />} />
              <Route path="/alert-sandbox" element={<AlertSimulationSandbox />} />
              <Route path="/liquidity-fragmentation" element={<LiquidityFragmentation />} />
              <Route path="/liquidity-dashboard" element={<LiquidityDashboard />} />
              <Route path="/schema-drift" element={<SchemaDriftMonitor />} />
              <Route path="/bridge-health-timeline" element={<BridgeHealthTimeline />} />
              <Route path="/export-scheduler" element={<ExportScheduler />} />
              <Route path="/asset-comparison" element={<AssetComparison />} />
              <Route path="/metrics-sidebar" element={<MetricsSidebarPage />} />
              <Route path="/cross-chain-verification" element={<CrossChainVerification />} />
              <Route path="/freshness" element={<FreshnessMonitoring />} />
              <Route path="/service-annotations" element={<ServiceAnnotations />} />
              <Route path="/liquidity-concentration" element={<LiquidityConcentration />} />
            </Route>
          </Routes>
        </Suspense>
      </NotificationProvider>
    </GlobalErrorBoundary>
  );
}

export default App;
