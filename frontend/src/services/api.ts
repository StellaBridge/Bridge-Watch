import type {
  AlertRoutingAuditEntry,
  AlertRoutingRule,
  ApiKeyRecord,
  Asset,
  AssetMetadata,
  AssetInfo,
  AssetWithHealth,
  CreateAlertRoutingRuleRequest,
  Bridge,
  BridgeStats,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  DependencyGraph,
  HealthScore,
  TransactionFilters,
  TransactionPage,
  ExportDataType,
  ExportFilters,
  ExportFormat,
  ExportRecord,
  ReconciliationDashboardResponse,
  ReconciliationMismatchDetail,
  ReconciliationRange,
  ReconciliationRun,
  ReconciliationTriageStatus,
  UpdateAlertRoutingRuleRequest,
  ProvenanceGraph,
  ProvenanceListItem,
  CrossChainStateResult,
  CrossChainVerificationSummary,
  ServiceAnnotation,
  CreateServiceAnnotationInput,
  UpdateServiceAnnotationInput,
  ServiceAnnotationAuditEntry,
} from "../types";
import type { LiquidityConcentrationData } from "../types/liquidity";
const API_BASE_URL = "/api/v1";

async function fetchApi<T>(
  endpoint: string,
  init?: RequestInit,
  apiKey?: string
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (apiKey) {
    headers.set("x-api-key", apiKey);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? "";
    } catch {
      // ignore non-JSON error bodies
    }
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`API error: ${response.status} ${response.statusText}${suffix}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export interface AnomalyTuningProfile {
  id: string;
  name: string;
  deviation_multiplier: number;
  sliding_window_size: number;
  updated_by: string | null;
  updated_at: string;
}

export interface AnomalyTuningOverride {
  id: string;
  anomaly_type: string;
  asset_code: string;
  bridge_name: string;
  reason: string;
  starts_at: string;
  expires_at: string;
}

export function getAnomalyTuning(apiKey: string) {
  return fetchApi<{ profile: AnomalyTuningProfile; overrides: AnomalyTuningOverride[] }>(
    "/anomaly/tuning",
    undefined,
    apiKey
  );
}

export function updateAnomalyTuning(
  apiKey: string,
  input: { deviationMultiplier: number; slidingWindowSize: number }
) {
  return fetchApi<{ profile: AnomalyTuningProfile }>(
    "/anomaly/tuning",
    { method: "PUT", body: JSON.stringify(input) },
    apiKey
  );
}

export function createAnomalyTuningOverride(
  apiKey: string,
  input: { assetCode?: string; reason: string; expiresAt: string }
) {
  return fetchApi<{ override: AnomalyTuningOverride }>(
    "/anomaly/tuning/overrides",
    { method: "POST", body: JSON.stringify(input) },
    apiKey
  );
}

export function deleteAnomalyTuningOverride(apiKey: string, id: string) {
  return fetchApi<void>(`/anomaly/tuning/overrides/${id}`, { method: "DELETE" }, apiKey);
}

/** Root health endpoint (not under /api/v1). */
export async function getServerHealth(): Promise<{ status: string; timestamp: string }> {
  const response = await fetch("/health");
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export type ExportStatus = "pending" | "processing" | "completed" | "failed";

export interface ExportRequestPayload {
  format: ExportFormat;
  dataType: ExportDataType;
  filters: ExportFilters;
  emailDelivery?: boolean;
  emailAddress?: string;
}

export async function requestExport(payload: ExportRequestPayload): Promise<ExportRecord> {
  const response = await fetchApi<{ export: ExportRecord }>("/exports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.export;
}

export async function getExportStatus(exportId: string): Promise<ExportRecord> {
  const response = await fetchApi<{ export: ExportRecord }>(`/exports/${exportId}`);
  return response.export;
}

export async function generateExportDownloadLink(exportId: string): Promise<string> {
  const response = await fetchApi<{ downloadLink: { url: string; expiresAt: string } }>(
    `/exports/${exportId}/download`
  );
  return response.downloadLink.url;
}

export interface SystemStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  uptime: number;
  version: string;
  maintenance?: {
    active: boolean;
    message: string;
    severity: "info" | "warning" | "critical";
    statusPageUrl?: string;
  };
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await fetch("/health/detailed");
  if (!response.ok) {
    throw new Error(`System status check failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}



