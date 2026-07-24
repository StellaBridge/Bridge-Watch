/**
 * TypeScript types matching the PostgreSQL database schema.
 * All timestamps are UTC. Decimal columns are returned as strings by pg driver
 * when they exceed JS number precision — use parseFloat() where needed.
 */

// ─── Core domain types ────────────────────────────────────────────────────────

export type AssetType = "native" | "credit_alphanum4" | "credit_alphanum12";
export type BridgeStatus = "healthy" | "degraded" | "down" | "unknown";
export type AlertPriority = "low" | "medium" | "high" | "critical";
export type PauseStatus = "active" | "recovering" | "resolved";
export type TriggerStatus = "triggered" | "resolved" | "expired";
export type RecoveryStatus = "pending" | "approved" | "executed" | "rejected";
export type CommitmentStatus = "pending" | "verified" | "challenged" | "slashed" | "resolved";
export type BridgeTransactionType = "mint" | "burn" | "transfer";
export type BridgeTransactionStatus = "pending" | "confirmed" | "failed" | "cancelled" | "processing";

export interface BridgeTransaction {
  id: string;
  bridge_name: string;
  symbol: string;
  transaction_type: BridgeTransactionType;
  status: BridgeTransactionStatus;
  correlation_id: string | null;
  tx_hash: string;
  source_chain: string | null;
  source_address: string | null;
  destination_address: string | null;
  amount: string;
  fee: string;
  submitted_at: Date;
  confirmed_at: Date | null;
  failed_at: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export type NewBridgeTransaction = Omit<BridgeTransaction, "id" | "created_at" | "updated_at" | "confirmed_at" | "failed_at" | "error_message"> & {
  confirmed_at?: Date | null;
  failed_at?: Date | null;
  error_message?: string | null;
};

export interface BridgeTransactionSummary {
  bridgeName: string;
  totalTransactions: number;
  totalVolume: string;
  averageConfirmationTimeSeconds: number;
  pendingTransactions: number;
  confirmedTransactions: number;
  failedTransactions: number;
}
export type ReconciliationStatus = "running" | "success" | "mismatch" | "failed";
export type ReconciliationTriageStatus =
  | "open"
  | "investigating"
  | "acknowledged"
  | "resolved"
  | "false_positive";

// ─── assets ──────────────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  issuer: string | null;
  asset_type: AssetType;
  bridge_provider: string | null;
  source_chain: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type NewAsset = Omit<Asset, "id" | "created_at" | "updated_at">;

// ─── bridges ─────────────────────────────────────────────────────────────────

export interface Bridge {
  id: string;
  name: string;
  source_chain: string;
  status: BridgeStatus;
  total_value_locked: string; // DECIMAL — use parseFloat()
  supply_on_stellar: string;
  supply_on_source: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type NewBridge = Omit<Bridge, "id" | "created_at" | "updated_at">;

// ─── prices (hypertable) ─────────────────────────────────────────────────────

export interface PriceRecord {
  time: Date;
  symbol: string;
  source: string;
  price: string; // DECIMAL(20,8)
  volume_24h: string | null;
}

export type NewPriceRecord = PriceRecord;

// ─── health_scores (hypertable) ──────────────────────────────────────────────

export interface HealthScoreRecord {
  time: Date;
  symbol: string;
  overall_score: number;
  liquidity_depth_score: number;
  price_stability_score: number;
  bridge_uptime_score: number;
  reserve_backing_score: number;
  volume_trend_score: number;
}

export type NewHealthScoreRecord = HealthScoreRecord;

// ─── liquidity_snapshots (hypertable) ────────────────────────────────────────

export type DexName = "stellarx" | "phoenix" | "lumenswap" | "sdex" | "soroswap";

export interface LiquiditySnapshot {
  time: Date;
  symbol: string;
  dex: DexName;
  base_asset: string;
  quote_asset: string;
  tvl_usd: string;
  volume_24h_usd: string | null;
  bid_depth: string | null;
  ask_depth: string | null;
  spread_pct: string | null;
}

export type NewLiquiditySnapshot = LiquiditySnapshot;

// ─── bridge_volume_stats ─────────────────────────────────────────────────────

export interface BridgeVolumeStat {
  id: string;
  stat_date: Date;
  bridge_name: string;
  symbol: string;
  inflow_amount: string;
  outflow_amount: string;
  net_flow: string;
  tx_count: number;
  avg_tx_size: string | null;
  created_at: Date;
  updated_at: Date;
}

export type NewBridgeVolumeStat = Omit<BridgeVolumeStat, "id" | "created_at" | "updated_at">;

// ─── bridge_operators ────────────────────────────────────────────────────────

export interface BridgeOperator {
  id: string;
  bridge_id: string;
  operator_address: string;
  provider_name: string;
  asset_code: string;
  source_chain: string;
  stake: string; // bigint
  is_active: boolean;
  slash_count: number;
  contract_address: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── reserve_commitments ─────────────────────────────────────────────────────

export interface ReserveCommitment {
  id: string;
  bridge_id: string;
  sequence: string; // bigint
  merkle_root: string;
  total_reserves: string; // bigint
  committed_at: string; // bigint (unix ms)
  committed_ledger: number;
  status: CommitmentStatus;
  challenger_address: string | null;
  tx_hash: string | null;
  reserve_leaves: unknown | null;
  created_at: Date;
  updated_at: Date;
}

// ─── verification_results (hypertable) ───────────────────────────────────────

export interface VerificationResult {
  verified_at: Date;
  id: string;
  bridge_id: string;
  sequence: string; // bigint
  leaf_hash: string;
  leaf_index: string; // bigint
  is_valid: boolean;
  proof_depth: number | null;
  metadata: unknown | null;
  job_id: string | null;
}

// ─── reconciliation_runs (hypertable) ────────────────────────────────────────

export interface ReconciliationRun {
  started_at: Date;
  id: string;
  asset_code: string;
  job_id: string | null;
  bridge_name: string | null;
  source_chain: string | null;
  status: ReconciliationStatus;
  stellar_supply: string | null;
  reported_supply: string | null;
  mismatch_percentage: string | null;
  on_chain_source: unknown | null;
  reserve_attestation: unknown | null;
  reported_backing: unknown | null;
  triage_status: ReconciliationTriageStatus | null;
  triage_owner: string | null;
  triage_note: string | null;
  triaged_at: Date | null;
  attempt: number;
  error: string | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── alert_rules ─────────────────────────────────────────────────────────────

export interface AlertRule {
  id: string;
  owner_address: string;
  name: string;
  asset_code: string;
  conditions: unknown; // JSON
  condition_op: "AND" | "OR";
  priority: AlertPriority;
  cooldown_seconds: number;
  is_active: boolean;
  webhook_url: string | null;
  on_chain_rule_id: string | null; // bigint
  last_triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── alert_events (hypertable) ───────────────────────────────────────────────

export interface AlertEvent {
  time: Date;
  rule_id: string;
  asset_code: string;
  alert_type: string;
  priority: AlertPriority;
  triggered_value: string;
  threshold: string;
  metric: string;
  webhook_delivered: boolean;
  webhook_delivered_at: Date | null;
  webhook_attempts: number;
  on_chain_event_id: string | null; // bigint
}

// ─── alert_routing_rules / alert_routing_audit ─────────────────────────────

export type AlertRoutingChannel = "in_app" | "webhook" | "email";
export type AlertRoutingAuditStatus =
  | "queued"
  | "delivered"
  | "suppressed"
  | "failed"
  | "fallback";

export interface AlertRoutingRuleRecord {
  id: string;
  name: string;
  owner_address: string | null;
  severity_levels: AlertPriority[];
  asset_codes: string[];
  source_types: string[];
  channels: AlertRoutingChannel[];
  fallback_channels: AlertRoutingChannel[];
  suppression_window_seconds: number;
  priority_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AlertRoutingAuditRecord {
  id: string;
  event_time: Date;
  alert_rule_id: string;
  routing_rule_id: string | null;
  owner_address: string;
  asset_code: string;
  source_type: string;
  severity: AlertPriority;
  channel: string;
  status: AlertRoutingAuditStatus;
  reason: string | null;
  attempt_count: number;
  latency_ms: number | null;
  created_at: Date;
}

// ─── circuit_breaker_triggers ────────────────────────────────────────────────

export interface CircuitBreakerTrigger {
  id: string;
  alert_id: string;
  alert_type: string;
  asset_code: string | null;
  bridge_id: string | null;
  severity: "low" | "medium" | "high";
  value: string;
  threshold: string;
  pause_scope: number;
  pause_level: number;
  reason: string;
  triggered_at: Date;
  status: TriggerStatus;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── circuit_breaker_pauses ──────────────────────────────────────────────────

export interface CircuitBreakerPause {
  pause_id: number;
  pause_scope: number;
  identifier: string | null;
  pause_level: number;
  triggered_by: string;
  trigger_reason: string;
  timestamp: string; // bigint
  recovery_deadline: string; // bigint
  guardian_approvals: number;
  guardian_threshold: number;
  status: PauseStatus;
  created_at: Date;
  updated_at: Date;
}

// ─── user preferences ───────────────────────────────────────────────────────

export type PreferenceCategory = "notifications" | "display" | "alerts";

export interface PreferenceDefault {
  id: string;
  category: PreferenceCategory;
  pref_key: string;
  value: unknown;
  schema_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserPreferenceState {
  user_id: string;
  version: number;
  schema_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserPreference {
  id: string;
  user_id: string;
  category: PreferenceCategory;
  pref_key: string;
  value: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface PreferenceMigrationHistory {
  id: string;
  user_id: string | null;
  from_schema_version: number;
  to_schema_version: number;
  migration_name: string;
  metadata: unknown;
  created_at: Date;
}

// ─── asset_transactions ─────────────────────────────────────────────────────

export interface AssetTransaction {
  id: string;
  bridge_name: string | null;
  asset_code: string;
  asset_issuer: string;
  transaction_hash: string;
  operation_id: string;
  operation_type: string;
  status: "pending" | "completed" | "failed";
  ledger: string | null;
  paging_token: string;
  source_account: string | null;
  from_address: string | null;
  to_address: string | null;
  amount: string;
  fee_charged: string;
  occurred_at: Date;
  raw_transaction: unknown | null;
  raw_operation: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface AssetTransactionSyncState {
  id: string;
  asset_code: string;
  asset_issuer: string;
  last_paging_token: string | null;
  last_ledger: string | null;
  error_count: number;
  last_error: string | null;
  last_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── tracked_balances / balance_history ─────────────────────────────────────

export interface TrackedBalance {
  id: string;
  asset_code: string;
  asset_issuer: string | null;
  address_label: string;
  address: string;
  chain: string;
  address_type: string;
  current_balance: string;
  previous_balance: string;
  balance_change: string;
  change_percentage: string;
  last_checked_at: Date | null;
  last_changed_at: Date | null;
  metadata: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface BalanceHistoryRecord {
  id: string;
  tracked_balance_id: string;
  asset_code: string;
  chain: string;
  address: string;
  balance: string;
  balance_change: string;
  change_percentage: string;
  block_number: string | null;
  recorded_at: Date;
  metadata: unknown | null;
}

// ─── webhook retry backoff configuration ──────────────────────────────────

export interface WebhookRetryConfig {
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryBackoffMultiplier: number;
  retryJitterRatio: number;
}

export const DEFAULT_WEBHOOK_RETRY_CONFIG: WebhookRetryConfig = {
  retryMaxAttempts: 7,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 3_600_000,
  retryBackoffMultiplier: 2.0,
  retryJitterRatio: 0.2,
};
// ─── event_source_keys ─────────────────────────────────────────────────────

export type SourceKeyAlgorithm = "ed25519" | "secp256k1" | "p256";

export interface EventSourceKey {
  id: string;
  source_name: string;
  public_key: string;
  algorithm: SourceKeyAlgorithm;
  is_active: boolean;
  rotated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type NewEventSourceKey = Omit<EventSourceKey, "id" | "created_at" | "updated_at">;

// ─── event_federation_audit ───────────────────────────────────────────────

export type FederationAuditStatus = "accepted" | "rejected_signature" | "rejected_timestamp" | "rejected_unknown_source";

export interface EventFederationAuditRecord {
  id: string;
  source_name: string;
  event_id: string;
  status: FederationAuditStatus;
  error_message: string | null;
  timestamp_age_ms: number | null;
  created_at: Date;
}
