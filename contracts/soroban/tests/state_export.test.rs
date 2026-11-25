#![cfg(test)]

//! Unit tests for `state_export.rs` (issue #1706).
//!
//! Covers the full per-asset mapping in a contract export, the checksum over
//! the exported payload, MMR inclusion checks and the snapshot builders.
//!
//! Not covered: pagination of large exports and admin-only export. Neither is
//! implemented. `export_contract_data_snapshot` returns every monitored asset
//! in one call and takes no caller, so there is no authorization to test.

use bridge_watch_contracts::state_export::{
    AssetStateSnapshot, StateExportHelper, STATE_EXPORT_VERSION,
};
use bridge_watch_contracts::{AssetHealth, BridgeWatchContract, BridgeWatchContractClient};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Address, BytesN, Env, String, Vec};

const NOW: u64 = 1_000_000;

fn setup() -> (Env, BridgeWatchContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let contract_id = env.register_contract(None, BridgeWatchContract);
    let client = BridgeWatchContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin, contract_id)
}

fn health(env: &Env, score: u32, paused: bool, active: bool) -> AssetHealth {
    AssetHealth {
        asset_code: String::from_str(env, "USDC"),
        health_score: score,
        liquidity_score: score,
        price_stability_score: score,
        bridge_uptime_score: score,
        paused,
        active,
        timestamp: NOW,
        expires_at: NOW + 1_000,
    }
}

#[test]
fn test_export_maps_every_monitored_asset_in_sorted_order() {
    let (env, client, admin, contract_id) = setup();
    let usdc = String::from_str(&env, "USDC");
    let eurc = String::from_str(&env, "EURC");
    let btc = String::from_str(&env, "BTC");
    client.register_asset(&admin, &usdc);
    client.register_asset(&admin, &eurc);
    client.register_asset(&admin, &btc);
    client.submit_health(&admin, &usdc, &90, &88, &92, &91);
    client.submit_health(&admin, &eurc, &70, &68, &72, &71);

    let export = client.export_contract_data_snapshot();
    assert_eq!(export.version, STATE_EXPORT_VERSION);
    assert_eq!(export.metadata.item_count, 3);
    assert_eq!(export.contract_address, contract_id);

    let snapshots = client.list_asset_state_snapshots();
    assert_eq!(snapshots.len(), 3);
    // Ascending by asset code: BTC, EURC, USDC.
    let btc_snap = snapshots.get(0).unwrap();
    let eurc_snap = snapshots.get(1).unwrap();
    let usdc_snap = snapshots.get(2).unwrap();
    assert_eq!(btc_snap.asset_code, btc);
    assert_eq!(eurc_snap.asset_code, eurc);
    assert_eq!(usdc_snap.asset_code, usdc);

    // BTC was registered but never scored. Registration stores a zero-score
    // record, so it is exported as Active/Critical rather than dropped.
    assert_eq!(btc_snap.status, String::from_str(&env, "Active"));
    assert_eq!(btc_snap.risk_rating, String::from_str(&env, "Critical"));
    assert_eq!(btc_snap.risk_score_bps, 0);

    assert_eq!(eurc_snap.risk_rating, String::from_str(&env, "Medium"));
    assert_eq!(eurc_snap.risk_score_bps, 7_000);

    assert_eq!(usdc_snap.risk_rating, String::from_str(&env, "Low"));
    assert_eq!(usdc_snap.risk_score_bps, 9_000);
    assert_eq!(usdc_snap.updated_at, NOW);
    assert!(!usdc_snap.is_frozen);
}

#[test]
fn test_state_hash_matches_digest_recomputed_over_exported_snapshots() {
    let (env, client, admin, _) = setup();
    let usdc = String::from_str(&env, "USDC");
    client.register_asset(&admin, &usdc);
    client.submit_health(&admin, &usdc, &90, &88, &92, &91);

    let export = client.export_contract_data_snapshot();
    let snapshots = client.list_asset_state_snapshots();
    let recomputed = StateExportHelper::compute_snapshots_hash(&env, &snapshots);

    assert_eq!(export.state_hash, recomputed);
    // SHA-256 rendered as lowercase hex.
    assert_eq!(export.state_hash.len(), 64);
}

