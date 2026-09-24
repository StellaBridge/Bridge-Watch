export interface Asset {
  symbol: string;
  name: string;
  category?: string | null;
}

export interface HealthFactors {
  liquidityDepth: number;
  priceStability: number;
  bridgeUptime: number;
  reserveBacking: number;
  volumeTrend: number;
}

export interface HealthScore {
  symbol?: string;
  overallScore: number;
  factors: HealthFactors;
  trend: "improving" | "stable" | "deteriorating";
  lastUpdated: string;
}

export type HealthStatus = "healthy" | "warning" | "critical";

export interface AssetWithHealth extends Asset {
  health: HealthScore | null;
}

export type SortField = "symbol" | "score";
export type SortOrder = "asc" | "desc";
export type FilterStatus = "all" | HealthStatus;

export interface Bridge {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
}

export interface EvmLockDetail {
  chain: "ethereum" | "polygon" | "base";
  contractAddress: string;
  tokenAddress: string;
  assetSymbol: string;
  lockedAmount: string;
  isPaused: boolean;
  blockNumber: number;
  timestamp: number;
  error: string | null;
}

export interface BridgeStats {
  name: string;
  volume24h: number;
  volume7d: number;
  volume30d: number;
  customVolume?: number;
  startDate?: string;
  endDate?: string;
  totalTransactions: number;
  averageTransferTime: number;
  uptime30d: number;
  /** Per-chain EVM lock contract balances, present for multi-chain (e.g. Wormhole) bridges. */
  evmLockDetails?: EvmLockDetail[];
}

export type ReconciliationTriageStatus =
  | "open"
  | "investigating"
  | "acknowledged"
  | "resolved"
  | "false_positive";

export type DriftSeverity = "aligned" | "low" | "medium" | "high" | "critical";
export type DriftTrendDirection = "new" | "improving" | "worsening" | "flat";
export type ReconciliationRange = "24h" | "7d" | "30d" | "90d";
export type ReconciliationStatus = "running" | "success" | "mismatch" | "failed";

export interface ReconciliationSourceDatum {
  id: "on-chain" | "reserve-attestation" | "reported-backing";
  label: string;
  source: string;
  value: number | null;
  unit: string;
  observedAt: string | null;
  status: string;
  reference: string | null;
  details: Record<string, string | number | boolean | null>;
}

export interface ReconciliationRun {
  id: string;
  assetCode: string;
  bridgeName: string;
  sourceChain: string | null;
  status: ReconciliationStatus;
  triageStatus: ReconciliationTriageStatus;
  triageOwner: string | null;
  triageNote: string | null;
  triagedAt: string | null;
  stellarSupply: number | null;
  reportedSupply: number | null;
  mismatchPercentage: number | null;
  discrepancy: number | null;
  discrepancyAbs: number | null;
  severity: DriftSeverity;
  startedAt: string;
  finishedAt: string | null;
  attempt: number;
  jobId: string | null;
  error: string | null;
  sourceData: ReconciliationSourceDatum[];
}

export interface ReconciliationDriftSummary {
  id: string;
  assetCode: string;
  bridgeName: string;
  sourceChain: string | null;
  latestRun: ReconciliationRun;
  previousRunId: string | null;
  severity: DriftSeverity;
  trendDirection: DriftTrendDirection;
  unresolved: boolean;
  mismatchDelta: number | null;
  runCount: number;
  mismatchRunCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  history: Array<{
    id: string;
    startedAt: string;
    mismatchPercentage: number | null;
    status: ReconciliationStatus;
    triageStatus: ReconciliationTriageStatus;
  }>;
}

export interface ReconciliationDashboardResponse {
  generatedAt: string;
  filters: {
    assetCode: string | null;
    bridge: string | null;
    range: ReconciliationRange;
    startDate: string | null;
    endDate: string | null;
  };
  totals: {
    summaries: number;
    unresolved: number;
    critical: number;
    mismatchRuns: number;
  };
  availableFilters: {
    assets: string[];
    bridges: string[];
    ranges: ReconciliationRange[];
  };
  summaries: ReconciliationDriftSummary[];
}

