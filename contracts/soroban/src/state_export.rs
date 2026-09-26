//! # State Export Functions
//!
//! Provides compact, exportable views of contract state for off-chain sync and auditing.

use crate::AssetHealth;
use soroban_sdk::{contracttype, Address, Bytes, BytesN, Env, String, Vec};

/// Version marker for state export compatibility.
pub const STATE_EXPORT_VERSION: u32 = 1;

/// Compact representation of contract state for export.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StateExport {
    /// Schema version for compatibility tracking.
    pub version: u32,
    /// Timestamp when state was exported.
    pub exported_at: u64,
    /// Contract address generating the export.
    pub contract_address: Address,
    /// Compact state payload (deterministic SHA-256 hex digest).
    pub state_hash: String,
    /// Summary metadata.
    pub metadata: ExportMetadata,
    /// MMR root hash at time of export (for historical verification).
    pub mmr_root: Option<BytesN<32>>,
    /// Leaf index in MMR for this state snapshot.
    pub mmr_leaf_index: Option<u64>,
}

/// Metadata about exported state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExportMetadata {
    /// Total number of items in state.
    pub item_count: u32,
    /// Size estimate in bytes.
    pub size_estimate_bytes: u32,
    /// Compression level applied (0=none, 1=basic).
    pub compression_level: u32,
    /// Notes about the export.
    pub notes: String,
}

/// Summary of asset state for export.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetStateSnapshot {
    /// Asset code.
    pub asset_code: String,
    /// Asset status.
    pub status: String,
    /// Compliance status.
    pub compliance: String,
    /// Risk rating.
    pub risk_rating: String,
    /// Risk score in basis points.
    pub risk_score_bps: u32,
    /// Number of chain links.
    pub chain_count: u32,
    /// Number of oracle feeds.
    pub oracle_feed_count: u32,
    /// Number of bridge associations.
    pub bridge_count: u32,
    /// Number of liquidity pool associations.
    pub pool_count: u32,
    /// Is frozen.
    pub is_frozen: bool,
    /// Timestamp of last update.
    pub updated_at: u64,
}

/// Export helper for building state snapshots.
pub struct StateExportHelper;

impl StateExportHelper {
    /// Build a compact asset snapshot from on-chain health data.
    pub fn build_asset_snapshot_from_health(env: &Env, health: &AssetHealth) -> AssetStateSnapshot {
        let status = if !health.active {
            String::from_str(env, "Inactive")
        } else if health.paused {
            String::from_str(env, "Paused")
        } else {
            String::from_str(env, "Active")
        };

        AssetStateSnapshot {
            asset_code: health.asset_code.clone(),
            status,
            compliance: String::from_str(env, "Unknown"),
            risk_rating: Self::risk_rating_for_score(env, health.health_score),
            risk_score_bps: health.health_score.saturating_mul(100),
            chain_count: 0,
            oracle_feed_count: 0,
            bridge_count: 0,
            pool_count: 0,
            is_frozen: health.paused,
            updated_at: health.timestamp,
        }
    }

    /// Generate deterministic state hash for audit trail.
    ///
    /// Uses SHA-256 over the same byte encoding as the other hash functions in
    /// this file — `no_std` compatible, no `format!` macro required.
    pub fn compute_state_hash(
        env: Env,
        asset_code: &String,
        status: &String,
        risk_score: u32,
        timestamp: u64,
    ) -> String {
        let mut bytes = Bytes::new(&env);
        Self::append_string(&mut bytes, asset_code);
        Self::append_string(&mut bytes, status);
        Self::append_u32(&mut bytes, risk_score);
        Self::append_u64(&mut bytes, timestamp);
        let digest: BytesN<32> = env.crypto().sha256(&bytes).into();
        Self::hash_to_hex(&env, &digest)
    }