#[test]
fn test_state_hash_is_stable_then_changes_with_exported_state() {
    let (env, client, admin, _) = setup();
    let usdc = String::from_str(&env, "USDC");
    client.register_asset(&admin, &usdc);
    client.submit_health(&admin, &usdc, &90, &88, &92, &91);

    let before = client.export_contract_data_snapshot().state_hash;
    assert_eq!(client.export_contract_data_snapshot().state_hash, before);

    client.submit_health(&admin, &usdc, &40, &88, &92, &91);
    let after = client.export_contract_data_snapshot().state_hash;
    assert_ne!(before, after);

    // Flipping one exported field must change the digest.
    let snapshots = client.list_asset_state_snapshots();
    let mut tampered_snap: AssetStateSnapshot = snapshots.get(0).unwrap();
    tampered_snap.is_frozen = !tampered_snap.is_frozen;
    let mut tampered: Vec<AssetStateSnapshot> = Vec::new(&env);
    tampered.push_back(tampered_snap);
    assert_ne!(
        StateExportHelper::compute_snapshots_hash(&env, &tampered),
        after
    );
}

#[test]
fn test_verify_state_inclusion_requires_both_root_and_leaf_index() {
    let env = Env::default();
    let contract = Address::generate(&env);
    let root = BytesN::from_array(&env, &[7u8; 32]);
    let other_root = BytesN::from_array(&env, &[8u8; 32]);
    let snapshots: Vec<AssetStateSnapshot> = Vec::new(&env);

    let anchored = StateExportHelper::assemble_export_with_mmr(
        &env,
        contract.clone(),
        snapshots.clone(),
        Some(root.clone()),
        Some(12),
    );
    assert!(StateExportHelper::verify_state_inclusion(
        &env, &anchored, &root
    ));
    assert!(!StateExportHelper::verify_state_inclusion(
        &env,
        &anchored,
        &other_root
    ));

    let missing_leaf = StateExportHelper::assemble_export_with_mmr(
        &env,
        contract.clone(),
        snapshots.clone(),
        Some(root.clone()),
        None,
    );
    assert!(!StateExportHelper::verify_state_inclusion(
        &env,
        &missing_leaf,
        &root
    ));

    let unanchored = StateExportHelper::assemble_export(&env, contract, snapshots);
    assert!(!StateExportHelper::verify_state_inclusion(
        &env,
        &unanchored,
        &root
    ));
}

#[test]
fn test_snapshot_status_reflects_active_and_paused_flags() {
    let env = Env::default();

    let inactive =
        StateExportHelper::build_asset_snapshot_from_health(&env, &health(&env, 90, false, false));
    assert_eq!(inactive.status, String::from_str(&env, "Inactive"));
    assert!(!inactive.is_frozen);

    let paused =
        StateExportHelper::build_asset_snapshot_from_health(&env, &health(&env, 90, true, true));
    assert_eq!(paused.status, String::from_str(&env, "Paused"));
    assert!(paused.is_frozen);

    let active =
        StateExportHelper::build_asset_snapshot_from_health(&env, &health(&env, 90, false, true));
    assert_eq!(active.status, String::from_str(&env, "Active"));
    assert!(!active.is_frozen);
}

#[test]
fn test_risk_rating_tier_boundaries() {
    let env = Env::default();
    let cases: [(u32, &str); 8] = [
        (100, "Low"),
        (80, "Low"),
        (79, "Medium"),
        (60, "Medium"),
        (59, "High"),
        (40, "High"),
        (39, "Critical"),
        (0, "Critical"),
    ];
    for &(score, expected) in cases.iter() {
        let snap = StateExportHelper::build_asset_snapshot_from_health(
            &env,
            &health(&env, score, false, true),
        );
        assert_eq!(
            snap.risk_rating,
            String::from_str(&env, expected),
            "score {}",
            score
        );
    }
}

#[test]
fn test_risk_score_bps_saturates_instead_of_overflowing() {
    let env = Env::default();
    let snap = StateExportHelper::build_asset_snapshot_from_health(
        &env,
        &health(&env, u32::MAX, false, true),
    );
    assert_eq!(snap.risk_score_bps, u32::MAX);
}

#[test]
fn test_compare_strings_orders_prefix_before_longer_code() {
    let env = Env::default();
    let usd = String::from_str(&env, "USD");
    let usdc = String::from_str(&env, "USDC");
    assert_eq!(StateExportHelper::compare_strings(&usd, &usdc), -1);
    assert_eq!(StateExportHelper::compare_strings(&usdc, &usd), 1);
    assert_eq!(StateExportHelper::compare_strings(&usdc, &usdc.clone()), 0);
}
