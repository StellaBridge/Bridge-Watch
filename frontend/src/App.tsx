import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { LoadingFallback } from "./components/LoadingFallback";
import { GlobalErrorBoundary, ComponentErrorBoundary } from "./components/ErrorBoundary";
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
const CircuitBreakerActions = lazy(() => import("./pages/CircuitBreakerActions"));
const LiquidityConcentration = lazy(() => import("./pages/LiquidityConcentration"));
const AssetExposureConcentration = lazy(() => import("./pages/AssetExposureConcentration"));
const BridgeTransferSLATracking = lazy(() => import("./pages/BridgeTransferSLATracking"));
const DataQualityScoring = lazy(() => import("./pages/DataQualityScoring"));
const ProviderLatencyComparison = lazy(() => import("./pages/ProviderLatencyComparison"));
// #1058 — Request Sampling Controls
const SamplingRules = lazy(() => import("./pages/admin/SamplingRules"));
// #1059 — Structured Error Catalog
const ErrorCatalogAdmin = lazy(() => import("./pages/admin/ErrorCatalog"));
// #1060 — Operational Change Approval Workflow
const ChangeRequests = lazy(() => import("./pages/admin/ChangeRequests"));
// #1061 — Config Rollback Preview
const ConfigRollback = lazy(() => import("./pages/admin/ConfigRollback"));
// #1148 — Bulk Asset Metadata Editing
const BulkAssetMetadataEditor = lazy(() => import("./pages/admin/BulkAssetMetadataEditor"));
// #1146 — Operator Availability Calendar
const OperatorAvailabilityCalendar = lazy(() => import("./pages/admin/OperatorAvailabilityCalendar"));
// #1145 — Incident Ownership Transfer
const IncidentOwnershipTransfer = lazy(() => import("./pages/admin/IncidentOwnershipTransfer"));
// #1143 — Alert Escalation Policy Preview
const AlertEscalationPolicyPreview = lazy(() => import("./pages/admin/AlertEscalationPolicyPreview"));
// #1162 — External Source Response Archive
const ExternalSourceResponseArchive = lazy(() => import("./pages/admin/ExternalSourceResponseArchive"));
// #1171 — Dataset Column Lineage
const DatasetColumnLineage = lazy(() => import("./pages/admin/DatasetColumnLineage"));
// #1170 — Import Validation Preview
const ImportValidationPreview = lazy(() => import("./pages/admin/ImportValidationPreview"));
// #1172 — API Key Scope Templates
const ApiKeyScopeTemplates = lazy(() => import("./pages/admin/ApiKeyScopeTemplates"));
// #1168 — Failed Parse Quarantine Queue
const ParseQuarantineQueue = lazy(() => import("./pages/admin/ParseQuarantineQueue"));
// #1177 — Security Event Correlation View
const SecurityEventCorrelation = lazy(() => import("./pages/admin/SecurityEventCorrelation"));
// #1178 — Webhook IP Allowlist Management
const WebhookIpAllowlist = lazy(() => import("./pages/admin/WebhookIpAllowlist"));
// #1179 — Signed Request Verification Middleware
const SignedRequestVerification = lazy(() => import("./pages/admin/SignedRequestVerification"));
// #1180 — Sensitive Field Access Reports
const SensitiveFieldAccessReport = lazy(() => import("./pages/admin/SensitiveFieldAccessReport"));
const DexPoolDiscovery = lazy(() => import("./pages/liquidity/DexPoolDiscovery"));
const PoolQualityRanking = lazy(() => import("./pages/liquidity/PoolQualityRanking"));
const MarketImpactPresets = lazy(() => import("./pages/liquidity/MarketImpactPresets"));
const RouteQuotes = lazy(() => import("./pages/liquidity/RouteQuotes"));
// #1040 — Asset Lifecycle State Timeline
const AssetLifecycleTimeline = lazy(() => import("./pages/AssetLifecycleTimeline"));
// #1176 — Permission Change Notifications
const PermissionChangeNotifications = lazy(() => import("./pages/PermissionChangeNotifications"));
// #1173 — Session Device Management
const SessionDeviceManagement = lazy(() => import("./pages/SessionDeviceManagement"));
// #1175 — Admin Impersonation Safeguards
const AdminImpersonationSafeguards = lazy(() => import("./pages/admin/AdminImpersonationSafeguards"));
// #1184 — Queue Priority Fairness
const QueueFairness = lazy(() => import("./pages/admin/QueueFairness"));

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
              <Route
                path="/relationship-explorer"
                element={
                  <ComponentErrorBoundary
                    severity="medium"
                    context="relationship-explorer"
                  >
                    <RelationshipExplorer />
                  </ComponentErrorBoundary>
                }
              />
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
              <Route path="/circuit-breaker-actions" element={<CircuitBreakerActions />} />
              <Route path="/liquidity-concentration" element={<LiquidityConcentration />} />
              <Route path="/asset-exposure" element={<AssetExposureConcentration />} />
              <Route path="/transfer-sla" element={<BridgeTransferSLATracking />} />
              <Route path="/data-quality" element={<DataQualityScoring />} />
              <Route path="/provider-latency" element={<ProviderLatencyComparison />} />
              {/* #1058 — Request Sampling Controls */}
              <Route path="/admin/sampling-rules" element={<SamplingRules />} />
              {/* #1059 — Structured Error Catalog */}
              <Route path="/admin/error-catalog" element={<ErrorCatalogAdmin />} />
              {/* #1060 — Operational Change Approval Workflow */}
              <Route path="/admin/change-requests" element={<ChangeRequests />} />
              {/* #1061 — Config Rollback Preview */}
              <Route path="/admin/config-rollback" element={<ConfigRollback />} />
              {/* #1148 — Bulk Asset Metadata Editing */}
              <Route path="/admin/bulk-asset-metadata" element={<BulkAssetMetadataEditor />} />
              {/* #1146 — Operator Availability Calendar */}
              <Route path="/admin/operator-availability" element={<OperatorAvailabilityCalendar />} />
              {/* #1145 — Incident Ownership Transfer */}
              <Route path="/admin/incident-ownership-transfer" element={<IncidentOwnershipTransfer />} />
              {/* #1143 — Alert Escalation Policy Preview */}
              <Route path="/admin/alert-escalation-preview" element={<AlertEscalationPolicyPreview />} />
              {/* #1162 — External Source Response Archive */}
              <Route path="/admin/external-source-archive" element={<ExternalSourceResponseArchive />} />
              {/* #1171 — Dataset Column Lineage */}
              <Route path="/admin/dataset-lineage" element={<DatasetColumnLineage />} />
              {/* #1170 — Import Validation Preview */}
              <Route path="/admin/import-validation-preview" element={<ImportValidationPreview />} />
              {/* #1172 — API Key Scope Templates */}
              <Route path="/admin/api-key-templates" element={<ApiKeyScopeTemplates />} />
              {/* #1168 — Failed Parse Quarantine Queue */}
              <Route path="/admin/quarantine" element={<ParseQuarantineQueue />} />
              {/* #1177 — Security Event Correlation View */}
              <Route path="/admin/security-correlations" element={<SecurityEventCorrelation />} />
              {/* #1178 — Webhook IP Allowlist Management */}
              <Route path="/admin/webhook-ip-allowlist" element={<WebhookIpAllowlist />} />
              {/* #1179 — Signed Request Verification Middleware */}
              <Route path="/admin/signed-requests" element={<SignedRequestVerification />} />
              {/* #1180 — Sensitive Field Access Reports */}
              <Route path="/admin/sensitive-field-reports" element={<SensitiveFieldAccessReport />} />
              {/* #1157 — DEX Pool Discovery Refresh */}
              <Route path="/liquidity/pool-discovery" element={<DexPoolDiscovery />} />
              {/* #1158 — Liquidity Pool Quality Ranking */}
              <Route path="/liquidity/pool-quality" element={<PoolQualityRanking />} />
              {/* #1159 — Market Impact Scenario Presets */}
              <Route path="/liquidity/market-impact-presets" element={<MarketImpactPresets />} />
              {/* #1160 — Route Quote Expiration Handling */}
              <Route path="/liquidity/route-quotes" element={<RouteQuotes />} />
              {/* #1040 — Asset Lifecycle State Timeline */}
              <Route path="/assets/lifecycle-timeline" element={<AssetLifecycleTimeline />} />
              {/* #1176 — Permission Change Notifications */}
              <Route path="/notifications/permission-changes" element={<PermissionChangeNotifications />} />
              {/* #1173 — Session Device Management */}
              <Route path="/user/devices" element={<SessionDeviceManagement />} />
              {/* #1175 — Admin Impersonation Safeguards */}
              <Route path="/admin/impersonation-safeguards" element={<AdminImpersonationSafeguards />} />
              {/* #1184 — Queue Priority Fairness */}
              <Route path="/admin/queue-fairness" element={<QueueFairness />} />
            </Route>
          </Routes>
        </Suspense>
      </NotificationProvider>
    </GlobalErrorBoundary>
  );
}

export default App;
