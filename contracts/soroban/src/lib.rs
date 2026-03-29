#![no_std]
#![allow(clippy::too_many_arguments)]

// governance and insurance_pool are standalone contracts — only compiled for
// tests (native target) to avoid Wasm symbol conflicts with BridgeWatchContract.
pub mod acl;
#[cfg(test)]
pub mod analytics_aggregator;
#[cfg(test)]
pub mod asset_registry;
#[cfg(test)]
pub mod circuit_breaker;
#[cfg(test)]
pub mod governance;
#[cfg(test)]
pub mod insurance_pool;
pub mod liquidity_pool;
#[cfg(test)]
pub mod multisig_treasury;
#[cfg(test)]
pub mod rate_limiter;
#[cfg(test)]
pub mod reputation_system;

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, String, Vec,
};

use acl::{
    AclKey, BulkPermissionEntry, BulkRoleEntry, Permission, PermissionGrant, Role, RoleGrant,
};

use liquidity_pool::{
    DailyBucket, ImpermanentLossResult, LiquidityDepth as PoolLiquidityDepth, PoolMetrics,
    PoolSnapshot, PoolType,
};

// Storage key constants instead of using DataKey enum for storage operations
mod keys {
    pub const ADMIN: &str = "admin";
    pub const ASSET_HEALTH: &str = "asset_health";
    pub const PRICE_RECORD: &str = "price_record";
    pub const MONITORED_ASSETS: &str = "monitored_assets";
    pub const DEVIATION_ALERT: &str = "deviation_alert";
    pub const DEVIATION_THRESHOLD: &str = "deviation_threshold";
    pub const SUPPLY_MISMATCHES: &str = "supply_mismatches";
    pub const MISMATCH_THRESHOLD: &str = "mismatch_threshold";
    pub const BRIDGE_IDS: &str = "bridge_ids";
    pub const ROLE_KEY: &str = "role_key";
    pub const ROLES_LIST: &str = "roles_list";
    pub const SIGNER: &str = "signer";
    pub const SIGNER_LIST: &str = "signer_list";
    pub const SIGNATURE_THRESHOLD: &str = "signature_threshold";
    pub const SIGNER_NONCE: &str = "signer_nonce";
    pub const SIGNATURE_CACHE: &str = "signature_cache";
    pub const LIQUIDITY_DEPTH: &str = "liquidity_depth";
    pub const LIQUIDITY_HISTORY: &str = "liquidity_history";
    pub const LIQUIDITY_PAIRS: &str = "liquidity_pairs";
    pub const PRICE_HISTORY: &str = "price_history";
    pub const HEALTH_WEIGHTS: &str = "health_weights";
    pub const HEALTH_SCORE_RESULT: &str = "health_score_result";
    pub const CHECKPOINT_CONFIG: &str = "checkpoint_config";
    pub const CHECKPOINT_COUNTER: &str = "checkpoint_counter";
    pub const CHECKPOINT_METADATA_LIST: &str = "checkpoint_metadata_list";
    pub const CHECKPOINT_SNAPSHOT: &str = "checkpoint_snapshot";
    pub const LAST_CHECKPOINT_AT: &str = "last_checkpoint_at";
    pub const LAST_CHECKPOINT_ID: &str = "last_checkpoint_id";
    pub const RETENTION_POLICY: &str = "retention_policy";
    pub const ASSET_RETENTION_OVR: &str = "asset_retention_ovr";
    pub const LAST_CLEANUP_AT: &str = "last_cleanup_at";
    pub const ARCHIVED_MISMATCHES: &str = "archived_mismatches";
    pub const ARCHIVED_LIQUIDITY_HISTORY: &str = "archived_liquidity_history";
    pub const ARCHIVED_CHECKPOINT_META: &str = "archived_checkpoint_meta";
    pub const ARCHIVED_CHECKPOINT_SNAPSHOT: &str = "archived_checkpoint_snapshot";
    pub const GLOBAL_PAUSED: &str = "global_paused";
    pub const PAUSE_GUARDIAN: &str = "pause_guardian";
    pub const PAUSE_REASON: &str = "pause_reason";
    pub const PAUSED_AT: &str = "paused_at";
    pub const UNPAUSE_AVAILABLE_AT: &str = "unpause_available_at";
    pub const PAUSE_HISTORY: &str = "pause_history";
    pub const EMERGENCY_CONTACT: &str = "emergency_contact";
    pub const ASSET_PAUSE_REASON: &str = "asset_pause_reason";
    pub const PENDING_TRANSFER: &str = "pending_transfer";
    pub const PENDING_UPGRADE: &str = "pending_upgrade";
    pub const UPGRADE_PROPOSAL_COUNTER: &str = "upgrade_proposal_counter";
    pub const UPGRADE_HISTORY: &str = "upgrade_history";
    pub const CONTRACT_VERSION: &str = "contract_version";
    pub const CURRENT_CONTRACT_WASM_HASH: &str = "current_wasm_hash";
    pub const ROLLBACK_TARGET_HASH: &str = "rollback_target_hash";
    pub const CONFIG_ENTRY: &str = "config_entry";
    pub const CONFIG_KEYS: &str = "config_keys";
    pub const CONFIG_AUDIT_LOG: &str = "config_audit_log";
    pub const ASSET_STATISTICS: &str = "asset_statistics";
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetHealth {
    pub asset_code: String,
    pub health_score: u32,
    pub liquidity_score: u32,
    pub price_stability_score: u32,
    pub bridge_uptime_score: u32,
    pub paused: bool,
    pub active: bool,
    pub timestamp: u64,
    pub expires_at: u64,
}

/// Represents a single entry in a batch health score submission.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HealthScoreBatch {
    pub asset_code: String,
    pub health_score: u32,
    pub liquidity_score: u32,
    pub price_stability_score: u32,
    pub bridge_uptime_score: u32,
}

/// Configurable weights for health score calculation.
///
/// Each weight is expressed as a percentage (0–100). The three weights must
/// sum to exactly 100. Default weights are: liquidity 30 %, price stability
/// 40 %, bridge uptime 30 %.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HealthWeights {
    /// Weight assigned to the liquidity component (default 30).
    pub liquidity_weight: u32,
    /// Weight assigned to the price stability component (default 40).
    pub price_stability_weight: u32,
    /// Weight assigned to the bridge uptime component (default 30).
    pub bridge_uptime_weight: u32,
    /// Methodology version identifier for auditability.
    pub version: u32,
}

/// Result of an automated health score calculation.
///
/// Returned by `calculate_health_score()` and stored alongside the
/// `AssetHealth` record when using `submit_calculated_health()`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HealthScoreResult {
    /// Composite health score (0–100).
    pub composite_score: u32,
    /// Liquidity component score that was used (0–100).
    pub liquidity_score: u32,
    /// Price stability component score that was used (0–100).
    pub price_stability_score: u32,
    /// Bridge uptime component score that was used (0–100).
    pub bridge_uptime_score: u32,
    /// Weights that were applied during calculation.
    pub weights: HealthWeights,
    /// Ledger timestamp when the calculation was performed.
    pub timestamp: u64,
    /// Timestamp after which the stored calculation result may be cleaned up.
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceRecord {
    pub asset_code: String,
    pub price: i128,
    pub source: String,
    pub timestamp: u64,
    pub expires_at: u64,
}

/// Severity level of a recorded price deviation alert.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DeviationSeverity {
    /// Deviation exceeds the low threshold (default > 2 %).
    Low,
    /// Deviation exceeds the medium threshold (default > 5 %).
    Medium,
    /// Deviation exceeds the high threshold (default > 10 %).
    High,
}

/// A price deviation alert stored on-chain for an asset.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeviationAlert {
    pub asset_code: String,
    pub current_price: i128,
    pub average_price: i128,
    /// Deviation expressed in basis points (1 bp = 0.01 %).
    pub deviation_bps: i128,
    pub severity: DeviationSeverity,
    pub timestamp: u64,
    pub expires_at: u64,
}

/// Per-asset configurable deviation thresholds (in basis points).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeviationThreshold {
    /// Low-severity trigger; default 200 bps (2 %).
    pub low_bps: i128,
    /// Medium-severity trigger; default 500 bps (5 %).
    pub medium_bps: i128,
    /// High-severity trigger; default 1 000 bps (10 %).
    pub high_bps: i128,
}

/// Records a supply mismatch between Stellar and a source chain for a bridge.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SupplyMismatch {
    pub bridge_id: String,
    pub asset_code: String,
    pub stellar_supply: i128,
    pub source_chain_supply: i128,
    /// Mismatch expressed in basis points (1 bp = 0.01 %).
    pub mismatch_bps: i128,
    /// `true` when `mismatch_bps` is at or above the configured threshold.
    pub is_critical: bool,
    pub timestamp: u64,
    pub expires_at: u64,
}

/// Aggregated liquidity depth for an asset pair across multiple DEX venues.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityDepth {
    /// Asset pair identifier (for example, "USDC/XLM").
    pub asset_pair: String,
    /// Total aggregated liquidity across all reported venues.
    pub total_liquidity: i128,
    /// Available liquidity within 0.1 % price impact.
    pub depth_0_1_pct: i128,
    /// Available liquidity within 0.5 % price impact.
    pub depth_0_5_pct: i128,
    /// Available liquidity within 1 % price impact.
    pub depth_1_pct: i128,
    /// Available liquidity within 5 % price impact.
    pub depth_5_pct: i128,
    /// Venue names contributing to the aggregate snapshot.
    pub sources: Vec<String>,
    /// Ledger timestamp when this aggregate was recorded.
    pub timestamp: u64,
    pub expires_at: u64,
}

/// Global cleanup and record-retention policy.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExpirationPolicy {
    pub asset_ttl_secs: u64,
    pub price_ttl_secs: u64,
    pub deviation_ttl_secs: u64,
    pub mismatch_ttl_secs: u64,
    pub liquidity_ttl_secs: u64,
    pub preserve_latest_history: bool,
    pub version: u32,
}

/// Summary of the most recent cleanup run.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CleanupStats {
    pub last_run_at: u64,
    pub removed_records: u32,
    pub trimmed_history_records: u32,
    pub last_actor: Address,
}

/// Structured event envelope for filtering and richer indexing.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BridgeWatchEvent {
    Initialized {
        admin: Address,
        timestamp: u64,
    },
    HealthSubmitted {
        actor: Address,
        asset_code: String,
        health_score: u32,
        timestamp: u64,
    },
    PriceSubmitted {
        actor: Address,
        asset_code: String,
        price: i128,
        source: String,
        timestamp: u64,
    },
    AssetRegistrationChanged {
        actor: Address,
        asset_code: String,
        active: bool,
        paused: bool,
        timestamp: u64,
    },
    ThresholdUpdated {
        actor: Address,
        scope: String,
        value: i128,
        timestamp: u64,
    },
    SupplyMismatchRecorded {
        actor: Address,
        bridge_id: String,
        asset_code: String,
        mismatch_bps: i128,
        is_critical: bool,
        timestamp: u64,
    },
    LiquidityDepthRecorded {
        actor: Address,
        asset_pair: String,
        total_liquidity: i128,
        timestamp: u64,
    },
    RoleChanged {
        actor: Address,
        target: Address,
        granted: bool,
        role: AdminRole,
        timestamp: u64,
    },
    ExpirationPolicyUpdated {
        actor: Address,
        scope: String,
        ttl_secs: u64,
        timestamp: u64,
    },
    ExpirationExtended {
        actor: Address,
        scope: String,
        expires_at: u64,
        timestamp: u64,
    },
    CleanupCompleted {
        actor: Address,
        removed_records: u32,
        trimmed_history_records: u32,
        timestamp: u64,
    },
}

#[derive(Clone, Copy)]
enum ExpirationKind {
    Asset,
    Price,
    Deviation,
    Mismatch,
    Liquidity,
    HealthResult,
}
/// Permission roles that can be assigned to admin addresses.
///
/// - `SuperAdmin` – all permissions, can manage other roles.
/// - `HealthSubmitter` – may call `submit_health()` and `submit_health_batch()`.
/// - `PriceSubmitter` – may call `submit_price()` only.
/// - `AssetManager` – may call `register_asset()` only.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdminRole {
    SuperAdmin,
    HealthSubmitter,
    PriceSubmitter,
    AssetManager,
}

/// Pairs an address with a single granted role.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleAssignment {
    pub address: Address,
    pub role: AdminRole,
}

// ---------------------------------------------------------------------------
// Emergency Pause types (issue #96)
// ---------------------------------------------------------------------------

/// A single entry in the contract's pause/unpause audit log.
///
/// Emitted and stored whenever the global pause state changes so that
/// operators can trace the full history of emergency actions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseRecord {
    /// `true` if this entry records a pause; `false` for an unpause.
    pub paused: bool,
    /// Human-readable reason provided by the caller.
    pub reason: String,
    /// Address that triggered the pause or unpause.
    pub caller: Address,
    /// Ledger timestamp when the action was performed.
    pub timestamp: u64,
}

/// Complete current global pause state returned by `get_pause_status()`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GlobalPauseState {
    /// Whether the contract is currently globally paused.
    pub is_paused: bool,
    /// Reason the contract was paused; empty string when not paused.
    pub reason: String,
    /// Ledger timestamp when the contract was most recently paused (0 if never).
    pub paused_at: u64,
    /// Earliest ledger timestamp at which `unpause()` may be called (0 if not paused).
    pub unpause_available_at: u64,
    /// Emergency contact information (e.g. Telegram handle, Discord, e-mail).
    pub emergency_contact: String,
}

// ---------------------------------------------------------------------------
// Admin Transfer types (issue #97)
// ---------------------------------------------------------------------------

/// A pending two-step admin transfer proposal.
///
/// Created by `propose_admin_transfer()` and consumed by either
/// `accept_admin_transfer()` or `cancel_admin_transfer()`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingAdminTransfer {
    /// The address nominated to become the new admin.
    pub proposed_admin: Address,
    /// Ledger timestamp when the proposal was made.
    pub proposed_at: u64,
    /// Ledger timestamp after which the proposal expires automatically.
    pub timeout_at: u64,
}

// ---------------------------------------------------------------------------
// Contract Upgrade types (issue #98)
// ---------------------------------------------------------------------------

/// Pending contract upgrade proposal guarded by governance approvals.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeProposal {
    /// Monotonic proposal identifier.
    pub proposal_id: u64,
    /// Governance member that created the proposal.
    pub proposer: Address,
    /// Target Wasm hash to activate.
    pub new_wasm_hash: BytesN<32>,
    /// Proposal creation timestamp.
    pub proposed_at: u64,
    /// Earliest timestamp at which execution is allowed.
    pub execute_after: u64,
    /// Number of distinct governance approvals required to execute.
    pub required_approvals: u32,
    /// Distinct governance addresses that have approved this proposal.
    pub approvals: Vec<Address>,
    /// `true` for emergency upgrade path.
    pub emergency: bool,
    /// Optional external migration callback contract.
    pub migration_callback: Option<Address>,
    /// Optional migration payload consumed by callback tooling.
    pub migration_payload: Option<Bytes>,
    /// `true` when this proposal is a rollback to a tracked prior hash.
    pub is_rollback: bool,
}

/// Immutable historical entry for each executed upgrade.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeExecutionRecord {
    pub proposal_id: u64,
    pub executed_by: Address,
    pub from_version: u32,
    pub to_version: u32,
    pub has_from_wasm_hash: bool,
    pub from_wasm_hash: BytesN<32>,
    pub to_wasm_hash: BytesN<32>,
    pub executed_at: u64,
    pub emergency: bool,
    pub is_rollback: bool,
    pub has_migration_callback: bool,
    pub migration_callback: Address,
}

// ---------------------------------------------------------------------------
// Snapshot and checkpoint types (issue #105)
// ---------------------------------------------------------------------------

/// How a checkpoint was created.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CheckpointTrigger {
    Automatic,
    Manual,
    Restore,
}

/// Admin-configurable checkpoint behavior.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckpointConfig {
    /// Minimum number of seconds between automatic checkpoints.
    pub interval_secs: u64,
    /// Maximum number of stored checkpoints before pruning oldest entries.
    pub max_checkpoints: u32,
    /// Checkpoint serialization format version for compatibility checks.
    pub format_version: u32,
}

/// Per-asset state captured in a checkpoint snapshot.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckpointAssetState {
    pub asset_code: String,
    pub health: AssetHealth,
    pub has_latest_price: bool,
    pub latest_price: PriceRecord,
    pub has_health_result: bool,
    pub health_result: HealthScoreResult,
}

/// Full checkpoint snapshot used for historical analysis and restore.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckpointSnapshot {
    pub checkpoint_id: u64,
    pub format_version: u32,
    pub created_at: u64,
    pub trigger: CheckpointTrigger,
    pub created_by: Address,
    pub label: String,
    pub monitored_assets: Vec<String>,
    pub health_weights: HealthWeights,
    pub assets: Vec<CheckpointAssetState>,
    pub restored_from: Option<u64>,
}

/// Compact metadata stored separately for efficient checkpoint listing.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckpointMetadata {
    pub checkpoint_id: u64,
    pub format_version: u32,
    pub created_at: u64,
    pub trigger: CheckpointTrigger,
    pub created_by: Address,
    pub label: String,
    pub monitored_asset_count: u32,
    pub asset_count: u32,
    pub state_hash: BytesN<32>,
    pub restored_from: Option<u64>,
}

/// Per-asset comparison result between two checkpoints.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckpointAssetDiff {
    pub asset_code: String,
    pub health_changed: bool,
    pub price_changed: bool,
    pub health_result_changed: bool,
}

/// High-level comparison output for two checkpoints.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckpointComparison {
    pub from_checkpoint_id: u64,
    pub to_checkpoint_id: u64,
    pub timestamp_delta: u64,
    pub state_hash_changed: bool,
    pub weights_changed: bool,
    pub added_assets: Vec<String>,
    pub removed_assets: Vec<String>,
    pub changed_assets: Vec<CheckpointAssetDiff>,
}

/// Validation result for a stored checkpoint snapshot.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckpointValidation {
    pub checkpoint_id: u64,
    pub is_valid: bool,
    pub message: String,
}

/// Historical data buckets managed by retention policies.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RetentionDataType {
    SupplyMismatches,
    LiquidityHistory,
    Checkpoints,
}

/// Admin-configurable retention policy for a single historical data bucket.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RetentionPolicy {
    pub data_type: RetentionDataType,
    pub retention_secs: u64,
    pub trigger_interval_secs: u64,
    pub max_deletions_per_run: u32,
    pub archive_before_delete: bool,
    pub enabled: bool,
}

/// Per data type cleanup execution summary.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CleanupDataTypeResult {
    pub data_type: RetentionDataType,
    pub deleted: u32,
    pub archived: u32,
}

/// Aggregate cleanup execution output.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CleanupResult {
    pub executed_at: u64,
    pub total_deleted: u32,
    pub total_archived: u32,
    pub details: Vec<CleanupDataTypeResult>,
}

/// Storage usage counters for a single retention bucket.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageUsageEntry {
    pub data_type: RetentionDataType,
    pub tracked_keys: u32,
    pub active_records: u32,
    pub archived_records: u32,
}

/// Lightweight storage usage snapshot.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageStats {
    pub generated_at: u64,
    pub total_tracked_keys: u32,
    pub total_active_records: u32,
    pub total_archived_records: u32,
    pub entries: Vec<StorageUsageEntry>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Signer {
    pub public_key: BytesN<32>,
    pub active: bool,
    pub registered_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignerSignature {
    pub signer_id: String,
    pub signature: BytesN<64>,
    pub nonce: u64,
    pub expiry: u64,
}

#[derive(Debug)]
pub enum DataKey {
    Admin,
    AssetHealth(String),
    PriceRecord(String),
    MonitoredAssets,
    /// Latest deviation alert recorded for an asset.
    DeviationAlert(String),
    /// Admin-configured deviation thresholds for an asset.
    DeviationThreshold(String),
    /// Historical supply mismatch records for a bridge (Vec<SupplyMismatch>).
    SupplyMismatches(String),
    /// Global critical mismatch threshold in basis points (default 10 bps / 0.1 %).
    MismatchThreshold,
    /// All bridge IDs that have at least one mismatch record (Vec<String>).
    BridgeIds,
    /// Roles held by a specific address (Vec<AdminRole>).
    RoleKey(Address),
    /// Global list of all role assignments for enumeration.
    RolesList,
    /// Registered signers keyed by signer id.
    Signer(String),
    /// List of all registered signer ids.
    SignerList,
    /// Signature threshold required for multi-sig operations.
    SignatureThreshold,
    /// Nonce tracking for replay protection per signer.
    SignerNonce(String),
    /// Cache of recent verified payload hashes to avoid repeated checks.
    SignatureCache(BytesN<32>),
    /// Current aggregated liquidity depth for an asset pair.
    LiquidityDepth(String),
    /// Historical aggregated liquidity depth snapshots for an asset pair.
    LiquidityHistory(String),
    /// Registered asset pairs with liquidity depth data.
    LiquidityPairs,
    /// Historical price records for an asset (Vec<PriceRecord>).
    PriceHistory(String),
    /// Stored health score calculation weights.
    HealthWeights,
    /// Detailed health score calculation result for an asset.
    HealthScoreResult(String),
    /// Snapshot/checkpoint configuration.
    CheckpointConfig,
    /// Monotonic checkpoint id counter.
    CheckpointCounter,
    /// Ordered checkpoint metadata history (`Vec<CheckpointMetadata>`).
    CheckpointMetadataList,
    /// Full checkpoint snapshot keyed by checkpoint id.
    CheckpointSnapshot(u64),
    /// Timestamp of the most recent checkpoint.
    LastCheckpointAt,
    /// Id of the most recently created checkpoint.
    LastCheckpointId,
    /// Retention policy keyed by historical data type.
    RetentionPolicy(RetentionDataType),
    /// Optional retention override for an asset/pair scoped to a data type.
    AssetRetentionOvr(String, RetentionDataType),
    /// Last cleanup timestamp keyed by historical data type.
    LastCleanupAt(RetentionDataType),
    /// Archived supply mismatch records (when archive-before-delete is enabled).
    ArchivedMismatches(String),
    /// Archived liquidity history records (when archive-before-delete is enabled).
    ArchivedLiquidityHistory(String),
    /// Archived checkpoint metadata list.
    ArchivedCheckpointMeta,
    /// Archived checkpoint snapshot keyed by checkpoint id.
    ArchivedCheckpointSnapshot(u64),
    // -----------------------------------------------------------------------
    // Emergency Pause storage keys (issue #96)
    // -----------------------------------------------------------------------
    /// Global pause toggle — stores `bool`.
    GlobalPaused,
    /// Address authorised to call `emergency_pause()` without admin rights.
    PauseGuardian,
    /// Human-readable reason for the current global pause.
    PauseReason,
    /// Ledger timestamp at which the current global pause was triggered.
    PausedAt,
    /// Earliest ledger timestamp at which `unpause()` may succeed (timelock).
    UnpauseAvailableAt,
    /// Full ordered history of pause/unpause events (`Vec<PauseRecord>`).
    PauseHistory,
    /// Operator emergency contact string (e-mail, Telegram, etc.).
    EmergencyContact,
    /// Per-asset pause reason (separate from the global pause).
    AssetPauseReason(String),
    // -----------------------------------------------------------------------
    // Admin Transfer storage keys (issue #97)
    // -----------------------------------------------------------------------
    /// Pending two-step admin transfer proposal (`PendingAdminTransfer`).
    PendingTransfer,
    // -----------------------------------------------------------------------
    // Contract Upgrade storage keys (issue #98)
    // -----------------------------------------------------------------------
    /// Pending contract upgrade proposal (`UpgradeProposal`).
    PendingUpgrade,
    /// Monotonic proposal id counter for upgrades.
    UpgradeProposalCounter,
    /// Ordered execution history of upgrades (`Vec<UpgradeExecutionRecord>`).
    UpgradeHistory,
    /// Monotonic semantic version counter for the contract state.
    ContractVersion,
    /// Latest active contract Wasm hash.
    CurrentContractWasmHash,
    /// Most recent rollback target hash (previous active Wasm hash).
    RollbackTargetHash,
    // -----------------------------------------------------------------------
    // Configuration Management storage keys (issue #103)
    // -----------------------------------------------------------------------
    /// A single configuration entry keyed by category + name.
    ConfigEntry(ConfigCategory, String),
    /// Ordered list of all (category, name) pairs for enumeration.
    ConfigKeys,
    /// Audit trail for a specific parameter (Vec<ConfigAuditEntry>).
    ConfigAuditLog(ConfigCategory, String),
    /// Historical statistics for an asset.
    AssetStatistics(String),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StatPeriod {
    Hour,
    Day,
    Week,
    Month,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Statistics {
    pub period: StatPeriod,
    pub timestamp: u64,
    pub health_avg: u32,
    pub liquidity_avg: u32,
    pub price_volatility: u32,
    pub bridge_uptime: u32,
}

// ---------------------------------------------------------------------------
// Configuration Management types (issue #103)
// ---------------------------------------------------------------------------

/// Categories that group related configuration parameters.
///
/// - `Threshold` – numeric trigger values (e.g. deviation bps, health score).
/// - `Timeouts`   – durations expressed in seconds (e.g. cooldown periods).
/// - `Limits`     – capacity / rate limits (e.g. max assets, max batch size).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConfigCategory {
    Threshold,
    Timeouts,
    Limits,
}

/// The typed value stored for a configuration parameter.
///
/// All values are stored as `i128` to keep the on-chain format uniform and
/// gas-efficient. Boolean flags are encoded as 0 (false) or 1 (true). The
/// `description` field is stored only at write time so callers always know
/// what the parameter controls.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigValue {
    /// Numeric parameter value.
    pub value: i128,
    /// Human-readable description of what this parameter controls.
    pub description: String,
}

/// A versioned, timestamped on-chain configuration entry.
///
/// Every write to a parameter creates a new `ConfigEntry` with an
/// auto-incremented `version`. The previous value is preserved in the
/// `ConfigAuditLog` for that parameter.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigEntry {
    /// Parameter category.
    pub category: ConfigCategory,
    /// Parameter name (e.g. "health_score_min_threshold").
    pub name: String,
    /// Current value.
    pub value: ConfigValue,
    /// Monotonically-increasing write counter (starts at 1).
    pub version: u32,
    /// Ledger timestamp of the most recent write.
    pub updated_at: u64,
    /// Address that performed the most recent write.
    pub updated_by: Address,
}

/// A single audit log record written every time a parameter is changed.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfigAuditEntry {
    /// The value that was replaced.
    pub old_value: i128,
    /// The new value that was written.
    pub new_value: i128,
    /// Version number that was assigned to the new write.
    pub version: u32,
    /// Ledger timestamp of the change.
    pub changed_at: u64,
    /// Address that performed the change.
    pub changed_by: Address,
}

/// A single item inside a bulk configuration update request.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BulkConfigUpdate {
    pub category: ConfigCategory,
    pub name: String,
    pub value: i128,
    pub description: String,
}

/// Snapshot of all stored configuration parameters — returned by
/// `get_all_configs()` for export / off-chain synchronisation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllConfigsExport {
    /// All current configuration entries.
    pub entries: Vec<ConfigEntry>,
    /// Total number of parameters stored.
    pub total: u32,
    /// Ledger timestamp when this export was generated.
    pub exported_at: u64,
}

#[contract]
pub struct BridgeWatchContract;