export interface ReconciliationMismatchDetail {
  generatedAt: string;
  mismatch: ReconciliationRun;
  history: ReconciliationRun[];
  sourceData: ReconciliationSourceDatum[];
  reserveCommitment: {
    bridgeId: string;
    sequence: number | null;
    merkleRoot: string;
    totalReserves: number | null;
    status: string;
    verificationStatus: CommitmentVerificationStatus;
    txHash: string | null;
    committedAt: string | number;
    committedLedger: number;
    updatedAt: string | null;
  } | null;
}

/**
 * Bridge summary data combining status and performance metrics
 * for display in summary card components
 */
export interface BridgeSummary {
  id: string;
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  /** Coverage metric: bridge uptime percentage (0-100) */
  coverage: number;
  /** Performance metric: average transfer time in milliseconds */
  performance: number;
  /** Total value locked in the bridge (USD) */
  totalValueLocked: number;
  /** Total value locked in native token (optional, for USD/Native toggle) */
  totalValueLockedNative?: number;
  /** Supply on Stellar */
  supplyOnStellar: number;
  /** Supply on source chain */
  supplyOnSource: number;
  /** Mismatch percentage between supplies */
  mismatchPercentage: number;
  /** Timestamp of last data update */
  lastUpdated: string;
}

// Transaction History types
export type TransactionStatus = "pending" | "completed" | "failed";

export interface BridgeTransaction {
  id: string;
  txHash: string;
  bridge: string;
  asset: string;
  amount: number;
  sourceChain: string;
  destinationChain: string;
  senderAddress: string;
  recipientAddress: string;
  status: TransactionStatus;
  fee: number;
  timestamp: string;
  confirmedAt: string | null;
  stellarTxHash: string | null;
  ethereumTxHash: string | null;
  blockNumber: number | null;
}

export interface TransactionFilters {
  bridge: string;
  asset: string;
  status: TransactionStatus | "all";
  search: string;
  dateFrom: string;
  dateTo: string;
}

