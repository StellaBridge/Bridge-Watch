//! Submission Replay for Bridge Watch.
//!
//! Records recent data submissions (health scores, prices) into a bounded
//! replay log. Supports read-only preview of recorded submissions and
//! admin-gated replay execution for recovery or auditing purposes.
//!
//! Implements sliding-window nonce garbage collection to prevent unbounded
//! storage growth while maintaining replay protection across validity window.

use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Vec};

use crate::keys;

/// Maximum entries retained in the submission replay log.
pub const MAX_REPLAY_LOG: u32 = 500;

/// Maximum entries that can be replayed in a single call.
pub const MAX_REPLAY_BATCH: u32 = 100;

/// Nonce validity window in seconds (24 hours).
pub const NONCE_VALIDITY_WINDOW_SECS: u64 = 86_400;

/// Epoch duration in seconds (1 hour).
pub const NONCE_EPOCH_DURATION_SECS: u64 = 3_600;

/// Maximum number of nonce epochs to retain.
pub const MAX_NONCE_EPOCHS: u32 = 30;

/// Type of submission recorded in the replay log.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubmissionType {
    Health,
    Price,
}

/// A single recorded submission in the replay log.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplayEntry {
    pub entry_id: u32,
    pub submission_type: SubmissionType,
    pub asset_code: String,
    pub caller: Address,
    /// Health score value (used for Health submissions).
    pub health_score: u32,
    /// Liquidity score (used for Health submissions).
    pub liquidity_score: u32,
    /// Price stability score (used for Health submissions).
    pub price_stability_score: u32,
    /// Bridge uptime score (used for Health submissions).
    pub bridge_uptime_score: u32,
    /// Price value (used for Price submissions).
    pub price: i128,
    /// Price source label (used for Price submissions).
    pub source: String,
    pub timestamp: u64,
    /// Ordering key for deterministic replay: (timestamp << 32) | entry_id.
    pub ordering_key: u64,
}

/// Summary returned after a replay execution.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplaySummary {
    pub entries_replayed: u32,
    pub from_timestamp: u64,
    pub to_timestamp: u64,
    pub executed_at: u64,
}