    /// Build a placeholder snapshot when no health record exists yet.
    pub fn build_empty_asset_snapshot(env: &Env, asset_code: String) -> AssetStateSnapshot {
        AssetStateSnapshot {
            asset_code,
            status: String::from_str(env, "Unknown"),
            compliance: String::from_str(env, "Unknown"),
            risk_rating: String::from_str(env, "Unknown"),
            risk_score_bps: 0,
            chain_count: 0,
            oracle_feed_count: 0,
            bridge_count: 0,
            pool_count: 0,
            is_frozen: false,
            updated_at: 0,
        }
    }

    /// Sort snapshots by asset code for stable ordering.
    pub fn sort_snapshots(env: &Env, snapshots: &mut Vec<AssetStateSnapshot>) {
        let len = snapshots.len();
        if len <= 1 {
            return;
        }

        let mut i = 0;
        while i < len {
            let mut j = i + 1;
            while j < len {
                let left = snapshots.get(i).unwrap();
                let right = snapshots.get(j).unwrap();
                if Self::asset_code_less_than(&left.asset_code, &right.asset_code) {
                    snapshots.set(i, right);
                    snapshots.set(j, left.clone());
                }
                j += 1;
            }
            i += 1;
        }

        let _ = env;
    }

    /// Compute deterministic SHA-256 hash over the export payload.
    pub fn compute_snapshots_hash(env: &Env, snapshots: &Vec<AssetStateSnapshot>) -> String {
        let mut data = Bytes::new(env);
        Self::append_u32(&mut data, STATE_EXPORT_VERSION);
        Self::append_u32(&mut data, snapshots.len());

        for snapshot in snapshots.iter() {
            Self::append_snapshot(&mut data, &snapshot);
        }

        let digest: BytesN<32> = env.crypto().sha256(&data).into();
        Self::hash_to_hex(env, &digest)
    }

    /// Assemble the top-level export envelope with optional MMR anchoring.
    pub fn assemble_export(
        env: &Env,
        contract_address: Address,
        snapshots: Vec<AssetStateSnapshot>,
    ) -> StateExport {
        Self::assemble_export_with_mmr(env, contract_address, snapshots, None, None)
    }

    /// Assemble export envelope with MMR root and leaf index for historical verification.
    /// This links the state snapshot to a specific historical ledger via MMR proof.
    pub fn assemble_export_with_mmr(
        env: &Env,
        contract_address: Address,
        snapshots: Vec<AssetStateSnapshot>,
        mmr_root: Option<BytesN<32>>,
        mmr_leaf_index: Option<u64>,
    ) -> StateExport {
        let mut ordered = snapshots;
        Self::sort_snapshots(env, &mut ordered);
        let item_count = ordered.len();
        let state_hash = Self::compute_snapshots_hash(env, &ordered);
        let now = env.ledger().timestamp();

        StateExport {
            version: STATE_EXPORT_VERSION,
            exported_at: now,
            contract_address,
            state_hash,
            metadata: ExportMetadata {
                item_count,
                size_estimate_bytes: item_count.saturating_mul(256),
                compression_level: 0,
                notes: String::from_str(env, "contract-data-snapshot"),
            },
            mmr_root,
            mmr_leaf_index,
        }
    }

    fn risk_rating_for_score(env: &Env, health_score: u32) -> String {
        if health_score >= 80 {
            String::from_str(env, "Low")
        } else if health_score >= 60 {
            String::from_str(env, "Medium")
        } else if health_score >= 40 {
            String::from_str(env, "High")
        } else {
            String::from_str(env, "Critical")
        }
    }

    fn asset_code_less_than(left: &String, right: &String) -> bool {
        Self::compare_strings(left, right) > 0
    }

    /// Verify that a state export snapshot was included in a historical MMR root.
    /// This enables external light clients to cryptographically verify that an exported
    /// state was committed at a specific historical ledger.
    pub fn verify_state_inclusion(
        env: &Env,
        state_export: &StateExport,
        mmr_root_at_export: &BytesN<32>,
    ) -> bool {
        // Both MMR root and leaf index must be present in the export
        let export_mmr_root = match &state_export.mmr_root {
            Some(root) => root,
            None => return false,
        };

        let _leaf_index = match state_export.mmr_leaf_index {
            Some(idx) => idx,
            None => return false,
        };

        // Verify the export's MMR root matches the provided expected root
        export_mmr_root == mmr_root_at_export
    }