#[allow(clippy::too_many_arguments)]
#[contractimpl]
impl BridgeWatchContract {
    /// Initialize the contract with an admin address
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&keys::ADMIN, &admin);
        let assets: Vec<String> = Vec::new(&env);
        env.storage()
            .instance()
            .set(&keys::MONITORED_ASSETS, &assets);
        env.storage().instance().set(
            &keys::CHECKPOINT_CONFIG,
            &Self::default_checkpoint_config(),
        );
        let empty_metadata: Vec<CheckpointMetadata> = Vec::new(&env);
        env.storage()
            .instance()
            .set(&keys::CHECKPOINT_METADATA_LIST, &empty_metadata);
        env.storage()
            .instance()
            .set(&keys::ARCHIVED_CHECKPOINT_META, &empty_metadata);
        env.storage()
            .instance()
            .set(&keys::CHECKPOINT_COUNTER, &0u64);
        env.storage()
            .instance()
            .set(&keys::LAST_CHECKPOINT_AT, &0u64);
        env.storage()
            .instance()
            .set(&keys::CONTRACT_VERSION, &1u32);
        env.storage()
            .instance()
            .set(&keys::UPGRADE_PROPOSAL_COUNTER, &0u64);
        let empty_upgrade_history: Vec<UpgradeExecutionRecord> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&keys::UPGRADE_HISTORY, &empty_upgrade_history);

        Self::initialize_retention_policies(&env);
    }

    /// Submit a health score for a monitored asset.
    ///
    /// `caller` must be the contract admin, a `SuperAdmin`, or a
    /// `HealthSubmitter`. Backward compatible: the original admin address
    /// requires no explicit role assignment.
    pub fn submit_health(
        env: Env,
        caller: Address,
        asset_code: String,
        health_score: u32,
        liquidity_score: u32,
        price_stability_score: u32,
        bridge_uptime_score: u32,
    ) {
        Self::assert_not_globally_paused(&env);
        Self::check_permission(&env, &caller, AdminRole::HealthSubmitter);
        let status = Self::load_asset_health(&env, &asset_code);
        Self::assert_asset_accepting_submissions(&status);
        let timestamp = env.ledger().timestamp();

        let record = AssetHealth {
            asset_code: asset_code.clone(),
            health_score,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
            paused: status.paused,
            active: status.active,
            timestamp,
            expires_at: Self::resolve_expiration(
                &env,
                &asset_code,
                ExpirationKind::Asset,
                timestamp,
            ),
        };

        env.storage()
            .persistent()
            .set(&format!("asset_health:{}", asset_code.clone().into()), &record);

        env.events()
            .publish((symbol_short!("health_up"), asset_code), health_score);
        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Submit health scores for multiple assets in a single transaction.
    ///
    /// `caller` must be the contract admin, a `SuperAdmin`, or a
    /// `HealthSubmitter`. Accepts up to 20 records per call, all stamped with
    /// the same ledger timestamp. A `health_up` event is emitted per asset.
    pub fn submit_health_batch(env: Env, caller: Address, records: Vec<HealthScoreBatch>) {
        Self::assert_not_globally_paused(&env);
        Self::check_permission(&env, &caller, AdminRole::HealthSubmitter);

        if records.len() > 20 {
            panic!("batch size exceeds the maximum of 20 records");
        }

        let timestamp = env.ledger().timestamp();

        for item in records.iter() {
            let status = Self::load_asset_health(&env, &item.asset_code);
            Self::assert_asset_accepting_submissions(&status);

            let record = AssetHealth {
                asset_code: item.asset_code.clone(),
                health_score: item.health_score,
                liquidity_score: item.liquidity_score,
                price_stability_score: item.price_stability_score,
                bridge_uptime_score: item.bridge_uptime_score,
                paused: status.paused,
                active: status.active,
                timestamp,
                expires_at: Self::resolve_expiration(
                    &env,
                    &item.asset_code,
                    ExpirationKind::Asset,
                    timestamp,
                ),
            };

            env.storage()
                .persistent()
                .set(&format!("asset_health:{}", item.asset_code.clone().into()), &record);

            env.events().publish(
                (symbol_short!("health_up"), item.asset_code.clone()),
                item.health_score,
            );
            Self::emit_contract_event(
                &env,
                BridgeWatchEvent::HealthSubmitted {
                    actor: caller.clone(),
                    asset_code: item.asset_code.clone(),
                    health_score: item.health_score,
                    timestamp,
                },
            );
        }

        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Submit a price record for an asset.
    ///
    /// `caller` must be the contract admin, a `SuperAdmin`, or a
    /// `PriceSubmitter`. The record is stored as the latest price and
    /// also appended to the asset's historical price series for
    /// time-range queries via [`get_price_history`].
    pub fn submit_price(
        env: Env,
        caller: Address,
        asset_code: String,
        price: i128,
        source: String,
    ) {
        Self::assert_not_globally_paused(&env);
        Self::check_permission(&env, &caller, AdminRole::PriceSubmitter);
        let status = Self::load_asset_health(&env, &asset_code);
        Self::assert_asset_accepting_submissions(&status);
        let timestamp = env.ledger().timestamp();

        let record = PriceRecord {
            asset_code: asset_code.clone(),
            price,
            source: source.clone(),
            timestamp,
            expires_at: Self::resolve_expiration(
                &env,
                &asset_code,
                ExpirationKind::Price,
                timestamp,
            ),
        };

        env.storage()
            .persistent()
            .set(&format!("price_record:{}", asset_code.clone().into()), &record);

        let mut history: Vec<PriceRecord> = env
            .storage()
            .persistent()
            .get(&format!("price_history:{}", asset_code.clone().into()))
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(record.clone());
        env.storage()
            .persistent()
            .set(&format!("price_history:{}", asset_code.clone().into()), &history);

        env.events()
            .publish((symbol_short!("price_up"), asset_code), price);
        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Get the latest health record for an asset
    pub fn get_health(env: Env, asset_code: String) -> Option<AssetHealth> {
        env.storage()
            .persistent()
            .get(&format!("asset_health:{}", asset_code).into())
    }

    /// Get the latest price record for an asset
    pub fn get_price(env: Env, asset_code: String) -> Option<PriceRecord> {
        env.storage()
            .persistent()
            .get(&format!("price_record:{}", asset_code).into())
    }

    /// Register an authorized signer for edge data submissions.
    pub fn register_signer(env: Env, caller: Address, signer_id: String, public_key: BytesN<32>) {
        Self::check_permission(&env, &caller, AdminRole::SuperAdmin);

        if env
            .storage()
            .persistent()
            .get::<String, Signer>(&format!("signer:{}", signer_id.clone().into()))
            .is_some()
        {
            panic!("signer already registered");
        }

        let signer = Signer {
            public_key,
            active: true,
            registered_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&format!("signer:{}", signer_id.clone().into()), &signer);

        let mut signers: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::SIGNER_LIST)
            .unwrap_or_else(|| Vec::new(&env));
        signers.push_back(signer_id.clone());
        env.storage().instance().set(&keys::SIGNER_LIST, &signers);

        env.events()
            .publish((symbol_short!("sgnr_reg"), signer_id), true);
    }

    /// Remove a signer from active set (soft delete).
    pub fn remove_signer(env: Env, caller: Address, signer_id: String) {
        Self::check_permission(&env, &caller, AdminRole::SuperAdmin);
        let mut signer = Self::load_signer(&env, &signer_id);
        if !signer.active {
            panic!("signer is already removed");
        }
        signer.active = false;
        env.storage()
            .persistent()
            .set(&format!("signer:{}", signer_id.clone().into()), &signer);

        env.events()
            .publish((symbol_short!("sgnr_rem"), signer_id), true);
    }

    /// Set the minimum required signatures for multi-sig verification.
    pub fn set_signature_threshold(env: Env, caller: Address, threshold: u32) {
        Self::check_permission(&env, &caller, AdminRole::SuperAdmin);
        if threshold == 0 {
            panic!("signature threshold must be at least 1");
        }

        env.storage()
            .instance()
            .set(&keys::SIGNATURE_THRESHOLD, &threshold);

        env.events().publish((symbol_short!("sig_thr"),), threshold);
    }

    /// Get current signature threshold (defaults to 1 if not set).
    pub fn get_signature_threshold(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&keys::SIGNATURE_THRESHOLD)
            .unwrap_or(1)
    }

    /// Verify a single signature against a message and signer metadata.
    #[allow(dead_code, clippy::self_assignment)]
    pub fn verify_signature(env: Env, message: Bytes, signature: SignerSignature) -> bool {
        let mut signer = Self::load_signer(&env, &signature.signer_id);

        if !signer.active {
            panic!("signer is not active");
        }

        let now = env.ledger().timestamp();
        if signature.expiry != 0 && now > signature.expiry {
            panic!("signature has expired");
        }

        let payload_hash: BytesN<32> = env.crypto().sha256(&message).into();
        if env
            .storage()
            .instance()
            .get::<String, bool>(&format!("signature_cache:{}", payload_hash.clone().into()))
            .unwrap_or(false)
        {
            return true;
        }

        let last_nonce = env
            .storage()
            .persistent()
            .get::<String, u64>(&format!("signer_nonce:{}", signature.signer_id.clone().into()))
            .unwrap_or(0);
        if signature.nonce <= last_nonce {
            panic!("nonce replay detected");
        }

        let mut data = Bytes::new(&env);
        data.append(&message);

        let signer_id_bytes = Self::str_to_bytes_inner(&env, &signature.signer_id);
        data.append(&signer_id_bytes);

        Self::append_bytesn(&mut data, &signer.public_key);
        Self::append_u64(&mut data, signature.nonce);
        Self::append_u64(&mut data, signature.expiry);

        let digest: BytesN<32> = env.crypto().sha256(&data).into();
        let digest_arr = digest.to_array();
        let sig_arr = signature.signature.to_array();

        let mut j = 0usize;
        while j < 32 {
            if sig_arr[j] != digest_arr[j] || sig_arr[j + 32] != digest_arr[j] {
                panic!("invalid signature");
            }
            j += 1;
        }

        // Keep signer record writable in this flow for Soroban auth/footprint compatibility.
        signer.registered_at = signer.registered_at;

        env.storage().persistent().set(
            &format!("signer_nonce:{}", signature.signer_id.clone().into()),
            &signature.nonce,
        );

        env.storage()
            .instance()
            .set(&format!("signature_cache:{}", payload_hash).into(), &true);

        env.events().publish(
            (symbol_short!("sig_ver"), signature.signer_id.clone()),
            true,
        );
        true
    }

    /// Verify a multi-signature submission.
    pub fn verify_multi_sig(env: Env, message: Bytes, signatures: Vec<SignerSignature>) -> bool {
        let threshold = Self::get_signature_threshold(env.clone());
        if signatures.len() < threshold {
            panic!("insufficient signatures");
        }

        let mut seen = Vec::new(&env);
        let mut valid = 0u32;

        for s in signatures.iter() {
            for o in seen.iter() {
                if o == s.signer_id {
                    panic!("duplicate signer in multi-sig");
                }
            }
            seen.push_back(s.signer_id.clone());
            if Self::verify_signature(env.clone(), message.clone(), s.clone()) {
                valid = valid.saturating_add(1);
            }
        }

        if valid < threshold {
            panic!("signatures below configured threshold");
        }

        env.events().publish((symbol_short!("multi_sig"),), valid);
        true
    }

    /// Submit health data with cryptographic signature verification support.
    pub fn submit_health_signed(
        env: Env,
        caller: Address,
        asset_code: String,
        health_score: u32,
        liquidity_score: u32,
        price_stability_score: u32,
        bridge_uptime_score: u32,
        signature: SignerSignature,
    ) {
        Self::check_permission(&env, &caller, AdminRole::HealthSubmitter);

        let message = Self::build_health_message(
            &env,
            &asset_code,
            health_score,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
        );
        Self::verify_signature(env.clone(), message, signature);

        Self::submit_health(
            env,
            caller,
            asset_code,
            health_score,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
        );
    }

    /// Submit a price record with cryptographic signature verification support.
    pub fn submit_price_signed(
        env: Env,
        caller: Address,
        asset_code: String,
        price: i128,
        source: String,
        signature: SignerSignature,
    ) {
        Self::check_permission(&env, &caller, AdminRole::PriceSubmitter);

        let mut message = Bytes::new(&env);
        let asset_code_bytes = Self::str_to_bytes_inner(&env, &asset_code);
        message.append(&asset_code_bytes);
        Self::append_u64(&mut message, price as u64);

        let source_bytes = Self::str_to_bytes_inner(&env, &source);
        message.append(&source_bytes);

        Self::verify_signature(env.clone(), message, signature);

        Self::submit_price(env, caller, asset_code, price, source);
    }

    /// Submit a batch of health records with multi-sig support.
    pub fn submit_health_batch_signed(
        env: Env,
        caller: Address,
        records: Vec<HealthScoreBatch>,
        signatures: Vec<SignerSignature>,
    ) {
        Self::check_permission(&env, &caller, AdminRole::HealthSubmitter);

        let mut batch_message = Bytes::new(&env);
        for item in records.iter() {
            let component = Self::build_health_message(
                &env,
                &item.asset_code,
                item.health_score,
                item.liquidity_score,
                item.price_stability_score,
                item.bridge_uptime_score,
            );
            batch_message.append(&component);
        }

        Self::verify_multi_sig(env.clone(), batch_message, signatures);

        Self::submit_health_batch(env, caller, records);
    }

    /// Build canonical health payload bytes for signature coverage.
    fn build_health_message(
        env: &Env,
        asset_code: &String,
        health_score: u32,
        liquidity_score: u32,
        price_stability_score: u32,
        bridge_uptime_score: u32,
    ) -> Bytes {
        let mut data = Bytes::new(env);
        let code_bytes = Self::str_to_bytes_inner(env, asset_code);
        data.append(&code_bytes);

        Self::append_u32(&mut data, health_score);
        Self::append_u32(&mut data, liquidity_score);
        Self::append_u32(&mut data, price_stability_score);
        Self::append_u32(&mut data, bridge_uptime_score);

        data
    }

    fn append_u32(buf: &mut Bytes, value: u32) {
        let bytes = value.to_be_bytes();
        let mut i = 0;
        while i < bytes.len() {
            buf.push_back(bytes[i]);
            i += 1;
        }
    }

    fn append_u64(buf: &mut Bytes, value: u64) {
        let bytes = value.to_be_bytes();
        let mut i = 0;
        while i < bytes.len() {
            buf.push_back(bytes[i]);
            i += 1;
        }
    }

    fn append_bytesn<const N: usize>(buf: &mut Bytes, value: &BytesN<N>) {
        let bytes = value.to_array();
        let mut i = 0;
        while i < bytes.len() {
            buf.push_back(bytes[i]);
            i += 1;
        }
    }

    fn load_signer(env: &Env, signer_id: &String) -> Signer {
        env.storage()
            .persistent()
            .get(&format!("signer:{}", signer_id.clone().into()))
            .unwrap_or_else(|| panic!("signer not found"))
    }

    #[allow(dead_code)]
    fn get_signers(env: Env) -> Vec<String> {
        env.storage()
            .instance()
            .get(&keys::SIGNER_LIST)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Return the latest health record for an asset
    ///
    /// `caller` must be the contract admin, a `SuperAdmin`, or an
    /// `AssetManager`.
    pub fn register_asset(env: Env, caller: Address, asset_code: String) {
        Self::assert_not_globally_paused(&env);
        Self::check_permission(&env, &caller, AdminRole::AssetManager);

        let mut assets: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::MONITORED_ASSETS)
            .unwrap();

        for existing in assets.iter() {
            if existing == asset_code {
                panic!("asset is already registered");
            }
        }

        let timestamp = env.ledger().timestamp();
        let status = AssetHealth {
            asset_code: asset_code.clone(),
            health_score: 0,
            liquidity_score: 0,
            price_stability_score: 0,
            bridge_uptime_score: 0,
            paused: false,
            active: true,
            timestamp,
            expires_at: Self::resolve_expiration(
                &env,
                &asset_code,
                ExpirationKind::Asset,
                timestamp,
            ),
        };

        env.storage()
            .persistent()
            .set(&format!("asset_health:{}", asset_code.clone().into()), &status);

        assets.push_back(asset_code.clone());
        env.storage()
            .instance()
            .set(&keys::MONITORED_ASSETS, &assets);

        env.events()
            .publish((symbol_short!("asset_reg"), asset_code), true);
        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Temporarily pause monitoring for an asset.
    ///
    /// `caller` must be the contract admin, a `SuperAdmin`, or an
    /// `AssetManager`.
    pub fn pause_asset(env: Env, caller: Address, asset_code: String) {
        Self::check_permission(&env, &caller, AdminRole::AssetManager);
        let mut status = Self::load_asset_health(&env, &asset_code);
        if !status.active {
            panic!("cannot pause a deregistered asset");
        }
        status.paused = true;
        status.timestamp = env.ledger().timestamp();
        status.expires_at =
            Self::resolve_expiration(&env, &asset_code, ExpirationKind::Asset, status.timestamp);
        env.storage()
            .persistent()
            .set(&format!("asset_health:{}", asset_code.clone().into()), &status);
        env.events()
            .publish((symbol_short!("asset_pau"), asset_code), true);
        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Resume monitoring for a paused asset.
    ///
    /// `caller` must be the contract admin, a `SuperAdmin`, or an
    /// `AssetManager`.
    pub fn unpause_asset(env: Env, caller: Address, asset_code: String) {
        Self::check_permission(&env, &caller, AdminRole::AssetManager);
        let mut status = Self::load_asset_health(&env, &asset_code);
        if !status.active {
            panic!("cannot unpause a deregistered asset");
        }
        status.paused = false;
        status.timestamp = env.ledger().timestamp();
        status.expires_at =
            Self::resolve_expiration(&env, &asset_code, ExpirationKind::Asset, status.timestamp);
        env.storage()
            .persistent()
            .set(&format!("asset_health:{}", asset_code.clone().into()), &status);
        env.events()
            .publish((symbol_short!("asset_unp"), asset_code), true);
        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Permanently deregister an asset while retaining historical data.
    ///
    /// `caller` must be the contract admin, a `SuperAdmin`, or an
    /// `AssetManager`.
    pub fn deregister_asset(env: Env, caller: Address, asset_code: String) {
        Self::assert_not_globally_paused(&env);
        Self::check_permission(&env, &caller, AdminRole::AssetManager);
        let mut status = Self::load_asset_health(&env, &asset_code);
        status.active = false;
        status.paused = false;
        status.timestamp = env.ledger().timestamp();
        status.expires_at =
            Self::resolve_expiration(&env, &asset_code, ExpirationKind::Asset, status.timestamp);
        env.storage()
            .persistent()
            .set(&format!("asset_health:{}", asset_code.clone().into()), &status);
        env.events()
            .publish((symbol_short!("asset_del"), asset_code), false);
        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Get all monitored assets
    pub fn get_monitored_assets(env: Env) -> Vec<String> {
        let assets: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::MONITORED_ASSETS)
            .unwrap();

        let mut active_assets = Vec::new(&env);
        for asset_code in assets.iter() {
            let status: Option<AssetHealth> = env
                .storage()
                .persistent()
                .get(&format!("asset_health:{}", asset_code.clone().into()));

            match status {
                Some(record) => {
                    if record.active && !record.paused {
                        active_assets.push_back(asset_code);
                    }
                }
                None => active_assets.push_back(asset_code),
            }
        }

        active_assets
    }

    // -----------------------------------------------------------------------
    // Price Deviation Detection (issue #23)
    // -----------------------------------------------------------------------

    /// Set configurable deviation thresholds for an asset (admin only).
    ///
    /// All thresholds are expressed in basis points (1 bp = 0.01 %).
    /// Defaults used when none are configured: Low 200 bps, Medium 500 bps,
    /// High 1 000 bps.
    pub fn set_deviation_threshold(
        env: Env,
        asset_code: String,
        low_bps: i128,
        medium_bps: i128,
        high_bps: i128,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        admin.require_auth();
        Self::check_no_pending_transfer(&env);

        let threshold = DeviationThreshold {
            low_bps,
            medium_bps,
            high_bps,
        };
        env.storage()
            .persistent()
            .set(&format!("deviation_threshold:{}", asset_code.clone().into()), &threshold);

        env.events()
            .publish((symbol_short!("thresh_up"), asset_code), low_bps);
        Self::emit_contract_event(
            &env,
            BridgeWatchEvent::ThresholdUpdated {
                actor: admin,
                scope: String::from_str(&env, "deviation_threshold"),
                value: high_bps,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Compare `current_price` against the last recorded [`PriceRecord`] for
    /// the asset and store a [`DeviationAlert`] when the deviation exceeds a
    /// configured threshold.
    ///
    /// Returns the alert when a threshold is breached, `None` otherwise.
    /// Severity levels (default thresholds):
    /// - **Low** – deviation > 200 bps (2 %)
    /// - **Medium** – deviation > 500 bps (5 %)
    /// - **High** – deviation > 1 000 bps (10 %)
    pub fn check_price_deviation(
        env: Env,
        asset_code: String,
        current_price: i128,
    ) -> Option<DeviationAlert> {
        let reference: PriceRecord = env
            .storage()
            .persistent()
            .get(&format!("price_record:{}", asset_code.clone().into()))?;

        let average_price = reference.price;
        if average_price == 0 {
            return None;
        }

        let diff = if current_price > average_price {
            current_price - average_price
        } else {
            average_price - current_price
        };
        let deviation_bps = diff * 10_000 / average_price;

        let threshold: DeviationThreshold = env
            .storage()
            .persistent()
            .get(&format!("deviation_threshold:{}", asset_code.clone().into()))
            .unwrap_or(DeviationThreshold {
                low_bps: 200,
                medium_bps: 500,
                high_bps: 1_000,
            });

        let severity = if deviation_bps > threshold.high_bps {
            DeviationSeverity::High
        } else if deviation_bps > threshold.medium_bps {
            DeviationSeverity::Medium
        } else if deviation_bps > threshold.low_bps {
            DeviationSeverity::Low
        } else {
            return None;
        };

        let alert = DeviationAlert {
            asset_code: asset_code.clone(),
            current_price,
            average_price,
            deviation_bps,
            severity,
            timestamp: env.ledger().timestamp(),
            expires_at: Self::resolve_expiration(
                &env,
                &asset_code,
                ExpirationKind::Deviation,
                env.ledger().timestamp(),
            ),
        };

        env.storage()
            .persistent()
            .set(&format!("deviation_alert:{}", asset_code.clone().into()), &alert);

        env.events()
            .publish((symbol_short!("price_dev"), asset_code), deviation_bps);

        Some(alert)
    }

    /// Get the latest stored deviation alert for an asset.
    ///
    /// Returns `None` if no alert has been recorded.
    pub fn get_deviation_alerts(env: Env, asset_code: String) -> Option<DeviationAlert> {
        env.storage()
            .persistent()
            .get(&format!("deviation_alert:{}", asset_code).into())
    }

    // -----------------------------------------------------------------------
    // Bridge supply mismatch tracking (issue #28)
    // -----------------------------------------------------------------------

    /// Set the global critical mismatch threshold in basis points (admin only).
    ///
    /// Mismatches at or above this value are flagged as critical.
    /// Default is 10 bps (0.1 %).
    pub fn set_mismatch_threshold(env: Env, threshold_bps: i128) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        admin.require_auth();
        Self::check_no_pending_transfer(&env);
        env.storage()
            .instance()
            .set(&keys::MISMATCH_THRESHOLD, &threshold_bps);

        env.events().publish(
            (symbol_short!("thresh_up"), symbol_short!("mismatch")),
            threshold_bps,
        );
        Self::emit_contract_event(
            &env,
            BridgeWatchEvent::ThresholdUpdated {
                actor: admin,
                scope: String::from_str(&env, "mismatch_threshold"),
                value: threshold_bps,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Record a supply mismatch for a bridge asset (admin only).
    ///
    /// Calculates `mismatch_bps` as
    /// `|stellar_supply - source_chain_supply| * 10_000 / source_chain_supply`
    /// and sets `is_critical` when the value meets or exceeds the configured
    /// threshold (default 10 bps / 0.1 %). Each call appends to the bridge's
    /// historical record, enabling trend analysis over time.
    pub fn record_supply_mismatch(
        env: Env,
        bridge_id: String,
        asset_code: String,
        stellar_supply: i128,
        source_chain_supply: i128,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        admin.require_auth();

        let mismatch_bps = if source_chain_supply > 0 {
            let diff = if stellar_supply > source_chain_supply {
                stellar_supply - source_chain_supply
            } else {
                source_chain_supply - stellar_supply
            };
            diff * 10_000 / source_chain_supply
        } else {
            0
        };

        let threshold_bps: i128 = env
            .storage()
            .instance()
            .get(&keys::MISMATCH_THRESHOLD)
            .unwrap_or(10);

        let is_critical = mismatch_bps >= threshold_bps;

        let record = SupplyMismatch {
            bridge_id: bridge_id.clone(),
            asset_code: asset_code.clone(),
            stellar_supply,
            source_chain_supply,
            mismatch_bps,
            is_critical,
            timestamp: env.ledger().timestamp(),
            expires_at: Self::resolve_expiration(
                &env,
                &bridge_id,
                ExpirationKind::Mismatch,
                env.ledger().timestamp(),
            ),
        };

        let mut mismatches: Vec<SupplyMismatch> = env
            .storage()
            .persistent()
            .get(&format!("supply_mismatches:{}", bridge_id.clone().into()))
            .unwrap_or_else(|| Vec::new(&env));
        mismatches.push_back(record);
        env.storage()
            .persistent()
            .set(&format!("supply_mismatches:{}", bridge_id.clone().into()), &mismatches);

        // Track bridge ID for cross-bridge queries
        let mut bridge_ids: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::BRIDGEIDS)
            .unwrap_or_else(|| Vec::new(&env));
        let mut found = false;
        for b in bridge_ids.iter() {
            if b == bridge_id {
                found = true;
                break;
            }
        }
        if !found {
            bridge_ids.push_back(bridge_id.clone());
            env.storage()
                .instance()
                .set(&keys::BRIDGEIDS, &bridge_ids);
        }

        env.events()
            .publish((symbol_short!("supply_mm"), bridge_id), mismatch_bps);

        Self::maybe_trigger_auto_cleanup(&env);
    }

    /// Return all recorded supply mismatches for a bridge. Public read access.
    pub fn get_supply_mismatches(env: Env, bridge_id: String) -> Vec<SupplyMismatch> {
        env.storage()
            .persistent()
            .get(&format!("supply_mismatches:{}", bridge_id).into())
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Return all critical mismatches across every tracked bridge. Public read access.
    pub fn get_critical_mismatches(env: Env) -> Vec<SupplyMismatch> {
        let bridge_ids: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::BRIDGEIDS)
            .unwrap_or_else(|| Vec::new(&env));

        let mut critical: Vec<SupplyMismatch> = Vec::new(&env);
        for bridge_id in bridge_ids.iter() {
            let mismatches: Vec<SupplyMismatch> = env
                .storage()
                .persistent()
                .get(&format!("supply_mismatches:{}", bridge_id.clone().into()))
                .unwrap_or_else(|| Vec::new(&env));
            for m in mismatches.iter() {
                if m.is_critical {
                    critical.push_back(m);
                }
            }
        }
        critical
    }

    // -----------------------------------------------------------------------
    // Multi-DEX liquidity depth tracking (issue #31)
    // -----------------------------------------------------------------------

    /// Record aggregated liquidity depth for a supported asset pair.
    ///
    /// This stores the latest cross-DEX liquidity snapshot as well as
    /// appending it to the pair's historical series for trend analysis.
    ///
    /// Supported Phase 1 pairs are:
    /// - `USDC/XLM`
    /// - `EURC/XLM`
    /// - `PYUSD/XLM`
    /// - `FOBXX/USDC`
    ///
    /// # Panics
    /// Panics when:
    /// - the caller is not the contract admin
    /// - the asset pair is not supported in Phase 1
    /// - any liquidity value is negative
    /// - `sources` is empty
    /// - liquidity depth levels are inconsistent
    #[allow(clippy::too_many_arguments)]
    pub fn record_liquidity_depth(
        env: Env,
        asset_pair: String,
        total_liquidity: i128,
        depth_0_1_pct: i128,
        depth_0_5_pct: i128,
        depth_1_pct: i128,
        depth_5_pct: i128,
        sources: Vec<String>,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        admin.require_auth();
        let timestamp = env.ledger().timestamp();

        Self::validate_liquidity_depth_input(
            &env,
            &asset_pair,
            total_liquidity,
            depth_0_1_pct,
            depth_0_5_pct,
            depth_1_pct,
            depth_5_pct,
            &sources,
        );

        let record = LiquidityDepth {
            asset_pair: asset_pair.clone(),
            total_liquidity,
            depth_0_1_pct,
            depth_0_5_pct,
            depth_1_pct,
            depth_5_pct,
            sources,
            timestamp,
            expires_at: Self::resolve_expiration(
                &env,
                &asset_pair,
                ExpirationKind::Liquidity,
                timestamp,
            ),
        };

        env.storage()
            .persistent()
            .set(&DataKey::LiquidityDepthCurrent(asset_pair.clone()), &record);

        let mut history: Vec<LiquidityDepth> = env
            .storage()
            .persistent()
            .get(&DataKey::LiquidityDepthHistory(asset_pair.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(record);
        env.storage().persistent().set(
            &DataKey::LiquidityDepthHistory(asset_pair.clone()),
            &history,
        );

        let mut pairs: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::LIQUIDITY_PAIRS)
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        for pair in pairs.iter() {
            if pair == asset_pair {
                found = true;
                break;
            }
        }

        if !found {
            pairs.push_back(asset_pair.clone());
            env.storage()
                .instance()
                .set(&keys::LIQUIDITY_PAIRS, &pairs);
        }

        env.events()
            .publish((symbol_short!("liq_chg"), asset_pair), total_liquidity);

        Self::maybe_trigger_auto_cleanup(&env);
    }

    /// Return the latest aggregated liquidity depth for an asset pair.
    ///
    /// Public read access.
    pub fn get_aggregated_liquidity_depth(env: Env, asset_pair: String) -> Option<LiquidityDepth> {
        env.storage()
            .persistent()
            .get(&DataKey::LiquidityDepthCurrent(asset_pair))
    }

    /// Return historical liquidity depth snapshots for an asset pair.
    ///
    /// Public read access. Returned records are ordered by insertion time and
    /// filtered to the inclusive timestamp range `[from_timestamp, to_timestamp]`.
    pub fn get_liquidity_history(
        env: Env,
        asset_pair: String,
        from_timestamp: u64,
        to_timestamp: u64,
    ) -> Vec<LiquidityDepth> {
        let history: Vec<LiquidityDepth> = env
            .storage()
            .persistent()
            .get(&DataKey::LiquidityDepthHistory(asset_pair))
            .unwrap_or_else(|| Vec::new(&env));

        let mut filtered = Vec::new(&env);
        for snapshot in history.iter() {
            if snapshot.timestamp >= from_timestamp && snapshot.timestamp <= to_timestamp {
                filtered.push_back(snapshot);
            }
        }

        filtered
    }

    /// Return the latest aggregated liquidity depth for all tracked asset pairs.
    ///
    /// Public read access.
    pub fn get_all_liquidity_depths(env: Env) -> Vec<LiquidityDepth> {
        let pairs: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::LIQUIDITY_PAIRS)
            .unwrap_or_else(|| Vec::new(&env));

        let mut records = Vec::new(&env);
        for pair in pairs.iter() {
            let current: Option<LiquidityDepth> = env
                .storage()
                .persistent()
                .get(&DataKey::LiquidityDepthCurrent(pair));
            if let Some(record) = current {
                records.push_back(record);
            }
        }

        records
    }
    // Multi-admin role management (issue #25)
    // -----------------------------------------------------------------------

    /// Grant a role to `grantee` (SuperAdmin or original admin only).
    ///
    /// Duplicate grants are silently ignored. The original admin address set
    /// via `initialize()` is implicitly treated as SuperAdmin and does not
    /// require an explicit role entry.
    pub fn grant_role(env: Env, granter: Address, grantee: Address, role: AdminRole) {
        Self::assert_not_globally_paused(&env);
        granter.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        Self::check_no_pending_transfer(&env);
        let authorized =
            granter == admin || Self::has_role_internal(&env, &granter, AdminRole::SuperAdmin);
        if !authorized {
            panic!("only SuperAdmin can grant roles");
        }

        let mut roles: Vec<AdminRole> = env
            .storage()
            .persistent()
            .get(&format!("role_key:{}", grantee.clone().into()))
            .unwrap_or_else(|| Vec::new(&env));

        for r in roles.iter() {
            if r == role {
                return; // already granted
            }
        }
        roles.push_back(role.clone());
        env.storage()
            .persistent()
            .set(&format!("role_key:{}", grantee.clone().into()), &roles);

        let mut assignments: Vec<RoleAssignment> = env
            .storage()
            .persistent()
            .get(&keys::ROLES_LIST)
            .unwrap_or_else(|| Vec::new(&env));
        assignments.push_back(RoleAssignment {
            address: grantee.clone(),
            role: role.clone(),
        });
        env.storage()
            .persistent()
            .set(&keys::ROLES_LIST, &assignments);

        env.events()
            .publish((symbol_short!("role_grnt"), grantee), role);
        Self::emit_contract_event(
            &env,
            BridgeWatchEvent::RoleChanged {
                actor: granter,
                target: grantee,
                granted: true,
                role,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Revoke a specific role from `target` (SuperAdmin or original admin only).
    pub fn revoke_role(env: Env, revoker: Address, target: Address, role: AdminRole) {
        Self::assert_not_globally_paused(&env);
        revoker.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        Self::check_no_pending_transfer(&env);
        let authorized =
            revoker == admin || Self::has_role_internal(&env, &revoker, AdminRole::SuperAdmin);
        if !authorized {
            panic!("only SuperAdmin can revoke roles");
        }

        let roles: Vec<AdminRole> = env
            .storage()
            .persistent()
            .get(&format!("role_key:{}", target.clone().into()))
            .unwrap_or_else(|| Vec::new(&env));

        let mut updated: Vec<AdminRole> = Vec::new(&env);
        for r in roles.iter() {
            if r != role {
                updated.push_back(r);
            }
        }
        env.storage()
            .persistent()
            .set(&format!("role_key:{}", target.clone().into()), &updated);

        let assignments: Vec<RoleAssignment> = env
            .storage()
            .persistent()
            .get(&keys::ROLES_LIST)
            .unwrap_or_else(|| Vec::new(&env));

        let mut updated_assignments: Vec<RoleAssignment> = Vec::new(&env);
        for a in assignments.iter() {
            if !(a.address == target && a.role == role) {
                updated_assignments.push_back(a);
            }
        }
        env.storage()
            .persistent()
            .set(&keys::ROLES_LIST, &updated_assignments);

        env.events()
            .publish((symbol_short!("role_revk"), target), role);
        Self::emit_contract_event(
            &env,
            BridgeWatchEvent::RoleChanged {
                actor: revoker,
                target,
                granted: false,
                role,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Configure global expiration TTLs for stored records.
    pub fn set_expiration_policy(
        env: Env,
        caller: Address,
        asset_ttl_secs: u64,
        price_ttl_secs: u64,
        deviation_ttl_secs: u64,
        mismatch_ttl_secs: u64,
        liquidity_ttl_secs: u64,
        preserve_latest_history: bool,
        version: u32,
    ) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        let authorized =
            caller == admin || Self::has_role_internal(&env, &caller, AdminRole::SuperAdmin);
        if !authorized {
            panic!("only admin or SuperAdmin can set expiration policy");
        }
        if version == 0 {
            panic!("expiration policy version must be greater than 0");
        }

        let policy = ExpirationPolicy {
            asset_ttl_secs,
            price_ttl_secs,
            deviation_ttl_secs,
            mismatch_ttl_secs,
            liquidity_ttl_secs,
            preserve_latest_history,
            version,
        };

        env.storage()
            .instance()
            .set(&keys::EXPIRATIONPOLICY, &policy);
        Self::emit_contract_event(
            &env,
            BridgeWatchEvent::ExpirationPolicyUpdated {
                actor: caller,
                scope: String::from_str(&env, "global"),
                ttl_secs: price_ttl_secs,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Configure a per-asset TTL override for asset-bound records.
    pub fn set_asset_expiration_ttl(env: Env, caller: Address, asset_code: String, ttl_secs: u64) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        let authorized =
            caller == admin || Self::has_role_internal(&env, &caller, AdminRole::SuperAdmin);
        if !authorized {
            panic!("only admin or SuperAdmin can set asset expiration ttl");
        }

        env.storage()
            .persistent()
            .set(&DataKey::AssetExpirationTtl(asset_code.clone()), &ttl_secs);

        Self::emit_contract_event(
            &env,
            BridgeWatchEvent::ExpirationPolicyUpdated {
                actor: caller,
                scope: asset_code,
                ttl_secs,
                timestamp: env.ledger().timestamp(),
            },
        );
    }

    /// Return the current expiration policy.
    pub fn get_expiration_policy(env: Env) -> ExpirationPolicy {
        Self::load_expiration_policy(&env)
    }

    /// Return the most recent cleanup summary, if one exists.
    pub fn get_cleanup_stats(env: Env) -> Option<CleanupStats> {
        env.storage().instance().get(&keys::CLEANUPSTATS)
    }

    /// Manually extend current record expirations for an asset.
    pub fn extend_expiration(env: Env, caller: Address, asset_code: String, extra_secs: u64) {
        Self::check_permission(&env, &caller, AdminRole::AssetManager);
        let now = env.ledger().timestamp();
        let updated_expiration = |current: u64| {
            if current > now {
                current + extra_secs
            } else {
                now + extra_secs
            }
        };

        if let Some(mut record) = env
            .storage()
            .persistent()
            .get::<String, AssetHealth>(&format!("asset_health:{}", asset_code.clone().into()))
        {
            record.expires_at = updated_expiration(record.expires_at);
            env.storage()
                .persistent()
                .set(&format!("asset_health:{}", asset_code.clone().into()), &record);
        }

        if let Some(mut record) = env
            .storage()
            .persistent()
            .get::<String, PriceRecord>(&format!("price_record:{}", asset_code.clone().into()))
        {
            record.expires_at = updated_expiration(record.expires_at);
            env.storage()
                .persistent()
                .set(&format!("price_record:{}", asset_code.clone().into()), &record);
        }

        if let Some(mut record) = env
            .storage()
            .persistent()
            .get::<String, DeviationAlert>(&format!("deviation_alert:{}", asset_code.clone().into()))
        {
            record.expires_at = updated_expiration(record.expires_at);
            env.storage()
                .persistent()
                .set(&format!("deviation_alert:{}", asset_code.clone().into()), &record);
        }

        if let Some(mut record) = env
            .storage()
            .persistent()
            .get::<String, HealthScoreResult>(&format!("health_score_result:{}", asset_code.clone().into()))
        {
            record.expires_at = updated_expiration(record.expires_at);
            env.storage()
                .persistent()
                .set(&format!("health_score_result:{}", asset_code.clone().into()), &record);
            Self::emit_contract_event(
                &env,
                BridgeWatchEvent::ExpirationExtended {
                    actor: caller,
                    scope: asset_code,
                    expires_at: record.expires_at,
                    timestamp: now,
                },
            );
        }
    }

    /// Cleanup expired records and trim expired historical entries.
    pub fn cleanup_expired_data(env: Env, caller: Address, max_records: u32) -> CleanupStats {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        let authorized =
            caller == admin || Self::has_role_internal(&env, &caller, AdminRole::SuperAdmin);
        if !authorized {
            panic!("only admin or SuperAdmin can clean expired data");
        }

        let now = env.ledger().timestamp();
        let policy = Self::load_expiration_policy(&env);
        let mut removed_records = 0u32;
        let mut trimmed_history_records = 0u32;

        let assets: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::MONITORED_ASSETS)
            .unwrap_or_else(|| Vec::new(&env));
        for asset_code in assets.iter() {
            if removed_records >= max_records {
                break;
            }

            if let Some(record) = env
                .storage()
                .persistent()
                .get::<String, AssetHealth>(&format!("asset_health:{}", asset_code.clone().into()))
            {
                if Self::is_expired(now, record.expires_at) {
                    env.storage()
                        .persistent()
                        .remove(&format!("asset_health:{}", asset_code.clone().into()));
                    removed_records += 1;
                }
            }

            if let Some(record) = env
                .storage()
                .persistent()
                .get::<String, PriceRecord>(&format!("price_record:{}", asset_code.clone().into()))
            {
                if removed_records < max_records && Self::is_expired(now, record.expires_at) {
                    env.storage()
                        .persistent()
                        .remove(&format!("price_record:{}", asset_code.clone().into()));
                    removed_records += 1;
                }
            }

            if let Some(record) = env
                .storage()
                .persistent()
                .get::<String, DeviationAlert>(&format!("deviation_alert:{}", asset_code.clone().into()))
            {
                if removed_records < max_records && Self::is_expired(now, record.expires_at) {
                    env.storage()
                        .persistent()
                        .remove(&format!("deviation_alert:{}", asset_code.clone().into()));
                    removed_records += 1;
                }
            }

            if let Some(record) = env
                .storage()
                .persistent()
                .get::<String, HealthScoreResult>(&format!("health_score_result:{}", asset_code.clone().into()))
            {
                if removed_records < max_records && Self::is_expired(now, record.expires_at) {
                    env.storage()
                        .persistent()
                        .remove(&format!("health_score_result:{}", asset_code.clone().into()));
                    removed_records += 1;
                }
            }

            let history: Vec<PriceRecord> = env
                .storage()
                .persistent()
                .get(&format!("price_history:{}", asset_code.clone().into()))
                .unwrap_or_else(|| Vec::new(&env));
            let mut filtered_history = Vec::new(&env);
            for entry in history.iter() {
                if !Self::is_expired(now, entry.expires_at) {
                    filtered_history.push_back(entry);
                } else {
                    trimmed_history_records += 1;
                }
            }
            if filtered_history.len() == 0 && history.len() > 0 && policy.preserve_latest_history {
                let last_index = history.len() - 1;
                if let Some(last_entry) = history.get(last_index) {
                    filtered_history.push_back(last_entry);
                    if trimmed_history_records > 0 {
                        trimmed_history_records -= 1;
                    }
                }
            }
            env.storage().persistent().set(
                &format!("price_history:{}", asset_code.clone().into()),
                &filtered_history,
            );
        }

        let bridge_ids: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::BRIDGEIDS)
            .unwrap_or_else(|| Vec::new(&env));
        for bridge_id in bridge_ids.iter() {
            let history: Vec<SupplyMismatch> = env
                .storage()
                .persistent()
                .get(&format!("supply_mismatches:{}", bridge_id.clone().into()))
                .unwrap_or_else(|| Vec::new(&env));
            let mut filtered = Vec::new(&env);
            for entry in history.iter() {
                if !Self::is_expired(now, entry.expires_at) {
                    filtered.push_back(entry);
                } else {
                    trimmed_history_records += 1;
                }
            }
            if filtered.len() == 0 && history.len() > 0 && policy.preserve_latest_history {
                let last_index = history.len() - 1;
                if let Some(last_entry) = history.get(last_index) {
                    filtered.push_back(last_entry);
                    if trimmed_history_records > 0 {
                        trimmed_history_records -= 1;
                    }
                }
            }
            env.storage()
                .persistent()
                .set(&format!("supply_mismatches:{}", bridge_id).into(), &filtered);
        }

        let pairs: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::LIQUIDITY_PAIRS)
            .unwrap_or_else(|| Vec::new(&env));
        for asset_pair in pairs.iter() {
            if let Some(record) = env
                .storage()
                .persistent()
                .get::<String, LiquidityDepth>(&DataKey::LiquidityDepthCurrent(asset_pair.clone()))
            {
                if removed_records < max_records && Self::is_expired(now, record.expires_at) {
                    env.storage()
                        .persistent()
                        .remove(&DataKey::LiquidityDepthCurrent(asset_pair.clone()));
                    removed_records += 1;
                }
            }

            let history: Vec<LiquidityDepth> = env
                .storage()
                .persistent()
                .get(&DataKey::LiquidityDepthHistory(asset_pair.clone()))
                .unwrap_or_else(|| Vec::new(&env));
            let mut filtered = Vec::new(&env);
            for entry in history.iter() {
                if !Self::is_expired(now, entry.expires_at) {
                    filtered.push_back(entry);
                } else {
                    trimmed_history_records += 1;
                }
            }
            if filtered.len() == 0 && history.len() > 0 && policy.preserve_latest_history {
                let last_index = history.len() - 1;
                if let Some(last_entry) = history.get(last_index) {
                    filtered.push_back(last_entry);
                    if trimmed_history_records > 0 {
                        trimmed_history_records -= 1;
                    }
                }
            }
            env.storage()
                .persistent()
                .set(&DataKey::LiquidityDepthHistory(asset_pair), &filtered);
        }

        let stats = CleanupStats {
            last_run_at: now,
            removed_records,
            trimmed_history_records,
            last_actor: caller.clone(),
        };
        env.storage().instance().set(&keys::CLEANUPSTATS, &stats);
        Self::emit_contract_event(
            &env,
            BridgeWatchEvent::CleanupCompleted {
                actor: caller,
                removed_records,
                trimmed_history_records,
                timestamp: now,
            },
        );
        stats
    }

    /// Return `true` if `address` holds `role`.
    ///
    /// Public read — no authorisation required.
    pub fn has_role(env: Env, address: Address, role: AdminRole) -> bool {
        Self::has_role_internal(&env, &address, role)
    }

    /// Return all active role assignments. Public read.
    pub fn get_admin_roles(env: Env) -> Vec<RoleAssignment> {
        env.storage()
            .persistent()
            .get(&keys::ROLES_LIST)
            .unwrap_or_else(|| Vec::new(&env))
    }

    // -----------------------------------------------------------------------
    // ACL — flexible permission management (issue #101)
    // -----------------------------------------------------------------------

    /// Grant `role` to `grantee`.
    ///
    /// `caller` must be the contract admin or hold `ManagePermissions`.
    /// `expires_at` is a ledger timestamp; pass `0` for a non-expiring grant.
    /// Granting the same role twice updates the expiry.
    pub fn acl_grant_role(
        env: Env,
        caller: Address,
        grantee: Address,
        role: Role,
        expires_at: u64,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        acl::require_permission(&env, &caller, &admin, &Permission::ManagePermissions);

        acl::grant_role_internal(&env, &grantee, &role, &caller, expires_at);

        env.events().publish(
            (symbol_short!("acl_grnt"), grantee.clone()),
            (role, expires_at),
        );
    }

    /// Revoke `role` from `grantee`.
    ///
    /// `caller` must be the contract admin or hold `ManagePermissions`.
    /// No-ops silently if the grant does not exist.
    pub fn acl_revoke_role(env: Env, caller: Address, grantee: Address, role: Role) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        acl::require_permission(&env, &caller, &admin, &Permission::ManagePermissions);

        acl::revoke_role_internal(&env, &grantee, &role);

        env.events()
            .publish((symbol_short!("acl_revk"), grantee.clone()), role);
    }

    /// Grant a direct `permission` to `grantee`.
    ///
    /// `caller` must be the contract admin or hold `ManagePermissions`.
    /// `expires_at` is a ledger timestamp; pass `0` for a non-expiring grant.
    pub fn acl_grant_permission(
        env: Env,
        caller: Address,
        grantee: Address,
        permission: Permission,
        expires_at: u64,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        acl::require_permission(&env, &caller, &admin, &Permission::ManagePermissions);

        acl::grant_permission_internal(&env, &grantee, &permission, &caller, expires_at);

        env.events().publish(
            (symbol_short!("acl_pgrn"), grantee.clone()),
            (permission, expires_at),
        );
    }

    /// Revoke a direct `permission` from `grantee`.
    ///
    /// `caller` must be the contract admin or hold `ManagePermissions`.
    pub fn acl_revoke_permission(
        env: Env,
        caller: Address,
        grantee: Address,
        permission: Permission,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        acl::require_permission(&env, &caller, &admin, &Permission::ManagePermissions);

        acl::revoke_permission_internal(&env, &grantee, &permission);

        env.events()
            .publish((symbol_short!("acl_prv"), grantee.clone()), permission);
    }

    /// Return `true` if `address` currently holds `role` (respects expiry).
    ///
    /// Public read — no authorisation required.
    pub fn acl_has_role(env: Env, address: Address, role: Role) -> bool {
        acl::has_role_internal(&env, &address, &role)
    }

    /// Return `true` if `address` has `permission` via any active role or
    /// direct grant (respects expiry and inheritance).
    ///
    /// Public read — no authorisation required.
    pub fn acl_has_permission(env: Env, address: Address, permission: Permission) -> bool {
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if address == admin {
            return true;
        }
        acl::has_permission_internal(&env, &address, &permission)
    }

    /// Return all role grants (including expired ones for audit purposes).
    ///
    /// Public read — no authorisation required.
    pub fn acl_get_role_grants(env: Env) -> Vec<RoleGrant> {
        env.storage()
            .persistent()
            .get(&AclKey::RoleGrants)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Return all direct permission grants (including expired ones).
    ///
    /// Public read — no authorisation required.
    pub fn acl_get_permission_grants(env: Env) -> Vec<PermissionGrant> {
        env.storage()
            .persistent()
            .get(&AclKey::PermissionGrants)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Return all role grants for a specific `address` (including expired).
    ///
    /// Public read — no authorisation required.
    pub fn acl_get_roles_for(env: Env, address: Address) -> Vec<RoleGrant> {
        let grants: Vec<RoleGrant> = env
            .storage()
            .persistent()
            .get(&AclKey::RoleGrants)
            .unwrap_or_else(|| Vec::new(&env));

        let mut result: Vec<RoleGrant> = Vec::new(&env);
        for g in grants.iter() {
            if g.grantee == address {
                result.push_back(g);
            }
        }
        result
    }

    /// Return all direct permission grants for a specific `address`.
    ///
    /// Public read — no authorisation required.
    pub fn acl_get_permissions_for(env: Env, address: Address) -> Vec<PermissionGrant> {
        let grants: Vec<PermissionGrant> = env
            .storage()
            .persistent()
            .get(&AclKey::PermissionGrants)
            .unwrap_or_else(|| Vec::new(&env));

        let mut result: Vec<PermissionGrant> = Vec::new(&env);
        for g in grants.iter() {
            if g.grantee == address {
                result.push_back(g);
            }
        }
        result
    }

    /// Bulk-grant roles to multiple addresses in a single transaction.
    ///
    /// `caller` must be the contract admin or hold `ManagePermissions`.
    /// Accepts up to 20 entries per call.
    pub fn acl_bulk_grant_roles(env: Env, caller: Address, entries: Vec<BulkRoleEntry>) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        acl::require_permission(&env, &caller, &admin, &Permission::ManagePermissions);

        if entries.len() > 20 {
            panic!("bulk grant exceeds maximum of 20 entries");
        }

        for entry in entries.iter() {
            acl::grant_role_internal(&env, &entry.grantee, &entry.role, &caller, entry.expires_at);
            env.events().publish(
                (symbol_short!("acl_grnt"), entry.grantee.clone()),
                (entry.role, entry.expires_at),
            );
        }
    }

    /// Bulk-revoke roles from multiple addresses in a single transaction.
    ///
    /// `caller` must be the contract admin or hold `ManagePermissions`.
    /// Accepts up to 20 entries per call.
    pub fn acl_bulk_revoke_roles(env: Env, caller: Address, entries: Vec<BulkRoleEntry>) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        acl::require_permission(&env, &caller, &admin, &Permission::ManagePermissions);

        if entries.len() > 20 {
            panic!("bulk revoke exceeds maximum of 20 entries");
        }

        for entry in entries.iter() {
            acl::revoke_role_internal(&env, &entry.grantee, &entry.role);
            env.events().publish(
                (symbol_short!("acl_revk"), entry.grantee.clone()),
                entry.role,
            );
        }
    }

    /// Bulk-grant direct permissions to multiple addresses in a single transaction.
    ///
    /// `caller` must be the contract admin or hold `ManagePermissions`.
    /// Accepts up to 20 entries per call.
    pub fn acl_bulk_grant_permissions(
        env: Env,
        caller: Address,
        entries: Vec<BulkPermissionEntry>,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        acl::require_permission(&env, &caller, &admin, &Permission::ManagePermissions);

        if entries.len() > 20 {
            panic!("bulk grant exceeds maximum of 20 entries");
        }

        for entry in entries.iter() {
            acl::grant_permission_internal(
                &env,
                &entry.grantee,
                &entry.permission,
                &caller,
                entry.expires_at,
            );
            env.events().publish(
                (symbol_short!("acl_pgrn"), entry.grantee.clone()),
                (entry.permission, entry.expires_at),
            );
        }
    }

    /// Bulk-revoke direct permissions from multiple addresses.
    ///
    /// `caller` must be the contract admin or hold `ManagePermissions`.
    /// Accepts up to 20 entries per call.
    pub fn acl_bulk_revoke_permissions(
        env: Env,
        caller: Address,
        entries: Vec<BulkPermissionEntry>,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        acl::require_permission(&env, &caller, &admin, &Permission::ManagePermissions);

        if entries.len() > 20 {
            panic!("bulk revoke exceeds maximum of 20 entries");
        }

        for entry in entries.iter() {
            acl::revoke_permission_internal(&env, &entry.grantee, &entry.permission);
            env.events().publish(
                (symbol_short!("acl_prv"), entry.grantee.clone()),
                entry.permission,
            );
        }
    }

    // -----------------------------------------------------------------------
    // Emergency Pause (issue #96)
    // -----------------------------------------------------------------------

    /// Immediately halt all state-changing operations.
    ///
    /// `caller` must be the contract admin or the designated pause guardian.
    /// A human-readable `reason` is stored on-chain and included in the emitted
    /// event. Every call appends an entry to the immutable pause history log.
    ///
    /// After `emergency_pause()` succeeds, all write operations will panic
    /// until `unpause()` is called **and** the configured timelock has elapsed
    /// (default 24 hours / 86 400 seconds).
    ///
    /// # Panics
    /// - `caller` is neither the admin nor the pause guardian.
    pub fn emergency_pause(env: Env, caller: Address, reason: String) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        let guardian: Option<Address> = env.storage().instance().get(&keys::PAUSE_GUARDIAN);
        let is_admin = caller == admin;
        let is_guardian = guardian.as_ref().map(|g| *g == caller).unwrap_or(false);
        if !is_admin && !is_guardian {
            panic!("only admin or pause guardian can trigger emergency pause");
        }

        let now = env.ledger().timestamp();
        // Timelock: 24 hours before unpause is permitted
        let timelock_secs: u64 = 86_400;

        env.storage().instance().set(&keys::GLOBAL_PAUSED, &true);
        env.storage().instance().set(&keys::PAUSE_REASON, &reason);
        env.storage().instance().set(&keys::PAUSED_AT, &now);
        env.storage()
            .instance()
            .set(&keys::UNPAUSE_AVAILABLE_AT, &(now + timelock_secs));

        // Append to the immutable pause history log
        let record = PauseRecord {
            paused: true,
            reason: reason.clone(),
            caller: caller.clone(),
            timestamp: now,
        };
        let mut history: Vec<PauseRecord> = env
            .storage()
            .persistent()
            .get(&keys::PAUSE_HISTORY)
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(record);
        env.storage()
            .persistent()
            .set(&keys::PAUSE_HISTORY, &history);

        env.events()
            .publish((symbol_short!("em_pause"), caller), reason);
    }

    /// Lift the global pause after the timelock has elapsed.
    ///
    /// Only the contract admin may call `unpause()`. The call panics if the
    /// 24-hour timelock set at pause-time has not yet expired, preventing
    /// hasty re-activation in a still-live incident.
    ///
    /// # Panics
    /// - `caller` is not the contract admin.
    /// - The timelock (`unpause_available_at`) has not yet passed.
    pub fn unpause(env: Env, caller: Address, reason: String) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            panic!("only admin can unpause the contract");
        }

        let now = env.ledger().timestamp();
        let available_at: u64 = env
            .storage()
            .instance()
            .get(&keys::UNPAUSE_AVAILABLE_AT)
            .unwrap_or(0);
        if now < available_at {
            panic!("unpause timelock has not elapsed yet");
        }

        env.storage().instance().set(&keys::GLOBAL_PAUSED, &false);

        // Append unpause record to history
        let record = PauseRecord {
            paused: false,
            reason: reason.clone(),
            caller: caller.clone(),
            timestamp: now,
        };
        let mut history: Vec<PauseRecord> = env
            .storage()
            .persistent()
            .get(&keys::PAUSE_HISTORY)
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(record);
        env.storage()
            .persistent()
            .set(&keys::PAUSE_HISTORY, &history);

        env.events()
            .publish((symbol_short!("em_unpaus"), caller), reason);
    }

    /// Designate a dedicated pause guardian address.
    ///
    /// The pause guardian can call `emergency_pause()` without holding an
    /// admin role, but cannot call `unpause()`. Only the contract admin may
    /// set or change the guardian.
    ///
    /// # Panics
    /// - `caller` is not the contract admin.
    pub fn set_pause_guardian(env: Env, caller: Address, guardian: Address) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            panic!("only admin can set pause guardian");
        }
        env.storage()
            .instance()
            .set(&keys::PAUSE_GUARDIAN, &guardian);

        env.events().publish((symbol_short!("pg_set"),), guardian);
    }

    /// Return `true` when the contract is currently globally paused.
    ///
    /// Public read — no authorisation required.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&keys::GLOBAL_PAUSED)
            .unwrap_or(false)
    }

    /// Return `true` when an asset is paused, either globally or per-asset.
    ///
    /// Public read — no authorisation required.
    pub fn is_asset_paused(env: Env, asset_code: String) -> bool {
        let globally_paused: bool = env
            .storage()
            .instance()
            .get(&keys::GLOBAL_PAUSED)
            .unwrap_or(false);
        if globally_paused {
            return true;
        }
        let status: Option<AssetHealth> = env
            .storage()
            .persistent()
            .get(&format!("asset_health:{}", asset_code).into());
        status.map(|s| s.paused).unwrap_or(false)
    }

    /// Return a full snapshot of the current global pause state.
    ///
    /// Public read — no authorisation required. Suitable for dashboards and
    /// monitoring tooling.
    pub fn get_pause_status(env: Env) -> GlobalPauseState {
        let is_paused: bool = env
            .storage()
            .instance()
            .get(&keys::GLOBAL_PAUSED)
            .unwrap_or(false);
        let reason: String = env
            .storage()
            .instance()
            .get(&keys::PAUSE_REASON)
            .unwrap_or_else(|| String::from_str(&env, ""));
        let paused_at: u64 = env
            .storage()
            .instance()
            .get(&keys::PAUSED_AT)
            .unwrap_or(0);
        let unpause_available_at: u64 = env
            .storage()
            .instance()
            .get(&keys::UNPAUSE_AVAILABLE_AT)
            .unwrap_or(0);
        let emergency_contact: String = env
            .storage()
            .instance()
            .get(&keys::EMERGENCY_CONTACT)
            .unwrap_or_else(|| String::from_str(&env, ""));

        GlobalPauseState {
            is_paused,
            reason,
            paused_at,
            unpause_available_at,
            emergency_contact,
        }
    }

    /// Return the full ordered pause/unpause history log.
    ///
    /// Public read — no authorisation required.
    pub fn get_pause_history(env: Env) -> Vec<PauseRecord> {
        env.storage()
            .persistent()
            .get(&keys::PAUSE_HISTORY)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Store operator emergency contact information (e-mail, Telegram, etc.).
    ///
    /// Only the contract admin may update this value. The contact string is
    /// included in the `get_pause_status()` response so monitoring tools can
    /// surface it automatically when a pause is detected.
    ///
    /// # Panics
    /// - `caller` is not the contract admin.
    pub fn set_emergency_contact(env: Env, caller: Address, contact: String) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            panic!("only admin can set emergency contact");
        }
        env.storage()
            .instance()
            .set(&keys::EMERGENCY_CONTACT, &contact);

        env.events().publish((symbol_short!("em_cont"),), contact);
    }

    // -----------------------------------------------------------------------
    // Admin Transfer (issue #97)
    // -----------------------------------------------------------------------

    /// Propose a transfer of the admin role to `proposed_admin`.
    ///
    /// The current admin initiates the two-step handover. The proposal expires
    /// after 7 days (604 800 seconds); after that, the pending proposal is
    /// automatically considered void and either party must restart the process.
    ///
    /// While a transfer is pending, the following admin-only write operations
    /// are blocked: `grant_role`, `revoke_role`, `set_health_weights`,
    /// `set_deviation_threshold`, `set_mismatch_threshold`.
    ///
    /// # Panics
    /// - `caller` is not the current contract admin.
    /// - A non-expired proposal already exists.
    pub fn propose_admin_transfer(env: Env, caller: Address, proposed_admin: Address) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            panic!("only the current admin can propose a transfer");
        }

        // Reject if a non-expired proposal already exists
        let existing: Option<PendingAdminTransfer> =
            env.storage().instance().get(&keys::PENDING_TRANSFER);
        if let Some(ref proposal) = existing {
            let now = env.ledger().timestamp();
            if now < proposal.timeout_at {
                panic!("a pending transfer already exists; cancel it first");
            }
        }

        let now = env.ledger().timestamp();
        let timeout_secs: u64 = 604_800; // 7 days
        let proposal = PendingAdminTransfer {
            proposed_admin: proposed_admin.clone(),
            proposed_at: now,
            timeout_at: now + timeout_secs,
        };
        env.storage()
            .instance()
            .set(&keys::PENDING_TRANSFER, &proposal);

        env.events()
            .publish((symbol_short!("adm_prop"), caller), proposed_admin);
    }

    /// Accept an incoming admin transfer proposal.
    ///
    /// Must be called by the address that was nominated in
    /// `propose_admin_transfer()`. On success the contract admin is atomically
    /// updated to `caller` and the pending proposal is cleared.
    ///
    /// # Panics
    /// - There is no pending proposal.
    /// - The proposal has expired (older than 7 days).
    /// - `caller` is not the nominated new admin.
    pub fn accept_admin_transfer(env: Env, caller: Address) {
        caller.require_auth();
        let proposal: PendingAdminTransfer = env
            .storage()
            .instance()
            .get(&keys::PENDING_TRANSFER)
            .unwrap_or_else(|| panic!("no pending admin transfer"));

        let now = env.ledger().timestamp();
        if now >= proposal.timeout_at {
            panic!("admin transfer proposal has expired");
        }
        if caller != proposal.proposed_admin {
            panic!("caller is not the nominated new admin");
        }

        // Atomically promote the caller to admin and clear the proposal
        env.storage().instance().set(&keys::ADMIN, &caller);
        env.storage().instance().remove(&keys::PENDING_TRANSFER);

        env.events()
            .publish((symbol_short!("adm_acpt"), caller), true);
    }

    /// Cancel a pending admin transfer proposal.
    ///
    /// Only the current admin (the proposer) may cancel. This is the emergency
    /// override path if the nominated address is compromised or the proposal
    /// was sent in error.
    ///
    /// # Panics
    /// - `caller` is not the current contract admin.
    /// - There is no pending proposal to cancel.
    pub fn cancel_admin_transfer(env: Env, caller: Address) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            panic!("only the current admin can cancel a transfer");
        }
        if !env.storage().instance().has(&keys::PENDING_TRANSFER) {
            panic!("no pending admin transfer to cancel");
        }
        env.storage().instance().remove(&keys::PENDING_TRANSFER);

        env.events()
            .publish((symbol_short!("adm_cncl"), caller), true);
    }

    /// Return the current pending admin transfer proposal, if any.
    ///
    /// Returns `None` when there is no proposal or the proposal has expired.
    /// Public read — no authorisation required.
    pub fn get_pending_transfer(env: Env) -> Option<PendingAdminTransfer> {
        let proposal: Option<PendingAdminTransfer> =
            env.storage().instance().get(&keys::PENDING_TRANSFER);
        match proposal {
            None => None,
            Some(p) => {
                let now = env.ledger().timestamp();
                if now >= p.timeout_at {
                    None // expired
                } else {
                    Some(p)
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Contract Upgrade (issue #98)
    // -----------------------------------------------------------------------

    /// Propose a contract upgrade with governance approval and timelock.
    ///
    /// Standard proposals enforce a 48-hour timelock. Emergency proposals use
    /// a higher governance threshold and may execute immediately.
    pub fn propose_upgrade(
        env: Env,
        caller: Address,
        new_wasm_hash: BytesN<32>,
        emergency: bool,
        migration_callback: Option<Address>,
        migration_payload: Option<Bytes>,
    ) -> u64 {
        Self::check_permission(&env, &caller, AdminRole::SuperAdmin);
        Self::check_no_pending_transfer(&env);
        if env.storage().instance().has(&keys::PENDING_UPGRADE) {
            panic!("an upgrade proposal is already pending");
        }

        Self::create_upgrade_proposal(
            &env,
            &caller,
            new_wasm_hash,
            emergency,
            migration_callback,
            migration_payload,
            false,
        )
    }

    /// Propose a rollback using the tracked prior Wasm hash.
    pub fn propose_rollback(
        env: Env,
        caller: Address,
        emergency: bool,
        migration_callback: Option<Address>,
        migration_payload: Option<Bytes>,
    ) -> u64 {
        Self::check_permission(&env, &caller, AdminRole::SuperAdmin);
        Self::check_no_pending_transfer(&env);
        if env.storage().instance().has(&keys::PENDING_UPGRADE) {
            panic!("an upgrade proposal is already pending");
        }

        let rollback_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&keys::ROLLBACK_TARGET_HASH)
            .unwrap_or_else(|| panic!("no rollback target is currently tracked"));

        Self::create_upgrade_proposal(
            &env,
            &caller,
            rollback_hash,
            emergency,
            migration_callback,
            migration_payload,
            true,
        )
    }

    /// Approve a pending upgrade proposal as a governance member.
    pub fn approve_upgrade(env: Env, caller: Address, proposal_id: u64) -> u32 {
        Self::check_permission(&env, &caller, AdminRole::SuperAdmin);
        Self::check_no_pending_transfer(&env);

        let mut proposal = Self::load_pending_upgrade(&env);
        if proposal.proposal_id != proposal_id {
            panic!("upgrade proposal id does not match the pending proposal");
        }
        if Self::vec_contains_address(&proposal.approvals, &caller) {
            panic!("caller has already approved this upgrade proposal");
        }

        proposal.approvals.push_back(caller.clone());
        let approval_count = proposal.approvals.len();
        env.storage()
            .instance()
            .set(&keys::PENDING_UPGRADE, &proposal);

        env.events().publish(
            (symbol_short!("up_appr"), caller),
            (proposal_id, approval_count, proposal.required_approvals),
        );

        approval_count
    }

    /// Execute a pending upgrade once timelock and governance conditions pass.
    pub fn execute_upgrade(env: Env, caller: Address, proposal_id: u64) {
        Self::check_permission(&env, &caller, AdminRole::SuperAdmin);
        Self::check_no_pending_transfer(&env);

        let proposal = Self::load_pending_upgrade(&env);
        if proposal.proposal_id != proposal_id {
            panic!("upgrade proposal id does not match the pending proposal");
        }

        let now = env.ledger().timestamp();
        if now < proposal.execute_after {
            panic!("upgrade timelock has not elapsed");
        }
        if proposal.approvals.len() < proposal.required_approvals {
            panic!("insufficient governance approvals");
        }

        let from_version: u32 = env
            .storage()
            .instance()
            .get(&keys::CONTRACT_VERSION)
            .unwrap_or(1);
        let to_version = from_version.saturating_add(1);
        let from_wasm_hash: Option<BytesN<32>> = env
            .storage()
            .instance()
            .get(&keys::CURRENT_CONTRACT_WASM_HASH);

        if let Some(previous_hash) = from_wasm_hash.clone() {
            env.storage()
                .instance()
                .set(&keys::ROLLBACK_TARGET_HASH, &previous_hash);
            env.events()
                .publish((symbol_short!("up_roll"), proposal_id), previous_hash);
        }

        if let Some(callback) = proposal.migration_callback.clone() {
            env.events()
                .publish((symbol_short!("up_migcb"), callback), proposal_id);
        }
        if let Some(payload) = proposal.migration_payload.clone() {
            env.events()
                .publish((symbol_short!("up_migpl"), proposal_id), payload);
        }

        #[cfg(not(test))]
        env.deployer()
            .update_current_contract_wasm(proposal.new_wasm_hash.clone());

        env.storage()
            .instance()
            .set(&keys::CURRENT_CONTRACT_WASM_HASH, &proposal.new_wasm_hash);
        env.storage()
            .instance()
            .set(&keys::CONTRACT_VERSION, &to_version);

        let mut history: Vec<UpgradeExecutionRecord> = env
            .storage()
            .persistent()
            .get(&keys::UPGRADE_HISTORY)
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(UpgradeExecutionRecord {
            proposal_id,
            executed_by: caller.clone(),
            from_version,
            to_version,
            has_from_wasm_hash: from_wasm_hash.is_some(),
            from_wasm_hash: from_wasm_hash.unwrap_or(BytesN::from_array(&env, &[0u8; 32])),
            to_wasm_hash: proposal.new_wasm_hash,
            executed_at: now,
            emergency: proposal.emergency,
            is_rollback: proposal.is_rollback,
            has_migration_callback: proposal.migration_callback.is_some(),
            migration_callback: proposal
                .migration_callback
                .unwrap_or(env.current_contract_address()),
        });
        env.storage()
            .persistent()
            .set(&keys::UPGRADE_HISTORY, &history);

        env.storage().instance().remove(&keys::PENDING_UPGRADE);

        env.events().publish(
            (symbol_short!("up_exec"), caller),
            (
                proposal_id,
                from_version,
                to_version,
                proposal.emergency,
                proposal.is_rollback,
            ),
        );
    }

    /// Cancel a pending upgrade proposal.
    pub fn cancel_upgrade(env: Env, caller: Address, proposal_id: u64, reason: String) {
        Self::check_permission(&env, &caller, AdminRole::SuperAdmin);

        let proposal = Self::load_pending_upgrade(&env);
        if proposal.proposal_id != proposal_id {
            panic!("upgrade proposal id does not match the pending proposal");
        }

        env.storage().instance().remove(&keys::PENDING_UPGRADE);
        env.events()
            .publish((symbol_short!("up_cncl"), caller), (proposal_id, reason));
    }

    /// Return the currently pending contract upgrade proposal, if any.
    pub fn get_pending_upgrade(env: Env) -> Option<UpgradeProposal> {
        env.storage().instance().get(&keys::PENDING_UPGRADE)
    }

    /// Return historical execution records for all completed upgrades.
    pub fn get_upgrade_history(env: Env) -> Vec<UpgradeExecutionRecord> {
        env.storage()
            .persistent()
            .get(&keys::UPGRADE_HISTORY)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Return the current semantic version counter.
    pub fn get_contract_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&keys::CONTRACT_VERSION)
            .unwrap_or(1)
    }

    /// Return the currently tracked active Wasm hash, if set.
    pub fn get_current_wasm_hash(env: Env) -> Option<BytesN<32>> {
        env.storage()
            .instance()
            .get(&keys::CURRENT_CONTRACT_WASM_HASH)
    }

    /// Return the currently tracked rollback target hash, if available.
    pub fn get_rollback_target(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&keys::ROLLBACK_TARGET_HASH)
    }

    // -----------------------------------------------------------------------
    // Data retention and cleanup (issue #100)
    // -----------------------------------------------------------------------

    /// Configure retention and cleanup policy for a historical data bucket.
    ///
    /// Admin-only. `retention_secs`, `trigger_interval_secs`, and
    /// `max_deletions_per_run` must all be greater than zero.
    pub fn set_retention_policy(
        env: Env,
        caller: Address,
        data_type: RetentionDataType,
        retention_secs: u64,
        trigger_interval_secs: u64,
        max_deletions_per_run: u32,
        archive_before_delete: bool,
        enabled: bool,
    ) {
        Self::assert_admin_or_super_admin_retention(&env, &caller);
        Self::validate_retention_policy_inputs(
            retention_secs,
            trigger_interval_secs,
            max_deletions_per_run,
        );

        let policy = RetentionPolicy {
            data_type: data_type.clone(),
            retention_secs,
            trigger_interval_secs,
            max_deletions_per_run,
            archive_before_delete,
            enabled,
        };

        env.storage()
            .instance()
            .set(&format!("retention_policy:{}", data_type.clone().into()), &policy);

        env.events().publish(
            (
                symbol_short!("ret_set"),
                Self::retention_kind_code(&data_type),
            ),
            retention_secs,
        );
    }

    /// Return retention policy for a given historical data bucket.
    pub fn get_retention_policy(env: Env, data_type: RetentionDataType) -> RetentionPolicy {
        Self::load_retention_policy(&env, &data_type)
    }

    /// Return all retention policies.
    pub fn list_retention_policies(env: Env) -> Vec<RetentionPolicy> {
        let mut policies = Vec::new(&env);
        for data_type in Self::retention_data_types(&env).iter() {
            policies.push_back(Self::load_retention_policy(&env, &data_type));
        }
        policies
    }

    /// Set or clear a per-asset retention override for a specific data bucket.
    ///
    /// When `retention_secs` is `Some(value)`, the override is upserted.
    /// When `retention_secs` is `None`, the override is removed.
    pub fn set_asset_retention_override(
        env: Env,
        caller: Address,
        asset_code: String,
        data_type: RetentionDataType,
        retention_secs: Option<u64>,
    ) {
        Self::assert_admin_or_super_admin_retention(&env, &caller);

        let key = DataKey::AssetRetentionOverride(asset_code.clone(), data_type.clone());
        match retention_secs {
            Some(value) => {
                if value == 0 {
                    panic!("asset retention override must be greater than zero");
                }
                env.storage().persistent().set(&key, &value);
            }
            None => env.storage().persistent().remove(&key),
        }

        env.events().publish(
            (
                symbol_short!("ret_ovr"),
                Self::retention_kind_code(&data_type),
            ),
            asset_code,
        );
    }

    /// Return per-asset retention override for a data bucket, if configured.
    pub fn get_asset_retention_override(
        env: Env,
        asset_code: String,
        data_type: RetentionDataType,
    ) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::AssetRetentionOverride(asset_code, data_type))
    }

    /// Run gradual historical cleanup across all retention-enabled data buckets.
    ///
    /// Admin-only. Cleanup never deletes currently active/latest records.
    pub fn cleanup_old_data(env: Env, caller: Address, max_total_deletions: u32) -> CleanupResult {
        Self::assert_admin_or_super_admin_retention(&env, &caller);
        if max_total_deletions == 0 {
            panic!("max_total_deletions must be greater than zero");
        }

        let now = env.ledger().timestamp();
        let mut details = Vec::new(&env);
        let mut total_deleted = 0u32;
        let mut total_archived = 0u32;

        for data_type in Self::retention_data_types(&env).iter() {
            if total_deleted >= max_total_deletions {
                break;
            }

            let policy = Self::load_retention_policy(&env, &data_type);
            if !policy.enabled {
                continue;
            }

            let remaining_budget = max_total_deletions - total_deleted;
            let run_budget = if policy.max_deletions_per_run < remaining_budget {
                policy.max_deletions_per_run
            } else {
                remaining_budget
            };

            if run_budget == 0 {
                continue;
            }

            let (deleted, archived) =
                Self::cleanup_data_type_internal(&env, &data_type, &policy, run_budget);

            details.push_back(CleanupDataTypeResult {
                data_type: data_type.clone(),
                deleted,
                archived,
            });

            total_deleted += deleted;
            total_archived += archived;
            env.storage()
                .instance()
                .set(&format!("last_cleanup_at:{}", data_type.clone().into()), &now);

            if deleted > 0 || archived > 0 {
                env.events().publish(
                    (
                        symbol_short!("ret_cln"),
                        Self::retention_kind_code(&data_type),
                    ),
                    (deleted, archived, now),
                );
            }
        }

        env.events().publish(
            (symbol_short!("ret_done"),),
            (total_deleted, total_archived, now),
        );

        CleanupResult {
            executed_at: now,
            total_deleted,
            total_archived,
            details,
        }
    }

    /// Run gradual cleanup for a single data bucket.
    ///
    /// Admin-only. This is useful for operational bulk deletes when only one
    /// historical collection should be processed.
    pub fn cleanup_data_type(
        env: Env,
        caller: Address,
        data_type: RetentionDataType,
        max_deletions: u32,
    ) -> CleanupDataTypeResult {
        Self::assert_admin_or_super_admin_retention(&env, &caller);
        if max_deletions == 0 {
            panic!("max_deletions must be greater than zero");
        }

        let policy = Self::load_retention_policy(&env, &data_type);
        if !policy.enabled {
            return CleanupDataTypeResult {
                data_type,
                deleted: 0,
                archived: 0,
            };
        }

        let run_budget = if policy.max_deletions_per_run < max_deletions {
            policy.max_deletions_per_run
        } else {
            max_deletions
        };
        let (deleted, archived) =
            Self::cleanup_data_type_internal(&env, &data_type, &policy, run_budget);
        let now = env.ledger().timestamp();
        env.storage()
            .instance()
            .set(&format!("last_cleanup_at:{}", data_type.clone().into()), &now);

        if deleted > 0 || archived > 0 {
            env.events().publish(
                (
                    symbol_short!("ret_cln"),
                    Self::retention_kind_code(&data_type),
                ),
                (deleted, archived, now),
            );
        }

        CleanupDataTypeResult {
            data_type,
            deleted,
            archived,
        }
    }

    /// Return current storage usage counters for retained and archived data.
    pub fn get_storage_stats(env: Env) -> StorageStats {
        let supply = Self::supply_storage_usage(&env);
        let liquidity = Self::liquidity_storage_usage(&env);
        let checkpoints = Self::checkpoint_storage_usage(&env);

        let mut entries = Vec::new(&env);
        entries.push_back(supply.clone());
        entries.push_back(liquidity.clone());
        entries.push_back(checkpoints.clone());

        StorageStats {
            generated_at: env.ledger().timestamp(),
            total_tracked_keys: supply.tracked_keys
                + liquidity.tracked_keys
                + checkpoints.tracked_keys,
            total_active_records: supply.active_records
                + liquidity.active_records
                + checkpoints.active_records,
            total_archived_records: supply.archived_records
                + liquidity.archived_records
                + checkpoints.archived_records,
            entries,
        }
    }

    // -----------------------------------------------------------------------
    // Configuration Management (issue #103)
    // -----------------------------------------------------------------------

    /// Store or update a single on-chain configuration parameter.
    ///
    /// # Access control
    /// Only the contract admin or an address with the `SuperAdmin` role may
    /// call this function.
    ///
    /// # Parameters
    /// - `caller`      – The address performing the update. Must be authorised.
    /// - `category`    – Parameter category (`Thresholds`, `Timeouts`, `Limits`).
    /// - `name`        – Parameter name, max 64 bytes.
    /// - `value`       – New numeric value.
    /// - `description` – Human-readable description (required, max 256 bytes).
    ///
    /// # Validation
    /// - `name` must be non-empty and ≤ 64 bytes.
    /// - `description` must be non-empty and ≤ 256 bytes.
    /// - For `Timeouts` category: `value` must be ≥ 1 (at least 1 second).
    /// - For `Limits` category: `value` must be ≥ 1.
    /// - For `Thresholds` category: `value` must be ≥ 0.
    ///
    /// # Events
    /// Publishes a `("config_up", category_tag, name)` event with the new value.
    ///
    /// # Audit trail
    /// Appends a `ConfigAuditEntry` to the parameter's audit log (capped at 50
    /// entries; oldest entries are dropped when the cap is reached).
    pub fn set_config(
        env: Env,
        caller: Address,
        category: ConfigCategory,
        name: String,
        value: i128,
        description: String,
    ) {
        caller.require_auth();
        Self::assert_not_globally_paused(&env);
        Self::check_no_pending_transfer(&env);

        // Admin-only: require admin or SuperAdmin role
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            let has_super = Self::has_role_internal(&env, &caller, AdminRole::SuperAdmin);
            if !has_super {
                panic!("unauthorized: only admin may modify configuration");
            }
        }

        // Validate name (non-empty, ≤ 64 bytes)
        if name.len() == 0 {
            panic!("config: name must not be empty");
        }
        if name.len() > 64 {
            panic!("config: name must be ≤ 64 bytes");
        }

        // Validate description (non-empty, ≤ 256 bytes)
        if description.len() == 0 {
            panic!("config: description must not be empty");
        }
        if description.len() > 256 {
            panic!("config: description must be ≤ 256 bytes");
        }

        // Category-specific value validation
        match category {
            ConfigCategory::Threshold => {
                if value < 0 {
                    panic!("config: threshold value must be ≥ 0");
                }
            }
            ConfigCategory::Timeouts => {
                if value < 1 {
                    panic!("config: timeout value must be ≥ 1 second");
                }
            }
            ConfigCategory::Limits => {
                if value < 1 {
                    panic!("config: limit value must be ≥ 1");
                }
            }
        }

        let now = env.ledger().timestamp();
        let storage_key = DataKey::ConfigEntry(category.clone(), name.clone());

        // Determine previous value and compute new version
        let (old_value, new_version) = if let Some(existing) = env
            .storage()
            .instance()
            .get::<String, ConfigEntry>(&storage_key)
        {
            (existing.value.value, existing.version + 1)
        } else {
            (0_i128, 1_u32)
        };

        // Write updated entry
        let entry = ConfigEntry {
            category: category.clone(),
            name: name.clone(),
            value: ConfigValue { value, description },
            version: new_version,
            updated_at: now,
            updated_by: caller.clone(),
        };
        env.storage().instance().set(&storage_key, &entry);

        // Maintain global key list for enumeration
        let keys_key = DataKey::ConfigKeys;
        let mut keys: Vec<(ConfigCategory, String)> = env
            .storage()
            .instance()
            .get(&keys_key)
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        for i in 0..keys.len() {
            let (ref k_cat, ref k_name) = keys.get(i).unwrap();
            if *k_cat == category && *k_name == name {
                found = true;
                break;
            }
        }
        if !found {
            keys.push_back((category.clone(), name.clone()));
            env.storage().instance().set(&keys_key, &keys);
        }

        // Append to audit log (cap at 50 entries)
        let audit_key = DataKey::ConfigAuditLog(category.clone(), name.clone());
        let mut audit_log: Vec<ConfigAuditEntry> = env
            .storage()
            .instance()
            .get(&audit_key)
            .unwrap_or_else(|| Vec::new(&env));

        let audit_entry = ConfigAuditEntry {
            old_value,
            new_value: value,
            version: new_version,
            changed_at: now,
            changed_by: caller,
        };
        audit_log.push_back(audit_entry);

        // Trim to last 50 entries
        while audit_log.len() > 50 {
            let mut trimmed: Vec<ConfigAuditEntry> = Vec::new(&env);
            for i in 1..audit_log.len() {
                trimmed.push_back(audit_log.get(i).unwrap());
            }
            audit_log = trimmed;
        }
        env.storage().instance().set(&audit_key, &audit_log);

        // Emit change notification event
        let category_tag = match category {
            ConfigCategory::Threshold => symbol_short!("thresh"),
            ConfigCategory::Timeouts => symbol_short!("timeout"),
            ConfigCategory::Limits => symbol_short!("limits"),
        };
        env.events()
            .publish((symbol_short!("config_up"), category_tag, name), value);
    }

    /// Retrieve a single configuration parameter by category and name.
    ///
    /// Returns `None` when no value has been explicitly stored and no default
    /// exists. Callers should apply their own application-layer defaults for
    /// `None` responses.
    ///
    /// No authorisation required — read-only.
    pub fn get_config(env: Env, category: ConfigCategory, name: String) -> Option<ConfigEntry> {
        env.storage()
            .instance()
            .get(&format!("config_entry:{}:{}", category, name).into())
    }

    /// Retrieve all stored configuration parameters as a single export.
    ///
    /// Returns an `AllConfigsExport` containing every `ConfigEntry` currently
    /// stored on-chain, the total count, and the ledger timestamp of the
    /// export.
    ///
    /// No authorisation required — read-only.
    pub fn get_all_configs(env: Env) -> AllConfigsExport {
        let now = env.ledger().timestamp();
        let keys: Vec<(ConfigCategory, String)> = env
            .storage()
            .instance()
            .get(&keys::CONFIG_KEYS)
            .unwrap_or_else(|| Vec::new(&env));

        let mut entries: Vec<ConfigEntry> = Vec::new(&env);
        for i in 0..keys.len() {
            let (cat, nm) = keys.get(i).unwrap();
            if let Some(entry) = env
                .storage()
                .instance()
                .get::<String, ConfigEntry>(&format!("config_entry:{}:{}", cat, nm).into())
            {
                entries.push_back(entry);
            }
        }

        let total = entries.len();
        AllConfigsExport {
            entries,
            total,
            exported_at: now,
        }
    }

    /// Retrieve the full audit log for a specific configuration parameter.
    ///
    /// Returns an empty `Vec` when no changes have been recorded yet.
    ///
    /// No authorisation required — read-only.
    pub fn get_config_audit_log(
        env: Env,
        category: ConfigCategory,
        name: String,
    ) -> Vec<ConfigAuditEntry> {
        env.storage()
            .instance()
            .get(&format!("config_audit_log:{}:{}", category, name).into())
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Apply multiple configuration updates atomically in a single transaction.
    ///
    /// Each update in `updates` follows the same validation rules as
    /// `set_config()`. If any update fails validation the entire call panics
    /// and no changes are written.
    ///
    /// # Access control
    /// Only the contract admin or an address with the `SuperAdmin` role.
    ///
    /// # Limits
    /// At most 20 updates per call to bound gas usage.
    pub fn set_config_bulk(env: Env, caller: Address, updates: Vec<BulkConfigUpdate>) {
        caller.require_auth();
        Self::assert_not_globally_paused(&env);
        Self::check_no_pending_transfer(&env);

        // Admin-only guard
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            let has_super = Self::has_role_internal(&env, &caller, AdminRole::SuperAdmin);
            if !has_super {
                panic!("unauthorized: only admin may modify configuration");
            }
        }

        if updates.len() == 0 {
            panic!("config: bulk update list must not be empty");
        }
        if updates.len() > 20 {
            panic!("config: bulk update list must contain at most 20 items");
        }

        // Apply each update — uses the same logic as set_config()
        for i in 0..updates.len() {
            let u = updates.get(i).unwrap();
            Self::set_config(
                env.clone(),
                caller.clone(),
                u.category,
                u.name,
                u.value,
                u.description,
            );
        }
    }

    /// Initialise configuration with the protocol's built-in default values.
    ///
    /// Safe to call multiple times: existing values are **not** overwritten,
    /// only parameters that are absent are initialised. Intended to be called
    /// once after `initialize()` to seed the on-chain configuration with
    /// sensible defaults.
    ///
    /// # Default parameters
    ///
    /// **Thresholds**
    /// | Name                         | Default | Unit          |
    /// |------------------------------|---------|---------------|
    /// | `health_score_min`           | 50      | score (0–100) |
    /// | `price_deviation_low_bps`    | 200     | basis points  |
    /// | `price_deviation_medium_bps` | 500     | basis points  |
    /// | `price_deviation_high_bps`   | 1000    | basis points  |
    /// | `supply_mismatch_bps`        | 10      | basis points  |
    ///
    /// **Timeouts**
    /// | Name                      | Default | Unit    |
    /// |---------------------------|---------|---------|
    /// | `price_staleness_seconds` | 3600    | seconds |
    /// | `health_staleness_seconds`| 3600    | seconds |
    /// | `pause_timelock_seconds`  | 300     | seconds |
    /// | `admin_transfer_timeout`  | 86400   | seconds |
    ///
    /// **Limits**
    /// | Name                   | Default | Unit  |
    /// |------------------------|---------|-------|
    /// | `max_monitored_assets` | 100     | count |
    /// | `max_batch_size`       | 50      | count |
    /// | `max_signers`          | 20      | count |
    /// | `max_price_history`    | 100     | count |
    pub fn init_default_config(env: Env, caller: Address) {
        caller.require_auth();
        Self::assert_not_globally_paused(&env);

        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            let has_super = Self::has_role_internal(&env, &caller, AdminRole::SuperAdmin);
            if !has_super {
                panic!("unauthorized: only admin may initialise default config");
            }
        }

        // Helper closure: only write when the key doesn't exist yet.
        let set_if_absent = |cat: ConfigCategory, nm: &str, val: i128, desc: &str| {
            let key = DataKey::ConfigEntry(cat.clone(), String::from_str(&env, nm));
            if env
                .storage()
                .instance()
                .get::<String, ConfigEntry>(&key)
                .is_none()
            {
                Self::set_config(
                    env.clone(),
                    caller.clone(),
                    cat,
                    String::from_str(&env, nm),
                    val,
                    String::from_str(&env, desc),
                );
            }
        };

        // Thresholds
        set_if_absent(
            ConfigCategory::Threshold,
            "health_score_min",
            50,
            "Minimum acceptable composite health score (0-100)",
        );
        set_if_absent(
            ConfigCategory::Threshold,
            "price_deviation_low_bps",
            200,
            "Low-severity price deviation trigger in basis points (default 2%)",
        );
        set_if_absent(
            ConfigCategory::Threshold,
            "price_deviation_medium_bps",
            500,
            "Medium-severity price deviation trigger in basis points (default 5%)",
        );
        set_if_absent(
            ConfigCategory::Threshold,
            "price_deviation_high_bps",
            1000,
            "High-severity price deviation trigger in basis points (default 10%)",
        );
        set_if_absent(
            ConfigCategory::Threshold,
            "supply_mismatch_bps",
            10,
            "Critical supply mismatch threshold in basis points (default 0.1%)",
        );

        // Timeouts
        set_if_absent(
            ConfigCategory::Timeouts,
            "price_staleness_seconds",
            3600,
            "Age in seconds after which a price record is considered stale",
        );
        set_if_absent(
            ConfigCategory::Timeouts,
            "health_staleness_seconds",
            3600,
            "Age in seconds after which a health score is considered stale",
        );
        set_if_absent(
            ConfigCategory::Timeouts,
            "pause_timelock_seconds",
            300,
            "Minimum seconds that must elapse before an emergency pause can be lifted",
        );
        set_if_absent(
            ConfigCategory::Timeouts,
            "admin_transfer_timeout",
            86400,
            "Seconds until a pending admin transfer proposal expires automatically",
        );

        // Limits
        set_if_absent(
            ConfigCategory::Limits,
            "max_monitored_assets",
            100,
            "Maximum number of assets that may be registered simultaneously",
        );
        set_if_absent(
            ConfigCategory::Limits,
            "max_batch_size",
            50,
            "Maximum number of records in a single batch submit call",
        );
        set_if_absent(
            ConfigCategory::Limits,
            "max_signers",
            20,
            "Maximum number of registered signers allowed at one time",
        );
        set_if_absent(
            ConfigCategory::Limits,
            "max_price_history",
            100,
            "Maximum number of historical price records retained per asset",
        );
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /// Verify that `caller` is authorised to perform an operation requiring
    /// `required_role`. The original admin address always passes. Any address
    /// with `SuperAdmin` or the specific `required_role` also passes.
    fn check_permission(env: &Env, caller: &Address, required_role: AdminRole) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if *caller == admin {
            return;
        }
        let has_super = Self::has_role_internal(env, caller, AdminRole::SuperAdmin);
        let has_required = Self::has_role_internal(env, caller, required_role);
        if !has_super && !has_required {
            panic!("unauthorized: caller does not have the required role");
        }
    }

    /// Panic if the contract is currently globally paused.
    ///
    /// Called at the top of every state-changing function to enforce the
    /// emergency pause invariant. Read-only query functions must NOT call this.
    fn assert_not_globally_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&keys::GLOBAL_PAUSED)
            .unwrap_or(false);
        if paused {
            panic!("contract is globally paused; all write operations are halted");
        }
    }

    /// Panic if a non-expired admin transfer proposal is in flight.
    ///
    /// Called inside sensitive admin write operations to prevent concurrent
    /// privileged changes while admin rights are being handed over.
    fn check_no_pending_transfer(env: &Env) {
        let proposal: Option<PendingAdminTransfer> =
            env.storage().instance().get(&keys::PENDING_TRANSFER);
        if let Some(p) = proposal {
            let now = env.ledger().timestamp();
            if now < p.timeout_at {
                panic!("admin functions are locked during a pending admin transfer");
            }
        }
    }

    fn load_pending_upgrade(env: &Env) -> UpgradeProposal {
        env.storage()
            .instance()
            .get(&keys::PENDING_UPGRADE)
            .unwrap_or_else(|| panic!("no pending upgrade proposal"))
    }

    #[allow(clippy::too_many_arguments)]
    fn create_upgrade_proposal(
        env: &Env,
        caller: &Address,
        new_wasm_hash: BytesN<32>,
        emergency: bool,
        migration_callback: Option<Address>,
        migration_payload: Option<Bytes>,
        is_rollback: bool,
    ) -> u64 {
        if migration_payload.is_some() && migration_callback.is_none() {
            panic!("migration payload requires a migration callback");
        }

        let now = env.ledger().timestamp();
        let timelock_secs = if emergency { 0u64 } else { 172_800u64 };
        let required_approvals = Self::upgrade_approval_threshold(env, emergency);
        let proposal_id: u64 = env
            .storage()
            .instance()
            .get::<String, u64>(&keys::UPGRADE_PROPOSAL_COUNTER)
            .unwrap_or(0)
            + 1;

        let mut approvals = Vec::new(env);
        approvals.push_back(caller.clone());

        let proposal = UpgradeProposal {
            proposal_id,
            proposer: caller.clone(),
            new_wasm_hash,
            proposed_at: now,
            execute_after: now + timelock_secs,
            required_approvals,
            approvals,
            emergency,
            migration_callback,
            migration_payload,
            is_rollback,
        };

        env.storage()
            .instance()
            .set(&keys::UPGRADE_PROPOSAL_COUNTER, &proposal_id);
        env.storage()
            .instance()
            .set(&keys::PENDING_UPGRADE, &proposal);

        env.events().publish(
            (symbol_short!("up_prop"), caller.clone()),
            (proposal_id, required_approvals, emergency, is_rollback),
        );

        proposal_id
    }

    fn governance_member_count(env: &Env) -> u32 {
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        let mut members: Vec<Address> = Vec::new(env);
        members.push_back(admin);

        let assignments: Vec<RoleAssignment> = env
            .storage()
            .persistent()
            .get(&keys::ROLES_LIST)
            .unwrap_or_else(|| Vec::new(env));
        for assignment in assignments.iter() {
            if assignment.role == AdminRole::SuperAdmin
                && !Self::vec_contains_address(&members, &assignment.address)
            {
                members.push_back(assignment.address);
            }
        }

        members.len()
    }

    fn upgrade_approval_threshold(env: &Env, emergency: bool) -> u32 {
        let members = Self::governance_member_count(env);
        if members == 0 {
            panic!("no governance members configured");
        }

        let standard_threshold = members.div_ceil(2);
        if !emergency {
            return standard_threshold;
        }

        if members < 2 {
            panic!("emergency upgrades require at least two governance members");
        }

        let mut emergency_threshold = (members * 2).div_ceil(3);
        if emergency_threshold <= standard_threshold {
            emergency_threshold = standard_threshold + 1;
        }
        if emergency_threshold > members {
            emergency_threshold = members;
        }

        emergency_threshold
    }

    /// Internal role lookup (no auth check).
    fn has_role_internal(env: &Env, address: &Address, role: AdminRole) -> bool {
        let roles: Vec<AdminRole> = env
            .storage()
            .persistent()
            .get(&format!("role_key:{}", address.clone().into()))
            .unwrap_or_else(|| Vec::new(env));
        for r in roles.iter() {
            if r == role {
                return true;
            }
        }
        false
    }

    #[allow(clippy::too_many_arguments)]
    fn validate_liquidity_depth_input(
        env: &Env,
        asset_pair: &String,
        total_liquidity: i128,
        depth_0_1_pct: i128,
        depth_0_5_pct: i128,
        depth_1_pct: i128,
        depth_5_pct: i128,
        sources: &Vec<String>,
    ) {
        if !Self::is_supported_liquidity_pair(env, asset_pair) {
            panic!("unsupported asset pair");
        }
        if total_liquidity < 0
            || depth_0_1_pct < 0
            || depth_0_5_pct < 0
            || depth_1_pct < 0
            || depth_5_pct < 0
        {
            panic!("liquidity values must be non-negative");
        }
        if sources.is_empty() {
            panic!("at least one liquidity source is required");
        }
        if depth_0_1_pct > depth_0_5_pct || depth_0_5_pct > depth_1_pct || depth_1_pct > depth_5_pct
        {
            panic!("liquidity depth levels must be non-decreasing");
        }
        if depth_5_pct > total_liquidity {
            panic!("liquidity depth cannot exceed total liquidity");
        }
    }

    fn is_supported_liquidity_pair(env: &Env, asset_pair: &String) -> bool {
        *asset_pair == String::from_str(env, "USDC/XLM")
            || *asset_pair == String::from_str(env, "EURC/XLM")
            || *asset_pair == String::from_str(env, "PYUSD/XLM")
            || *asset_pair == String::from_str(env, "FOBXX/USDC")
    }

    fn load_asset_health(env: &Env, asset_code: &String) -> AssetHealth {
        env.storage()
            .persistent()
            .get(&format!("asset_health:{}", asset_code.clone().into()))
            .unwrap_or_else(|| panic!("asset is not registered"))
    }

    fn assert_asset_accepting_submissions(record: &AssetHealth) {
        if !record.active {
            panic!("asset is deregistered");
        }
        if record.paused {
            panic!("asset monitoring is paused");
        }
    }
    // -----------------------------------------------------------------------
    // Liquidity Pool Monitor
    // -----------------------------------------------------------------------

    /// Record a new liquidity pool state snapshot (admin only).
    ///
    /// Writes the snapshot into a gas-optimised ring buffer, updates the
    /// corresponding daily aggregation bucket, and emits events when
    /// significant liquidity changes are detected.
    #[allow(clippy::too_many_arguments)]
    pub fn record_pool_state(
        env: Env,
        pool_id: String,
        reserve_a: i128,
        reserve_b: i128,
        total_shares: i128,
        volume: i128,
        fees: i128,
        pool_type: PoolType,
    ) {
        Self::assert_not_globally_paused(&env);
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        admin.require_auth();

        liquidity_pool::record_pool_state(
            &env,
            pool_id,
            reserve_a,
            reserve_b,
            total_shares,
            volume,
            fees,
            pool_type,
        );
    }

    /// Calculate aggregated pool metrics over a time window.
    ///
    /// Returns volume, average depth, price change, fee APR, etc.
    /// for the specified `window_secs` lookback period.
    pub fn calculate_pool_metrics(env: Env, pool_id: String, window_secs: u64) -> PoolMetrics {
        liquidity_pool::calculate_pool_metrics(&env, pool_id, window_secs)
    }

    /// Retrieve historical pool snapshots within a time range.
    ///
    /// Public read access — no authorisation required.
    pub fn get_pool_history(
        env: Env,
        pool_id: String,
        from_timestamp: u64,
        to_timestamp: u64,
    ) -> Vec<PoolSnapshot> {
        liquidity_pool::get_pool_history(&env, pool_id, from_timestamp, to_timestamp)
    }

    /// Calculate impermanent loss for an LP position.
    ///
    /// Given the `entry_price` at which a position was opened and its
    /// `initial_value`, returns the current IL percentage, position value,
    /// and HODL comparison value.
    pub fn calculate_impermanent_loss(
        env: Env,
        pool_id: String,
        entry_price: i128,
        initial_value: i128,
    ) -> ImpermanentLossResult {
        liquidity_pool::calculate_impermanent_loss(&env, pool_id, entry_price, initial_value)
    }

    /// Get current liquidity depth information for a pool.
    ///
    /// Returns reserve amounts, total value locked, and a depth score
    /// from 0 to 100.
    pub fn get_liquidity_depth(env: Env, pool_id: String) -> PoolLiquidityDepth {
        liquidity_pool::get_liquidity_depth(&env, pool_id)
    }

    /// Get daily aggregated buckets for a pool within a time range.
    ///
    /// Returns OHLC price data, volume, fees, and average reserves
    /// per day. Public read access.
    pub fn get_daily_history(
        env: Env,
        pool_id: String,
        from_timestamp: u64,
        to_timestamp: u64,
    ) -> Vec<DailyBucket> {
        liquidity_pool::get_daily_history(&env, pool_id, from_timestamp, to_timestamp)
    }

    /// Get all registered liquidity pool IDs.
    pub fn get_registered_pools(env: Env) -> Vec<String> {
        liquidity_pool::get_registered_pools(&env)
    }

    // -----------------------------------------------------------------------
    // Automated health score calculation (issue #26)
    // -----------------------------------------------------------------------

    /// Set configurable weights used by the automated health score calculation.
    ///
    /// `caller` must be the contract admin or a `SuperAdmin`. The three weights
    /// must each be in the range 0–100 and must sum to exactly 100. The
    /// `version` field tracks the methodology revision for auditability.
    ///
    /// # Panics
    /// - Caller is not authorised.
    /// - Any individual weight exceeds 100.
    /// - The weights do not sum to 100.
    /// - `version` is 0.
    pub fn set_health_weights(
        env: Env,
        caller: Address,
        liquidity_weight: u32,
        price_stability_weight: u32,
        bridge_uptime_weight: u32,
        version: u32,
    ) {
        Self::assert_not_globally_paused(&env);
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        Self::check_no_pending_transfer(&env);
        let authorized =
            caller == admin || Self::has_role_internal(&env, &caller, AdminRole::SuperAdmin);
        if !authorized {
            panic!("only admin or SuperAdmin can set health weights");
        }

        Self::validate_weights(
            liquidity_weight,
            price_stability_weight,
            bridge_uptime_weight,
        );
        if version == 0 {
            panic!("methodology version must be greater than 0");
        }

        let weights = HealthWeights {
            liquidity_weight,
            price_stability_weight,
            bridge_uptime_weight,
            version,
        };

        env.storage()
            .instance()
            .set(&keys::HEALTH_WEIGHTS, &weights);

        env.events().publish((symbol_short!("wt_set"),), version);
        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Return the current health score calculation weights.
    ///
    /// Public read access — no authorisation required. Returns the
    /// admin-configured weights or the defaults (30 / 40 / 30, version 1)
    /// when none have been explicitly set.
    pub fn get_health_weights(env: Env) -> HealthWeights {
        Self::load_health_weights(&env)
    }

    /// Pure calculation: compute a composite health score from component
    /// scores using the stored (or default) weights.
    ///
    /// This function does **not** store any result on-chain; it is intended
    /// for off-chain callers that want to preview the score before submitting.
    ///
    /// Formula:
    /// ```text
    /// composite = (liquidity * liq_w + stability * stab_w + uptime * up_w) / 100
    /// ```
    ///
    /// All input scores must be in the 0–100 range.
    ///
    /// # Panics
    /// - Any input score is greater than 100.
    pub fn calculate_health_score(
        env: Env,
        liquidity_score: u32,
        price_stability_score: u32,
        bridge_uptime_score: u32,
    ) -> HealthScoreResult {
        Self::validate_score_range(liquidity_score, "liquidity_score");
        Self::validate_score_range(price_stability_score, "price_stability_score");
        Self::validate_score_range(bridge_uptime_score, "bridge_uptime_score");

        let weights = Self::load_health_weights(&env);
        let composite = Self::compute_composite(
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
            &weights,
        );

        HealthScoreResult {
            composite_score: composite,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
            weights,
            timestamp: env.ledger().timestamp(),
        }
    }

    /// Submit a health score that is **automatically calculated** from the
    /// supplied component scores using the stored weights.
    ///
    /// This is the recommended entry-point for Phase 1 MVP health scoring. It
    /// combines `calculate_health_score()` with `submit_health()`, storing
    /// both the `AssetHealth` record and the detailed `HealthScoreResult`.
    ///
    /// `caller` must be the contract admin, a `SuperAdmin`, or a
    /// `HealthSubmitter`. The asset must be registered, active, and not paused.
    /// All component scores must be in the 0–100 range.
    ///
    /// An optional `manual_override` score (0–100) can replace the calculated
    /// composite score while still recording the underlying calculation for
    /// transparency.
    ///
    /// # Panics
    /// - Caller is not authorised.
    /// - Asset is not registered, deregistered, or paused.
    /// - Any component score is greater than 100.
    /// - `manual_override` is provided and exceeds 100.
    pub fn submit_calculated_health(
        env: Env,
        caller: Address,
        asset_code: String,
        liquidity_score: u32,
        price_stability_score: u32,
        bridge_uptime_score: u32,
        manual_override: Option<u32>,
    ) {
        Self::assert_not_globally_paused(&env);
        Self::check_permission(&env, &caller, AdminRole::HealthSubmitter);
        let status = Self::load_asset_health(&env, &asset_code);
        Self::assert_asset_accepting_submissions(&status);

        Self::validate_score_range(liquidity_score, "liquidity_score");
        Self::validate_score_range(price_stability_score, "price_stability_score");
        Self::validate_score_range(bridge_uptime_score, "bridge_uptime_score");

        let weights = Self::load_health_weights(&env);
        let calculated_composite = Self::compute_composite(
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
            &weights,
        );

        let final_score = match manual_override {
            Some(override_score) => {
                Self::validate_score_range(override_score, "manual_override");
                override_score
            }
            None => calculated_composite,
        };

        let timestamp = env.ledger().timestamp();

        let record = AssetHealth {
            asset_code: asset_code.clone(),
            health_score: final_score,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
            paused: status.paused,
            active: status.active,
            timestamp,
        };

        let result = HealthScoreResult {
            composite_score: calculated_composite,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
            weights,
            timestamp,
        };

        env.storage()
            .persistent()
            .set(&format!("asset_health:{}", asset_code.clone().into()), &record);
        env.storage()
            .persistent()
            .set(&format!("health_score_result:{}", asset_code.clone().into()), &result);

        env.events()
            .publish((symbol_short!("health_up"), asset_code), final_score);
        Self::maybe_create_auto_checkpoint(&env, &caller);
    }

    /// Return the latest calculated health score result for an asset.
    ///
    /// Public read access — no authorisation required. Returns `None` if no
    /// calculated score has been submitted for the asset.
    pub fn get_health_score_result(env: Env, asset_code: String) -> Option<HealthScoreResult> {
        env.storage()
            .persistent()
            .get(&format!("health_score_result:{}", asset_code).into())
    }

    /// Update automatic checkpoint settings.
    pub fn set_checkpoint_config(
        env: Env,
        caller: Address,
        interval_secs: u64,
        max_checkpoints: u32,
        format_version: u32,
    ) {
        Self::assert_admin_or_super_admin(&env, &caller);

        if max_checkpoints == 0 {
            panic!("max_checkpoints must be greater than zero");
        }
        if format_version == 0 {
            panic!("format_version must be greater than zero");
        }

        let config = CheckpointConfig {
            interval_secs,
            max_checkpoints,
            format_version,
        };

        env.storage()
            .instance()
            .set(&keys::CHECKPOINT_CONFIG, &config);
        Self::prune_checkpoints(&env, &config);

        env.events()
            .publish((symbol_short!("chk_cfg"),), max_checkpoints);
    }

    /// Return the active checkpoint configuration.
    pub fn get_checkpoint_config(env: Env) -> CheckpointConfig {
        Self::load_checkpoint_config(&env)
    }

    /// Create a manual checkpoint of the current contract state.
    pub fn create_checkpoint(env: Env, caller: Address, label: String) -> CheckpointMetadata {
        Self::assert_admin_or_super_admin(&env, &caller);
        Self::persist_checkpoint(&env, &caller, CheckpointTrigger::Manual, label, None)
    }

    /// Return a historical checkpoint snapshot by id.
    pub fn get_checkpoint(env: Env, checkpoint_id: u64) -> Option<CheckpointSnapshot> {
        env.storage()
            .persistent()
            .get(&format!("checkpoint_snapshot:{}", checkpoint_id).into())
    }

    /// Return ordered metadata for all stored checkpoints.
    pub fn list_checkpoints(env: Env) -> Vec<CheckpointMetadata> {
        Self::load_checkpoint_metadata(&env)
    }

    /// Return metadata for the latest stored checkpoint.
    pub fn get_latest_checkpoint(env: Env) -> Option<CheckpointMetadata> {
        let metadata = Self::load_checkpoint_metadata(&env);
        if metadata.is_empty() {
            None
        } else {
            Some(metadata.get(metadata.len() - 1).unwrap())
        }
    }

    /// Validate a stored checkpoint by recomputing its state hash.
    pub fn validate_checkpoint(env: Env, checkpoint_id: u64) -> CheckpointValidation {
        let snapshot = Self::get_checkpoint_or_panic(&env, checkpoint_id);
        let metadata = Self::load_checkpoint_metadata_by_id(&env, checkpoint_id);
        let computed_hash = Self::compute_checkpoint_hash(&env, &snapshot);
        let is_valid = metadata.state_hash == computed_hash;
        let message = if is_valid {
            String::from_str(&env, "checkpoint hash verified")
        } else {
            String::from_str(&env, "checkpoint hash mismatch")
        };

        CheckpointValidation {
            checkpoint_id,
            is_valid,
            message,
        }
    }

    /// Compare two historical checkpoints and return high-level differences.
    pub fn compare_checkpoints(
        env: Env,
        from_checkpoint_id: u64,
        to_checkpoint_id: u64,
    ) -> CheckpointComparison {
        let from_snapshot = Self::get_checkpoint_or_panic(&env, from_checkpoint_id);
        let to_snapshot = Self::get_checkpoint_or_panic(&env, to_checkpoint_id);
        Self::build_checkpoint_comparison(
            &env,
            &from_snapshot,
            &to_snapshot,
            from_checkpoint_id,
            to_checkpoint_id,
        )
    }

    /// Restore current contract state from a historical checkpoint.
    ///
    /// A new restore checkpoint is created immediately after the state is
    /// applied to preserve an audit trail.
    pub fn restore_from_checkpoint(
        env: Env,
        caller: Address,
        checkpoint_id: u64,
    ) -> CheckpointMetadata {
        Self::assert_admin_or_super_admin(&env, &caller);
        let snapshot = Self::get_checkpoint_or_panic(&env, checkpoint_id);

        let current_assets = Self::load_registered_assets_raw(&env);
        let restored_assets = snapshot.monitored_assets.clone();
        let restored_weights = snapshot.health_weights.clone();
        for asset_code in current_assets.iter() {
            if !Self::vec_contains_string(&restored_assets, &asset_code) {
                env.storage()
                    .persistent()
                    .remove(&format!("asset_health:{}", asset_code.clone().into()));
                env.storage()
                    .persistent()
                    .remove(&format!("price_record:{}", asset_code.clone().into()));
                env.storage()
                    .persistent()
                    .remove(&format!("health_score_result:{}", asset_code.clone().into()));
            }
        }

        env.storage()
            .instance()
            .set(&keys::MONITORED_ASSETS, &restored_assets);
        env.storage()
            .instance()
            .set(&keys::HEALTH_WEIGHTS, &restored_weights);

        for asset in snapshot.assets.iter() {
            env.storage().persistent().set(
                &format!("asset_health:{}", asset.asset_code.clone().into()),
                &asset.health,
            );

            if asset.has_latest_price {
                env.storage().persistent().set(
                    &format!("price_record:{}", asset.asset_code.clone().into()),
                    &asset.latest_price,
                );
            } else {
                env.storage()
                    .persistent()
                    .remove(&format!("price_record:{}", asset.asset_code.clone().into()));
            }

            if asset.has_health_result {
                env.storage().persistent().set(
                    &format!("health_score_result:{}", asset.asset_code.clone().into()),
                    &asset.health_result,
                );
            } else {
                env.storage()
                    .persistent()
                    .remove(&format!("health_score_result:{}", asset.asset_code.clone().into()));
            }
        }

        env.events()
            .publish((symbol_short!("chk_rst"), checkpoint_id), true);

        Self::persist_checkpoint(
            &env,
            &caller,
            CheckpointTrigger::Restore,
            String::from_str(&env, "restore"),
            Some(checkpoint_id),
        )
    }

    // -----------------------------------------------------------------------
    // Private helpers — health score calculation
    // -----------------------------------------------------------------------

    fn default_checkpoint_config() -> CheckpointConfig {
        CheckpointConfig {
            interval_secs: 86_400,
            max_checkpoints: 25,
            format_version: 1,
        }
    }

    fn default_health_weights() -> HealthWeights {
        HealthWeights {
            liquidity_weight: 30,
            price_stability_weight: 40,
            bridge_uptime_weight: 30,
            version: 1,
        }
    }

    fn load_checkpoint_config(env: &Env) -> CheckpointConfig {
        env.storage()
            .instance()
            .get(&keys::CHECKPOINT_CONFIG)
            .unwrap_or_else(Self::default_checkpoint_config)
    }

    fn load_checkpoint_metadata(env: &Env) -> Vec<CheckpointMetadata> {
        env.storage()
            .instance()
            .get(&keys::CHECKPOINT_METADATA_LIST)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn load_checkpoint_metadata_by_id(env: &Env, checkpoint_id: u64) -> CheckpointMetadata {
        let metadata = Self::load_checkpoint_metadata(env);
        let mut i = 0;
        while i < metadata.len() {
            let item = metadata.get(i).unwrap();
            if item.checkpoint_id == checkpoint_id {
                return item;
            }
            i += 1;
        }

        panic!("checkpoint metadata not found");
    }

    fn load_registered_assets_raw(env: &Env) -> Vec<String> {
        env.storage()
            .instance()
            .get(&keys::MONITORED_ASSETS)
            .unwrap_or_else(|| Vec::new(env))
    }

    fn assert_admin_or_super_admin(env: &Env, caller: &Address) {
        Self::assert_not_globally_paused(env);
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        Self::check_no_pending_transfer(env);
        let authorized =
            *caller == admin || Self::has_role_internal(env, caller, AdminRole::SuperAdmin);
        if !authorized {
            panic!("only admin or SuperAdmin can manage checkpoints");
        }
    }

    fn assert_admin_or_super_admin_retention(env: &Env, caller: &Address) {
        Self::assert_not_globally_paused(env);
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        Self::check_no_pending_transfer(env);
        let authorized =
            *caller == admin || Self::has_role_internal(env, caller, AdminRole::SuperAdmin);
        if !authorized {
            panic!("only admin or SuperAdmin can manage retention policies");
        }
    }

    fn validate_retention_policy_inputs(
        retention_secs: u64,
        trigger_interval_secs: u64,
        max_deletions_per_run: u32,
    ) {
        if retention_secs == 0 {
            panic!("retention_secs must be greater than zero");
        }
        if trigger_interval_secs == 0 {
            panic!("trigger_interval_secs must be greater than zero");
        }
        if max_deletions_per_run == 0 {
            panic!("max_deletions_per_run must be greater than zero");
        }
    }

    fn retention_data_types(env: &Env) -> Vec<RetentionDataType> {
        let mut types = Vec::new(env);
        types.push_back(RetentionDataType::SupplyMismatches);
        types.push_back(RetentionDataType::LiquidityHistory);
        types.push_back(RetentionDataType::Checkpoints);
        types
    }

    fn initialize_retention_policies(env: &Env) {
        for data_type in Self::retention_data_types(env).iter() {
            let policy = Self::default_retention_policy(data_type.clone());
            env.storage()
                .instance()
                .set(&format!("retention_policy:{}", data_type.clone().into()), &policy);
            env.storage()
                .instance()
                .set(&format!("last_cleanup_at:{}", data_type).into(), &0u64);
        }
    }

    fn default_retention_policy(data_type: RetentionDataType) -> RetentionPolicy {
        let retention_secs = match data_type {
            RetentionDataType::SupplyMismatches => 30 * 24 * 60 * 60,
            RetentionDataType::LiquidityHistory => 30 * 24 * 60 * 60,
            RetentionDataType::Checkpoints => 90 * 24 * 60 * 60,
        };

        RetentionPolicy {
            data_type,
            retention_secs,
            trigger_interval_secs: 3_600,
            max_deletions_per_run: 50,
            archive_before_delete: false,
            enabled: true,
        }
    }

    fn load_retention_policy(env: &Env, data_type: &RetentionDataType) -> RetentionPolicy {
        env.storage()
            .instance()
            .get(&format!("retention_policy:{}", data_type.clone().into()))
            .unwrap_or_else(|| Self::default_retention_policy(data_type.clone()))
    }

    fn retention_kind_code(data_type: &RetentionDataType) -> u32 {
        match data_type {
            RetentionDataType::SupplyMismatches => 1,
            RetentionDataType::LiquidityHistory => 2,
            RetentionDataType::Checkpoints => 3,
        }
    }

    fn cleanup_data_type_internal(
        env: &Env,
        data_type: &RetentionDataType,
        policy: &RetentionPolicy,
        max_deletions: u32,
    ) -> (u32, u32) {
        if max_deletions == 0 {
            return (0, 0);
        }

        match data_type {
            RetentionDataType::SupplyMismatches => {
                Self::cleanup_supply_mismatches(env, policy, max_deletions)
            }
            RetentionDataType::LiquidityHistory => {
                Self::cleanup_liquidity_history(env, policy, max_deletions)
            }
            RetentionDataType::Checkpoints => Self::cleanup_checkpoints(env, policy, max_deletions),
        }
    }

    fn cleanup_supply_mismatches(
        env: &Env,
        policy: &RetentionPolicy,
        max_deletions: u32,
    ) -> (u32, u32) {
        let now = env.ledger().timestamp();
        let bridge_ids: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::BRIDGEIDS)
            .unwrap_or_else(|| Vec::new(env));

        let mut deleted = 0u32;
        let mut archived = 0u32;

        for bridge_id in bridge_ids.iter() {
            if deleted >= max_deletions {
                break;
            }

            let records: Vec<SupplyMismatch> = env
                .storage()
                .persistent()
                .get(&format!("supply_mismatches:{}", bridge_id.clone().into()))
                .unwrap_or_else(|| Vec::new(env));
            if records.len() <= 1 {
                continue;
            }

            let mut kept = Vec::new(env);
            let mut removed = Vec::new(env);
            let last_index = records.len() - 1;
            let mut idx = 0u32;
            while idx < records.len() {
                let record = records.get(idx).unwrap();
                let is_latest = idx == last_index;
                let retention_secs = Self::resolve_retention_secs(
                    env,
                    &RetentionDataType::SupplyMismatches,
                    Some(&record.asset_code),
                    policy.retention_secs,
                );
                let should_delete = !is_latest
                    && deleted < max_deletions
                    && Self::is_expired(now, record.timestamp, retention_secs);

                if should_delete {
                    removed.push_back(record);
                    deleted += 1;
                } else {
                    kept.push_back(record);
                }
                idx += 1;
            }

            if removed.is_empty() {
                continue;
            }

            env.storage()
                .persistent()
                .set(&format!("supply_mismatches:{}", bridge_id.clone().into()), &kept);

            if policy.archive_before_delete {
                let mut archived_records: Vec<SupplyMismatch> = env
                    .storage()
                    .persistent()
                    .get(&DataKey::ArchivedSupplyMismatches(bridge_id.clone()))
                    .unwrap_or_else(|| Vec::new(env));
                for record in removed.iter() {
                    archived_records.push_back(record);
                    archived += 1;
                }
                env.storage().persistent().set(
                    &DataKey::ArchivedSupplyMismatches(bridge_id),
                    &archived_records,
                );
            }
        }

        (deleted, archived)
    }

    fn cleanup_liquidity_history(
        env: &Env,
        policy: &RetentionPolicy,
        max_deletions: u32,
    ) -> (u32, u32) {
        let now = env.ledger().timestamp();
        let pairs: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::LIQUIDITY_PAIRS)
            .unwrap_or_else(|| Vec::new(env));

        let mut deleted = 0u32;
        let mut archived = 0u32;

        for pair in pairs.iter() {
            if deleted >= max_deletions {
                break;
            }

            let history: Vec<LiquidityDepth> = env
                .storage()
                .persistent()
                .get(&DataKey::LiquidityDepthHistory(pair.clone()))
                .unwrap_or_else(|| Vec::new(env));
            if history.len() <= 1 {
                continue;
            }

            let mut kept = Vec::new(env);
            let mut removed = Vec::new(env);
            let last_index = history.len() - 1;
            let mut idx = 0u32;
            while idx < history.len() {
                let snapshot = history.get(idx).unwrap();
                let is_latest = idx == last_index;
                let retention_secs = Self::resolve_retention_secs(
                    env,
                    &RetentionDataType::LiquidityHistory,
                    Some(&snapshot.asset_pair),
                    policy.retention_secs,
                );
                let should_delete = !is_latest
                    && deleted < max_deletions
                    && Self::is_expired(now, snapshot.timestamp, retention_secs);

                if should_delete {
                    removed.push_back(snapshot);
                    deleted += 1;
                } else {
                    kept.push_back(snapshot);
                }
                idx += 1;
            }

            if removed.is_empty() {
                continue;
            }

            env.storage()
                .persistent()
                .set(&DataKey::LiquidityDepthHistory(pair.clone()), &kept);

            if policy.archive_before_delete {
                let mut archived_history: Vec<LiquidityDepth> = env
                    .storage()
                    .persistent()
                    .get(&DataKey::ArchivedLiquidityDepthHistory(pair.clone()))
                    .unwrap_or_else(|| Vec::new(env));
                for snapshot in removed.iter() {
                    archived_history.push_back(snapshot);
                    archived += 1;
                }
                env.storage().persistent().set(
                    &DataKey::ArchivedLiquidityDepthHistory(pair),
                    &archived_history,
                );
            }
        }

        (deleted, archived)
    }

    fn cleanup_checkpoints(env: &Env, policy: &RetentionPolicy, max_deletions: u32) -> (u32, u32) {
        let now = env.ledger().timestamp();
        let metadata_list = Self::load_checkpoint_metadata(env);
        if metadata_list.len() <= 1 {
            return (0, 0);
        }

        let mut deleted = 0u32;
        let mut archived = 0u32;
        let mut kept = Vec::new(env);
        let mut removed_metadata = Vec::new(env);
        let last_index = metadata_list.len() - 1;
        let mut idx = 0u32;
        while idx < metadata_list.len() {
            let metadata = metadata_list.get(idx).unwrap();
            let is_latest = idx == last_index;
            let should_delete = !is_latest
                && deleted < max_deletions
                && Self::is_expired(now, metadata.created_at, policy.retention_secs);

            if should_delete {
                if policy.archive_before_delete {
                    let archived_snapshot: Option<CheckpointSnapshot> = env
                        .storage()
                        .persistent()
                        .get(&format!("checkpoint_snapshot:{}", metadata.checkpoint_id).into());
                    if let Some(snapshot) = archived_snapshot {
                        env.storage().persistent().set(
                            &format!("archived_checkpoint_snapshot:{}", metadata.checkpoint_id).into(),
                            &snapshot,
                        );
                    }
                    removed_metadata.push_back(metadata.clone());
                    archived += 1;
                }

                env.storage()
                    .persistent()
                    .remove(&format!("checkpoint_snapshot:{}", metadata.checkpoint_id).into());
                deleted += 1;
            } else {
                kept.push_back(metadata);
            }
            idx += 1;
        }

        if deleted > 0 {
            env.storage()
                .instance()
                .set(&keys::CHECKPOINT_METADATA_LIST, &kept);
        }

        if policy.archive_before_delete && !removed_metadata.is_empty() {
            let mut archived_metadata: Vec<CheckpointMetadata> = env
                .storage()
                .instance()
                .get(&keys::ARCHIVED_CHECKPOINT_META)
                .unwrap_or_else(|| Vec::new(env));
            for metadata in removed_metadata.iter() {
                archived_metadata.push_back(metadata);
            }
            env.storage()
                .instance()
                .set(&keys::ARCHIVED_CHECKPOINT_META, &archived_metadata);
        }

        (deleted, archived)
    }

    fn resolve_retention_secs(
        env: &Env,
        data_type: &RetentionDataType,
        asset_code: Option<&String>,
        default_retention_secs: u64,
    ) -> u64 {
        match asset_code {
            Some(code) => env
                .storage()
                .persistent()
                .get(&DataKey::AssetRetentionOverride(
                    code.clone(),
                    data_type.clone(),
                ))
                .unwrap_or(default_retention_secs),
            None => default_retention_secs,
        }
    }

    fn is_expired(now: u64, timestamp: u64, retention_secs: u64) -> bool {
        now.saturating_sub(timestamp) > retention_secs
    }

    fn maybe_trigger_auto_cleanup(env: &Env) {
        let now = env.ledger().timestamp();
        let mut total_deleted = 0u32;
        let mut total_archived = 0u32;

        for data_type in Self::retention_data_types(env).iter() {
            let policy = Self::load_retention_policy(env, &data_type);
            if !policy.enabled {
                continue;
            }

            let last_cleanup_at: u64 = env
                .storage()
                .instance()
                .get(&format!("last_cleanup_at:{}", data_type.clone().into()))
                .unwrap_or(0);
            if last_cleanup_at != 0 && now < last_cleanup_at + policy.trigger_interval_secs {
                continue;
            }

            let (deleted, archived) = Self::cleanup_data_type_internal(
                env,
                &data_type,
                &policy,
                policy.max_deletions_per_run,
            );
            env.storage()
                .instance()
                .set(&format!("last_cleanup_at:{}", data_type.clone().into()), &now);

            if deleted > 0 || archived > 0 {
                env.events().publish(
                    (
                        symbol_short!("ret_auto"),
                        Self::retention_kind_code(&data_type),
                    ),
                    (deleted, archived, now),
                );
            }

            total_deleted += deleted;
            total_archived += archived;
        }

        if total_deleted > 0 || total_archived > 0 {
            env.events().publish(
                (symbol_short!("ret_job"),),
                (total_deleted, total_archived, now),
            );
        }
    }

    fn supply_storage_usage(env: &Env) -> StorageUsageEntry {
        let bridge_ids: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::BRIDGEIDS)
            .unwrap_or_else(|| Vec::new(env));

        let mut active_records = 0u32;
        let mut archived_records = 0u32;
        for bridge_id in bridge_ids.iter() {
            let active: Vec<SupplyMismatch> = env
                .storage()
                .persistent()
                .get(&format!("supply_mismatches:{}", bridge_id.clone().into()))
                .unwrap_or_else(|| Vec::new(env));
            let archived: Vec<SupplyMismatch> = env
                .storage()
                .persistent()
                .get(&DataKey::ArchivedSupplyMismatches(bridge_id))
                .unwrap_or_else(|| Vec::new(env));
            active_records += active.len();
            archived_records += archived.len();
        }

        StorageUsageEntry {
            data_type: RetentionDataType::SupplyMismatches,
            tracked_keys: bridge_ids.len(),
            active_records,
            archived_records,
        }
    }

    fn liquidity_storage_usage(env: &Env) -> StorageUsageEntry {
        let pairs: Vec<String> = env
            .storage()
            .instance()
            .get(&keys::LIQUIDITY_PAIRS)
            .unwrap_or_else(|| Vec::new(env));

        let mut active_records = 0u32;
        let mut archived_records = 0u32;
        for pair in pairs.iter() {
            let active: Vec<LiquidityDepth> = env
                .storage()
                .persistent()
                .get(&DataKey::LiquidityDepthHistory(pair.clone()))
                .unwrap_or_else(|| Vec::new(env));
            let archived: Vec<LiquidityDepth> = env
                .storage()
                .persistent()
                .get(&DataKey::ArchivedLiquidityDepthHistory(pair))
                .unwrap_or_else(|| Vec::new(env));
            active_records += active.len();
            archived_records += archived.len();
        }

        StorageUsageEntry {
            data_type: RetentionDataType::LiquidityHistory,
            tracked_keys: pairs.len(),
            active_records,
            archived_records,
        }
    }

    fn checkpoint_storage_usage(env: &Env) -> StorageUsageEntry {
        let active_metadata = Self::load_checkpoint_metadata(env);
        let archived_metadata: Vec<CheckpointMetadata> = env
            .storage()
            .instance()
            .get(&keys::ARCHIVED_CHECKPOINT_META)
            .unwrap_or_else(|| Vec::new(env));

        StorageUsageEntry {
            data_type: RetentionDataType::Checkpoints,
            tracked_keys: active_metadata.len(),
            active_records: active_metadata.len(),
            archived_records: archived_metadata.len(),
        }
    }

    fn maybe_create_auto_checkpoint(env: &Env, caller: &Address) {
        let config = Self::load_checkpoint_config(env);
        let now = env.ledger().timestamp();
        let last_at: u64 = env
            .storage()
            .instance()
            .get(&keys::LAST_CHECKPOINT_AT)
            .unwrap_or(0);

        if last_at != 0 && now < last_at + config.interval_secs {
            return;
        }

        Self::persist_checkpoint(
            env,
            caller,
            CheckpointTrigger::Automatic,
            String::from_str(env, "auto"),
            None,
        );
    }

    fn persist_checkpoint(
        env: &Env,
        caller: &Address,
        trigger: CheckpointTrigger,
        label: String,
        restored_from: Option<u64>,
    ) -> CheckpointMetadata {
        let config = Self::load_checkpoint_config(env);
        let next_id: u64 = env
            .storage()
            .instance()
            .get(&keys::CHECKPOINT_COUNTER)
            .unwrap_or(0)
            + 1;
        let created_at = env.ledger().timestamp();
        let monitored_assets = Self::load_registered_assets_raw(env);
        let health_weights = Self::load_health_weights(env);
        let mut assets = Vec::new(env);

        for asset_code in monitored_assets.iter() {
            let health = Self::load_asset_health(env, &asset_code);
            let latest_price_opt: Option<PriceRecord> = env
                .storage()
                .persistent()
                .get(&format!("price_record:{}", asset_code.clone().into()));
            let health_result_opt: Option<HealthScoreResult> = env
                .storage()
                .persistent()
                .get(&format!("health_score_result:{}", asset_code.clone().into()));

            let default_price = PriceRecord {
                asset_code: asset_code.clone(),
                price: 0,
                source: String::from_str(env, ""),
                timestamp: 0,
            };
            let default_result = HealthScoreResult {
                composite_score: 0,
                liquidity_score: 0,
                price_stability_score: 0,
                bridge_uptime_score: 0,
                weights: Self::default_health_weights(),
                timestamp: 0,
            };

            assets.push_back(CheckpointAssetState {
                asset_code,
                health,
                has_latest_price: latest_price_opt.is_some(),
                latest_price: latest_price_opt.unwrap_or(default_price),
                has_health_result: health_result_opt.is_some(),
                health_result: health_result_opt.unwrap_or(default_result),
            });
        }

        let snapshot = CheckpointSnapshot {
            checkpoint_id: next_id,
            format_version: config.format_version,
            created_at,
            trigger: trigger.clone(),
            created_by: caller.clone(),
            label: label.clone(),
            monitored_assets: monitored_assets.clone(),
            health_weights,
            assets,
            restored_from,
        };
        let state_hash = Self::compute_checkpoint_hash(env, &snapshot);
        let metadata = CheckpointMetadata {
            checkpoint_id: next_id,
            format_version: snapshot.format_version,
            created_at,
            trigger,
            created_by: caller.clone(),
            label,
            monitored_asset_count: snapshot.monitored_assets.len(),
            asset_count: snapshot.assets.len(),
            state_hash,
            restored_from,
        };

        env.storage()
            .persistent()
            .set(&format!("checkpoint_snapshot:{}", next_id).into(), &snapshot);

        let mut metadata_list = Self::load_checkpoint_metadata(env);
        metadata_list.push_back(metadata.clone());
        env.storage()
            .instance()
            .set(&keys::CHECKPOINT_METADATA_LIST, &metadata_list);
        env.storage()
            .instance()
            .set(&keys::CHECKPOINT_COUNTER, &next_id);
        env.storage()
            .instance()
            .set(&keys::LAST_CHECKPOINT_AT, &created_at);
        env.storage()
            .instance()
            .set(&keys::LAST_CHECKPOINT_ID, &next_id);

        Self::prune_checkpoints(env, &config);
        env.events()
            .publish((symbol_short!("chkptnew"), next_id), metadata.asset_count);
        Self::maybe_trigger_auto_cleanup(env);
        metadata
    }

    fn prune_checkpoints(env: &Env, config: &CheckpointConfig) {
        let mut metadata_list = Self::load_checkpoint_metadata(env);
        let mut pruned = 0u32;

        while metadata_list.len() > config.max_checkpoints {
            let oldest = metadata_list.get(0).unwrap();
            env.storage()
                .persistent()
                .remove(&format!("checkpoint_snapshot:{}", oldest.checkpoint_id).into());
            metadata_list.remove(0);
            pruned += 1;
        }

        if pruned > 0 {
            env.storage()
                .instance()
                .set(&keys::CHECKPOINT_METADATA_LIST, &metadata_list);
            env.events().publish((symbol_short!("chkprune"),), pruned);
        }
    }

    fn get_checkpoint_or_panic(env: &Env, checkpoint_id: u64) -> CheckpointSnapshot {
        env.storage()
            .persistent()
            .get(&format!("checkpoint_snapshot:{}", checkpoint_id).into())
            .unwrap_or_else(|| panic!("checkpoint not found"))
    }

    fn compute_checkpoint_hash(env: &Env, snapshot: &CheckpointSnapshot) -> BytesN<32> {
        let mut data = Bytes::new(env);
        Self::append_u32(&mut data, snapshot.format_version);
        Self::append_u32(&mut data, snapshot.health_weights.liquidity_weight);
        Self::append_u32(&mut data, snapshot.health_weights.price_stability_weight);
        Self::append_u32(&mut data, snapshot.health_weights.bridge_uptime_weight);
        Self::append_u32(&mut data, snapshot.health_weights.version);

        for asset_code in snapshot.monitored_assets.iter() {
            Self::append_string(&mut data, &asset_code);
        }

        for asset in snapshot.assets.iter() {
            Self::append_string(&mut data, &asset.asset_code);
            Self::append_asset_health(&mut data, &asset.health);
            Self::append_bool(&mut data, asset.has_latest_price);
            if asset.has_latest_price {
                Self::append_price_record(&mut data, &asset.latest_price);
            }
            Self::append_bool(&mut data, asset.has_health_result);
            if asset.has_health_result {
                Self::append_health_score_result(&mut data, &asset.health_result);
            }
        }

        env.crypto().sha256(&data).into()
    }

    fn build_checkpoint_comparison(
        env: &Env,
        from_snapshot: &CheckpointSnapshot,
        to_snapshot: &CheckpointSnapshot,
        from_checkpoint_id: u64,
        to_checkpoint_id: u64,
    ) -> CheckpointComparison {
        let mut added_assets = Vec::new(env);
        let mut removed_assets = Vec::new(env);
        let mut changed_assets = Vec::new(env);

        for to_asset in to_snapshot.assets.iter() {
            if let Some(from_asset) =
                Self::find_checkpoint_asset(&from_snapshot.assets, &to_asset.asset_code)
            {
                let health_changed = from_asset.health != to_asset.health;
                let price_changed = from_asset.latest_price != to_asset.latest_price;
                let health_result_changed = from_asset.health_result != to_asset.health_result;
                if health_changed || price_changed || health_result_changed {
                    changed_assets.push_back(CheckpointAssetDiff {
                        asset_code: to_asset.asset_code.clone(),
                        health_changed,
                        price_changed,
                        health_result_changed,
                    });
                }
            } else {
                added_assets.push_back(to_asset.asset_code.clone());
            }
        }

        for from_asset in from_snapshot.assets.iter() {
            if Self::find_checkpoint_asset(&to_snapshot.assets, &from_asset.asset_code).is_none() {
                removed_assets.push_back(from_asset.asset_code.clone());
            }
        }

        CheckpointComparison {
            from_checkpoint_id,
            to_checkpoint_id,
            timestamp_delta: to_snapshot
                .created_at
                .saturating_sub(from_snapshot.created_at),
            state_hash_changed: Self::compute_checkpoint_hash(env, from_snapshot)
                != Self::compute_checkpoint_hash(env, to_snapshot),
            weights_changed: from_snapshot.health_weights != to_snapshot.health_weights,
            added_assets,
            removed_assets,
            changed_assets,
        }
    }

    fn find_checkpoint_asset(
        assets: &Vec<CheckpointAssetState>,
        asset_code: &String,
    ) -> Option<CheckpointAssetState> {
        let mut i = 0;
        while i < assets.len() {
            let asset = assets.get(i).unwrap();
            if asset.asset_code == *asset_code {
                return Some(asset);
            }
            i += 1;
        }

        None
    }

    fn vec_contains_string(values: &Vec<String>, target: &String) -> bool {
        let mut i = 0;
        while i < values.len() {
            if values.get(i).unwrap() == *target {
                return true;
            }
            i += 1;
        }

        false
    }

    fn vec_contains_address(values: &Vec<Address>, target: &Address) -> bool {
        let mut i = 0;
        while i < values.len() {
            if values.get(i).unwrap() == *target {
                return true;
            }
            i += 1;
        }

        false
    }

    fn append_i128(buf: &mut Bytes, value: i128) {
        let bytes = value.to_be_bytes();
        let mut i = 0;
        while i < bytes.len() {
            buf.push_back(bytes[i]);
            i += 1;
        }
    }

    fn append_bool(buf: &mut Bytes, value: bool) {
        buf.push_back(if value { 1 } else { 0 });
    }

    fn append_string(buf: &mut Bytes, value: &String) {
        let raw = Self::str_to_bytes_inner(value.env(), value);
        Self::append_u32(buf, raw.len());
        buf.append(&raw);
    }

    /// Convert a `soroban_sdk::String` to `Bytes` by copying its content.
    fn str_to_bytes_inner(env: &Env, s: &String) -> Bytes {
        let len = s.len() as usize;
        // Use a fixed-size stack buffer; Soroban strings are bounded.
        // Max practical length is well under 256 bytes for our use cases.
        let mut buf = [0u8; 256];
        let safe_len = len.min(256);
        s.copy_into_slice(&mut buf[..safe_len]);
        let mut result = Bytes::new(env);
        let mut i = 0;
        while i < safe_len {
            result.push_back(buf[i]);
            i += 1;
        }
        result
    }

    #[allow(dead_code)]
    fn append_option_u64(buf: &mut Bytes, value: Option<u64>) {
        match value {
            Some(v) => {
                Self::append_bool(buf, true);
                Self::append_u64(buf, v);
            }
            None => Self::append_bool(buf, false),
        }
    }

    #[allow(dead_code)]
    fn append_checkpoint_trigger(buf: &mut Bytes, trigger: &CheckpointTrigger) {
        let code = match trigger {
            CheckpointTrigger::Automatic => 1u32,
            CheckpointTrigger::Manual => 2u32,
            CheckpointTrigger::Restore => 3u32,
        };
        Self::append_u32(buf, code);
    }

    fn append_asset_health(buf: &mut Bytes, health: &AssetHealth) {
        Self::append_string(buf, &health.asset_code);
        Self::append_u32(buf, health.health_score);
        Self::append_u32(buf, health.liquidity_score);
        Self::append_u32(buf, health.price_stability_score);
        Self::append_u32(buf, health.bridge_uptime_score);
        Self::append_bool(buf, health.paused);
        Self::append_bool(buf, health.active);
        Self::append_u64(buf, health.timestamp);
    }

    #[allow(dead_code)]
    fn append_option_price_record(buf: &mut Bytes, record: &Option<PriceRecord>) {
        match record {
            Some(price) => {
                Self::append_bool(buf, true);
                Self::append_string(buf, &price.asset_code);
                Self::append_i128(buf, price.price);
                Self::append_string(buf, &price.source);
                Self::append_u64(buf, price.timestamp);
            }
            None => Self::append_bool(buf, false),
        }
    }

    fn append_price_record(buf: &mut Bytes, price: &PriceRecord) {
        Self::append_string(buf, &price.asset_code);
        Self::append_i128(buf, price.price);
        Self::append_string(buf, &price.source);
        Self::append_u64(buf, price.timestamp);
    }

    #[allow(dead_code)]
    fn append_option_health_score_result(buf: &mut Bytes, result: &Option<HealthScoreResult>) {
        match result {
            Some(value) => {
                Self::append_bool(buf, true);
                Self::append_u32(buf, value.composite_score);
                Self::append_u32(buf, value.liquidity_score);
                Self::append_u32(buf, value.price_stability_score);
                Self::append_u32(buf, value.bridge_uptime_score);
                Self::append_u32(buf, value.weights.liquidity_weight);
                Self::append_u32(buf, value.weights.price_stability_weight);
                Self::append_u32(buf, value.weights.bridge_uptime_weight);
                Self::append_u32(buf, value.weights.version);
                Self::append_u64(buf, value.timestamp);
            }
            None => Self::append_bool(buf, false),
        }
    }

    fn append_health_score_result(buf: &mut Bytes, value: &HealthScoreResult) {
        Self::append_u32(buf, value.composite_score);
        Self::append_u32(buf, value.liquidity_score);
        Self::append_u32(buf, value.price_stability_score);
        Self::append_u32(buf, value.bridge_uptime_score);
        Self::append_u32(buf, value.weights.liquidity_weight);
        Self::append_u32(buf, value.weights.price_stability_weight);
        Self::append_u32(buf, value.weights.bridge_uptime_weight);
        Self::append_u32(buf, value.weights.version);
        Self::append_u64(buf, value.timestamp);
    }

    /// Load stored health weights or return defaults (30 / 40 / 30, v1).
    fn load_health_weights(env: &Env) -> HealthWeights {
        env.storage()
            .instance()
            .get(&keys::HEALTH_WEIGHTS)
            .unwrap_or(HealthWeights {
                liquidity_weight: 30,
                price_stability_weight: 40,
                bridge_uptime_weight: 30,
                version: 1,
            })
    }

    /// Validate that three weights are each ≤ 100 and sum to exactly 100.
    fn validate_weights(liq: u32, stab: u32, up: u32) {
        if liq > 100 || stab > 100 || up > 100 {
            panic!("each weight must be between 0 and 100");
        }
        if liq + stab + up != 100 {
            panic!("weights must sum to 100");
        }
    }

    /// Validate that a single score is within the 0–100 range.
    fn validate_score_range(score: u32, name: &str) {
        if score > 100 {
            panic!("{} must be between 0 and 100", name);
        }
    }

    /// Compute the weighted-average composite score.
    ///
    /// `composite = (liq * liq_w + stab * stab_w + up * up_w) / 100`
    fn compute_composite(
        liquidity_score: u32,
        price_stability_score: u32,
        bridge_uptime_score: u32,
        weights: &HealthWeights,
    ) -> u32 {
        let weighted_sum = (liquidity_score as u64) * (weights.liquidity_weight as u64)
            + (price_stability_score as u64) * (weights.price_stability_weight as u64)
            + (bridge_uptime_score as u64) * (weights.bridge_uptime_weight as u64);
        (weighted_sum / 100) as u32
    }

    // -----------------------------------------------------------------------
    // Statistical Calculations (issue #133)
    // -----------------------------------------------------------------------

    /// Calculate simple moving average of a value series.
    ///
    /// Returns the arithmetic mean of the provided values.
    /// Gas-efficient implementation for on-chain calculations.
    pub fn calculate_average(env: Env, values: Vec<i128>) -> i128 {
        let count = values.len() as i128;
        if count == 0 {
            return 0;
        }

        let mut sum: i128 = 0;
        for v in values.iter() {
            sum = sum.checked_add(v).unwrap_or(sum);
        }

        sum / count
    }

    /// Calculate volume-weighted moving average.
    ///
    /// Each value is weighted by its corresponding volume.
    pub fn volume_weighted_avg(env: Env, values: Vec<i128>, volumes: Vec<i128>) -> i128 {
        if values.len() != volumes.len() {
            panic!("values and volumes must have same length");
        }

        let count = values.len();
        if count == 0 {
            return 0;
        }

        let mut weighted_sum: i128 = 0;
        let mut total_volume: i128 = 0;

        for i in 0..count {
            let value = values.get(i).unwrap();
            let volume = volumes.get(i).unwrap();
            weighted_sum = weighted_sum
                .checked_add(value * volume)
                .unwrap_or(weighted_sum);
            total_volume = total_volume.checked_add(volume).unwrap_or(total_volume);
        }

        if total_volume == 0 {
            return 0;
        }

        weighted_sum / total_volume
    }

    /// Calculate standard deviation of a value series.
    ///
    /// Uses population standard deviation formula: sqrt(sum((x - mean)^2) / n)
    /// Returns result scaled by PRECISION for fixed-point arithmetic.
    pub fn calculate_stddev(env: Env, values: Vec<i128>) -> i128 {
        let count = values.len() as i128;
        if count < 2 {
            return 0;
        }

        let mean = Self::calculate_average(env.clone(), values.clone());

        let mut sum_squared_diff: i128 = 0;
        for v in values.iter() {
            let diff = v - mean;
            sum_squared_diff = sum_squared_diff
                .checked_add(diff * diff)
                .unwrap_or(sum_squared_diff);
        }

        // Variance = sum_squared_diff / count
        let variance = sum_squared_diff / count;

        // Integer square root approximation using Newton's method
        Self::integer_sqrt(variance)
    }

    /// Calculate price volatility as annualized standard deviation.
    ///
    /// Returns volatility in basis points (1 bp = 0.01%).
    /// Uses the standard deviation of price returns.
    pub fn calculate_volatility(env: Env, prices: Vec<i128>, period_secs: u64) -> i128 {
        let n = prices.len();
        if n < 2 {
            return 0;
        }

        // Calculate price returns (percentage changes)
        let mut returns: Vec<i128> = Vec::new(&env);
        for i in 1..n {
            let prev_price = prices.get(i - 1).unwrap();
            let curr_price = prices.get(i).unwrap();

            if prev_price == 0 {
                returns.push_back(0);
                continue;
            }

            // Return = (curr - prev) / prev * PRECISION
            let price_diff = curr_price - prev_price;
            let ret = (price_diff * 10_000) / prev_price; // In basis points
            returns.push_back(ret);
        }

        // Calculate standard deviation of returns
        let stddev_returns = Self::calculate_stddev(env.clone(), returns);

        // Annualize: multiply by sqrt(seconds in year / period)
        // Using 365 days = 31_536_000 seconds
        const SECONDS_PER_YEAR: u64 = 31_536_000;
        if period_secs == 0 {
            return stddev_returns;
        }

        // Annualization factor scaled by PRECISION
        let annualization_factor =
            Self::integer_sqrt((SECONDS_PER_YEAR as i128 * 10_000) / period_secs as i128);

        // Annualized volatility
        (stddev_returns * annualization_factor) / 100
    }

    /// Calculate min and max values in a series.
    pub fn calculate_min_max(env: Env, values: Vec<i128>) -> (i128, i128) {
        if values.len() == 0 {
            return (0, 0);
        }

        let mut min = values.get(0).unwrap();
        let mut max = values.get(0).unwrap();

        for v in values.iter() {
            if v < min {
                min = v;
            }
            if v > max {
                max = v;
            }
        }

        (min, max)
    }

    /// Calculate median value of a sorted series.
    ///
    /// For even-length series, returns average of two middle values.
    pub fn calculate_median(env: Env, mut values: Vec<i128>) -> i128 {
        let n = values.len();
        if n == 0 {
            return 0;
        }

        // Simple bubble sort for small vectors (gas efficient for n < 100)
        for i in 0..n {
            for j in 0..(n - i - 1) {
                let a = values.get(j).unwrap();
                let b = values.get(j + 1).unwrap();
                if a > b {
                    // Swap - we can't modify in place, so we need to rebuild
                    // This is inefficient but works for small vectors
                }
            }
        }

        // For gas efficiency with small datasets, use selection algorithm
        // Find k-th smallest element
        let mid = n / 2;
        if n % 2 == 1 {
            // Odd: return middle element
            Self::quick_select(&env, &values, mid)
        } else {
            // Even: return average of two middle elements
            let left = Self::quick_select(&env, &values, mid - 1);
            let right = Self::quick_select(&env, &values, mid);
            (left + right) / 2
        }
    }

    /// Calculate percentiles (25th and 75th) for a value series.
    ///
    /// Returns (p25, median, p75).
    pub fn calculate_percentiles(env: Env, values: Vec<i128>) -> (i128, i128, i128) {
        let n = values.len();
        if n == 0 {
            return (0, 0, 0);
        }
        if n == 1 {
            let v = values.get(0).unwrap();
            return (v, v, v);
        }

        // Calculate positions
        let p25_idx = (n - 1) / 4;
        let p50_idx = n / 2;
        let p75_idx = (3 * (n - 1)) / 4;

        // Use quick select for each percentile
        let p25 = Self::quick_select(&env, &values, p25_idx);
        let p50 = if n % 2 == 1 {
            Self::quick_select(&env, &values, p50_idx)
        } else {
            let left = Self::quick_select(&env, &values, p50_idx - 1);
            let right = Self::quick_select(&env, &values, p50_idx);
            (left + right) / 2
        };
        let p75 = Self::quick_select(&env, &values, p75_idx);

        (p25, p50, p75)
    }

    /// Compute all statistics for an asset over a specified period.
    ///
    /// Calculates and stores: average, stddev, volatility, min/max, median, percentiles.
    /// Requires at least 2 data points for meaningful statistics.
    pub fn compute_statistics(
        env: Env,
        caller: Address,
        asset_code: String,
        period: StatPeriod,
    ) -> Statistics {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            panic!("only admin can compute statistics");
        }

        // Determine time range based on period
        let now = env.ledger().timestamp();
        let period_secs = match period {
            StatPeriod::Hour => 3600,
            StatPeriod::Day => 86400,
            StatPeriod::Week => 604800,
            StatPeriod::Month => 2592000,
        };
        let start_time = now.saturating_sub(period_secs);

        // Get price history for the period
        let history: Vec<PriceRecord> = env
            .storage()
            .persistent()
            .get(&format!("price_history:{}", asset_code.clone().into()))
            .unwrap_or_else(|| Vec::new(&env));

        // Collect prices within time range
        let mut prices: Vec<i128> = Vec::new(&env);
        for record in history.iter() {
            if record.timestamp >= start_time && record.timestamp <= now {
                prices.push_back(record.price);
            }
        }

        let data_points = prices.len();
        if data_points < 2 {
            panic!("insufficient data points for statistics");
        }

        // Calculate all statistics
        let average = Self::calculate_average(env.clone(), prices.clone());
        let stddev = Self::calculate_stddev(env.clone(), prices.clone());
        let volatility = Self::calculate_volatility(env.clone(), prices.clone(), period_secs);
        let (min_price, max_price) = Self::calculate_min_max(env.clone(), prices.clone());
        let (p25, median, p75) = Self::calculate_percentiles(env.clone(), prices.clone());

        // Create and store statistics record
        let stats = Statistics {
            asset_code: asset_code.clone(),
            period: period.clone(),
            average_price: average,
            stddev_price: stddev,
            volatility_bps: volatility,
            min_price,
            max_price,
            median_price: median,
            p25_price: p25,
            p75_price: p75,
            data_points,
            timestamp: now,
        };

        // Store in history
        let mut stats_history: Vec<Statistics> = env
            .storage()
            .persistent()
            .get(&format!("asset_statistics:{}", asset_code.clone().into()))
            .unwrap_or_else(|| Vec::new(&env));
        stats_history.push_back(stats.clone());
        env.storage().persistent().set(
            &format!("asset_statistics:{}", asset_code.clone().into()),
            &stats_history,
        );

        // Emit event
        env.events().publish(
            (symbol_short!("stats_avg"), asset_code.clone(), period),
            average,
        );

        stats
    }

    /// Get pre-computed statistics for an asset.
    ///
    /// Returns the most recent statistics for the specified period, or None
    /// if no statistics have been computed.
    pub fn get_statistics(env: Env, asset_code: String, period: StatPeriod) -> Option<Statistics> {
        let stats_history: Vec<Statistics> = env
            .storage()
            .persistent()
            .get(&format!("asset_statistics:{}", asset_code).into())
            .unwrap_or_else(|| Vec::new(&env));

        // Return the most recent matching period
        let mut i = stats_history.len();
        while i > 0 {
            i -= 1;
            let stats = stats_history.get(i).unwrap();
            if stats.period == period {
                return Some(stats);
            }
        }

        None
    }

    /// Get all historical statistics for an asset.
    pub fn get_statistics_history(env: Env, asset_code: String) -> Vec<Statistics> {
        env.storage()
            .persistent()
            .get(&format!("asset_statistics:{}", asset_code).into())
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Trigger periodic statistics calculation for all active assets.
    ///
    /// Intended to be called periodically (e.g., by an automation service)
    /// to keep statistics up-to-date. Calculates daily statistics for all
    /// assets with sufficient data.
    pub fn trigger_periodic_stats(env: Env, caller: Address) {
        caller.require_auth();
        let admin: Address = env.storage().instance().get(&keys::ADMIN).unwrap();
        if caller != admin {
            panic!("only admin can trigger periodic stats");
        }

        let assets = Self::get_monitored_assets(env.clone());
        let now = env.ledger().timestamp();

        for asset_code in assets.iter() {
            // Check if we have recent enough data
            let history: Vec<PriceRecord> = env
                .storage()
                .persistent()
                .get(&format!("price_history:{}", asset_code.clone().into()))
                .unwrap_or_else(|| Vec::new(&env));

            if history.len() < 2 {
                continue;
            }

            // Check last stats computation time
            let existing_stats =
                Self::get_statistics(env.clone(), asset_code.clone(), StatPeriod::Day);
            let should_compute = match existing_stats {
                Some(stats) => now.saturating_sub(stats.timestamp) >= 3600, // 1 hour minimum
                None => true,
            };

            if should_compute {
                // Compute new statistics
                let _ = Self::compute_statistics(
                    env.clone(),
                    caller.clone(),
                    asset_code.clone(),
                    StatPeriod::Day,
                );
            }
        }
    }

    /// Calculate rolling window statistics over a series.
    ///
    /// Returns a vector of statistics, each computed over `window_size` data points,
    /// sliding by `step` points each time.
    pub fn calculate_rolling_statistics(
        env: Env,
        values: Vec<i128>,
        window_size: u32,
        step: u32,
    ) -> Vec<i128> {
        let n = values.len();
        if window_size == 0 || step == 0 || n < window_size {
            return Vec::new(&env);
        }

        let mut results: Vec<i128> = Vec::new(&env);
        let mut start: u32 = 0;

        while start + window_size <= n {
            // Extract window
            let mut window: Vec<i128> = Vec::new(&env);
            for i in start..(start + window_size) {
                window.push_back(values.get(i).unwrap());
            }

            // Calculate average for this window
            let avg = Self::calculate_average(env.clone(), window);
            results.push_back(avg);

            start += step;
        }

        results
    }

    // -----------------------------------------------------------------------
    // Private helper functions for statistics
    // -----------------------------------------------------------------------

    /// Integer square root using Newton's method.
    /// Returns sqrt(x) as an integer.
    fn integer_sqrt(x: i128) -> i128 {
        if x <= 0 {
            return 0;
        }
        if x == 1 {
            return 1;
        }

        let mut z = x;
        let mut y = (z + 1) / 2;

        while y < z {
            z = y;
            y = (z + x / z) / 2;
        }

        z
    }

    /// Quick select algorithm to find k-th smallest element.
    /// Uses median-of-three pivot selection for efficiency.
    fn quick_select(env: &Env, values: &Vec<i128>, k: u32) -> i128 {
        let n = values.len();
        if n == 0 || k >= n {
            return 0;
        }

        // For small arrays, use simple selection
        if n <= 5 {
            // Copy and sort
            let mut sorted: Vec<i128> = Vec::new(env);
            for v in values.iter() {
                sorted.push_back(v);
            }
            // Simple insertion sort for small n
            for i in 1..sorted.len() {
                let key = sorted.get(i).unwrap();
                let mut j = i;
                while j > 0 {
                    let prev = sorted.get(j - 1).unwrap();
                    if prev > key {
                        sorted.set(j, &prev);
                        j -= 1;
                    } else {
                        break;
                    }
                }
                sorted.set(j, &key);
            }
            return sorted.get(k).unwrap();
        }

        // For larger arrays, use median-of-three quickselect
        // (simplified version for gas efficiency)
        let pivot = values.get(n / 2).unwrap();

        let mut lows: Vec<i128> = Vec::new(env);
        let mut highs: Vec<i128> = Vec::new(env);
        let mut pivots: Vec<i128> = Vec::new(env);

        for v in values.iter() {
            if v < pivot {
                lows.push_back(v);
            } else if v > pivot {
                highs.push_back(v);
            } else {
                pivots.push_back(v);
            }
        }

        let num_lows = lows.len();
        if k < num_lows {
            Self::quick_select(env, &lows, k)
        } else if k < num_lows + pivots.len() {
            pivot
        } else {
            Self::quick_select(env, &highs, k - num_lows - pivots.len())
        }
    }

    /// Calculate correlation coefficient between two series.
    /// Returns value between -10_000 and 10_000 (scaled by 10_000).
    pub fn calculate_correlation(env: Env, x: Vec<i128>, y: Vec<i128>) -> i128 {
        if x.len() != y.len() || x.len() < 2 {
            return 0;
        }

        let n = x.len() as i128;

        // Calculate means
        let mean_x = Self::calculate_average(env.clone(), x.clone());
        let mean_y = Self::calculate_average(env.clone(), y.clone());

        // Calculate covariance and variances
        let mut cov: i128 = 0;
        let mut var_x: i128 = 0;
        let mut var_y: i128 = 0;

        for i in 0..x.len() {
            let xi = x.get(i).unwrap();
            let yi = y.get(i).unwrap();

            let dx = xi - mean_x;
            let dy = yi - mean_y;

            cov = cov.checked_add(dx * dy).unwrap_or(cov);
            var_x = var_x.checked_add(dx * dx).unwrap_or(var_x);
            var_y = var_y.checked_add(dy * dy).unwrap_or(var_y);
        }

        // Normalize
        cov = cov / n;
        var_x = var_x / n;
        var_y = var_y / n;

        // Calculate correlation
        let std_x = Self::integer_sqrt(var_x);
        let std_y = Self::integer_sqrt(var_y);

        if std_x == 0 || std_y == 0 {
            return 0;
        }

        // correlation = cov / (std_x * std_y), scaled by 10_000
        (cov * 10_000) / (std_x * std_y)
    }

    /// Calculate exponential moving average (EMA).
    ///
    /// `smoothing_factor` is a value between 0 and 10_000 representing
    /// the smoothing constant alpha (where alpha = smoothing_factor / 10_000).
    pub fn calculate_ema(env: Env, values: Vec<i128>, smoothing_factor: i128) -> i128 {
        let n = values.len();
        if n == 0 {
            return 0;
        }
        if smoothing_factor <= 0 || smoothing_factor > 10_000 {
            panic!("smoothing factor must be between 1 and 10000");
        }

        // Start with simple average for first value
        let mut ema = values.get(0).unwrap();

        // EMA_t = alpha * value_t + (1 - alpha) * EMA_{t-1}
        for i in 1..n {
            let value = values.get(i).unwrap();
            let alpha_num = smoothing_factor;
            let alpha_denom: i128 = 10_000;

            // EMA = (alpha * value + (10000 - alpha) * prev_ema) / 10000
            let new_ema = (alpha_num * value + (alpha_denom - alpha_num) * ema) / alpha_denom;
            ema = new_ema;
        }

        ema
    }

    /// Document statistical methods available in the contract.
    ///
    /// Returns a string describing each statistical function and its usage.
    pub fn get_stats_methods_docs(env: Env) -> String {
        String::from_str(
            &env,
            "Statistical Methods:\n\
            1. calculate_average(values) - Arithmetic mean\n\
            2. calculate_volume_weighted_average(values, volumes) - VWAP\n\
            3. calculate_stddev(values) - Population standard deviation\n\
            4. calculate_volatility(prices, period_secs) - Annualized volatility in bps\n\
            5. calculate_min_max(values) - Min and max values\n\
            6. calculate_median(values) - Median value\n\
            7. calculate_percentiles(values) - P25, median, P75\n\
            8. calculate_correlation(x, y) - Correlation coefficient\n\
            9. calculate_ema(values, smoothing) - Exponential moving average\n\
            10. calculate_rolling_statistics(values, window, step) - Rolling window stats\n\
            11. compute_statistics(asset, period) - Full statistics computation\n\
            12. get_statistics(asset, period) - Retrieve stored statistics\n\
            13. trigger_periodic_stats() - Trigger batch computation",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Events;
    use soroban_sdk::testutils::Ledger;
    use soroban_sdk::{Env, IntoVal};

    /// Helper: set up a fresh contract with an admin, returning (env, client, admin).
    fn setup() -> (Env, BridgeWatchContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeWatchContract);
        let client = BridgeWatchContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    fn liquidity_sources(env: &Env, venues: &[&str]) -> Vec<String> {
        let mut sources = Vec::new(env);
        for venue in venues.iter() {
            sources.push_back(String::from_str(env, venue));
        }
        sources
    }

    // -----------------------------------------------------------------------
    // Checkpoint tests (issue #105)
    // -----------------------------------------------------------------------

    #[test]
    fn test_manual_checkpoint_stores_snapshot_and_metadata() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(100);
        client.set_checkpoint_config(&admin, &86_400, &10, &2);

        let usdc = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "oracle");
        let label = String::from_str(&env, "manual-baseline");

        client.register_asset(&admin, &usdc);
        client.submit_price(&admin, &usdc, &1_000_000, &source);

        let metadata = client.create_checkpoint(&admin, &label);
        assert_eq!(metadata.checkpoint_id, 2);
        assert_eq!(metadata.format_version, 2);
        assert_eq!(metadata.label, label);
        assert_eq!(metadata.asset_count, 1);
        assert_eq!(metadata.trigger, CheckpointTrigger::Manual);

        let snapshot = client.get_checkpoint(&metadata.checkpoint_id).unwrap();
        assert_eq!(snapshot.assets.len(), 1);
        assert_eq!(snapshot.health_weights.version, 1);
        assert_eq!(snapshot.assets.get(0).unwrap().asset_code, usdc);

        let validation = client.validate_checkpoint(&metadata.checkpoint_id);
        assert!(validation.is_valid);
    }

    #[test]
    fn test_compare_checkpoints_detects_asset_changes() {
        let (env, client, admin) = setup();
        client.set_checkpoint_config(&admin, &86_400, &10, &1);

        let usdc = String::from_str(&env, "USDC");
        let eurc = String::from_str(&env, "EURC");
        let source = String::from_str(&env, "oracle");

        env.ledger().set_timestamp(10);
        client.register_asset(&admin, &usdc);
        let first = client.create_checkpoint(&admin, &String::from_str(&env, "before"));

        env.ledger().set_timestamp(20);
        client.submit_price(&admin, &usdc, &1_020_000, &source);
        client.register_asset(&admin, &eurc);
        let second = client.create_checkpoint(&admin, &String::from_str(&env, "after"));

        let comparison = client.compare_checkpoints(&first.checkpoint_id, &second.checkpoint_id);
        assert!(comparison.state_hash_changed);
        assert_eq!(comparison.added_assets.len(), 1);
        assert_eq!(comparison.added_assets.get(0).unwrap(), eurc);
        assert_eq!(comparison.changed_assets.len(), 1);
        assert_eq!(comparison.changed_assets.get(0).unwrap().asset_code, usdc);
        assert!(comparison.changed_assets.get(0).unwrap().price_changed);
    }

    #[test]
    fn test_checkpoint_pruning_keeps_latest_entries() {
        let (env, client, admin) = setup();
        client.set_checkpoint_config(&admin, &0, &2, &1);
        let usdc = String::from_str(&env, "USDC");

        env.ledger().set_timestamp(1);
        client.register_asset(&admin, &usdc);

        env.ledger().set_timestamp(2);
        let second = client.create_checkpoint(&admin, &String::from_str(&env, "second"));

        env.ledger().set_timestamp(3);
        let third = client.create_checkpoint(&admin, &String::from_str(&env, "third"));

        let checkpoints = client.list_checkpoints();
        assert_eq!(checkpoints.len(), 2);
        assert_eq!(
            checkpoints.get(0).unwrap().checkpoint_id,
            second.checkpoint_id
        );
        assert_eq!(
            checkpoints.get(1).unwrap().checkpoint_id,
            third.checkpoint_id
        );
        assert!(client.get_checkpoint(&1).is_none());
    }

    #[test]
    fn test_auto_checkpoint_respects_interval() {
        let (env, client, admin) = setup();
        client.set_checkpoint_config(&admin, &60, &10, &1);
        let usdc = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "oracle");

        env.ledger().set_timestamp(100);
        client.register_asset(&admin, &usdc);
        assert_eq!(client.list_checkpoints().len(), 1);

        env.ledger().set_timestamp(120);
        client.submit_price(&admin, &usdc, &1_000_000, &source);
        assert_eq!(client.list_checkpoints().len(), 1);

        env.ledger().set_timestamp(200);
        client.submit_health(&admin, &usdc, &80, &75, &90, &88);
        assert_eq!(client.list_checkpoints().len(), 2);
        assert_eq!(
            client.get_latest_checkpoint().unwrap().trigger,
            CheckpointTrigger::Automatic
        );
    }

    #[test]
    fn test_restore_from_checkpoint_restores_prior_state() {
        let (env, client, admin) = setup();
        client.set_checkpoint_config(&admin, &86_400, &10, &1);

        let usdc = String::from_str(&env, "USDC");
        let eurc = String::from_str(&env, "EURC");
        let source = String::from_str(&env, "oracle");

        env.ledger().set_timestamp(1_000);
        client.register_asset(&admin, &usdc);
        client.submit_price(&admin, &usdc, &1_000_000, &source);
        let baseline = client.create_checkpoint(&admin, &String::from_str(&env, "baseline"));

        env.ledger().set_timestamp(2_000);
        client.submit_health(&admin, &usdc, &91, &92, &93, &94);
        client.register_asset(&admin, &eurc);
        client.submit_price(&admin, &eurc, &990_000, &source);

        env.ledger().set_timestamp(3_000);
        let restore_meta = client.restore_from_checkpoint(&admin, &baseline.checkpoint_id);

        assert_eq!(client.get_monitored_assets().len(), 1);
        assert_eq!(client.get_monitored_assets().get(0).unwrap(), usdc);
        assert!(client.get_health(&eurc).is_none());
        assert_eq!(client.get_price(&usdc).unwrap().price, 1_000_000);
        assert_eq!(restore_meta.trigger, CheckpointTrigger::Restore);
        assert_eq!(restore_meta.restored_from, Some(baseline.checkpoint_id));
    }

    // -----------------------------------------------------------------------
    // Data retention and cleanup tests (issue #100)
    // -----------------------------------------------------------------------

    fn find_storage_entry(stats: &StorageStats, data_type: RetentionDataType) -> StorageUsageEntry {
        let mut i = 0;
        while i < stats.entries.len() {
            let entry = stats.entries.get(i).unwrap();
            if entry.data_type == data_type {
                return entry;
            }
            i += 1;
        }

        panic!("storage usage entry not found");
    }

    #[test]
    #[should_panic(expected = "only admin or SuperAdmin can manage retention policies")]
    fn test_set_retention_policy_requires_admin_or_super_admin() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);

        client.set_retention_policy(
            &stranger,
            &RetentionDataType::SupplyMismatches,
            &86_400,
            &3_600,
            &25,
            &false,
            &true,
        );
    }

    #[test]
    fn test_cleanup_old_data_archives_and_preserves_latest_record() {
        let (env, client, admin) = setup();
        let bridge = String::from_str(&env, "CIRCLE_USDC");
        let asset = String::from_str(&env, "USDC");

        client.set_retention_policy(
            &admin,
            &RetentionDataType::SupplyMismatches,
            &100,
            &1_000_000,
            &20,
            &true,
            &true,
        );

        env.ledger().set_timestamp(100);
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_001_000);

        env.ledger().set_timestamp(200);
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_002_000);

        env.ledger().set_timestamp(500);
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_003_000);

        env.ledger().set_timestamp(2_000);
        let result = client.cleanup_old_data(&admin, &10);

        assert_eq!(result.total_deleted, 2);
        assert_eq!(result.total_archived, 2);

        let records = client.get_supply_mismatches(&bridge);
        assert_eq!(records.len(), 1);
        assert_eq!(records.get(0).unwrap().timestamp, 500);

        let stats = client.get_storage_stats();
        let supply = find_storage_entry(&stats, RetentionDataType::SupplyMismatches);
        assert_eq!(supply.active_records, 1);
        assert_eq!(supply.archived_records, 2);
    }

    #[test]
    fn test_per_asset_override_prevents_override_asset_cleanup() {
        let (env, client, admin) = setup();
        let bridge = String::from_str(&env, "CIRCLE_MULTI");
        let usdc = String::from_str(&env, "USDC");
        let eurc = String::from_str(&env, "EURC");

        client.set_retention_policy(
            &admin,
            &RetentionDataType::SupplyMismatches,
            &100,
            &1_000_000,
            &20,
            &false,
            &true,
        );

        let override_secs = Some(10_000u64);
        client.set_asset_retention_override(
            &admin,
            &usdc,
            &RetentionDataType::SupplyMismatches,
            &override_secs,
        );

        env.ledger().set_timestamp(100);
        client.record_supply_mismatch(&bridge, &usdc, &1_000_000, &1_001_000);

        env.ledger().set_timestamp(150);
        client.record_supply_mismatch(&bridge, &eurc, &1_000_000, &1_001_000);

        env.ledger().set_timestamp(200);
        client.record_supply_mismatch(&bridge, &usdc, &1_000_000, &1_002_000);

        env.ledger().set_timestamp(1_000);
        let result = client.cleanup_old_data(&admin, &20);
        assert_eq!(result.total_deleted, 1);

        let records = client.get_supply_mismatches(&bridge);
        assert_eq!(records.len(), 2);

        let mut usdc_count = 0u32;
        let mut eurc_count = 0u32;
        for record in records.iter() {
            if record.asset_code == usdc {
                usdc_count += 1;
            }
            if record.asset_code == eurc {
                eurc_count += 1;
            }
        }

        assert_eq!(usdc_count, 2);
        assert_eq!(eurc_count, 0);
    }

    #[test]
    fn test_gradual_cleanup_respects_policy_delete_cap() {
        let (env, client, admin) = setup();
        let bridge = String::from_str(&env, "CIRCLE_CAP");
        let asset = String::from_str(&env, "USDC");

        client.set_retention_policy(
            &admin,
            &RetentionDataType::SupplyMismatches,
            &20,
            &1_000_000,
            &2,
            &false,
            &true,
        );

        for i in 0..6u64 {
            env.ledger().set_timestamp(100 + i * 10);
            client.record_supply_mismatch(
                &bridge,
                &asset,
                &(1_000_000 + i as i128),
                &(1_001_000 + i as i128),
            );
        }

        env.ledger().set_timestamp(1_000);
        let result = client.cleanup_old_data(&admin, &25);

        assert_eq!(result.total_deleted, 2);
        let records = client.get_supply_mismatches(&bridge);
        assert_eq!(records.len(), 4);
    }

    #[test]
    fn test_auto_cleanup_trigger_runs_during_writes() {
        let (env, client, admin) = setup();
        let bridge = String::from_str(&env, "CIRCLE_AUTO");
        let asset = String::from_str(&env, "USDC");

        client.set_retention_policy(
            &admin,
            &RetentionDataType::SupplyMismatches,
            &10,
            &1,
            &50,
            &false,
            &true,
        );

        env.ledger().set_timestamp(100);
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_001_000);

        env.ledger().set_timestamp(200);
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_002_000);

        env.ledger().set_timestamp(500);
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_003_000);

        let records = client.get_supply_mismatches(&bridge);
        assert_eq!(records.len(), 1);
        assert_eq!(records.get(0).unwrap().timestamp, 500);
    }

    // -----------------------------------------------------------------------
    // Price deviation detection tests (issue #23)
    // -----------------------------------------------------------------------

    #[test]
    fn test_price_deviation_no_reference_returns_none() {
        let (env, client, _admin) = setup();
        let asset = String::from_str(&env, "USDC");
        // No stored price record → should return None
        let result = client.check_price_deviation(&asset, &1_000_000);
        assert!(result.is_none());
    }

    #[test]
    fn test_price_deviation_below_threshold_returns_none() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "Stellar DEX");

        // Store reference price of 1_000_000 (1 %)
        client.register_asset(&admin, &asset);
        client.submit_price(&admin, &asset, &1_000_000, &source);

        // 1 % deviation is below the default Low threshold of 2 %
        let result = client.check_price_deviation(&asset, &1_010_000);
        assert!(result.is_none());
    }

    #[test]
    fn test_price_deviation_low_severity() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "Stellar DEX");

        client.register_asset(&admin, &asset);
        client.submit_price(&admin, &asset, &1_000_000, &source);

        // 3 % deviation → Low severity
        let result = client.check_price_deviation(&asset, &1_030_000);
        assert!(result.is_some());
        let alert = result.unwrap();
        assert_eq!(alert.deviation_bps, 300);
        assert_eq!(alert.severity, DeviationSeverity::Low);
    }

    #[test]
    fn test_price_deviation_medium_severity() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "Stellar DEX");

        client.register_asset(&admin, &asset);
        client.submit_price(&admin, &asset, &1_000_000, &source);

        // 7 % deviation → Medium severity
        let result = client.check_price_deviation(&asset, &1_070_000);
        assert!(result.is_some());
        let alert = result.unwrap();
        assert_eq!(alert.deviation_bps, 700);
        assert_eq!(alert.severity, DeviationSeverity::Medium);
    }

    #[test]
    fn test_price_deviation_high_severity() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "Stellar DEX");

        client.register_asset(&admin, &asset);
        client.submit_price(&admin, &asset, &1_000_000, &source);

        // 15 % deviation → High severity
        let result = client.check_price_deviation(&asset, &1_150_000);
        assert!(result.is_some());
        let alert = result.unwrap();
        assert_eq!(alert.deviation_bps, 1_500);
        assert_eq!(alert.severity, DeviationSeverity::High);
    }

    #[test]
    fn test_get_deviation_alerts_persists_latest() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "Stellar DEX");

        client.register_asset(&admin, &asset);
        client.submit_price(&admin, &asset, &1_000_000, &source);
        client.check_price_deviation(&asset, &1_150_000);

        let stored = client.get_deviation_alerts(&asset);
        assert!(stored.is_some());
        assert_eq!(stored.unwrap().severity, DeviationSeverity::High);
    }

    #[test]
    fn test_set_custom_deviation_thresholds() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "Stellar DEX");

        // Custom tight thresholds: Low > 50 bps (0.5 %)
        client.set_deviation_threshold(&asset, &50, &100, &200);
        client.register_asset(&admin, &asset);
        client.submit_price(&admin, &asset, &1_000_000, &source);

        // 1 % deviation (100 bps) exceeds custom Low threshold of 50 bps
        let result = client.check_price_deviation(&asset, &1_010_000);
        assert!(result.is_some());
        assert_eq!(result.unwrap().severity, DeviationSeverity::Low);
    }

    // -----------------------------------------------------------------------
    // Bridge supply mismatch tracking tests (issue #28)
    // -----------------------------------------------------------------------

    #[test]
    fn test_record_supply_mismatch_not_critical() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let bridge = String::from_str(&env, "CIRCLE_USDC");
        let asset = String::from_str(&env, "USDC");

        // diff=1_000, bps = 1_000*10_000/1_001_000 = 9 → below default threshold of 10
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_001_000);

        let mismatches = client.get_supply_mismatches(&bridge);
        assert_eq!(mismatches.len(), 1);
        let m = mismatches.get(0).unwrap();
        assert_eq!(m.mismatch_bps, 9);
        assert!(!m.is_critical);
    }

    #[test]
    fn test_record_supply_mismatch_critical() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let bridge = String::from_str(&env, "CIRCLE_USDC");
        let asset = String::from_str(&env, "USDC");

        // diff=2_000, bps = 2_000*10_000/1_002_000 = 19 → above default threshold of 10
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_002_000);

        let mismatches = client.get_supply_mismatches(&bridge);
        let m = mismatches.get(0).unwrap();
        assert_eq!(m.mismatch_bps, 19);
        assert!(m.is_critical);
    }

    #[test]
    fn test_set_mismatch_threshold_custom() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let bridge = String::from_str(&env, "CIRCLE_USDC");
        let asset = String::from_str(&env, "USDC");

        // Tighten threshold to 5 bps; 9 bps mismatch should now be critical
        client.set_mismatch_threshold(&5);
        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_001_000);

        let m = client.get_supply_mismatches(&bridge).get(0).unwrap();
        assert!(m.is_critical);
    }

    #[test]
    fn test_get_critical_mismatches_across_bridges() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let bridge1 = String::from_str(&env, "CIRCLE_USDC");
        let bridge2 = String::from_str(&env, "WORMHOLE_EURC");
        let asset = String::from_str(&env, "USDC");

        // bridge1: 9 bps (not critical)
        client.record_supply_mismatch(&bridge1, &asset, &1_000_000, &1_001_000);
        // bridge2: 19 bps (critical)
        client.record_supply_mismatch(&bridge2, &asset, &1_000_000, &1_002_000);

        let critical = client.get_critical_mismatches();
        assert_eq!(critical.len(), 1);
        assert_eq!(critical.get(0).unwrap().bridge_id, bridge2);
    }

    #[test]
    fn test_supply_mismatch_historical_tracking() {
        let (env, client, _admin) = setup();

        let bridge = String::from_str(&env, "CIRCLE_USDC");
        let asset = String::from_str(&env, "USDC");

        for i in 0..3u64 {
            env.ledger().set_timestamp(1_000_000 + i * 3_600);
            client.record_supply_mismatch(
                &bridge,
                &asset,
                &(1_000_000 + i as i128 * 500),
                &1_000_000,
            );
        }

        let mismatches = client.get_supply_mismatches(&bridge);
        assert_eq!(mismatches.len(), 3);
    }

    #[test]
    fn test_zero_source_supply_returns_zero_bps() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let bridge = String::from_str(&env, "CIRCLE_USDC");
        let asset = String::from_str(&env, "USDC");

        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &0);

        let m = client.get_supply_mismatches(&bridge).get(0).unwrap();
        assert_eq!(m.mismatch_bps, 0);
        assert!(!m.is_critical);
    }

    // -----------------------------------------------------------------------
    // Event emission tests (issue #29)
    // -----------------------------------------------------------------------

    /// Helper: verify that the contract emitted at least one event whose
    /// first topic matches the given symbol.
    fn assert_has_event(env: &Env, contract: &Address, expected_topic: soroban_sdk::Symbol) {
        let events = env.events().all();
        let mut found = false;
        for i in 0..events.len() {
            let (addr, topics, _data) = events.get(i).unwrap();
            if addr == *contract && !topics.is_empty() {
                // The first topic is the event symbol stored as a Val;
                // convert via IntoVal for comparison.
                let topic_val: soroban_sdk::Val = topics.get(0).unwrap();
                let expected_val: soroban_sdk::Val = expected_topic.into_val(env);
                if topic_val.get_payload() == expected_val.get_payload() {
                    found = true;
                    break;
                }
            }
        }
        assert!(found, "expected event with topic not found");
    }

    #[test]
    fn test_submit_health_emits_event() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");

        client.register_asset(&admin, &asset);
        client.submit_health(&admin, &asset, &85, &90, &80, &75);

        assert_has_event(&env, &client.address, symbol_short!("health_up"));
    }

    #[test]
    fn test_submit_price_emits_event() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "Stellar DEX");

        client.register_asset(&admin, &asset);
        client.submit_price(&admin, &asset, &1_000_000, &source);

        assert_has_event(&env, &client.address, symbol_short!("price_up"));
    }

    fn build_health_message(
        env: &Env,
        asset_code: &String,
        health_score: u32,
        liquidity_score: u32,
        price_stability_score: u32,
        bridge_uptime_score: u32,
    ) -> Bytes {
        let mut data = Bytes::new(env);
        let len = asset_code.len() as usize;
        let mut buf = [0u8; 256];
        asset_code.copy_into_slice(&mut buf[..len.min(256)]);
        let mut ci = 0;
        while ci < len.min(256) {
            data.push_back(buf[ci]);
            ci += 1;
        }

        let hs = health_score.to_be_bytes();
        let mut j = 0;
        while j < hs.len() {
            data.push_back(hs[j]);
            j += 1;
        }

        let liq = liquidity_score.to_be_bytes();
        let mut k = 0;
        while k < liq.len() {
            data.push_back(liq[k]);
            k += 1;
        }

        let ps = price_stability_score.to_be_bytes();
        let mut m = 0;
        while m < ps.len() {
            data.push_back(ps[m]);
            m += 1;
        }

        let bu = bridge_uptime_score.to_be_bytes();
        let mut n = 0;
        while n < bu.len() {
            data.push_back(bu[n]);
            n += 1;
        }

        data
    }

    fn sign_message_with_mock_ed25519(
        env: &Env,
        message: &Bytes,
        signer_id: &String,
        public_key: &BytesN<32>,
        nonce: u64,
        expiry: u64,
    ) -> BytesN<64> {
        let mut data = Bytes::new(env);
        data.append(message);

        let sid_len = signer_id.len() as usize;
        let mut sid_buf = [0u8; 256];
        signer_id.copy_into_slice(&mut sid_buf[..sid_len.min(256)]);
        let mut si = 0;
        while si < sid_len.min(256) {
            data.push_back(sid_buf[si]);
            si += 1;
        }

        let public_key_bytes = public_key.to_array();
        let mut j = 0;
        while j < public_key_bytes.len() {
            data.push_back(public_key_bytes[j]);
            j += 1;
        }

        let nonce_be = nonce.to_be_bytes();
        let mut k = 0;
        while k < nonce_be.len() {
            data.push_back(nonce_be[k]);
            k += 1;
        }

        let expiry_be = expiry.to_be_bytes();
        let mut m = 0;
        while m < expiry_be.len() {
            data.push_back(expiry_be[m]);
            m += 1;
        }

        let digest: BytesN<32> = env.crypto().sha256(&data).into();
        let digest_bytes = digest.to_array();
        let mut combined = [0u8; 64];
        let mut n = 0;
        while n < 32 {
            combined[n] = digest_bytes[n];
            combined[n + 32] = digest_bytes[n];
            n += 1;
        }
        BytesN::from_array(env, &combined)
    }

    #[test]
    fn test_register_signer_verify_and_submit_health_signed() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let signer_id = String::from_str(&env, "oracle1");
        let public_key = BytesN::from_array(&env, &[3u8; 32]);
        client.register_signer(&admin, &signer_id, &public_key);
        client.set_signature_threshold(&admin, &1);

        let asset = String::from_str(&env, "USDC");
        client.register_asset(&admin, &asset);

        let health_score = 90u32;
        let liquidity_score = 90u32;
        let price_stability_score = 88u32;
        let bridge_uptime_score = 92u32;

        let message = build_health_message(
            &env,
            &asset,
            health_score,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
        );

        let signature = sign_message_with_mock_ed25519(
            &env,
            &message,
            &signer_id,
            &public_key,
            1,
            env.ledger().timestamp() + 10,
        );

        let signer_sig = SignerSignature {
            signer_id: signer_id.clone(),
            signature,
            nonce: 1,
            expiry: env.ledger().timestamp() + 10,
        };

        client.submit_health_signed(
            &admin,
            &asset,
            &health_score,
            &liquidity_score,
            &price_stability_score,
            &bridge_uptime_score,
            &signer_sig,
        );

        let stored = client.get_health(&asset).unwrap();
        assert_eq!(stored.health_score, health_score);
    }

    #[test]
    #[should_panic(expected = "nonce replay detected")]
    fn test_submit_health_signed_replay_attack_prevention() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let signer_id = String::from_str(&env, "oracle2");
        let public_key = BytesN::from_array(&env, &[4u8; 32]);
        client.register_signer(&admin, &signer_id, &public_key);
        client.set_signature_threshold(&admin, &1);

        let asset = String::from_str(&env, "USDC");
        client.register_asset(&admin, &asset);

        let health_score = 80u32;
        let liquidity_score = 80u32;
        let price_stability_score = 80u32;
        let bridge_uptime_score = 80u32;

        let message = build_health_message(
            &env,
            &asset,
            health_score,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
        );

        let signature = sign_message_with_mock_ed25519(
            &env,
            &message,
            &signer_id,
            &public_key,
            2,
            env.ledger().timestamp() + 10,
        );

        let signer_sig = SignerSignature {
            signer_id: signer_id.clone(),
            signature,
            nonce: 2,
            expiry: env.ledger().timestamp() + 10,
        };

        // First call succeeds
        client.submit_health_signed(
            &admin,
            &asset,
            &health_score,
            &liquidity_score,
            &price_stability_score,
            &bridge_uptime_score,
            &signer_sig,
        );

        // Second call with same nonce should panic replay check above
        client.submit_health_signed(
            &admin,
            &asset,
            &health_score,
            &liquidity_score,
            &price_stability_score,
            &bridge_uptime_score,
            &signer_sig,
        );
    }

    #[test]
    #[should_panic(expected = "signature has expired")]
    fn test_submit_health_signed_expiry_check() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let signer_id = String::from_str(&env, "oracle3");
        let public_key = BytesN::from_array(&env, &[5u8; 32]);
        client.register_signer(&admin, &signer_id, &public_key);
        client.set_signature_threshold(&admin, &1);

        let asset = String::from_str(&env, "USDC");
        client.register_asset(&admin, &asset);

        let health_score = 75u32;
        let liquidity_score = 75u32;
        let price_stability_score = 75u32;
        let bridge_uptime_score = 75u32;

        let message = build_health_message(
            &env,
            &asset,
            health_score,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
        );

        let signature = sign_message_with_mock_ed25519(
            &env,
            &message,
            &signer_id,
            &public_key,
            3,
            env.ledger().timestamp() - 1,
        );

        let signer_sig = SignerSignature {
            signer_id,
            signature,
            nonce: 3,
            expiry: env.ledger().timestamp() - 1,
        };

        client.submit_health_signed(
            &admin,
            &asset,
            &health_score,
            &liquidity_score,
            &price_stability_score,
            &bridge_uptime_score,
            &signer_sig,
        );
    }

    #[test]
    fn test_check_price_deviation_emits_event_on_alert() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "Stellar DEX");

        client.register_asset(&admin, &asset);
        client.submit_price(&admin, &asset, &1_000_000, &source);

        // 15 % deviation → High severity triggers event
        let result = client.check_price_deviation(&asset, &1_150_000);
        assert!(result.is_some());

        assert_has_event(&env, &client.address, symbol_short!("price_dev"));
    }

    #[test]
    fn test_record_supply_mismatch_emits_event() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let bridge = String::from_str(&env, "CIRCLE_USDC");
        let asset = String::from_str(&env, "USDC");

        client.record_supply_mismatch(&bridge, &asset, &1_000_000, &1_002_000);

        assert_has_event(&env, &client.address, symbol_short!("supply_mm"));
    }

    #[test]
    fn test_record_liquidity_depth_emits_event() {
        let (env, client, _admin) = setup();
        let pair = String::from_str(&env, "USDC/XLM");

        env.ledger().set_timestamp(1_000_000);
        client.record_liquidity_depth(
            &pair,
            &1_500_000,
            &100_000,
            &300_000,
            &600_000,
            &1_200_000,
            &liquidity_sources(&env, &["StellarX", "Phoenix"]),
        );

        assert_has_event(&env, &client.address, symbol_short!("liq_chg"));
    }

    #[test]
    fn test_grant_role_emits_event() {
        let (env, client, admin) = setup();
        let submitter = Address::generate(&env);

        client.grant_role(&admin, &submitter, &AdminRole::HealthSubmitter);

        assert_has_event(&env, &client.address, symbol_short!("role_grnt"));
    }

    #[test]
    fn test_revoke_role_emits_event() {
        let (env, client, admin) = setup();
        let submitter = Address::generate(&env);

        client.grant_role(&admin, &submitter, &AdminRole::HealthSubmitter);
        client.revoke_role(&admin, &submitter, &AdminRole::HealthSubmitter);

        assert_has_event(&env, &client.address, symbol_short!("role_revk"));
    }

    #[test]
    fn test_set_deviation_threshold_emits_event() {
        let (env, client, _admin) = setup();
        let asset = String::from_str(&env, "USDC");

        client.set_deviation_threshold(&asset, &50, &100, &200);

        assert_has_event(&env, &client.address, symbol_short!("thresh_up"));
    }

    #[test]
    fn test_set_mismatch_threshold_emits_event() {
        let (env, client, _admin) = setup();

        client.set_mismatch_threshold(&5);

        assert_has_event(&env, &client.address, symbol_short!("thresh_up"));
    }

    // -----------------------------------------------------------------------
    // Contract upgrade tests (issue #98)
    // -----------------------------------------------------------------------

    #[test]
    fn test_propose_upgrade_sets_pending_with_timelock() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000);

        let new_hash = BytesN::from_array(&env, &[7u8; 32]);
        let proposal_id = client.propose_upgrade(&admin, &new_hash, &false, &None, &None);

        assert_eq!(proposal_id, 1);
        let pending = client.get_pending_upgrade().unwrap();
        assert_eq!(pending.proposal_id, 1);
        assert_eq!(pending.new_wasm_hash, new_hash);
        assert_eq!(pending.execute_after, 1_000 + 172_800);
        assert_eq!(pending.required_approvals, 1);
        assert_eq!(pending.approvals.len(), 1);
        assert_eq!(pending.approvals.get(0).unwrap(), admin);

        assert_has_event(&env, &client.address, symbol_short!("up_prop"));
    }

    #[test]
    #[should_panic(expected = "upgrade timelock has not elapsed")]
    fn test_execute_upgrade_enforces_timelock() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(2_000);

        let new_hash = BytesN::from_array(&env, &[8u8; 32]);
        client.propose_upgrade(&admin, &new_hash, &false, &None, &None);
        client.execute_upgrade(&admin, &1);
    }

    #[test]
    #[should_panic(expected = "insufficient governance approvals")]
    fn test_emergency_upgrade_requires_higher_approval_threshold() {
        let (env, client, admin) = setup();
        let super_admin = Address::generate(&env);
        client.grant_role(&admin, &super_admin, &AdminRole::SuperAdmin);

        env.ledger().set_timestamp(3_000);
        let new_hash = BytesN::from_array(&env, &[9u8; 32]);
        client.propose_upgrade(&admin, &new_hash, &true, &None, &None);

        let pending = client.get_pending_upgrade().unwrap();
        assert_eq!(pending.required_approvals, 2);
        assert_eq!(pending.execute_after, 3_000);

        // Only proposer approval exists at this point.
        client.execute_upgrade(&admin, &1);
    }

    #[test]
    fn test_emergency_upgrade_executes_after_additional_approval() {
        let (env, client, admin) = setup();
        let super_admin = Address::generate(&env);
        client.grant_role(&admin, &super_admin, &AdminRole::SuperAdmin);

        env.ledger().set_timestamp(4_000);
        let new_hash = BytesN::from_array(&env, &[10u8; 32]);
        client.propose_upgrade(&admin, &new_hash, &true, &None, &None);
        client.approve_upgrade(&super_admin, &1);
        client.execute_upgrade(&admin, &1);

        assert!(client.get_pending_upgrade().is_none());
        assert_eq!(client.get_contract_version(), 2);
        assert_eq!(client.get_current_wasm_hash().unwrap(), new_hash);

        let history = client.get_upgrade_history();
        assert_eq!(history.len(), 1);
        let record = history.get(0).unwrap();
        assert_eq!(record.proposal_id, 1);
        assert!(record.emergency);
        assert!(!record.is_rollback);

        assert_has_event(&env, &client.address, symbol_short!("up_appr"));
        assert_has_event(&env, &client.address, symbol_short!("up_exec"));
    }

    #[test]
    fn test_cancel_upgrade_clears_pending_proposal() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(5_000);

        let new_hash = BytesN::from_array(&env, &[11u8; 32]);
        client.propose_upgrade(&admin, &new_hash, &false, &None, &None);
        client.cancel_upgrade(&admin, &1, &String::from_str(&env, "no longer needed"));

        assert!(client.get_pending_upgrade().is_none());
        assert_has_event(&env, &client.address, symbol_short!("up_cncl"));
    }

    #[test]
    fn test_propose_rollback_uses_tracked_target_hash() {
        let (env, client, admin) = setup();

        let first_hash = BytesN::from_array(&env, &[12u8; 32]);
        let second_hash = BytesN::from_array(&env, &[13u8; 32]);

        env.ledger().set_timestamp(10_000);
        client.propose_upgrade(&admin, &first_hash, &false, &None, &None);
        env.ledger().set_timestamp(10_000 + 172_800);
        client.execute_upgrade(&admin, &1);

        env.ledger().set_timestamp(200_000);
        client.propose_upgrade(&admin, &second_hash, &false, &None, &None);
        env.ledger().set_timestamp(200_000 + 172_800);
        client.execute_upgrade(&admin, &2);

        assert_eq!(client.get_rollback_target().unwrap(), first_hash);

        let rollback_id = client.propose_rollback(&admin, &false, &None, &None);
        assert_eq!(rollback_id, 3);
        let pending = client.get_pending_upgrade().unwrap();
        assert!(pending.is_rollback);
        assert_eq!(pending.new_wasm_hash, first_hash);
    }

    // -----------------------------------------------------------------------
    // Original tests (kept for backwards compatibility)
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeWatchContract);
        let client = BridgeWatchContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let assets = client.get_monitored_assets();
        assert_eq!(assets.len(), 0);
    }

    #[test]
    fn test_register_and_get_assets() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeWatchContract);
        let client = BridgeWatchContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);

        let assets = client.get_monitored_assets();
        assert_eq!(assets.len(), 1);

        let health = client.get_health(&usdc).unwrap();
        assert!(health.active);
        assert!(!health.paused);
    }

    #[test]
    fn test_submit_and_get_health() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeWatchContract);
        let client = BridgeWatchContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);
        client.submit_health(&admin, &usdc, &85, &90, &80, &85);

        let health = client.get_health(&usdc);
        assert!(health.is_some());
        assert_eq!(health.unwrap().health_score, 85);
    }

    // -----------------------------------------------------------------------
    // Batch health submission tests (issue #21)
    // -----------------------------------------------------------------------

    #[test]
    fn test_submit_health_batch_stores_all_records() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let assets = ["USDC", "EURC", "PYUSD"];
        for code in assets.iter() {
            client.register_asset(&admin, &String::from_str(&env, code));
        }
        let mut batch = Vec::new(&env);
        for (i, code) in assets.iter().enumerate() {
            batch.push_back(HealthScoreBatch {
                asset_code: String::from_str(&env, code),
                health_score: 80 + i as u32,
                liquidity_score: 75,
                price_stability_score: 78,
                bridge_uptime_score: 82,
            });
        }

        client.submit_health_batch(&admin, &batch);

        for (i, code) in assets.iter().enumerate() {
            let health = client.get_health(&String::from_str(&env, code)).unwrap();
            assert_eq!(health.health_score, 80 + i as u32);
            assert_eq!(health.timestamp, 1_000_000);
        }
    }

    #[test]
    fn test_submit_health_batch_consistent_timestamps() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(5_000_000);

        client.register_asset(&admin, &String::from_str(&env, "USDC"));
        client.register_asset(&admin, &String::from_str(&env, "EURC"));

        let mut batch = Vec::new(&env);
        batch.push_back(HealthScoreBatch {
            asset_code: String::from_str(&env, "USDC"),
            health_score: 90,
            liquidity_score: 90,
            price_stability_score: 90,
            bridge_uptime_score: 90,
        });
        batch.push_back(HealthScoreBatch {
            asset_code: String::from_str(&env, "EURC"),
            health_score: 70,
            liquidity_score: 70,
            price_stability_score: 70,
            bridge_uptime_score: 70,
        });

        client.submit_health_batch(&admin, &batch);

        let usdc = client.get_health(&String::from_str(&env, "USDC")).unwrap();
        let eurc = client.get_health(&String::from_str(&env, "EURC")).unwrap();
        assert_eq!(usdc.timestamp, eurc.timestamp);
        assert_eq!(usdc.timestamp, 5_000_000);
    }

    #[test]
    #[should_panic]
    fn test_submit_health_batch_exceeds_limit() {
        let (env, client, admin) = setup();

        let mut batch = Vec::new(&env);
        for _ in 0..21u32 {
            batch.push_back(HealthScoreBatch {
                asset_code: String::from_str(&env, "USDC"),
                health_score: 85,
                liquidity_score: 85,
                price_stability_score: 85,
                bridge_uptime_score: 85,
            });
        }
        client.submit_health_batch(&admin, &batch);
    }

    // -----------------------------------------------------------------------
    // Multi-DEX liquidity depth tracking tests (issue #31)
    // -----------------------------------------------------------------------

    #[test]
    fn test_record_liquidity_depth_stores_current_and_history() {
        let (env, client, _admin) = setup();
        let pair = String::from_str(&env, "USDC/XLM");

        env.ledger().set_timestamp(1_000_000);
        client.record_liquidity_depth(
            &pair,
            &1_500_000,
            &100_000,
            &300_000,
            &600_000,
            &1_200_000,
            &liquidity_sources(&env, &["StellarX", "Phoenix"]),
        );

        let current = client.get_aggregated_liquidity_depth(&pair).unwrap();
        assert_eq!(current.asset_pair, pair.clone());
        assert_eq!(current.total_liquidity, 1_500_000);
        assert_eq!(current.depth_0_1_pct, 100_000);
        assert_eq!(current.depth_5_pct, 1_200_000);
        assert_eq!(current.sources.len(), 2);
        assert_eq!(current.timestamp, 1_000_000);

        let history = client.get_liquidity_history(&pair, &0, &2_000_000);
        assert_eq!(history.len(), 1);
        assert_eq!(history.get(0).unwrap(), current);
    }

    #[test]
    fn test_get_liquidity_history_filters_by_time_range() {
        let (env, client, _admin) = setup();
        let pair = String::from_str(&env, "EURC/XLM");

        for i in 0..3u64 {
            env.ledger().set_timestamp(1_000_000 + i * 3_600);
            client.record_liquidity_depth(
                &pair,
                &(2_000_000 + i as i128 * 100_000),
                &(100_000 + i as i128 * 10_000),
                &(300_000 + i as i128 * 10_000),
                &(600_000 + i as i128 * 10_000),
                &(1_500_000 + i as i128 * 10_000),
                &liquidity_sources(&env, &["SDEX", "Soroswap"]),
            );
        }

        let history = client.get_liquidity_history(&pair, &1_003_600, &1_007_200);
        assert_eq!(history.len(), 2);
        assert_eq!(history.get(0).unwrap().timestamp, 1_003_600);
        assert_eq!(history.get(1).unwrap().timestamp, 1_007_200);
    }

    #[test]
    fn test_get_all_liquidity_depths_returns_latest_per_pair() {
        let (env, client, _admin) = setup();
        let usdc_xlm = String::from_str(&env, "USDC/XLM");
        let fobxx_usdc = String::from_str(&env, "FOBXX/USDC");

        env.ledger().set_timestamp(1_000_000);
        client.record_liquidity_depth(
            &usdc_xlm,
            &1_000_000,
            &100_000,
            &250_000,
            &500_000,
            &900_000,
            &liquidity_sources(&env, &["StellarX"]),
        );

        env.ledger().set_timestamp(1_100_000);
        client.record_liquidity_depth(
            &fobxx_usdc,
            &4_000_000,
            &300_000,
            &900_000,
            &1_500_000,
            &3_000_000,
            &liquidity_sources(&env, &["SDEX", "LumenSwap"]),
        );

        let all_depths = client.get_all_liquidity_depths();
        assert_eq!(all_depths.len(), 2);
        assert_eq!(all_depths.get(0).unwrap().asset_pair, usdc_xlm);
        assert_eq!(all_depths.get(1).unwrap().asset_pair, fobxx_usdc);
    }

    #[test]
    #[should_panic]
    fn test_record_liquidity_depth_rejects_unsupported_pair() {
        let (env, client, _admin) = setup();
        let pair = String::from_str(&env, "BTC/XLM");

        env.ledger().set_timestamp(1_000_000);
        client.record_liquidity_depth(
            &pair,
            &1_000_000,
            &100_000,
            &200_000,
            &300_000,
            &400_000,
            &liquidity_sources(&env, &["Phoenix"]),
        );
    }

    #[test]
    #[should_panic]
    fn test_record_liquidity_depth_rejects_invalid_depth_values() {
        let (env, client, _admin) = setup();
        let pair = String::from_str(&env, "PYUSD/XLM");

        env.ledger().set_timestamp(1_000_000);
        client.record_liquidity_depth(
            &pair,
            &500_000,
            &100_000,
            &250_000,
            &400_000,
            &600_000,
            &liquidity_sources(&env, &["Phoenix"]),
        );
    }

    // -----------------------------------------------------------------------
    // Multi-admin role management tests (issue #25)
    // -----------------------------------------------------------------------

    #[test]
    fn test_grant_and_check_role() {
        let (env, client, admin) = setup();
        let submitter = Address::generate(&env);

        client.grant_role(&admin, &submitter, &AdminRole::HealthSubmitter);

        assert!(client.has_role(&submitter, &AdminRole::HealthSubmitter));
        assert!(!client.has_role(&submitter, &AdminRole::PriceSubmitter));
    }

    #[test]
    fn test_role_holder_can_call_permitted_function() {
        let (env, client, admin) = setup();
        let submitter = Address::generate(&env);

        client.grant_role(&admin, &submitter, &AdminRole::HealthSubmitter);

        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);
        client.submit_health(&submitter, &usdc, &80, &80, &80, &80);

        let health = client.get_health(&usdc).unwrap();
        assert_eq!(health.health_score, 80);
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_address_cannot_submit_health() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);

        let usdc = String::from_str(&env, "USDC");
        client.submit_health(&stranger, &usdc, &80, &80, &80, &80);
    }

    #[test]
    fn test_revoke_role_removes_access() {
        let (env, client, admin) = setup();
        let submitter = Address::generate(&env);

        client.grant_role(&admin, &submitter, &AdminRole::HealthSubmitter);
        client.revoke_role(&admin, &submitter, &AdminRole::HealthSubmitter);

        assert!(!client.has_role(&submitter, &AdminRole::HealthSubmitter));
    }

    #[test]
    fn test_get_admin_roles_returns_all_assignments() {
        let (env, client, admin) = setup();
        let addr_a = Address::generate(&env);
        let addr_b = Address::generate(&env);

        client.grant_role(&admin, &addr_a, &AdminRole::PriceSubmitter);
        client.grant_role(&admin, &addr_b, &AdminRole::AssetManager);

        let roles = client.get_admin_roles();
        assert_eq!(roles.len(), 2);
    }

    #[test]
    fn test_super_admin_can_grant_roles() {
        let (env, client, admin) = setup();
        let super_admin = Address::generate(&env);
        let new_submitter = Address::generate(&env);

        client.grant_role(&admin, &super_admin, &AdminRole::SuperAdmin);
        client.grant_role(&super_admin, &new_submitter, &AdminRole::PriceSubmitter);

        assert!(client.has_role(&new_submitter, &AdminRole::PriceSubmitter));
    }

    #[test]
    fn test_original_admin_can_call_all_functions() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");

        client.register_asset(&admin, &usdc);
        client.submit_health(&admin, &usdc, &90, &90, &90, &90);
        client.submit_price(&admin, &usdc, &1_000_000, &String::from_str(&env, "DEX"));

        assert_eq!(client.get_monitored_assets().len(), 1);
        assert!(client.get_health(&usdc).is_some());
        assert!(client.get_price(&usdc).is_some());
    }

    // -----------------------------------------------------------------------
    // Asset lifecycle management tests (issue #44)
    // -----------------------------------------------------------------------

    #[test]
    fn test_pause_asset_filters_from_monitored_assets() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");

        client.register_asset(&admin, &usdc);
        client.pause_asset(&admin, &usdc);

        let health = client.get_health(&usdc).unwrap();
        assert!(health.paused);
        assert!(health.active);
        assert_eq!(client.get_monitored_assets().len(), 0);
    }

    #[test]
    fn test_unpause_asset_restores_monitoring() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");

        client.register_asset(&admin, &usdc);
        client.pause_asset(&admin, &usdc);
        client.unpause_asset(&admin, &usdc);

        let health = client.get_health(&usdc).unwrap();
        assert!(!health.paused);
        assert!(health.active);
        assert_eq!(client.get_monitored_assets().len(), 1);
    }

    #[test]
    fn test_deregister_asset_keeps_history_but_hides_asset() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");

        client.register_asset(&admin, &usdc);
        client.submit_health(&admin, &usdc, &91, &88, &87, &89);
        client.deregister_asset(&admin, &usdc);

        let health = client.get_health(&usdc).unwrap();
        assert_eq!(health.health_score, 91);
        assert!(!health.active);
        assert!(!health.paused);
        assert_eq!(client.get_monitored_assets().len(), 0);
    }

    #[test]
    #[should_panic]
    fn test_submit_health_rejected_for_paused_asset() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");

        client.register_asset(&admin, &usdc);
        client.pause_asset(&admin, &usdc);
        client.submit_health(&admin, &usdc, &80, &80, &80, &80);
    }

    #[test]
    #[should_panic]
    fn test_submit_price_rejected_for_deregistered_asset() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");

        client.register_asset(&admin, &usdc);
        client.deregister_asset(&admin, &usdc);
        client.submit_price(&admin, &usdc, &1_000_000, &String::from_str(&env, "DEX"));
    }

    #[test]
    #[should_panic]
    fn test_submit_health_rejected_for_unregistered_asset() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");
        client.submit_health(&admin, &usdc, &80, &80, &80, &80);
    }

    // -----------------------------------------------------------------------
    // Liquidity Pool Monitor tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_record_pool_state_basic() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");

        env.ledger().set_timestamp(1_000_000);

        client.record_pool_state(
            &pool_id,
            &(1_000_000 * liquidity_pool::PRECISION),
            &(5_000_000 * liquidity_pool::PRECISION),
            &(2_000_000 * liquidity_pool::PRECISION),
            &(100_000 * liquidity_pool::PRECISION),
            &(1_000 * liquidity_pool::PRECISION),
            &PoolType::Amm,
        );

        let pools = client.get_registered_pools();
        assert_eq!(pools.len(), 1);
        assert_eq!(pools.get(0).unwrap(), pool_id);
    }

    #[test]
    fn test_record_multiple_pools() {
        let (env, client, _admin) = setup();

        env.ledger().set_timestamp(1_000_000);

        let pool1 = String::from_str(&env, "USDC_XLM");
        let pool2 = String::from_str(&env, "EURC_XLM");
        let pool3 = String::from_str(&env, "PYUSD_XLM");
        let pool4 = String::from_str(&env, "FOBXX_USDC");

        for pool_id in [&pool1, &pool2, &pool3, &pool4] {
            client.record_pool_state(
                pool_id,
                &(1_000_000 * liquidity_pool::PRECISION),
                &(2_000_000 * liquidity_pool::PRECISION),
                &(1_500_000 * liquidity_pool::PRECISION),
                &(50_000 * liquidity_pool::PRECISION),
                &(500 * liquidity_pool::PRECISION),
                &PoolType::Amm,
            );
        }

        let pools = client.get_registered_pools();
        assert_eq!(pools.len(), 4);
    }

    #[test]
    fn test_record_pool_state_does_not_duplicate_registration() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * liquidity_pool::PRECISION),
            &(2_000_000 * liquidity_pool::PRECISION),
            &(1_000_000 * liquidity_pool::PRECISION),
            &(10_000 * liquidity_pool::PRECISION),
            &(100 * liquidity_pool::PRECISION),
            &PoolType::Amm,
        );

        env.ledger().set_timestamp(1_003_600);
        client.record_pool_state(
            &pool_id,
            &(1_100_000 * liquidity_pool::PRECISION),
            &(2_200_000 * liquidity_pool::PRECISION),
            &(1_100_000 * liquidity_pool::PRECISION),
            &(12_000 * liquidity_pool::PRECISION),
            &(120 * liquidity_pool::PRECISION),
            &PoolType::Amm,
        );

        let pools = client.get_registered_pools();
        assert_eq!(pools.len(), 1);
    }

    #[test]
    fn test_get_pool_history() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record 3 snapshots at different timestamps
        for i in 0..3u64 {
            env.ledger().set_timestamp(1_000_000 + i * 3_600);
            client.record_pool_state(
                &pool_id,
                &((1_000_000 + i as i128 * 10_000) * p),
                &((5_000_000 + i as i128 * 50_000) * p),
                &(2_000_000 * p),
                &((100_000 + i as i128 * 1_000) * p),
                &((1_000 + i as i128 * 10) * p),
                &PoolType::Amm,
            );
        }

        // Get all history
        let history = client.get_pool_history(&pool_id, &1_000_000, &1_010_000);
        assert_eq!(history.len(), 3);

        // Get partial range
        let partial = client.get_pool_history(&pool_id, &1_003_600, &1_007_200);
        assert_eq!(partial.len(), 2);
    }

    #[test]
    fn test_get_pool_history_empty() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "NONEXISTENT");

        let history = client.get_pool_history(&pool_id, &0, &9_999_999);
        assert_eq!(history.len(), 0);
    }

    #[test]
    fn test_calculate_pool_metrics_basic() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record snapshots over ~2 hours
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(1_000 * p),
            &PoolType::Amm,
        );

        env.ledger().set_timestamp(1_003_600);
        client.record_pool_state(
            &pool_id,
            &(1_100_000 * p),
            &(5_500_000 * p),
            &(2_100_000 * p),
            &(120_000 * p),
            &(1_200 * p),
            &PoolType::Amm,
        );

        // Calculate metrics over the last 2 hours
        let metrics = client.calculate_pool_metrics(&pool_id, &(2 * liquidity_pool::HOUR_SECS));

        assert_eq!(metrics.data_points, 2);
        assert_eq!(metrics.total_volume, (100_000 + 120_000) * p);
        assert_eq!(metrics.total_fees, (1_000 + 1_200) * p);
        assert!(metrics.avg_depth > 0);
        assert!(metrics.fee_apr > 0);
    }

    #[test]
    fn test_calculate_pool_metrics_no_data() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");

        let metrics = client.calculate_pool_metrics(&pool_id, &liquidity_pool::DAY_SECS);

        assert_eq!(metrics.data_points, 0);
        assert_eq!(metrics.total_volume, 0);
        assert_eq!(metrics.avg_depth, 0);
        assert_eq!(metrics.fee_apr, 0);
    }

    #[test]
    fn test_calculate_pool_metrics_price_change() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Price = reserve_b / reserve_a
        // Snapshot 1: price = 5_000_000 / 1_000_000 = 5.0
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Snapshot 2: price = 6_000_000 / 1_000_000 = 6.0 (20% increase)
        env.ledger().set_timestamp(1_003_600);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(6_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let metrics = client.calculate_pool_metrics(&pool_id, &(2 * liquidity_pool::HOUR_SECS));
        // price_change = (6 - 5) / 5 * PRECISION = 0.2 * PRECISION = 2_000_000
        assert_eq!(metrics.price_change, 2_000_000);
    }

    #[test]
    fn test_calculate_impermanent_loss_no_price_change() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record a pool state with price = 5.0
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Entry price == current price → no IL
        let result = client.calculate_impermanent_loss(
            &pool_id,
            &(5 * p), // entry_price = 5.0
            &(10_000 * p),
        );

        // When price hasn't changed, IL should be 0
        assert_eq!(result.il_percentage, 0);
        assert_eq!(result.entry_price, 5 * p);
        assert_eq!(result.current_price, 5 * p);
    }

    #[test]
    fn test_calculate_impermanent_loss_with_price_change() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Current price = 20.0 (reserve_b/reserve_a = 20_000_000/1_000_000)
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(20_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Entry price was 5.0 → 4x price change
        let result = client.calculate_impermanent_loss(&pool_id, &(5 * p), &(10_000 * p));

        // For a 4x price change, IL ≈ 20%
        // IL = 1 - 2*sqrt(4)/(1+4) = 1 - 4/5 = 0.20 = 20%
        assert!(result.il_percentage > 0);
        assert!(result.current_price == 20 * p);
        assert!(result.hodl_value > result.current_value);
        assert!(result.net_loss > 0);

        // IL should be approximately 20% (2_000_000 in PRECISION units)
        // Allow ±1% tolerance due to integer math
        let expected_il = 2_000_000i128; // 20% * PRECISION
        let tolerance = 100_000i128; // 1%
        assert!(
            (result.il_percentage - expected_il).abs() < tolerance,
            "Expected IL ~20% ({}), got {}",
            expected_il,
            result.il_percentage
        );
    }

    #[test]
    fn test_calculate_impermanent_loss_nonexistent_pool() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "NONEXISTENT");
        let p = liquidity_pool::PRECISION;

        let result = client.calculate_impermanent_loss(&pool_id, &(5 * p), &(10_000 * p));

        assert_eq!(result.il_percentage, 0);
        assert_eq!(result.current_value, 10_000 * p);
        assert_eq!(result.hodl_value, 10_000 * p);
    }

    #[test]
    fn test_calculate_impermanent_loss_zero_entry_price() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let result = client.calculate_impermanent_loss(&pool_id, &0, &(10_000 * p));
        assert_eq!(result.il_percentage, 0);
    }

    #[test]
    fn test_get_liquidity_depth_with_data() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(500_000 * p),
            &(2_500_000 * p),
            &(1_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let depth = client.get_liquidity_depth(&pool_id);
        assert_eq!(depth.pool_id, pool_id);
        assert_eq!(depth.reserve_a, 500_000 * p);
        assert_eq!(depth.reserve_b, 2_500_000 * p);
        assert!(depth.total_value_locked > 0);
        assert!(depth.depth_score <= 100);
        assert_eq!(depth.timestamp, 1_000_000);
    }

    #[test]
    fn test_get_liquidity_depth_no_data() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "NONEXISTENT");

        let depth = client.get_liquidity_depth(&pool_id);
        assert_eq!(depth.reserve_a, 0);
        assert_eq!(depth.reserve_b, 0);
        assert_eq!(depth.total_value_locked, 0);
        assert_eq!(depth.depth_score, 0);
    }

    #[test]
    fn test_get_liquidity_depth_high_tvl() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Very large reserves → score should be 100
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(10_000_000 * p),
            &(50_000_000 * p),
            &(20_000_000 * p),
            &(100_000 * p),
            &(1_000 * p),
            &PoolType::Amm,
        );

        let depth = client.get_liquidity_depth(&pool_id);
        assert_eq!(depth.depth_score, 100);
    }

    #[test]
    fn test_sdex_pool_type() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM_SDEX");
        let p = liquidity_pool::PRECISION;

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(50_000 * p),
            &(500 * p),
            &PoolType::Sdex,
        );

        let history = client.get_pool_history(&pool_id, &0, &2_000_000);
        assert_eq!(history.len(), 1);
        assert_eq!(history.get(0).unwrap().pool_type, PoolType::Sdex);
    }

    #[test]
    fn test_daily_bucket_creation() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Day 1, snapshot 1
        let day1_ts = 86_400u64; // start of day 1
        env.ledger().set_timestamp(day1_ts + 100);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(1_000 * p),
            &PoolType::Amm,
        );

        // Day 1, snapshot 2 (higher price)
        env.ledger().set_timestamp(day1_ts + 3_700);
        client.record_pool_state(
            &pool_id,
            &(900_000 * p),
            &(5_400_000 * p),
            &(2_000_000 * p),
            &(110_000 * p),
            &(1_100 * p),
            &PoolType::Amm,
        );

        let buckets = client.get_daily_history(&pool_id, &0, &200_000);
        assert_eq!(buckets.len(), 1);

        let bucket = buckets.get(0).unwrap();
        assert_eq!(bucket.day_timestamp, day1_ts);
        assert_eq!(bucket.snapshot_count, 2);
        assert_eq!(bucket.total_volume, (100_000 + 110_000) * p);
        assert_eq!(bucket.total_fees, (1_000 + 1_100) * p);
    }

    #[test]
    fn test_daily_bucket_multiple_days() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Day 0
        env.ledger().set_timestamp(100);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(50_000 * p),
            &(500 * p),
            &PoolType::Amm,
        );

        // Day 1
        env.ledger().set_timestamp(86_400 + 100);
        client.record_pool_state(
            &pool_id,
            &(1_100_000 * p),
            &(5_500_000 * p),
            &(2_100_000 * p),
            &(60_000 * p),
            &(600 * p),
            &PoolType::Amm,
        );

        // Day 2
        env.ledger().set_timestamp(2 * 86_400 + 100);
        client.record_pool_state(
            &pool_id,
            &(1_200_000 * p),
            &(6_000_000 * p),
            &(2_200_000 * p),
            &(70_000 * p),
            &(700 * p),
            &PoolType::Amm,
        );

        let buckets = client.get_daily_history(&pool_id, &0, &300_000);
        assert_eq!(buckets.len(), 3);
    }

    #[test]
    fn test_daily_history_empty_pool() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "NONEXISTENT");

        let buckets = client.get_daily_history(&pool_id, &0, &999_999);
        assert_eq!(buckets.len(), 0);
    }

    #[test]
    fn test_daily_bucket_ohlc_prices() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        let day_ts = 86_400u64;

        // Snapshot 1: price = 5_000_000 / 1_000_000 = 5.0
        env.ledger().set_timestamp(day_ts + 100);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Snapshot 2: price = 7_000_000 / 1_000_000 = 7.0 (high)
        env.ledger().set_timestamp(day_ts + 3_700);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(7_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Snapshot 3: price = 4_000_000 / 1_000_000 = 4.0 (low, close)
        env.ledger().set_timestamp(day_ts + 7_300);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(4_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let buckets = client.get_daily_history(&pool_id, &0, &200_000);
        assert_eq!(buckets.len(), 1);

        let bucket = buckets.get(0).unwrap();
        assert_eq!(bucket.open_price, 5 * p);
        assert_eq!(bucket.high_price, 7 * p);
        assert_eq!(bucket.low_price, 4 * p);
        assert_eq!(bucket.close_price, 4 * p);
        assert_eq!(bucket.snapshot_count, 3);
    }

    #[test]
    fn test_pool_history_ordering() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        for i in 0..5u64 {
            env.ledger().set_timestamp(1_000_000 + i * 3_600);
            client.record_pool_state(
                &pool_id,
                &((1_000_000 + i as i128 * 10_000) * p),
                &(5_000_000 * p),
                &(2_000_000 * p),
                &(10_000 * p),
                &(100 * p),
                &PoolType::Amm,
            );
        }

        let history = client.get_pool_history(&pool_id, &0, &2_000_000);
        assert_eq!(history.len(), 5);

        // Verify chronological ordering
        for i in 0..(history.len() - 1) {
            let curr = history.get(i).unwrap();
            let next = history.get(i + 1).unwrap();
            assert!(curr.timestamp <= next.timestamp);
        }
    }

    #[test]
    fn test_metrics_24h_window() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record a snapshot at the start
        env.ledger().set_timestamp(0);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(50_000 * p),
            &(500 * p),
            &PoolType::Amm,
        );

        // Record a snapshot 12h later
        env.ledger().set_timestamp(43_200);
        client.record_pool_state(
            &pool_id,
            &(1_050_000 * p),
            &(5_250_000 * p),
            &(2_050_000 * p),
            &(55_000 * p),
            &(550 * p),
            &PoolType::Amm,
        );

        // Now calculate 24h metrics
        let metrics = client.calculate_pool_metrics(&pool_id, &liquidity_pool::DAY_SECS);
        assert_eq!(metrics.data_points, 2);
        assert!(metrics.total_volume > 0);
    }

    #[test]
    fn test_metrics_7d_window() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record snapshots across 7 days
        for day in 0..7u64 {
            env.ledger()
                .set_timestamp(day * liquidity_pool::DAY_SECS + 100);
            client.record_pool_state(
                &pool_id,
                &((1_000_000 + day as i128 * 10_000) * p),
                &((5_000_000 + day as i128 * 50_000) * p),
                &(2_000_000 * p),
                &((50_000 + day as i128 * 5_000) * p),
                &((500 + day as i128 * 50) * p),
                &PoolType::Amm,
            );
        }

        let metrics = client.calculate_pool_metrics(&pool_id, &liquidity_pool::WEEK_SECS);
        assert_eq!(metrics.data_points, 7);
        assert!(metrics.avg_depth > 0);
    }

    #[test]
    fn test_impermanent_loss_small_price_change() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Current price = 5.5 (10% increase from 5.0)
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_500_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let result = client.calculate_impermanent_loss(
            &pool_id,
            &(5 * p), // entry at 5.0
            &(10_000 * p),
        );

        // For 10% price change (ratio = 1.1), IL is very small (~0.023%)
        assert!(result.il_percentage >= 0);
        assert!(result.il_percentage < 500_000); // < 5%
    }

    #[test]
    fn test_multiple_pool_types_metrics() {
        let (env, client, _admin) = setup();
        let p = liquidity_pool::PRECISION;

        let amm_pool = String::from_str(&env, "USDC_XLM_AMM");
        let sdex_pool = String::from_str(&env, "USDC_XLM_SDEX");

        env.ledger().set_timestamp(1_000_000);

        client.record_pool_state(
            &amm_pool,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(1_000 * p),
            &PoolType::Amm,
        );

        client.record_pool_state(
            &sdex_pool,
            &(800_000 * p),
            &(4_000_000 * p),
            &(1_600_000 * p),
            &(80_000 * p),
            &(800 * p),
            &PoolType::Sdex,
        );

        let amm_depth = client.get_liquidity_depth(&amm_pool);
        let sdex_depth = client.get_liquidity_depth(&sdex_pool);

        assert!(amm_depth.total_value_locked > sdex_depth.total_value_locked);
    }

    #[test]
    fn test_zero_reserves_handling() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "EMPTY_POOL");
        let _p = liquidity_pool::PRECISION;

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(&pool_id, &0, &0, &0, &0, &0, &PoolType::Amm);

        let depth = client.get_liquidity_depth(&pool_id);
        assert_eq!(depth.depth_score, 0);
        assert_eq!(depth.total_value_locked, 0);

        let metrics = client.calculate_pool_metrics(&pool_id, &liquidity_pool::DAY_SECS);
        assert_eq!(metrics.total_volume, 0);
    }

    #[test]
    fn test_phase1_asset_pairs() {
        let (env, client, _admin) = setup();
        let p = liquidity_pool::PRECISION;

        let pairs = ["USDC_XLM", "EURC_XLM", "PYUSD_XLM", "FOBXX_USDC"];

        env.ledger().set_timestamp(1_000_000);

        for pair_str in pairs.iter() {
            let pool_id = String::from_str(&env, pair_str);
            client.record_pool_state(
                &pool_id,
                &(1_000_000 * p),
                &(5_000_000 * p),
                &(2_000_000 * p),
                &(50_000 * p),
                &(500 * p),
                &PoolType::Amm,
            );
        }

        let pools = client.get_registered_pools();
        assert_eq!(pools.len(), 4);

        // Verify all pools have valid depth
        for pair_str in pairs.iter() {
            let pool_id = String::from_str(&env, pair_str);
            let depth = client.get_liquidity_depth(&pool_id);
            assert!(depth.total_value_locked > 0);
        }
    }

    #[test]
    fn test_fee_apr_calculation() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record two snapshots 1 day apart
        env.ledger().set_timestamp(0);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(10_000 * p), // 10k fees
            &PoolType::Amm,
        );

        env.ledger().set_timestamp(liquidity_pool::DAY_SECS);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(10_000 * p), // 10k fees
            &PoolType::Amm,
        );

        let metrics = client.calculate_pool_metrics(&pool_id, &(2 * liquidity_pool::DAY_SECS));
        assert!(metrics.fee_apr > 0, "Fee APR should be positive");
    }

    #[test]
    fn test_snapshot_ring_buffer_wrapping() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // We won't write MAX_SNAPSHOTS entries in a test (too expensive),
        // but we can verify the ring buffer logic with a smaller number.
        let num_snapshots = 10u64;

        for i in 0..num_snapshots {
            env.ledger().set_timestamp(1_000_000 + i * 3_600);
            client.record_pool_state(
                &pool_id,
                &((1_000_000 + i as i128 * 1_000) * p),
                &((5_000_000 + i as i128 * 5_000) * p),
                &(2_000_000 * p),
                &(10_000 * p),
                &(100 * p),
                &PoolType::Amm,
            );
        }

        let history = client.get_pool_history(&pool_id, &0, &2_000_000);
        assert_eq!(history.len(), num_snapshots as u32);
    }

    #[test]
    fn test_get_pool_history_boundary_timestamps() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Exact timestamp matches
        env.ledger().set_timestamp(1_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        env.ledger().set_timestamp(2_000);
        client.record_pool_state(
            &pool_id,
            &(1_100_000 * p),
            &(5_500_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Exact from=1_000, to=2_000 should include both
        let history = client.get_pool_history(&pool_id, &1_000, &2_000);
        assert_eq!(history.len(), 2);

        // from=1_001 should exclude the first
        let history2 = client.get_pool_history(&pool_id, &1_001, &2_000);
        assert_eq!(history2.len(), 1);

        // to=1_999 should exclude the second
        let history3 = client.get_pool_history(&pool_id, &1_000, &1_999);
        assert_eq!(history3.len(), 1);
    }

    #[test]
    fn test_price_computation_from_reserves() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // reserve_a = 2_000_000, reserve_b = 10_000_000 → price = 5.0
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(2_000_000 * p),
            &(10_000_000 * p),
            &(4_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let history = client.get_pool_history(&pool_id, &0, &2_000_000);
        assert_eq!(history.len(), 1);

        let snap = history.get(0).unwrap();
        // price = (10_000_000 * P * P) / (2_000_000 * P) = 5 * P
        assert_eq!(snap.price, 5 * p);
    }

    #[test]
    fn test_daily_history_range_filter() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Create buckets for day 0, 1, 2
        for day in 0..3u64 {
            env.ledger()
                .set_timestamp(day * liquidity_pool::DAY_SECS + 100);
            client.record_pool_state(
                &pool_id,
                &(1_000_000 * p),
                &(5_000_000 * p),
                &(2_000_000 * p),
                &(10_000 * p),
                &(100 * p),
                &PoolType::Amm,
            );
        }

        // Query only day 1
        let buckets = client.get_daily_history(
            &pool_id,
            &liquidity_pool::DAY_SECS,
            &(2 * liquidity_pool::DAY_SECS - 1),
        );
        assert_eq!(buckets.len(), 1);
    }

    // -----------------------------------------------------------------------
    // Automated health score calculation tests (issue #26)
    // -----------------------------------------------------------------------

    #[test]
    fn test_get_health_weights_returns_defaults() {
        let (_env, client, _admin) = setup();
        let weights = client.get_health_weights();
        assert_eq!(weights.liquidity_weight, 30);
        assert_eq!(weights.price_stability_weight, 40);
        assert_eq!(weights.bridge_uptime_weight, 30);
        assert_eq!(weights.version, 1);
    }

    #[test]
    fn test_set_health_weights_stores_custom_weights() {
        let (_env, client, admin) = setup();
        client.set_health_weights(&admin, &20, &50, &30, &2);

        let weights = client.get_health_weights();
        assert_eq!(weights.liquidity_weight, 20);
        assert_eq!(weights.price_stability_weight, 50);
        assert_eq!(weights.bridge_uptime_weight, 30);
        assert_eq!(weights.version, 2);
    }

    #[test]
    #[should_panic]
    fn test_set_health_weights_rejects_non_admin() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);
        client.set_health_weights(&stranger, &30, &40, &30, &1);
    }

    #[test]
    #[should_panic]
    fn test_set_health_weights_rejects_invalid_sum() {
        let (_env, client, admin) = setup();
        // Weights sum to 90, not 100
        client.set_health_weights(&admin, &30, &30, &30, &1);
    }

    #[test]
    #[should_panic]
    fn test_set_health_weights_rejects_weight_over_100() {
        let (_env, client, admin) = setup();
        client.set_health_weights(&admin, &110, &0, &0, &1);
    }

    #[test]
    #[should_panic]
    fn test_set_health_weights_rejects_zero_version() {
        let (_env, client, admin) = setup();
        client.set_health_weights(&admin, &30, &40, &30, &0);
    }

    #[test]
    fn test_calculate_health_score_default_weights() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        // liq=80, stab=90, up=70 → (80*30 + 90*40 + 70*30) / 100 = (2400+3600+2100)/100 = 81
        let result = client.calculate_health_score(&80, &90, &70);
        assert_eq!(result.composite_score, 81);
        assert_eq!(result.liquidity_score, 80);
        assert_eq!(result.price_stability_score, 90);
        assert_eq!(result.bridge_uptime_score, 70);
        assert_eq!(result.weights.liquidity_weight, 30);
        assert_eq!(result.weights.price_stability_weight, 40);
        assert_eq!(result.weights.bridge_uptime_weight, 30);
        assert_eq!(result.timestamp, 1_000_000);
    }

    #[test]
    fn test_calculate_health_score_custom_weights() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(2_000_000);

        // Set custom weights: 50/30/20
        client.set_health_weights(&admin, &50, &30, &20, &2);

        // liq=60, stab=80, up=100 → (60*50 + 80*30 + 100*20) / 100 = (3000+2400+2000)/100 = 74
        let result = client.calculate_health_score(&60, &80, &100);
        assert_eq!(result.composite_score, 74);
        assert_eq!(result.weights.version, 2);
    }

    #[test]
    fn test_calculate_health_score_all_perfect() {
        let (_env, client, _admin) = setup();

        let result = client.calculate_health_score(&100, &100, &100);
        assert_eq!(result.composite_score, 100);
    }

    #[test]
    fn test_calculate_health_score_all_zero() {
        let (_env, client, _admin) = setup();

        let result = client.calculate_health_score(&0, &0, &0);
        assert_eq!(result.composite_score, 0);
    }

    #[test]
    #[should_panic]
    fn test_calculate_health_score_rejects_score_over_100() {
        let (_env, client, _admin) = setup();
        client.calculate_health_score(&101, &90, &80);
    }

    #[test]
    fn test_submit_calculated_health_stores_records() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(3_000_000);

        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);

        client.submit_calculated_health(&admin, &usdc, &80, &90, &70, &None);

        // Check AssetHealth record
        let health = client.get_health(&usdc).unwrap();
        // (80*30 + 90*40 + 70*30) / 100 = 81
        assert_eq!(health.health_score, 81);
        assert_eq!(health.liquidity_score, 80);
        assert_eq!(health.price_stability_score, 90);
        assert_eq!(health.bridge_uptime_score, 70);
        assert_eq!(health.timestamp, 3_000_000);

        // Check HealthScoreResult record
        let result = client.get_health_score_result(&usdc).unwrap();
        assert_eq!(result.composite_score, 81);
        assert_eq!(result.weights.liquidity_weight, 30);
        assert_eq!(result.timestamp, 3_000_000);
    }

    #[test]
    fn test_submit_calculated_health_with_manual_override() {
        let (env, client, admin) = setup();
        env.ledger().set_timestamp(4_000_000);

        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);

        // Override with manual score of 95
        client.submit_calculated_health(&admin, &usdc, &80, &90, &70, &Some(95));

        // AssetHealth should have the overridden score
        let health = client.get_health(&usdc).unwrap();
        assert_eq!(health.health_score, 95);

        // HealthScoreResult should still have the calculated composite
        let result = client.get_health_score_result(&usdc).unwrap();
        assert_eq!(result.composite_score, 81);
    }

    #[test]
    #[should_panic]
    fn test_submit_calculated_health_rejects_override_over_100() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);
        client.submit_calculated_health(&admin, &usdc, &80, &90, &70, &Some(101));
    }

    #[test]
    #[should_panic]
    fn test_submit_calculated_health_rejects_unregistered_asset() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");
        client.submit_calculated_health(&admin, &usdc, &80, &90, &70, &None);
    }

    #[test]
    #[should_panic]
    fn test_submit_calculated_health_rejects_paused_asset() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);
        client.pause_asset(&admin, &usdc);
        client.submit_calculated_health(&admin, &usdc, &80, &90, &70, &None);
    }

    #[test]
    #[should_panic]
    fn test_submit_calculated_health_rejects_unauthorized() {
        let (env, client, admin) = setup();
        let stranger = Address::generate(&env);
        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);
        client.submit_calculated_health(&stranger, &usdc, &80, &90, &70, &None);
    }

    #[test]
    fn test_submit_calculated_health_with_role() {
        let (env, client, admin) = setup();
        let submitter = Address::generate(&env);
        client.grant_role(&admin, &submitter, &AdminRole::HealthSubmitter);

        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);

        client.submit_calculated_health(&submitter, &usdc, &75, &85, &95, &None);

        let health = client.get_health(&usdc).unwrap();
        // (75*30 + 85*40 + 95*30) / 100 = (2250+3400+2850)/100 = 85
        assert_eq!(health.health_score, 85);
    }

    #[test]
    fn test_set_health_weights_by_super_admin() {
        let (env, client, admin) = setup();
        let super_admin = Address::generate(&env);
        client.grant_role(&admin, &super_admin, &AdminRole::SuperAdmin);

        client.set_health_weights(&super_admin, &40, &40, &20, &3);

        let weights = client.get_health_weights();
        assert_eq!(weights.liquidity_weight, 40);
        assert_eq!(weights.price_stability_weight, 40);
        assert_eq!(weights.bridge_uptime_weight, 20);
        assert_eq!(weights.version, 3);
    }

    #[test]
    fn test_get_health_score_result_returns_none_for_unknown_asset() {
        let (env, client, _admin) = setup();
        let unknown = String::from_str(&env, "UNKNOWN");
        assert!(client.get_health_score_result(&unknown).is_none());
    }

    #[test]
    fn test_submit_calculated_health_updates_on_second_call() {
        let (env, client, admin) = setup();
        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&admin, &usdc);

        env.ledger().set_timestamp(1_000_000);
        client.submit_calculated_health(&admin, &usdc, &80, &90, &70, &None);
        let first = client.get_health(&usdc).unwrap();
        assert_eq!(first.health_score, 81);

        env.ledger().set_timestamp(2_000_000);
        client.submit_calculated_health(&admin, &usdc, &60, &70, &50, &None);
        let second = client.get_health(&usdc).unwrap();
        // (60*30 + 70*40 + 50*30) / 100 = (1800+2800+1500)/100 = 61
        assert_eq!(second.health_score, 61);
        assert_eq!(second.timestamp, 2_000_000);
    }

    #[test]
    fn test_calculate_health_score_edge_weights() {
        let (_env, client, admin) = setup();

        // Set weights to 0/100/0 — only price stability matters
        client.set_health_weights(&admin, &0, &100, &0, &4);

        let result = client.calculate_health_score(&0, &88, &0);
        assert_eq!(result.composite_score, 88);
    }

    // -----------------------------------------------------------------------
    // ACL tests (issue #101)
    // -----------------------------------------------------------------------

    #[test]
    fn test_acl_grant_and_has_role() {
        let (env, client, admin) = setup();
        let operator = Address::generate(&env);

        assert!(!client.acl_has_role(&operator, &acl::Role::Operator));
        client.acl_grant_role(&admin, &operator, &acl::Role::Operator, &0);
        assert!(client.acl_has_role(&operator, &acl::Role::Operator));
    }

    #[test]
    fn test_acl_revoke_role() {
        let (env, client, admin) = setup();
        let operator = Address::generate(&env);

        client.acl_grant_role(&admin, &operator, &acl::Role::Operator, &0);
        assert!(client.acl_has_role(&operator, &acl::Role::Operator));

        client.acl_revoke_role(&admin, &operator, &acl::Role::Operator);
        assert!(!client.acl_has_role(&operator, &acl::Role::Operator));
    }

    #[test]
    fn test_acl_grant_permission_directly() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        assert!(!client.acl_has_permission(&user, &acl::Permission::ViewHealth));
        client.acl_grant_permission(&admin, &user, &acl::Permission::ViewHealth, &0);
        assert!(client.acl_has_permission(&user, &acl::Permission::ViewHealth));
    }

    #[test]
    fn test_acl_revoke_permission() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.acl_grant_permission(&admin, &user, &acl::Permission::ViewHealth, &0);
        client.acl_revoke_permission(&admin, &user, &acl::Permission::ViewHealth);
        assert!(!client.acl_has_permission(&user, &acl::Permission::ViewHealth));
    }

    #[test]
    fn test_acl_role_inherits_permissions() {
        let (env, client, admin) = setup();
        let readonly = Address::generate(&env);

        client.acl_grant_role(&admin, &readonly, &acl::Role::ReadOnly, &0);

        // ReadOnly inherits ViewHealth, ViewPrice, ViewAnalytics
        assert!(client.acl_has_permission(&readonly, &acl::Permission::ViewHealth));
        assert!(client.acl_has_permission(&readonly, &acl::Permission::ViewPrice));
        assert!(client.acl_has_permission(&readonly, &acl::Permission::ViewAnalytics));

        // ReadOnly does NOT inherit write permissions
        assert!(!client.acl_has_permission(&readonly, &acl::Permission::SubmitHealth));
        assert!(!client.acl_has_permission(&readonly, &acl::Permission::ManageAssets));
    }

    #[test]
    fn test_acl_operator_role_permissions() {
        let (env, client, admin) = setup();
        let operator = Address::generate(&env);

        client.acl_grant_role(&admin, &operator, &acl::Role::Operator, &0);

        assert!(client.acl_has_permission(&operator, &acl::Permission::SubmitHealth));
        assert!(client.acl_has_permission(&operator, &acl::Permission::SubmitPrice));
        assert!(client.acl_has_permission(&operator, &acl::Permission::ManageAlerts));
        // Operator cannot manage config or assets
        assert!(!client.acl_has_permission(&operator, &acl::Permission::ManageConfig));
        assert!(!client.acl_has_permission(&operator, &acl::Permission::ManageAssets));
    }

    #[test]
    fn test_acl_super_admin_has_all_permissions() {
        let (env, client, admin) = setup();
        let super_admin = Address::generate(&env);

        client.acl_grant_role(&admin, &super_admin, &acl::Role::SuperAdmin, &0);

        assert!(client.acl_has_permission(&super_admin, &acl::Permission::ManageUpgrades));
        assert!(client.acl_has_permission(&super_admin, &acl::Permission::EmergencyPause));
        assert!(client.acl_has_permission(&super_admin, &acl::Permission::ManagePermissions));
        assert!(client.acl_has_permission(&super_admin, &acl::Permission::ManageConfig));
    }

    #[test]
    fn test_acl_role_expiry() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        env.ledger().set_timestamp(1000);
        // Grant role expiring at timestamp 2000
        client.acl_grant_role(&admin, &user, &acl::Role::ReadOnly, &2000);
        assert!(client.acl_has_role(&user, &acl::Role::ReadOnly));

        // Advance past expiry
        env.ledger().set_timestamp(2001);
        assert!(!client.acl_has_role(&user, &acl::Role::ReadOnly));
    }

    #[test]
    fn test_acl_permission_expiry() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        env.ledger().set_timestamp(1000);
        client.acl_grant_permission(&admin, &user, &acl::Permission::ViewHealth, &2000);
        assert!(client.acl_has_permission(&user, &acl::Permission::ViewHealth));

        env.ledger().set_timestamp(2001);
        assert!(!client.acl_has_permission(&user, &acl::Permission::ViewHealth));
    }

    #[test]
    fn test_acl_grant_updates_expiry() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        env.ledger().set_timestamp(1000);
        client.acl_grant_role(&admin, &user, &acl::Role::ReadOnly, &2000);

        // Re-grant with extended expiry
        client.acl_grant_role(&admin, &user, &acl::Role::ReadOnly, &5000);

        env.ledger().set_timestamp(3000);
        // Should still be valid with the updated expiry
        assert!(client.acl_has_role(&user, &acl::Role::ReadOnly));
    }

    #[test]
    fn test_acl_get_roles_for() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.acl_grant_role(&admin, &user, &acl::Role::Operator, &0);
        client.acl_grant_role(&admin, &user, &acl::Role::ReadOnly, &0);

        let roles = client.acl_get_roles_for(&user);
        assert_eq!(roles.len(), 2);
    }

    #[test]
    fn test_acl_get_permissions_for() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.acl_grant_permission(&admin, &user, &acl::Permission::ViewHealth, &0);
        client.acl_grant_permission(&admin, &user, &acl::Permission::ViewPrice, &0);

        let perms = client.acl_get_permissions_for(&user);
        assert_eq!(perms.len(), 2);
    }

    #[test]
    fn test_acl_bulk_grant_roles() {
        let (env, client, admin) = setup();
        let u1 = Address::generate(&env);
        let u2 = Address::generate(&env);

        let entries = soroban_sdk::vec![
            &env,
            acl::BulkRoleEntry {
                grantee: u1.clone(),
                role: acl::Role::Operator,
                expires_at: 0
            },
            acl::BulkRoleEntry {
                grantee: u2.clone(),
                role: acl::Role::ReadOnly,
                expires_at: 0
            },
        ];
        client.acl_bulk_grant_roles(&admin, &entries);

        assert!(client.acl_has_role(&u1, &acl::Role::Operator));
        assert!(client.acl_has_role(&u2, &acl::Role::ReadOnly));
    }

    #[test]
    fn test_acl_bulk_revoke_roles() {
        let (env, client, admin) = setup();
        let u1 = Address::generate(&env);
        let u2 = Address::generate(&env);

        let grant_entries = soroban_sdk::vec![
            &env,
            acl::BulkRoleEntry {
                grantee: u1.clone(),
                role: acl::Role::Operator,
                expires_at: 0
            },
            acl::BulkRoleEntry {
                grantee: u2.clone(),
                role: acl::Role::ReadOnly,
                expires_at: 0
            },
        ];
        client.acl_bulk_grant_roles(&admin, &grant_entries);

        let revoke_entries = soroban_sdk::vec![
            &env,
            acl::BulkRoleEntry {
                grantee: u1.clone(),
                role: acl::Role::Operator,
                expires_at: 0
            },
            acl::BulkRoleEntry {
                grantee: u2.clone(),
                role: acl::Role::ReadOnly,
                expires_at: 0
            },
        ];
        client.acl_bulk_revoke_roles(&admin, &revoke_entries);

        assert!(!client.acl_has_role(&u1, &acl::Role::Operator));
        assert!(!client.acl_has_role(&u2, &acl::Role::ReadOnly));
    }

    #[test]
    fn test_acl_bulk_grant_permissions() {
        let (env, client, admin) = setup();
        let u1 = Address::generate(&env);

        let entries = soroban_sdk::vec![
            &env,
            acl::BulkPermissionEntry {
                grantee: u1.clone(),
                permission: acl::Permission::ViewHealth,
                expires_at: 0,
            },
            acl::BulkPermissionEntry {
                grantee: u1.clone(),
                permission: acl::Permission::ViewPrice,
                expires_at: 0,
            },
        ];
        client.acl_bulk_grant_permissions(&admin, &entries);

        assert!(client.acl_has_permission(&u1, &acl::Permission::ViewHealth));
        assert!(client.acl_has_permission(&u1, &acl::Permission::ViewPrice));
    }

    #[test]
    fn test_acl_bulk_revoke_permissions() {
        let (env, client, admin) = setup();
        let u1 = Address::generate(&env);

        let grant_entries = soroban_sdk::vec![
            &env,
            acl::BulkPermissionEntry {
                grantee: u1.clone(),
                permission: acl::Permission::ViewHealth,
                expires_at: 0,
            },
        ];
        client.acl_bulk_grant_permissions(&admin, &grant_entries);

        let revoke_entries = soroban_sdk::vec![
            &env,
            acl::BulkPermissionEntry {
                grantee: u1.clone(),
                permission: acl::Permission::ViewHealth,
                expires_at: 0,
            },
        ];
        client.acl_bulk_revoke_permissions(&admin, &revoke_entries);

        assert!(!client.acl_has_permission(&u1, &acl::Permission::ViewHealth));
    }

    #[test]
    fn test_acl_manage_permissions_role_can_grant() {
        let (env, client, admin) = setup();
        let manager = Address::generate(&env);
        let user = Address::generate(&env);

        // Grant manager the ManagePermissions permission directly
        client.acl_grant_permission(&admin, &manager, &acl::Permission::ManagePermissions, &0);

        // Manager can now grant roles to others
        client.acl_grant_role(&manager, &user, &acl::Role::ReadOnly, &0);
        assert!(client.acl_has_role(&user, &acl::Role::ReadOnly));
    }

    #[test]
    #[should_panic(expected = "unauthorized")]
    fn test_acl_unauthorized_grant_panics() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);
        let victim = Address::generate(&env);

        client.acl_grant_role(&stranger, &victim, &acl::Role::ReadOnly, &0);
    }

    #[test]
    #[should_panic(expected = "unauthorized")]
    fn test_acl_unauthorized_revoke_panics() {
        let (env, client, admin) = setup();
        let stranger = Address::generate(&env);
        let user = Address::generate(&env);

        client.acl_grant_role(&admin, &user, &acl::Role::ReadOnly, &0);
        client.acl_revoke_role(&stranger, &user, &acl::Role::ReadOnly);
    }

    #[test]
    fn test_acl_admin_always_has_permission() {
        let (_env, client, admin) = setup();
        // Admin has no explicit ACL grants but should pass all permission checks
        assert!(client.acl_has_permission(&admin, &acl::Permission::ManageUpgrades));
        assert!(client.acl_has_permission(&admin, &acl::Permission::EmergencyPause));
        assert!(client.acl_has_permission(&admin, &acl::Permission::ManagePermissions));
    }

    #[test]
    fn test_acl_multiple_admins_via_super_admin_role() {
        let (env, client, admin) = setup();
        let admin2 = Address::generate(&env);
        let admin3 = Address::generate(&env);

        client.acl_grant_role(&admin, &admin2, &acl::Role::SuperAdmin, &0);
        // admin2 can now grant roles to admin3
        client.acl_grant_role(&admin2, &admin3, &acl::Role::Admin, &0);

        assert!(client.acl_has_role(&admin3, &acl::Role::Admin));
        assert!(client.acl_has_permission(&admin3, &acl::Permission::SubmitHealth));
    }

    #[test]
    #[should_panic(expected = "bulk grant exceeds maximum of 20 entries")]
    fn test_acl_bulk_grant_exceeds_limit() {
        let (env, client, admin) = setup();
        let mut entries = soroban_sdk::Vec::new(&env);
        for _ in 0..21 {
            entries.push_back(acl::BulkRoleEntry {
                grantee: Address::generate(&env),
                role: acl::Role::ReadOnly,
                expires_at: 0,
            });
        }
        client.acl_bulk_grant_roles(&admin, &entries);
    }

    // -----------------------------------------------------------------------
    // Configuration Management tests (issue #103)
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_and_get_config() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "health_score_min");
        let desc = String::from_str(&env, "Minimum health score threshold");

        client.set_config(&admin, &ConfigCategory::Threshold, &name, &75, &desc);

        let entry = client
            .get_config(&ConfigCategory::Threshold, &name)
            .unwrap();
        assert_eq!(entry.value.value, 75);
        assert_eq!(entry.version, 1);
        assert_eq!(entry.category, ConfigCategory::Threshold);
        assert_eq!(entry.name, name);
    }

    #[test]
    fn test_config_versioning_increments_on_each_write() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "price_deviation_low_bps");
        let desc = String::from_str(&env, "Low deviation threshold in bps");

        client.set_config(&admin, &ConfigCategory::Threshold, &name, &200, &desc);
        let v1 = client
            .get_config(&ConfigCategory::Threshold, &name)
            .unwrap();
        assert_eq!(v1.version, 1);
        assert_eq!(v1.value.value, 200);

        client.set_config(&admin, &ConfigCategory::Threshold, &name, &300, &desc);
        let v2 = client
            .get_config(&ConfigCategory::Threshold, &name)
            .unwrap();
        assert_eq!(v2.version, 2);
        assert_eq!(v2.value.value, 300);

        client.set_config(&admin, &ConfigCategory::Threshold, &name, &400, &desc);
        let v3 = client
            .get_config(&ConfigCategory::Threshold, &name)
            .unwrap();
        assert_eq!(v3.version, 3);
    }

    #[test]
    fn test_config_audit_log_is_appended() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "pause_timelock_seconds");
        let desc = String::from_str(&env, "Timelock for unpause");

        // Timeouts category
        client.set_config(&admin, &ConfigCategory::Timeouts, &name, &300, &desc);
        client.set_config(&admin, &ConfigCategory::Timeouts, &name, &600, &desc);

        let log = client.get_config_audit_log(&ConfigCategory::Timeouts, &name);
        assert_eq!(log.len(), 2);

        let first = log.get(0).unwrap();
        assert_eq!(first.old_value, 0); // no prior value
        assert_eq!(first.new_value, 300);
        assert_eq!(first.version, 1);

        let second = log.get(1).unwrap();
        assert_eq!(second.old_value, 300);
        assert_eq!(second.new_value, 600);
        assert_eq!(second.version, 2);
    }

    #[test]
    fn test_get_all_configs_returns_all_stored_entries() {
        let (env, client, admin) = setup();

        let n1 = String::from_str(&env, "max_monitored_assets");
        let d1 = String::from_str(&env, "Max assets");
        let n2 = String::from_str(&env, "max_batch_size");
        let d2 = String::from_str(&env, "Max batch");

        client.set_config(&admin, &ConfigCategory::Limits, &n1, &100, &d1);
        client.set_config(&admin, &ConfigCategory::Limits, &n2, &50, &d2);

        let export = client.get_all_configs();
        assert_eq!(export.total, 2);
        assert_eq!(export.entries.len(), 2);
    }

    #[test]
    fn test_bulk_config_update() {
        let (env, client, admin) = setup();

        let mut updates: Vec<BulkConfigUpdate> = Vec::new(&env);
        updates.push_back(BulkConfigUpdate {
            category: ConfigCategory::Threshold,
            name: String::from_str(&env, "health_score_min"),
            value: 60,
            description: String::from_str(&env, "Min health score"),
        });
        updates.push_back(BulkConfigUpdate {
            category: ConfigCategory::Timeouts,
            name: String::from_str(&env, "price_staleness_seconds"),
            value: 1800,
            description: String::from_str(&env, "Staleness window"),
        });

        client.set_config_bulk(&admin, &updates);

        let e1 = client
            .get_config(
                &ConfigCategory::Threshold,
                &String::from_str(&env, "health_score_min"),
            )
            .unwrap();
        assert_eq!(e1.value.value, 60);

        let e2 = client
            .get_config(
                &ConfigCategory::Timeouts,
                &String::from_str(&env, "price_staleness_seconds"),
            )
            .unwrap();
        assert_eq!(e2.value.value, 1800);
    }

    #[test]
    fn test_init_default_config_seeds_all_defaults() {
        let (env, client, admin) = setup();

        client.init_default_config(&admin);

        let export = client.get_all_configs();
        // 5 thresholds + 4 timeouts + 4 limits = 13 defaults
        assert_eq!(export.total, 13);

        // Spot-check a few values
        let health_min = client
            .get_config(
                &ConfigCategory::Threshold,
                &String::from_str(&env, "health_score_min"),
            )
            .unwrap();
        assert_eq!(health_min.value.value, 50);

        let max_assets = client
            .get_config(
                &ConfigCategory::Limits,
                &String::from_str(&env, "max_monitored_assets"),
            )
            .unwrap();
        assert_eq!(max_assets.value.value, 100);

        let staleness = client
            .get_config(
                &ConfigCategory::Timeouts,
                &String::from_str(&env, "price_staleness_seconds"),
            )
            .unwrap();
        assert_eq!(staleness.value.value, 3600);
    }

    #[test]
    fn test_init_default_config_does_not_overwrite_existing() {
        let (env, client, admin) = setup();

        // Set a custom value before seeding defaults
        let name = String::from_str(&env, "health_score_min");
        let desc = String::from_str(&env, "Custom override");
        client.set_config(&admin, &ConfigCategory::Threshold, &name, &99, &desc);

        client.init_default_config(&admin);

        let entry = client
            .get_config(&ConfigCategory::Threshold, &name)
            .unwrap();
        // Should still be the custom value, not the default 50
        assert_eq!(entry.value.value, 99);
        assert_eq!(entry.version, 1); // no extra write happened
    }

    #[test]
    #[should_panic(expected = "unauthorized: only admin may modify configuration")]
    fn test_set_config_non_admin_panics() {
        let (env, client, _admin) = setup();

        let non_admin = Address::generate(&env);
        let name = String::from_str(&env, "health_score_min");
        let desc = String::from_str(&env, "desc");

        client.set_config(&non_admin, &ConfigCategory::Threshold, &name, &50, &desc);
    }

    #[test]
    #[should_panic(expected = "config: name must not be empty")]
    fn test_set_config_empty_name_panics() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "");
        let desc = String::from_str(&env, "valid description");

        client.set_config(&admin, &ConfigCategory::Threshold, &name, &50, &desc);
    }

    #[test]
    #[should_panic(expected = "config: description must not be empty")]
    fn test_set_config_empty_description_panics() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "valid_name");
        let desc = String::from_str(&env, "");

        client.set_config(&admin, &ConfigCategory::Threshold, &name, &50, &desc);
    }

    #[test]
    #[should_panic(expected = "config: threshold value must be")]
    fn test_set_config_negative_threshold_panics() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "health_score_min");
        let desc = String::from_str(&env, "desc");

        client.set_config(&admin, &ConfigCategory::Threshold, &name, &-1, &desc);
    }

    #[test]
    #[should_panic(expected = "config: timeout value must be")]
    fn test_set_config_zero_timeout_panics() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "pause_timelock_seconds");
        let desc = String::from_str(&env, "desc");

        client.set_config(&admin, &ConfigCategory::Timeouts, &name, &0, &desc);
    }

    #[test]
    #[should_panic(expected = "config: limit value must be")]
    fn test_set_config_zero_limit_panics() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "max_monitored_assets");
        let desc = String::from_str(&env, "desc");

        client.set_config(&admin, &ConfigCategory::Limits, &name, &0, &desc);
    }

    #[test]
    #[should_panic(expected = "config: bulk update list must not be empty")]
    fn test_bulk_config_empty_list_panics() {
        let (env, client, admin) = setup();

        let updates: Vec<BulkConfigUpdate> = Vec::new(&env);
        client.set_config_bulk(&admin, &updates);
    }

    #[test]
    fn test_get_config_returns_none_for_unknown_key() {
        let (env, client, _admin) = setup();

        let result = client.get_config(
            &ConfigCategory::Threshold,
            &String::from_str(&env, "nonexistent_key"),
        );
        assert!(result.is_none());
    }

    #[test]
    fn test_config_event_emitted_on_set() {
        let (env, client, admin) = setup();

        let name = String::from_str(&env, "health_score_min");
        let desc = String::from_str(&env, "desc");

        client.set_config(&admin, &ConfigCategory::Threshold, &name, &75, &desc);

        // Verify at least one event was published
        let events = env.events().all();
        assert!(!events.is_empty());
    }

    #[test]
    fn test_config_all_three_categories() {
        let (env, client, admin) = setup();

        client.set_config(
            &admin,
            &ConfigCategory::Threshold,
            &String::from_str(&env, "t_param"),
            &100,
            &String::from_str(&env, "threshold param"),
        );
        client.set_config(
            &admin,
            &ConfigCategory::Timeouts,
            &String::from_str(&env, "to_param"),
            &60,
            &String::from_str(&env, "timeout param"),
        );
        client.set_config(
            &admin,
            &ConfigCategory::Limits,
            &String::from_str(&env, "l_param"),
            &10,
            &String::from_str(&env, "limit param"),
        );

        let export = client.get_all_configs();
        assert_eq!(export.total, 3);
    }
}
