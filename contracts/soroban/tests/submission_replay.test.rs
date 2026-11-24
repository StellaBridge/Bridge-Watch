#![cfg(test)]

//! Unit tests for `submission_replay.rs` (issue #1705).
//!
//! Nonce checks are plain reads and writes against contract storage, so each
//! call runs inside `env.as_contract` with a contract frame in place.

use bridge_watch_contracts::submission_replay::{
    execute_replay, preview_replay, record_health_submission, record_nonce,
    record_price_submission, verify_nonce, NonceEpoch, SubmissionReplayKey, SubmissionType,
    NONCE_EPOCH_DURATION_SECS, NONCE_VALIDITY_WINDOW_SECS,
};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

#[contract]
struct TestContract;

#[contractimpl]
impl TestContract {}

const START: u64 = 1_000_000;

/// Registers a bare contract to provide a storage context and stores `admin`
/// under the `"admin"` key that `submission_replay` reads.
fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, TestContract);
    env.as_contract(&contract_id, || {
        env.storage().instance().set(&"admin", &admin);
    });
    env.ledger().set_timestamp(START);
    (env, admin, contract_id)
}

#[test]
fn test_first_time_sequential_nonces_are_accepted() {
    let (env, _admin, contract_id) = setup();
    env.as_contract(&contract_id, || {
        for nonce in 1..=5u32 {
            assert!(verify_nonce(&env, nonce));
            record_nonce(&env, nonce);
        }
    });
}

#[test]
fn test_duplicate_nonce_is_rejected_once_recorded() {
    let (env, _admin, contract_id) = setup();
    env.as_contract(&contract_id, || {
        assert!(verify_nonce(&env, 7));
        record_nonce(&env, 7);
        assert!(!verify_nonce(&env, 7));
        // Neighbouring bits in the same bitmap word stay unused.
        assert!(verify_nonce(&env, 6));
        assert!(verify_nonce(&env, 8));
    });
}

#[test]
fn test_out_of_order_nonces_are_tracked_independently() {
    let (env, _admin, contract_id) = setup();
    env.as_contract(&contract_id, || {
        // Nonce 100 lives in bitmap word 3, so this grows the bitmap.
        record_nonce(&env, 100);
        assert!(verify_nonce(&env, 3));
        record_nonce(&env, 3);
        assert!(!verify_nonce(&env, 3));
        assert!(!verify_nonce(&env, 100));
        assert!(verify_nonce(&env, 50));
    });
}

#[test]
fn test_nonce_stays_blocked_through_the_validity_window() {
    let (env, _admin, contract_id) = setup();
    env.as_contract(&contract_id, || {
        record_nonce(&env, 42);
    });

    // Exactly one validity window after recording the nonce is still blocked.
    env.ledger()
        .set_timestamp(START + NONCE_VALIDITY_WINDOW_SECS);
    env.as_contract(&contract_id, || {
        assert!(!verify_nonce(&env, 42));
    });
}

#[test]
fn test_nonce_is_accepted_again_once_its_epoch_leaves_the_window() {
    let (env, _admin, contract_id) = setup();
    env.as_contract(&contract_id, || {
        record_nonce(&env, 42);
    });

    env.ledger()
        .set_timestamp(START + NONCE_VALIDITY_WINDOW_SECS + 2 * NONCE_EPOCH_DURATION_SECS);
    env.as_contract(&contract_id, || {
        assert!(verify_nonce(&env, 42));
    });
}

#[test]
fn test_expired_epochs_are_pruned_from_storage() {
    let (env, _admin, contract_id) = setup();
    env.as_contract(&contract_id, || {
        record_nonce(&env, 1);
    });

    let later = START + 2 * NONCE_VALIDITY_WINDOW_SECS;
    env.ledger().set_timestamp(later);
    env.as_contract(&contract_id, || {
        // Recording in a new epoch prunes the epoch that left the window.
        record_nonce(&env, 2);

        let epochs: Vec<NonceEpoch> = env
            .storage()
            .persistent()
            .get(&SubmissionReplayKey::NonceEpochs)
            .unwrap();
        assert_eq!(epochs.len(), 1);
        assert_eq!(
            epochs.get(0).unwrap().epoch_id,
            (later / NONCE_EPOCH_DURATION_SECS) as u32
        );

        // The pruned nonce is no longer tracked; the new one still is.
        assert!(verify_nonce(&env, 1));
        assert!(!verify_nonce(&env, 2));
    });
}

#[test]
fn test_preview_replay_returns_only_entries_in_range() {
    let (env, admin, contract_id) = setup();
    let asset = String::from_str(&env, "USDC");
    env.as_contract(&contract_id, || {
        env.ledger().set_timestamp(1_000);
        record_health_submission(&env, &admin, asset.clone(), 80, 75, 90, 85);
        env.ledger().set_timestamp(2_000);
        record_health_submission(&env, &admin, asset.clone(), 85, 80, 95, 90);
        env.ledger().set_timestamp(3_000);
        record_health_submission(&env, &admin, asset.clone(), 70, 65, 80, 75);

        let entries = preview_replay(&env, 2_000, 3_000);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries.get(0).unwrap().health_score, 85);
        assert_eq!(entries.get(1).unwrap().health_score, 70);
    });
}

#[test]
fn test_health_and_price_submissions_keep_their_order() {
    let (env, admin, contract_id) = setup();
    let asset = String::from_str(&env, "USDC");
    let source = String::from_str(&env, "oracle");
    env.as_contract(&contract_id, || {
        env.ledger().set_timestamp(1_000);
        record_health_submission(&env, &admin, asset.clone(), 80, 75, 90, 85);
        env.ledger().set_timestamp(1_500);
        record_price_submission(&env, &admin, asset.clone(), 1_000_000, source.clone());

        let entries = preview_replay(&env, 0, u64::MAX);
        assert_eq!(entries.len(), 2);
        let first = entries.get(0).unwrap();
        let second = entries.get(1).unwrap();
        assert_eq!(first.submission_type, SubmissionType::Health);
        assert_eq!(second.submission_type, SubmissionType::Price);
        assert_eq!(second.price, 1_000_000);
        assert!(first.ordering_key < second.ordering_key);
    });
}

#[test]
fn test_execute_replay_by_admin_summarises_the_range() {
    let (env, admin, contract_id) = setup();
    let asset = String::from_str(&env, "USDC");
    env.as_contract(&contract_id, || {
        env.ledger().set_timestamp(1_000);
        record_health_submission(&env, &admin, asset.clone(), 80, 75, 90, 85);
        env.ledger().set_timestamp(2_000);
        record_health_submission(&env, &admin, asset.clone(), 90, 85, 95, 90);
    });

    env.ledger().set_timestamp(5_000);
    env.as_contract(&contract_id, || {
        let summary = execute_replay(&env, &admin, 1_000, 2_000);
        assert_eq!(summary.entries_replayed, 2);
        assert_eq!(summary.from_timestamp, 1_000);
        assert_eq!(summary.to_timestamp, 2_000);
        assert_eq!(summary.executed_at, 5_000);
    });
}