// Assets
export function getAssets() {
  return fetchApi<{ assets: Asset[]; total: number }>("/assets");
}

export function getAssetDetail(symbol: string) {
  return fetchApi<{ symbol: string; details: unknown }>(`/assets/${symbol}`);
}

export function getAssetHealth(symbol: string) {
  return fetchApi<HealthScore | null>(`/assets/${symbol}/health`);
}

export function getAssetHealthHistory(
  symbol: string,
  period: "24h" | "7d" | "30d" = "7d"
) {
  return fetchApi<
    | {
      symbol: string;
      period: "24h" | "7d" | "30d";
      points: Array<{ timestamp: string; score: number }>;
    }
    | null
  >(`/assets/${symbol}/health/history?period=${period}`);
}

export async function getAssetsWithHealth(): Promise<AssetWithHealth[]> {
  const { assets } = await getAssets();
  const healthPromises = assets.map(async (asset) => {
    try {
      const health = await getAssetHealth(asset.symbol);
      return { ...asset, health };
    } catch {
      return { ...asset, health: null };
    }
  });
  return Promise.all(healthPromises);
}

export function getAssetLiquidity(symbol: string) {
  return fetchApi<{
    symbol: string;
    totalLiquidity: number;
    sources: Array<{
      dex: string;
      bidDepth: number;
      askDepth: number;
      totalLiquidity: number;
      timestamp?: string;
    }>;
  } | null>(`/assets/${symbol}/liquidity`);
}

export function getLiquidityConcentration(pair: string) {
  return fetchApi<LiquidityConcentrationData | null>(
    `/assets/${pair.split("/")[1]}/liquidity/concentration?pair=${encodeURIComponent(pair)}`
  );
}

export function getAssetPrice(symbol: string) {
  return fetchApi<{
    symbol: string;
    vwap: number;
    sources: Array<{ source: string; price: number; timestamp: string }>;
    history?: Array<{ source: string; price: number; timestamp: string }>;
    deviation: number;
    lastUpdated: string;
  } | null>(`/assets/${symbol}/price`);
}

export function getAssetInfo(symbol: string) {
  return fetchApi<AssetInfo | null>(`/assets/${symbol}/info`);
}

export function getAssetMetadataBySymbol(symbol: string) {
  return fetchApi<AssetMetadata>(`/metadata/symbol/${symbol}`);
}