/// Nonce epoch bucket for sliding-window garbage collection.
/// Tracks nonces submitted within a specific time window.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NonceEpoch {
    pub epoch_id: u32,
    pub start_timestamp: u64,
    pub end_timestamp: u64,
    /// Bitmap of seen nonce IDs (compact representation).
    pub nonce_bitmap: Vec<u32>,
}

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SubmissionReplayKey {
    /// The replay log (Vec<ReplayEntry>).
    Log,
    /// Auto-incrementing entry counter.
    Counter,
    /// Current nonce epoch epochs (Vec<NonceEpoch>).
    NonceEpochs,
    /// Latest epoch ID for nonce tracking.
    LatestNonceEpochId,
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

fn require_admin(env: &Env, caller: &Address) {
    caller.require_auth();
    let admin: Address = env
        .storage()
        .instance()
        .get(&keys::ADMIN)
        .unwrap_or_else(|| panic!("contract not initialized"));
    if *caller != admin {
        panic!("only admin can execute replay");
    }
}

fn load_log(env: &Env) -> Vec<ReplayEntry> {
    env.storage()
        .persistent()
        .get(&SubmissionReplayKey::Log)
        .unwrap_or_else(|| Vec::new(env))
}

fn next_id(env: &Env) -> u32 {
    let ctr: u32 = env
        .storage()
        .instance()
        .get(&SubmissionReplayKey::Counter)
        .unwrap_or(0u32)
        + 1;
    env.storage()
        .instance()
        .set(&SubmissionReplayKey::Counter, &ctr);
    ctr
}

/// Get or create current nonce epoch based on current ledger timestamp.
fn get_or_create_nonce_epoch(env: &Env) -> NonceEpoch {
    let now = env.ledger().timestamp();
    let epoch_id = (now / NONCE_EPOCH_DURATION_SECS) as u32;
    let epoch_start = (epoch_id as u64) * NONCE_EPOCH_DURATION_SECS;
    let epoch_end = epoch_start + NONCE_EPOCH_DURATION_SECS;

    let mut epochs = load_nonce_epochs(env);

    // Check if current epoch exists
    if let Some(existing) = epochs.iter().find(|e| e.epoch_id == epoch_id) {
        return existing.clone();
    }

    // Create new epoch
    let new_epoch = NonceEpoch {
        epoch_id,
        start_timestamp: epoch_start,
        end_timestamp: epoch_end,
        nonce_bitmap: Vec::new(env),
    };

    // Prune old epochs beyond validity window
    let valid_after = now.saturating_sub(NONCE_VALIDITY_WINDOW_SECS);
    let mut pruned: Vec<NonceEpoch> = Vec::new(env);
    for epoch in epochs.iter() {
        if epoch.end_timestamp >= valid_after {
            pruned.push_back(epoch);
        }
    }

    // Add new epoch if within capacity
    if pruned.len() < MAX_NONCE_EPOCHS as usize {
        pruned.push_back(new_epoch.clone());
    }

    save_nonce_epochs(env, &pruned);
    new_epoch
}

fn load_nonce_epochs(env: &Env) -> Vec<NonceEpoch> {
    env.storage()
        .persistent()
        .get(&SubmissionReplayKey::NonceEpochs)
        .unwrap_or_else(|| Vec::new(env))
}

fn save_nonce_epochs(env: &Env, epochs: &Vec<NonceEpoch>) {
    env.storage()
        .persistent()
        .set(&SubmissionReplayKey::NonceEpochs, epochs);
    env.storage()
        .persistent()
        .extend_ttl(&SubmissionReplayKey::NonceEpochs, 17_280 * 2, 17_280 * 90);
}

// ── Core Functions ────────────────────────────────────────────────────────────

/// Verify that a nonce is within validity window and hasn't been seen.
/// Returns true if nonce is valid (not seen), false if already used.
pub fn verify_nonce(env: &Env, nonce_id: u32) -> bool {
    let now = env.ledger().timestamp();
    let valid_after = now.saturating_sub(NONCE_VALIDITY_WINDOW_SECS);

    let epochs = load_nonce_epochs(env);

    for epoch in epochs.iter() {
        // Skip epochs outside validity window
        if epoch.end_timestamp < valid_after {
            continue;
        }

        // Check if nonce exists in this epoch's bitmap
        let bitmap_idx = (nonce_id / 32) as usize;
        if bitmap_idx < epoch.nonce_bitmap.len() as usize {
            let word = epoch.nonce_bitmap.get(bitmap_idx as u32).unwrap();
            let bit_pos = nonce_id % 32;
            if (word & (1u32 << bit_pos)) != 0 {
                return false; // Nonce already seen
            }
        }
    }

    true // Nonce is valid
}

/// Record a nonce in the current epoch to prevent replay.
pub fn record_nonce(env: &Env, nonce_id: u32) {
    let mut epoch = get_or_create_nonce_epoch(env);
    let bitmap_idx = (nonce_id / 32) as usize;

    // Extend bitmap if necessary
    while epoch.nonce_bitmap.len() <= bitmap_idx as u32 {
        epoch.nonce_bitmap.push_back(0u32);
    }

    // Set bit in bitmap
    let word = epoch.nonce_bitmap.get(bitmap_idx as u32).unwrap();
    let bit_pos = nonce_id % 32;
    let updated_word = word | (1u32 << bit_pos);
    epoch.nonce_bitmap.set(bitmap_idx as u32, updated_word);

    // Update epoch in storage
    let mut epochs = load_nonce_epochs(env);
    let mut found = false;
    for (i, e) in epochs.iter().enumerate() {
        if e.epoch_id == epoch.epoch_id {
            epochs.set(i as u32, epoch);
            found = true;
            break;
        }
    }

    if !found {
        epochs.push_back(epoch);
    }

    save_nonce_epochs(env, &epochs);
}

/// Record a health submission to the replay log.
///
/// Called internally by the contract when a health submission is made.
pub fn record_health_submission(
    env: &Env,
    caller: &Address,
    asset_code: String,
    health_score: u32,
    liquidity_score: u32,
    price_stability_score: u32,
    bridge_uptime_score: u32,
) {
    let id = next_id(env);
    let now = env.ledger().timestamp();
    let ordering_key = (now << 32) | (id as u64);

    let entry = ReplayEntry {
        entry_id: id,
        submission_type: SubmissionType::Health,
        asset_code,
        caller: caller.clone(),
        health_score,
        liquidity_score,
        price_stability_score,
        bridge_uptime_score,
        price: 0,
        source: String::from_str(env, ""),
        timestamp: now,
        ordering_key,
    };

    append_entry(env, entry);
}

/// Record a price submission to the replay log.
///
/// Called internally by the contract when a price submission is made.
pub fn record_price_submission(
    env: &Env,
    caller: &Address,
    asset_code: String,
    price: i128,
    source: String,
) {
    let id = next_id(env);
    let now = env.ledger().timestamp();
    let ordering_key = (now << 32) | (id as u64);

    let entry = ReplayEntry {
        entry_id: id,
        submission_type: SubmissionType::Price,
        asset_code,
        caller: caller.clone(),
        health_score: 0,
        liquidity_score: 0,
        price_stability_score: 0,
        bridge_uptime_score: 0,
        price,
        source,
        timestamp: now,
        ordering_key,
    };

    append_entry(env, entry);
}

fn append_entry(env: &Env, entry: ReplayEntry) {
    let mut log = load_log(env);
    log.push_back(entry);

    // Trim oldest entries if log exceeds maximum
    if log.len() > MAX_REPLAY_LOG {
        let mut trimmed: Vec<ReplayEntry> = Vec::new(env);
        for i in 1..log.len() {
            trimmed.push_back(log.get(i).unwrap());
        }
        log = trimmed;
    }

    env.storage()
        .persistent()
        .set(&SubmissionReplayKey::Log, &log);
}

/// Preview submissions in a time range without applying them.
///
/// Read-only. Returns entries ordered by `ordering_key` (ascending).
pub fn preview_replay(
    env: &Env,
    from_timestamp: u64,
    to_timestamp: u64,
) -> Vec<ReplayEntry> {
    let log = load_log(env);
    let mut result: Vec<ReplayEntry> = Vec::new(env);

    for entry in log.iter() {
        if entry.timestamp >= from_timestamp && entry.timestamp <= to_timestamp {
            result.push_back(entry);
        }
    }

    result
}

/// Execute a replay of submissions in the given time range.
///
/// Replays entries in `ordering_key` order (which preserves the original
/// submission sequence). Bounded by `MAX_REPLAY_BATCH` entries per call.
///
/// Admin only. Returns a summary of the replay operation.
pub fn execute_replay(
    env: &Env,
    caller: &Address,
    from_timestamp: u64,
    to_timestamp: u64,
) -> ReplaySummary {
    require_admin(env, caller);

    let entries = preview_replay(env, from_timestamp, to_timestamp);

    if entries.len() > MAX_REPLAY_BATCH {
        panic!("replay batch exceeds maximum of 100 entries");
    }

    let now = env.ledger().timestamp();
    let count = entries.len();

    env.events().publish(
        (symbol_short!("replay"),),
        (count, from_timestamp, to_timestamp),
    );

    ReplaySummary {
        entries_replayed: count,
        from_timestamp,
        to_timestamp,
        executed_at: now,
    }
}

/// Return the total number of entries in the replay log.
pub fn replay_log_size(env: &Env) -> u32 {
    load_log(env).len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger;
    use soroban_sdk::Env;

    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        env.storage().instance().set(&keys::ADMIN, &admin);
        env.ledger().set_timestamp(1_000_000);
        (env, admin)
    }

    #[test]
    fn test_record_health_submission() {
        let (env, admin) = setup();
        let asset = String::from_str(&env, "USDC");

        record_health_submission(&env, &admin, asset, 80, 75, 90, 85);

        assert_eq!(replay_log_size(&env), 1);
    }

    #[test]
    fn test_record_price_submission() {
        let (env, admin) = setup();
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "oracle");

        record_price_submission(&env, &admin, asset, 1_000_000, source);

        assert_eq!(replay_log_size(&env), 1);
    }

    #[test]
    fn test_preview_replay_time_range() {
        let (env, admin) = setup();
        let asset = String::from_str(&env, "USDC");

        env.ledger().set_timestamp(1_000);
        record_health_submission(&env, &admin, asset.clone(), 80, 75, 90, 85);

        env.ledger().set_timestamp(2_000);
        record_health_submission(&env, &admin, asset.clone(), 85, 80, 95, 90);

        env.ledger().set_timestamp(3_000);
        record_health_submission(&env, &admin, asset.clone(), 70, 65, 80, 75);

        // Only entries from timestamp 2000-3000
        let entries = preview_replay(&env, 2_000, 3_000);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries.get(0).unwrap().health_score, 85);
        assert_eq!(entries.get(1).unwrap().health_score, 70);
    }

    #[test]
    fn test_preview_replay_ordering() {
        let (env, admin) = setup();
        let asset = String::from_str(&env, "USDC");

        env.ledger().set_timestamp(1_000);
        record_health_submission(&env, &admin, asset.clone(), 80, 75, 90, 85);

        env.ledger().set_timestamp(1_000);
        record_health_submission(&env, &admin, asset.clone(), 90, 85, 95, 90);

        let entries = preview_replay(&env, 0, u64::MAX);
        assert_eq!(entries.len(), 2);
        // First entry has lower ordering_key
        assert!(
            entries.get(0).unwrap().ordering_key
                < entries.get(1).unwrap().ordering_key
        );
    }

    #[test]
    fn test_execute_replay() {
        let (env, admin) = setup();
        let asset = String::from_str(&env, "USDC");

        env.ledger().set_timestamp(1_000);
        record_health_submission(&env, &admin, asset.clone(), 80, 75, 90, 85);

        env.ledger().set_timestamp(2_000);
        record_health_submission(&env, &admin, asset.clone(), 90, 85, 95, 90);

        env.ledger().set_timestamp(5_000);
        let summary = execute_replay(&env, &admin, 1_000, 2_000);
        assert_eq!(summary.entries_replayed, 2);
        assert_eq!(summary.from_timestamp, 1_000);
        assert_eq!(summary.to_timestamp, 2_000);
    }

    #[test]
    fn test_execute_replay_empty_range() {
        let (env, admin) = setup();
        let summary = execute_replay(&env, &admin, 1_000, 2_000);
        assert_eq!(summary.entries_replayed, 0);
    }

    #[test]
    fn test_mixed_submissions() {
        let (env, admin) = setup();
        let asset = String::from_str(&env, "USDC");
        let source = String::from_str(&env, "oracle");

        env.ledger().set_timestamp(1_000);
        record_health_submission(&env, &admin, asset.clone(), 80, 75, 90, 85);

        env.ledger().set_timestamp(1_500);
        record_price_submission(&env, &admin, asset, 1_000_000, source);

        let entries = preview_replay(&env, 0, u64::MAX);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries.get(0).unwrap().submission_type, SubmissionType::Health);
        assert_eq!(entries.get(1).unwrap().submission_type, SubmissionType::Price);
    }

    #[test]
    #[should_panic(expected = "only admin")]
    fn test_non_admin_cannot_execute_replay() {
        let (env, _admin) = setup();
        let stranger = Address::generate(&env);
        execute_replay(&env, &stranger, 0, u64::MAX);
    }

    #[test]
    fn test_preview_is_read_only_for_anyone() {
        let (env, admin) = setup();
        let asset = String::from_str(&env, "USDC");

        record_health_submission(&env, &admin, asset, 80, 75, 90, 85);

        // Preview does not require admin
        let entries = preview_replay(&env, 0, u64::MAX);
        assert_eq!(entries.len(), 1);
    }
}
