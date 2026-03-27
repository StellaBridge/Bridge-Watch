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