export function upsertAssetMetadata(payload: {
  assetId: string;
  symbol: string;
  metadata: {
    category?: string | null;
    tags?: string[];
    description?: string | null;
  };
  updatedBy: string;
}) {
  return fetchApi<AssetMetadata>("/metadata", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAssetPriceHistory(symbol: string, timeframe: string) {
  return fetchApi<Array<{ source: string; price: number; timestamp: string }>>(
    `/assets/${symbol}/price/history?timeframe=${timeframe}`
  );
}

export function getAssetPriceSparkline(
  symbol: string,
  period: "24h" | "7d" | "30d" = "7d"
) {
  return fetchApi<{
    symbol: string;
    period: "24h" | "7d" | "30d";
    points: Array<{ timestamp: string; value: number }>;
  }>(`/assets/${symbol}/price/history?period=${period}`);
}

export function getAssetVolumeSparkline(
  symbol: string,
  period: "24h" | "7d" | "30d" = "7d"
) {
  return fetchApi<{
    symbol: string;
    period: "24h" | "7d" | "30d";
    points: Array<{ timestamp: string; value: number }>;
  }>(`/assets/${symbol}/volume/history?period=${period}`);
}

export function getAssetPriceSources(symbol: string) {
  return fetchApi<Array<{ source: string; price: number; timestamp: string }>>(
    `/assets/${symbol}/price/sources`
  );
}

export function getAssetLiquiditySources(symbol: string) {
  return fetchApi<Array<{
    dex: string;
    bidDepth: number;
    askDepth: number;
    totalLiquidity: number;
  }>>(`/assets/${symbol}/liquidity/sources`);
}

export function getAssetVolume(symbol: string) {
  return fetchApi<{
    symbol: string;
    volume24h: number;
    volume7d: number;
    volume30d: number;
  } | null>(`/assets/${symbol}/volume`);
}

export function getAssetSupplyVerification(symbol: string) {
  return fetchApi<{
    symbol: string;
    onChainSupply: number;
    offChainSupply: number;
    mismatchPercentage: number;
    lastVerified: string;
  } | null>(`/assets/${symbol}/supply`);
}

export function getAssetAlerts(symbol: string) {
  return fetchApi<Array<{
    id: string;
    type: string;
    severity: "info" | "warning" | "critical";
    message: string;
    createdAt: string;
  }>>(`/assets/${symbol}/alerts`);
}

export interface AlertSuppressionRule {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  maintenanceMode: boolean;
  expiresAt: string | null;
}

export function getSuppressionRules(includeExpired = false) {
  return fetchApi<{ rules: AlertSuppressionRule[] }>(
    `/alert-suppression/rules?includeExpired=${includeExpired ? "true" : "false"}`
  );
}

export function toggleSuppressionRule(id: string, payload: { actor: string; isActive: boolean }) {
  return fetchApi<{ rule: AlertSuppressionRule }>(`/alert-suppression/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createMaintenanceOverride(payload: {
  actor: string;
  startAt: string;
  endAt: string;
  description?: string;
  sources?: string[];
  assetCodes?: string[];
}) {
  return fetchApi<{ rule: AlertSuppressionRule }>("/alert-suppression/maintenance/override", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function previewSuppression(payload: {
  actor: string;
  assetCode: string;
  source: string;
  alertType: "price_deviation" | "supply_mismatch" | "bridge_downtime" | "health_score_drop" | "volume_anomaly" | "reserve_ratio_breach";
  priority: "critical" | "high" | "medium" | "low";
}) {
  return fetchApi<{
    decision: {
      suppressed: boolean;
      matchedRule: { id: string; name: string } | null;
      reason: string | null;
    };
  }>("/alert-suppression/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Bridges
export function getBridges() {
  return fetchApi<{ bridges: Bridge[] }>("/bridges");
}

export function getBridgeStats(bridge: string) {
  return fetchApi<BridgeStats | null>(`/bridges/${bridge}/stats`);
}

export interface ReconciliationSummaryFilters {
  assetCode?: string;
  bridge?: string;
  range?: ReconciliationRange;
  startDate?: string;
  endDate?: string;
}

export function getReconciliationDriftSummaries(
  filters: ReconciliationSummaryFilters = {}
) {
  const params = new URLSearchParams();
  if (filters.assetCode) params.set("assetCode", filters.assetCode);
  if (filters.bridge) params.set("bridge", filters.bridge);
  if (filters.range) params.set("range", filters.range);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);

  const query = params.toString();
  return fetchApi<ReconciliationDashboardResponse>(
    `/reconciliation/drift-summaries${query ? `?${query}` : ""}`
  );
}

export function getReconciliationMismatchDetail(
  id: string,
  range: ReconciliationRange = "30d"
) {
  const params = new URLSearchParams({ range });
  return fetchApi<ReconciliationMismatchDetail>(
    `/reconciliation/mismatches/${id}?${params.toString()}`
  );
}

export function updateReconciliationTriage(
  id: string,
  payload: {
    status: ReconciliationTriageStatus;
    owner?: string | null;
    note?: string | null;
  }
) {
  return fetchApi<{ run: ReconciliationRun }>(`/reconciliation/runs/${id}/triage`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getDependencyGraph(filters?: {
  type?: string;
  status?: string;
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.type) params.set("type", filters.type);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("q", filters.search);

  const query = params.toString();
  return fetchApi<DependencyGraph>(
    `/metadata/dependencies${query ? `?${query}` : ""}`
  );
}

// Transactions
export function getTransactions(
  filters: TransactionFilters,
  page: number,
  pageSize: number
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.bridge) params.set("bridge", filters.bridge);
  if (filters.asset) params.set("asset", filters.asset);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  return fetchApi<TransactionPage>(`/transactions?${params.toString()}`);
}

export function exportTransactionsCsv(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.bridge) params.set("bridge", filters.bridge);
  if (filters.asset) params.set("asset", filters.asset);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  params.set("format", "csv");

  return `${API_BASE_URL}/transactions/export?${params.toString()}`;
}

// API key management
export function listApiKeys(apiKey: string) {
  return fetchApi<{ keys: ApiKeyRecord[] }>("/admin/api-keys", undefined, apiKey);
}

export function createApiKey(
  apiKey: string,
  payload: CreateApiKeyRequest
) {
  return fetchApi<CreateApiKeyResponse>(
    "/admin/api-keys",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    apiKey
  );
}

export function rotateApiKey(apiKey: string, id: string) {
  return fetchApi<CreateApiKeyResponse>(
    `/admin/api-keys/${id}/rotate`,
    { method: "POST" },
    apiKey
  );
}

export function revokeApiKey(apiKey: string, id: string) {
  return fetchApi<{ key: ApiKeyRecord }>(
    `/admin/api-keys/${id}/revoke`,
    { method: "POST" },
    apiKey
  );
}

export function extendApiKey(apiKey: string, id: string, extraDays: number) {
  return fetchApi<{ key: ApiKeyRecord }>(
    `/admin/api-keys/${id}/extend`,
    {
      method: "POST",
      body: JSON.stringify({ extraDays }),
    },
    apiKey
  );
}

// Alert routing admin
export function listAlertRoutingRules(apiKey: string, ownerAddress?: string) {
  const suffix = ownerAddress
    ? `?ownerAddress=${encodeURIComponent(ownerAddress)}`
    : "";
  return fetchApi<{ rules: AlertRoutingRule[] }>(
    `/admin/alert-routing/rules${suffix}`,
    undefined,
    apiKey
  );
}

export function createAlertRoutingRule(
  apiKey: string,
  payload: CreateAlertRoutingRuleRequest
) {
  return fetchApi<{ rule: AlertRoutingRule }>(
    "/admin/alert-routing/rules",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    apiKey
  );
}

export function updateAlertRoutingRule(
  apiKey: string,
  id: string,
  payload: UpdateAlertRoutingRuleRequest
) {
  return fetchApi<{ rule: AlertRoutingRule }>(
    `/admin/alert-routing/rules/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    apiKey
  );
}

export function deleteAlertRoutingRule(apiKey: string, id: string) {
  return fetchApi<Record<string, never>>(
    `/admin/alert-routing/rules/${id}`,
    {
      method: "DELETE",
    },
    apiKey
  );
}

export function getAlertRoutingAudit(
  apiKey: string,
  options?: {
    ownerAddress?: string;
    status?: "queued" | "delivered" | "suppressed" | "failed" | "fallback";
    channel?: string;
    limit?: number;
  }
) {
  const params = new URLSearchParams();
  if (options?.ownerAddress) params.set("ownerAddress", options.ownerAddress);
  if (options?.status) params.set("status", options.status);
  if (options?.channel) params.set("channel", options.channel);
  if (options?.limit) params.set("limit", String(options.limit));

  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";

  return fetchApi<{ entries: AlertRoutingAuditEntry[] }>(
    `/admin/alert-routing/audit${suffix}`,
    undefined,
    apiKey
  );
}

// Supply Chain
export function getSupplyChainGraph() {
  return fetchApi<import("../components/SupplyChainViz/types").SupplyChainGraph>("/supply-chain");
}

export function getSupplyChainNodes() {
  return fetchApi<{ nodes: import("../components/SupplyChainViz/types").ChainNode[] }>("/supply-chain/nodes");
}

export function getSupplyChainEdges() {
  return fetchApi<{ edges: import("../components/SupplyChainViz/types").BridgeEdge[] }>("/supply-chain/edges");
}

// Price Feeds
export function getPriceFeeds() {
  return fetchApi<{
    prices: Array<{
      symbol: string;
      price: number;
      confidence: number;
      sources: number;
      lastUpdated: string;
    }>;
  }>("/price-feeds");
}

export function getPriceFeed(symbol: string) {
  return fetchApi<{
    symbol: string;
    price: number;
    confidence: number;
    sources: number;
    lastUpdated: string;
  }>(`/price-feeds/${symbol}`);
}

export function getPriceFeedComparison(symbol: string) {
  return fetchApi<{
    symbol: string;
    consensus: number;
    samples: Array<{
      source: string;
      price: number;
      weight: number;
      isOutlier: boolean;
    }>;
  }>(`/price-feeds/${symbol}/compare`);
}

export function getPriceFeedHealth() {
  return fetchApi<{
    sources: Array<{
      name: string;
      successRate: number;
      avgLatencyMs: number;
      lastSuccess: string | null;
    }>;
  }>("/price-feeds/health");
}

export interface ExternalDependencyCheck {
  id: string;
  providerKey: string;
  status: "healthy" | "degraded" | "down" | "maintenance" | "unknown";
  checkedAt: string;
  latencyMs: number | null;
  statusCode: number | null;
  withinThreshold: boolean;
  alertTriggered: boolean;
  error: string | null;
  details: Record<string, unknown>;
}

export interface ExternalDependency {
  providerKey: string;
  displayName: string;
  category: string;
  endpoint: string;
  checkType: "http" | "jsonrpc";
  latencyWarningMs: number;
  latencyCriticalMs: number;
  failureThreshold: number;
  maintenanceMode: boolean;
  maintenanceNote: string | null;
  status: "healthy" | "degraded" | "down" | "maintenance" | "unknown";
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  alertState: "none" | "firing" | "suppressed";
  history?: ExternalDependencyCheck[];
}

export function getExternalDependencies(includeHistory = true, historyLimit = 8) {
  const params = new URLSearchParams({
    includeHistory: includeHistory ? "true" : "false",
    historyLimit: String(historyLimit),
  });

  return fetchApi<{
    dependencies: ExternalDependency[];
    summary: Record<"healthy" | "degraded" | "down" | "maintenance" | "unknown", number>;
  }>(`/external-dependencies?${params.toString()}`);
}

export interface IndexedSearchResult {
  id: string;
  type: "asset" | "bridge" | "incident" | "alert";
  title: string;
  description: string;
  relevanceScore: number;
  highlights: string[];
  metadata: Record<string, unknown>;
}

export function searchIndexed(query: string, limit = 12) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    fuzzy: "true",
  });

  return fetchApi<{
    success: boolean;
    data: {
      results: IndexedSearchResult[];
      total: number;
    };
  }>(`/search?${params.toString()}`);
}