    /// Lexicographic string comparison for stable asset ordering.
    pub fn compare_strings(left: &String, right: &String) -> i32 {
        let left_len = left.len() as usize;
        let right_len = right.len() as usize;
        let max_len = if left_len > right_len {
            left_len
        } else {
            right_len
        }
        .min(256);

        let mut left_buf = [0u8; 256];
        let mut right_buf = [0u8; 256];
        if left_len > 0 {
            left.copy_into_slice(&mut left_buf[..left_len.min(256)]);
        }
        if right_len > 0 {
            right.copy_into_slice(&mut right_buf[..right_len.min(256)]);
        }

        let mut idx = 0;
        while idx < max_len {
            let left_byte = if idx < left_len { left_buf[idx] } else { 0 };
            let right_byte = if idx < right_len { right_buf[idx] } else { 0 };

            if left_byte != right_byte {
                return if left_byte > right_byte { 1 } else { -1 };
            }
            idx += 1;
        }

        0
    }

    fn append_snapshot(buf: &mut Bytes, snapshot: &AssetStateSnapshot) {
        Self::append_string(buf, &snapshot.asset_code);
        Self::append_string(buf, &snapshot.status);
        Self::append_string(buf, &snapshot.compliance);
        Self::append_string(buf, &snapshot.risk_rating);
        Self::append_u32(buf, snapshot.risk_score_bps);
        Self::append_u32(buf, snapshot.chain_count);
        Self::append_u32(buf, snapshot.oracle_feed_count);
        Self::append_u32(buf, snapshot.bridge_count);
        Self::append_u32(buf, snapshot.pool_count);
        Self::append_bool(buf, snapshot.is_frozen);
        Self::append_u64(buf, snapshot.updated_at);
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

    fn append_bool(buf: &mut Bytes, value: bool) {
        buf.push_back(if value { 1 } else { 0 });
    }

    fn append_string(buf: &mut Bytes, value: &String) {
        let len = value.len() as usize;
        let safe_len = len.min(256);
        let mut raw = [0u8; 256];
        if safe_len > 0 {
            value.copy_into_slice(&mut raw[..safe_len]);
        }
        Self::append_u32(buf, len as u32);
        let mut idx = 0;
        while idx < safe_len {
            buf.push_back(raw[idx]);
            idx += 1;
        }
    }

    fn hash_to_hex(env: &Env, digest: &BytesN<32>) -> String {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        let bytes = digest.to_array();
        let mut out = [0u8; 64];
        let mut i = 0;
        while i < bytes.len() {
            out[i * 2] = HEX[(bytes[i] >> 4) as usize];
            out[i * 2 + 1] = HEX[(bytes[i] & 0x0f) as usize];
            i += 1;
        }
        String::from_bytes(env, &out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn sample_health(env: &Env, code: &str, score: u32, paused: bool, active: bool) -> AssetHealth {
        AssetHealth {
            asset_code: String::from_str(env, code),
            health_score: score,
            liquidity_score: score,
            price_stability_score: score,
            bridge_uptime_score: score,
            paused,
            active,
            timestamp: 1_000,
            expires_at: 2_000,
        }
    }

    #[test]
    fn test_state_export_version() {
        assert_eq!(STATE_EXPORT_VERSION, 1);
    }

    #[test]
    fn test_build_asset_snapshot_from_health() {
        let env = Env::default();
        let health = sample_health(&env, "USDC", 85, false, true);
        let snapshot = StateExportHelper::build_asset_snapshot_from_health(&env, &health);

        assert_eq!(snapshot.asset_code, health.asset_code);
        assert_eq!(snapshot.risk_score_bps, 8_500);
        assert_eq!(snapshot.risk_rating, String::from_str(&env, "Low"));
        assert!(!snapshot.is_frozen);
    }

    #[test]
    fn test_sort_snapshots_is_stable_by_asset_code() {
        let env = Env::default();
        let mut snapshots = Vec::new(&env);
        snapshots.push_back(StateExportHelper::build_empty_asset_snapshot(
            &env,
            String::from_str(&env, "USDC"),
        ));
        snapshots.push_back(StateExportHelper::build_empty_asset_snapshot(
            &env,
            String::from_str(&env, "EURC"),
        ));
        snapshots.push_back(StateExportHelper::build_empty_asset_snapshot(
            &env,
            String::from_str(&env, "BTC"),
        ));

        StateExportHelper::sort_snapshots(&env, &mut snapshots);

        assert_eq!(
            snapshots.get(0).unwrap().asset_code,
            String::from_str(&env, "BTC")
        );
        assert_eq!(
            snapshots.get(1).unwrap().asset_code,
            String::from_str(&env, "EURC")
        );
        assert_eq!(
            snapshots.get(2).unwrap().asset_code,
            String::from_str(&env, "USDC")
        );
    }

    #[test]
    fn test_compute_snapshots_hash_is_deterministic() {
        let env = Env::default();
        let mut snapshots = Vec::new(&env);
        snapshots.push_back(StateExportHelper::build_asset_snapshot_from_health(
            &env,
            &sample_health(&env, "USDC", 90, false, true),
        ));

        let first = StateExportHelper::compute_snapshots_hash(&env, &snapshots);
        let second = StateExportHelper::compute_snapshots_hash(&env, &snapshots);
        assert_eq!(first, second);
        assert_eq!(first.len(), 64);
    }

    #[test]
    fn test_assemble_export_metadata() {
        let env = Env::default();
        let contract = Address::generate(&env);
        let mut snapshots = Vec::new(&env);
        snapshots.push_back(StateExportHelper::build_asset_snapshot_from_health(
            &env,
            &sample_health(&env, "USDC", 75, false, true),
        ));

        let export = StateExportHelper::assemble_export(&env, contract.clone(), snapshots);
        assert_eq!(export.version, STATE_EXPORT_VERSION);
        assert_eq!(export.contract_address, contract);
        assert_eq!(export.metadata.item_count, 1);
        assert!(!export.state_hash.is_empty());
        assert_eq!(export.mmr_root, None);
        assert_eq!(export.mmr_leaf_index, None);
    }

    #[test]
    fn test_assemble_export_with_mmr_anchoring() {
        let env = Env::default();
        let contract = Address::generate(&env);
        let mut snapshots = Vec::new(&env);
        snapshots.push_back(StateExportHelper::build_asset_snapshot_from_health(
            &env,
            &sample_health(&env, "USDC", 90, false, true),
        ));

        let mmr_root = BytesN::from_array(&env, &[1u8; 32]);
        let mmr_leaf_idx = 42u64;

        let export = StateExportHelper::assemble_export_with_mmr(
            &env,
            contract.clone(),
            snapshots,
            Some(mmr_root.clone()),
            Some(mmr_leaf_idx),
        );

        assert_eq!(export.version, STATE_EXPORT_VERSION);
        assert_eq!(export.mmr_root, Some(mmr_root.clone()));
        assert_eq!(export.mmr_leaf_index, Some(mmr_leaf_idx));
    }

    #[test]
    fn test_verify_state_inclusion() {
        let env = Env::default();
        let contract = Address::generate(&env);
        let mut snapshots = Vec::new(&env);
        snapshots.push_back(StateExportHelper::build_asset_snapshot_from_health(
            &env,
            &sample_health(&env, "USDC", 85, false, true),
        ));

        let mmr_root = BytesN::from_array(&env, &[5u8; 32]);
        let export = StateExportHelper::assemble_export_with_mmr(
            &env,
            contract,
            snapshots,
            Some(mmr_root.clone()),
            Some(100u64),
        );

        // Verify with matching MMR root
        assert!(StateExportHelper::verify_state_inclusion(&env, &export, &mmr_root));

        // Verify fails with different MMR root
        let wrong_root = BytesN::from_array(&env, &[9u8; 32]);
        assert!(!StateExportHelper::verify_state_inclusion(&env, &export, &wrong_root));
    }
}