export interface TransactionPage {
  transactions: BridgeTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type ExportFormat = "csv" | "json";

export type ExportDataType = "analytics" | "transactions" | "health_metrics";

export type ExportStatus = "pending" | "processing" | "completed" | "failed";

export interface ExportFilters {
  startDate: string;
  endDate: string;
  assetCodes?: string[];
  bridgeIds?: string[];
}

export interface ExportRecord {
  id: string;
  requested_by: string;
  format: ExportFormat;
  data_type: ExportDataType;
  filters: ExportFilters;
  status: ExportStatus;
  download_url: string | null;
  download_url_expires_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// WebSocket connection
export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type SubscriptionChannel = "prices" | "health" | "health-updates" | "alerts" | "bridges";

interface WsBaseMessage {
  channel: SubscriptionChannel | string;
  type?: string;
  timestamp?: string;
}

export interface WsPriceMessage extends WsBaseMessage {
  channel: "prices";
  symbol: string;
  price: number;
  source: string;
  vwap?: number;
}

export interface WsHealthMessage extends WsBaseMessage {
  channel: "health" | "health-updates";
  symbol: string;
  overallScore: number;
  factors: HealthFactors;
  trend: "improving" | "stable" | "deteriorating";
  lastUpdated: string;
}

export interface WsAlertMessage extends WsBaseMessage {
  channel: "alerts";
  severity: "info" | "warning" | "critical";
  message: string;
  symbol?: string;
  bridgeName?: string;
}

export interface WsBridgeMessage extends WsBaseMessage {
  channel: "bridges";
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
}

export type WsMessage = WsPriceMessage | WsHealthMessage | WsAlertMessage | WsBridgeMessage;

export type PriceTimeframe = "1H" | "24H" | "7D" | "30D";

export interface AssetInfo {
  symbol: string;
  name: string;
  type?: string;
  description?: string;
  issuer?: string;
  domain?: string;
  bridge?: string;
  sourceChain?: string;
}

export interface AssetMetadata {
  id: string;
  asset_id: string;
  symbol: string;
  category: string | null;
  tags: string[];
  description?: string | null;
  updated_at?: string;
  version?: number;
}

export interface PriceSource {
  source: string;
  price: number;
  timestamp: string;
  deviation: number;
  status: "active" | "stale" | "offline";
}

export interface HealthHistoryPoint {
  timestamp: string;
  score: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  usageCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  clientId?: string | null;
  oauthEnabled?: boolean;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: string[];
  rateLimitPerMinute?: number;
  expiresInDays?: number;
  enableOAuth?: boolean;
  /** #1172 — Apply a saved scope template by name to populate scopes/rateLimit. */
  template?: string;
}

export interface CreateApiKeyResponse {
  apiKey: string;
  key: ApiKeyRecord;
  clientId?: string;
  clientSecret?: string;
}

/** Service dependency graph (`/metadata/dependencies`) */
export type DependencyNodeStatus = "healthy" | "degraded" | "down" | "unknown";

export type DependencyNodeType = string;

export interface DependencyGraph {
  summary: {
    totalNodes: number;
    degradedServices: number;
    downServices: number;
  };
  nodes: Array<{
    id: string;
    label: string;
    description: string;
    type: DependencyNodeType;
    status: DependencyNodeStatus;
    impactHint: string;
  }>;
  edges: Array<{ from: string; to: string; kind: string }>;
}

export type RuleThresholdOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "between";
export type RuleLogicOperator = "AND" | "OR";
export type RulePriority = "low" | "medium" | "high" | "critical";
export type AlertRuleStatus = "active" | "paused" | "disabled";

export interface RuleCondition {
  metric: string;
  operator: RuleThresholdOperator;
  threshold: number;
  thresholdHigh?: number;
  label?: string;
}

export interface AlertRule {
  id: string;
  ownerAddress: string;
  name: string;
  description?: string | null;
  assetCode: string;
  conditions: RuleCondition[];
  logicOperator: RuleLogicOperator;
  priority: RulePriority;
  status: AlertRuleStatus;
  cooldownSeconds: number;
  timeWindow?: string | null;
  version?: number;
  templateId?: string | null;
  webhookUrl?: string | null;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  createdAt: string;
}

export type AssetAlert = Alert;

export type AlertRoutingSeverity = "critical" | "high" | "medium" | "low";
export type AlertRoutingChannel = "in_app" | "webhook" | "email";
export type AlertRoutingAuditStatus =
  | "queued"
  | "delivered"
  | "suppressed"
  | "failed"
  | "fallback";

export interface AlertRoutingRule {
  id: string;
  name: string;
  ownerAddress: string | null;
  severityLevels: AlertRoutingSeverity[];
  assetCodes: string[];
  sourceTypes: string[];
  channels: AlertRoutingChannel[];
  fallbackChannels: AlertRoutingChannel[];
  suppressionWindowSeconds: number;
  priorityOrder: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRoutingAuditEntry {
  id: string;
  eventTime: string;
  alertRuleId: string;
  routingRuleId: string | null;
  ownerAddress: string;
  assetCode: string;
  sourceType: string;
  severity: AlertRoutingSeverity;
  channel: string;
  status: AlertRoutingAuditStatus;
  reason: string | null;
  attemptCount: number;
  latencyMs: number | null;
  createdAt: string;
}

export interface CreateAlertRoutingRuleRequest {
  name: string;
  ownerAddress?: string;
  severityLevels?: AlertRoutingSeverity[];
  assetCodes?: string[];
  sourceTypes?: string[];
  channels: AlertRoutingChannel[];
  fallbackChannels?: AlertRoutingChannel[];
  suppressionWindowSeconds?: number;
  priorityOrder?: number;
  isActive?: boolean;
}

export type UpdateAlertRoutingRuleRequest = Partial<CreateAlertRoutingRuleRequest>;

// Data Provenance Graph types
export type ProvenanceNodeKind = "source" | "transform" | "destination";
export type ProvenanceFreshness = "fresh" | "stale" | "unknown";

export interface ProvenanceNode {
  id: string;
  label: string;
  kind: ProvenanceNodeKind;
  /** ISO timestamp of when this hop last produced data */
  timestamp: string;
  freshness: ProvenanceFreshness;
  /** e.g. "asset", "bridge", "metric" */
  entityType: string;
  /** e.g. "USDC", "Allbridge", "price" */
  entityId: string;
  description: string;
  /** Arbitrary key-value metadata about this node */
  metadata: Record<string, string | number | boolean>;
}

export interface ProvenanceEdge {
  from: string;
  to: string;
  /** e.g. "fetch", "aggregate", "normalize" */
  transformKind: string;
  latencyMs: number | null;
}

export interface ProvenanceGraph {
  metric: string;
  asset: string | null;
  bridge: string | null;
  generatedAt: string;
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
}

export interface ProvenanceListItem {
  metric: string;
  asset: string | null;
  bridge: string | null;
  lastUpdated: string;
  nodeCount: number;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorType: "user" | "admin" | "system";
  action: string;
  resourceType: string;
  resourceId: string;
  severity?: "info" | "warning" | "critical";
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  checksum: string;
  previousChecksum?: string;
}

export interface RiskHistoryPoint {
  timestamp: string;
  score: number;
}

export interface EthereumChainState {
  blockNumber: number;
  lockedAmount: string;
  formattedAmount: string;
  isPaused: boolean;
  timestamp: number;
}

export interface StellarChainState {
  supply: number;
  assetCode: string;
  issuer: string;
}

export type CrossChainVerificationStatus = "verified" | "mismatch" | "error" | "stale" | "pending";

export type CommitmentVerificationStatus = "verified" | "challenged" | "pending" | "invalid" | "unknown";

export interface CrossChainStateResult {
  bridgeId: string;
  bridgeName: string;
  sourceChain: string;
  verifiedAt: string;
  ethereum: EthereumChainState | null;
  stellar: StellarChainState;
  merkleProofValid: boolean | null;
  proofDepth: number | null;
  proofLeafHash: string | null;
  leafCount: number | null;
  latestCommitmentSequence: number | null;
  stateConsistent: boolean;
  mismatchPct: number;
  mismatchThreshold: number;
  status: CrossChainVerificationStatus;
  cacheHit: boolean;
  freshnessSeconds: number;
  error?: string;
}

export interface CrossChainVerificationSummary {
  count: number;
  verified: number;
  mismatches: number;
  errors: number;
  results: CrossChainStateResult[];
}

export interface ServiceAnnotation {
  id: string;
  serviceName: string;
  entityType: string;
  entityId: string | null;
  content: string;
  author: string;
  startTime: string | null;
  endTime: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceAnnotationInput {
  serviceName: string;
  entityType: string;
  entityId?: string;
  content: string;
  author: string;
  startTime?: string;
  endTime?: string;
}

export interface UpdateServiceAnnotationInput {
  actor: string;
  content?: string;
  active?: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ServiceAnnotationAuditEntry {
  id: string;
  annotation_id: string;
  action: string;
  actor: string;
  changes: string;
  created_at: string;
}

// #1171 — Dataset Column Lineage
export type LineageNodeKind = "dataset" | "column" | "transform";

export interface ColumnLineageNode {
  id: string;
  kind: LineageNodeKind;
  name: string;
  datasetId: string | null;
  dataType: string | null;
  transformKind: string | null;
}

export interface ColumnLineageEdge {
  from: string;
  to: string;
  transformKind: string;
  transformOrder: number;
}

export interface ColumnLineageView {
  datasetId: string;
  datasetName: string;
  columnId: string;
  columnName: string;
  nodes: ColumnLineageNode[];
  edges: ColumnLineageEdge[];
  generatedAt: string;
}

export interface DatasetSummary {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  columnCount: number;
  isActive: boolean;
}

export interface DatasetColumn {
  id: string;
  datasetId: string;
  name: string;
  dataType: string | null;
  description: string | null;
  isPrimaryKey: boolean;
  position: number;
}

// #1170 — Import Validation Preview
export interface ImportValidationPreview {
  id: string;
  dataType: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  warningCount: number;
  dataQualityScore: number;
  errors: Array<Record<string, unknown>>;
  warnings: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  createdBy: string | null;
  applied: boolean;
  createdAt: string;
}

// #1172 — API Key Scope Templates
export interface ApiKeyScopeTemplate {
  id: string;
  name: string;
  description: string | null;
  scopes: string[];
  rateLimitPerMinute: number | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// #1168 — Failed Parse Quarantine Queue
export type QuarantineStatus =
  | "quarantined"
  | "in_review"
  | "resolved"
  | "disposed"
  | "failed";

export interface QuarantineRecord {
  id: string;
  source: string;
  dataType: string;
  rawPayload: Record<string, unknown>;
  parseError: string;
  errorCode: string | null;
  status: QuarantineStatus;
  retryCount: number;
  retryHistory: Array<Record<string, unknown>>;
  priority: number;
  reviewedBy: string | null;
  resolutionNote: string | null;
  quarantinedAt: string;
  reviewedAt: string | null;
  resolvedAt: string | null;
}

export interface QuarantineStats {
  total: number;
  byStatus: Record<QuarantineStatus, number>;
  bySource: Record<string, number>;
}

// #1040 — Asset Lifecycle State Timeline
export type AssetState =
  | "INITIALIZED"
  | "PROVISIONED"
  | "ACTIVE"
  | "PAUSED"
  | "DEPRECATED"
  | "RETIRED";

export interface AssetLifecycleRecord {
  id: string;
  assetId: string;
  assetSymbol: string;
  state: AssetState;
  previousState: AssetState | null;
  reason: string | null;
  triggeredBy: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AssetLifecycleStats {
  totalTransitions: number;
  byState: Record<AssetState, number>;
  activeAssets: number;
}

// #1176 — Permission Change Notifications
export type PermissionAction =
  | "ROLE_ASSIGNED"
  | "ROLE_REVOKED"
  | "PERMISSION_GRANTED"
  | "PERMISSION_REVOKED";

export type NotificationChannel = "IN_APP" | "EMAIL" | "SLACK";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface PermissionChangeNotificationRecord {
  id: string;
  targetUserId: string;
  actorId: string;
  action: PermissionAction;
  permissionOrRole: string;
  channels: NotificationChannel[];
  status: NotificationStatus;
  details: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionNotificationStats {
  total: number;
  byStatus: Record<NotificationStatus, number>;
  byAction: Record<PermissionAction, number>;
}

// #1173 — Session Device Management
export type DeviceType = "DESKTOP" | "MOBILE" | "TABLET" | "OTHER";

export interface SessionDeviceRecord {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  deviceType: DeviceType;
  ipAddress: string;
  location: string | null;
  userAgent: string | null;
  isActive: boolean;
  isTrusted: boolean;
  lastActiveAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// #1175 — Admin Impersonation Safeguards
export type ImpersonationStatus = "ACTIVE" | "ENDED" | "REVOKED" | "EXPIRED";

export interface AdminImpersonationSession {
  id: string;
  adminId: string;
  impersonatedUserId: string;
  reason: string;
  approvalTicketId: string | null;
  status: ImpersonationStatus;
  tokenHash: string;
  maxDurationMinutes: number;
  expiresAt: string;
  endedAt: string | null;
  ipAddress: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImpersonationAuditLog {
  id: string;
  impersonationSessionId: string;
  adminId: string;
  impersonatedUserId: string;
  actionPerformed: string;
  requestPath: string;
  requestMethod: string;
  timestamp: string;
}

export type LaneName = "critical" | "high" | "medium" | "low";
export type FairnessStatus = "healthy" | "degraded" | "unfair" | "starved";

export interface LanePolicy {
  laneName: LaneName;
  weight: number;
  minSharePct: number;
  enabled: boolean;
}

export interface FairnessAssessment {
  laneName: LaneName;
  status: FairnessStatus;
  reason: string;
  sharePct: number;
  minSharePct: number;
  depth: number;
  servedCount: number;
}

export interface FairnessStatusResponse {
  overall: FairnessStatus;
  byLane: FairnessAssessment[];
}

export interface BullMQCounts {
  counts: Record<string, { waiting: number; active: number; completed: number; failed: number }>;
}