export function getProvenanceMetrics(filters?: {
  asset?: string;
  bridge?: string;
  metric?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.asset) params.set("asset", filters.asset);
  if (filters?.bridge) params.set("bridge", filters.bridge);
  if (filters?.metric) params.set("metric", filters.metric);
  const query = params.toString();
  return fetchApi<{ metrics: ProvenanceListItem[] }>(
    `/provenance${query ? `?${query}` : ""}`
  );
}

export function getProvenanceLineage(
  metric: string,
  asset?: string,
  bridge?: string
) {
  const params = new URLSearchParams({ metric });
  if (asset) params.set("asset", asset);
  if (bridge) params.set("bridge", bridge);
  return fetchApi<ProvenanceGraph>(`/provenance/lineage?${params.toString()}`);
}

export interface BridgeHealthPoint {
  timestamp: string;
  score: number;
  annotation?: string;
}

export interface BridgeHealthHistoryResponse {
  bridge: string;
  period: "24h" | "7d" | "30d";
  points: BridgeHealthPoint[];
}

export function getBridgeHealthHistory(
  bridgeName: string,
  period: "24h" | "7d" | "30d" = "7d"
) {
  return fetchApi<BridgeHealthHistoryResponse | null>(
    `/bridges/${encodeURIComponent(bridgeName)}/health/history?period=${period}`
  );
}

export interface ScheduledExport {
  id: string;
  name: string;
  format: ExportFormat;
  dataType: ExportDataType;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  timezone: string;
  deliveryMethod: "email" | "download";
  emailAddress?: string;
  filters: ExportFilters;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export interface CreateScheduledExportRequest {
  name: string;
  format: ExportFormat;
  dataType: ExportDataType;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  timezone: string;
  deliveryMethod: "email" | "download";
  emailAddress?: string;
  filters: ExportFilters;
}

export function listScheduledExports() {
  return fetchApi<{ schedules: ScheduledExport[] }>("/exports/schedules");
}

export function createScheduledExport(payload: CreateScheduledExportRequest) {
  return fetchApi<{ schedule: ScheduledExport }>("/exports/schedules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateScheduledExport(
  id: string,
  payload: Partial<CreateScheduledExportRequest> & { isActive?: boolean }
) {
  return fetchApi<{ schedule: ScheduledExport }>(`/exports/schedules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteScheduledExport(id: string) {
  return fetchApi<Record<string, never>>(`/exports/schedules/${id}`, {
    method: "DELETE",
  });
}

export function runScheduledExportNow(id: string) {
  return fetchApi<{ export: ExportRecord }>(`/exports/schedules/${id}/run`, {
    method: "POST",
  });
}

// Incidents / Heatmap
export interface HeatmapBucket {
  date: string;
  hour: number;
  count: number;
  bySeverity: Record<string, number>;
  incidents: Array<{
    id: string;
    time: string;
    entity_type: string;
    entity_id: string;
    asset_symbol: string;
    severity: string;
    title: string;
    description: string;
  }>;
}

export function getIncidentHeatmap(params?: {
  startDate?: string;
  endDate?: string;
  assetSymbol?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.startDate) searchParams.set("startDate", params.startDate);
  if (params?.endDate) searchParams.set("endDate", params.endDate);
  if (params?.assetSymbol) searchParams.set("assetSymbol", params.assetSymbol);

  const qs = searchParams.toString();
  return fetchApi<{
    buckets: HeatmapBucket[];
    totalIncidents: number;
    dateRange: { start: string; end: string };
    assets: string[];
  }>(`/incidents/heatmap${qs ? `?${qs}` : ""}`);
}

export type IncidentReplayEventType =
  | "incident_created"
  | "ingestion"
  | "status_change"
  | "enrichment"
  | "resolution";

export interface IncidentReplayEvent {
  id: string;
  timestamp: string;
  eventType: IncidentReplayEventType;
  title: string;
  description: string;
  severity?: string;
  metadata: Record<string, unknown>;
}

export interface IncidentReplayTimeline {
  incidentId: string;
  incident: {
    id: string;
    bridgeId: string;
    assetCode: string | null;
    severity: string;
    status: string;
    title: string;
    description: string;
    occurredAt: string;
    resolvedAt: string | null;
  };
  events: IncidentReplayEvent[];
  durationMs: number;
}

export function getIncidentReplayTimeline(incidentId: string) {
  return fetchApi<IncidentReplayTimeline>(`/incidents/${encodeURIComponent(incidentId)}/replay`);
}

export interface SavedMetric {
  id: string;
  name: string;
  description: string | null;
  formula: string;
  isShared: boolean;
  createdBy: string;
  cacheTtl: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MetricValidationResponse {
  valid: boolean;
  errors: string[];
  preview?: {
    rowCount: number;
    columns: string[];
    sampleRows: Record<string, unknown>[];
  };
}

export function listSavedMetrics() {
  return fetchApi<{ success: boolean; data: SavedMetric[] }>("/analytics/saved-metrics").then(
    (r) => r.data,
  );
}

export function createSavedMetric(payload: {
  name: string;
  description?: string;
  formula: string;
  isShared?: boolean;
  cacheTtl?: number;
}) {
  return fetchApi<{ success: boolean; data: SavedMetric }>("/analytics/saved-metrics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function validateMetricFormula(formula: string) {
  return fetchApi<{ success: boolean; data: MetricValidationResponse }>(
    "/analytics/saved-metrics/validate",
    {
      method: "POST",
      body: JSON.stringify({ formula }),
    },
  );
}

export function deleteSavedMetric(id: string) {
  return fetchApi<{ success: boolean }>(`/analytics/saved-metrics/${id}`, {
    method: "DELETE",
  });
}

export interface PlaybookStep {
  order: number;
  title: string;
  body: string;
}

export interface AlertPlaybook {
  id: string;
  alertType: string;
  title: string;
  severity: string[];
  summary: string;
  steps: PlaybookStep[];
  tags: string[];
}

export function searchAlertPlaybooks(params?: {
  q?: string;
  alertType?: string;
  severity?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set("q", params.q);
  if (params?.alertType) searchParams.set("alertType", params.alertType);
  if (params?.severity) searchParams.set("severity", params.severity);
  const qs = searchParams.toString();
  return fetchApi<{ playbooks: AlertPlaybook[]; total: number; query?: string }>(
    `/playbooks${qs ? `?${qs}` : ""}`,
  );
}

export function getAlertPlaybook(id: string) {
  return fetchApi<AlertPlaybook>(`/playbooks/${encodeURIComponent(id)}`);
}

export function getCrossChainVerifications(force = false): Promise<CrossChainVerificationSummary> {
  return fetchApi<CrossChainVerificationSummary>(
    `/cross-chain-verification${force ? "?force=true" : ""}`
  );
}

export function getCrossChainVerification(
  bridgeId: string,
  force = false
): Promise<CrossChainStateResult> {
  return fetchApi<CrossChainStateResult>(
    `/cross-chain-verification/${encodeURIComponent(bridgeId)}${force ? "?force=true" : ""}`
  );
}

export function triggerCrossChainVerification(bridgeId: string): Promise<CrossChainStateResult> {
  return fetchApi<CrossChainStateResult>(
    `/cross-chain-verification/${encodeURIComponent(bridgeId)}/verify`,
    { method: "POST" }
  );
}

export interface FreshnessSourceStatus {
  key: string;
  label: string;
  status: "fresh" | "stale" | "unknown";
  lastUpdated: string | null;
  expectedIntervalMs: number;
  trend?: "improving" | "stable" | "degrading" | null;
  ageMs?: number | null;
}

export interface FreshnessSnapshot {
  sources: FreshnessSourceStatus[];
  staleSources: number;
  freshSources: number;
  timestamp: string;
}

export interface FreshnessSourceDetail extends FreshnessSourceStatus {
  history?: Array<{ timestamp: string; ageMs: number }>;
  recentIntervalsMs?: number[];
}

export interface FreshnessAlert {
  source: string;
  label: string;
  severity: "warning" | "critical";
  message: string;
  since: string;
}

export function getFreshnessSnapshot(opts?: {
  includeHistory?: boolean;
  historyLimit?: number;
}): Promise<FreshnessSnapshot> {
  const params = new URLSearchParams();
  if (opts?.includeHistory) params.set("includeHistory", "true");
  if (opts?.historyLimit != null) params.set("historyLimit", String(opts.historyLimit));
  const qs = params.toString();
  return fetchApi<FreshnessSnapshot>(`/freshness${qs ? `?${qs}` : ""}`);
}

export function getFreshnessSource(
  source: string,
  opts?: { historyLimit?: number }
): Promise<FreshnessSourceDetail> {
  const params = new URLSearchParams();
  if (opts?.historyLimit != null) params.set("historyLimit", String(opts.historyLimit));
  const qs = params.toString();
  return fetchApi<FreshnessSourceDetail>(
    `/freshness/${encodeURIComponent(source)}${qs ? `?${qs}` : ""}`
  );
}

export function getFreshnessSourceTrend(
  source: string,
  opts?: { historyLimit?: number }
): Promise<FreshnessSourceDetail> {
  const params = new URLSearchParams();
  if (opts?.historyLimit != null) params.set("historyLimit", String(opts.historyLimit));
  const qs = params.toString();
  return fetchApi<FreshnessSourceDetail>(
    `/freshness/${encodeURIComponent(source)}/trend${qs ? `?${qs}` : ""}`
  );
}

export function getFreshnessAlerts(): Promise<{ alerts: FreshnessAlert[]; timestamp: string }> {
  return fetchApi<{ alerts: FreshnessAlert[]; timestamp: string }>("/freshness/alerts");
}

export interface SchemaDriftSummary {
  source_name: string;
  incident_count: number;
  last_detected: string;
}

export interface SchemaDriftIncident {
  id: string;
  source_name: string;
  drift_type: "ADDITION" | "REMOVAL" | "TYPE_CHANGE";
  field_path: string;
  expected_type?: string | null;
  actual_type?: string | null;
  is_breaking: boolean;
  detected_at: string;
  is_resolved?: boolean;
}

export interface SchemaDriftReport {
  summary: SchemaDriftSummary[];
  recentIncidents: SchemaDriftIncident[];
}

export function getSchemaDriftReport(): Promise<SchemaDriftReport> {
  return fetchApi<SchemaDriftReport>("/schema-drift/report");
}

// Service Annotations
export function listServiceAnnotations(params?: {
  serviceName?: string;
  entityType?: string;
  entityId?: string;
  active?: string;
  author?: string;
}): Promise<ServiceAnnotation[]> {
  const searchParams = new URLSearchParams();
  if (params?.serviceName) searchParams.set("serviceName", params.serviceName);
  if (params?.entityType) searchParams.set("entityType", params.entityType);
  if (params?.entityId) searchParams.set("entityId", params.entityId);
  if (params?.active) searchParams.set("active", params.active);
  if (params?.author) searchParams.set("author", params.author);
  const qs = searchParams.toString();
  return fetchApi<ServiceAnnotation[]>(`/service-annotations${qs ? `?${qs}` : ""}`);
}

export function getServiceAnnotation(id: string): Promise<ServiceAnnotation> {
  return fetchApi<ServiceAnnotation>(`/service-annotations/${id}`);
}

export function createServiceAnnotation(
  input: CreateServiceAnnotationInput
): Promise<ServiceAnnotation> {
  return fetchApi<ServiceAnnotation>("/service-annotations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateServiceAnnotation(
  id: string,
  input: UpdateServiceAnnotationInput
): Promise<ServiceAnnotation> {
  return fetchApi<ServiceAnnotation>(`/service-annotations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteServiceAnnotation(id: string): Promise<Record<string, never>> {
  return fetchApi<Record<string, never>>(`/service-annotations/${id}`, {
    method: "DELETE",
  });
}

export function getServiceAnnotationAudit(
  id: string
): Promise<ServiceAnnotationAuditEntry[]> {
  return fetchApi<ServiceAnnotationAuditEntry[]>(`/service-annotations/${id}/audit`);
}
