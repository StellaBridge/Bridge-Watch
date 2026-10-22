#![cfg(test)]

use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env, String, Vec};
use bridge_watch_contracts::asset_ranking::{
    compute_all_rankings, compute_asset_rank, get_ranking_weights, set_ranking_weights,
    AssetScoreInput, DEFAULT_HEALTH_WEIGHT, DEFAULT_LIQUIDITY_WEIGHT, DEFAULT_VOLUME_WEIGHT,
};
use bridge_watch_contracts::keys;

fn setup() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    env.storage().instance().set(&keys::ADMIN, &admin);
    env.ledger().set_timestamp(1_000_000);
    (env, admin)
}

fn make_input(env: &Env, code: &str, health: u32, price: u32, liq: u32) -> AssetScoreInput {
    AssetScoreInput {
        asset_code: String::from_str(env, code),
        health_score: health,
        price_stability_score: price,
        liquidity_score: liq,
    }
}

// ── Default Weights ────────────────────────────────────────────────────────

#[test]
fn test_default_weights_are_correct() {
    let (env, _) = setup();
    let w = get_ranking_weights(&env);
    assert_eq!(w.health_weight, DEFAULT_HEALTH_WEIGHT);
    assert_eq!(w.volume_weight, DEFAULT_VOLUME_WEIGHT);
    assert_eq!(w.liquidity_weight, DEFAULT_LIQUIDITY_WEIGHT);
    assert_eq!(w.health_weight + w.volume_weight + w.liquidity_weight, 100);
}

// ── set_ranking_weights ────────────────────────────────────────────────────

#[test]
fn test_set_weights_updates_values_and_bumps_version() {
    let (env, admin) = setup();
    set_ranking_weights(&env, &admin, 50, 30, 20);
    let w = get_ranking_weights(&env);
    assert_eq!(w.health_weight, 50);
    assert_eq!(w.volume_weight, 30);
    assert_eq!(w.liquidity_weight, 20);
    assert_eq!(w.version, 2);
}

#[test]
#[should_panic(expected = "ranking weights must sum to 100")]
fn test_weights_not_summing_to_100_panics() {
    let (env, admin) = setup();
    set_ranking_weights(&env, &admin, 50, 30, 30); // 110 — invalid
}

#[test]
#[should_panic(expected = "ranking weights must sum to 100")]
fn test_weights_summing_below_100_panics() {
    let (env, admin) = setup();
    set_ranking_weights(&env, &admin, 30, 30, 30); // 90 — invalid
}

#[test]
fn test_zero_weight_allowed_when_sum_is_100() {
    let (env, admin) = setup();
    set_ranking_weights(&env, &admin, 100, 0, 0);
    let w = get_ranking_weights(&env);
    assert_eq!(w.health_weight, 100);
    assert_eq!(w.volume_weight, 0);
    assert_eq!(w.liquidity_weight, 0);
}

// ── compute_asset_rank ─────────────────────────────────────────────────────

#[test]
fn test_compute_single_asset_weighted_score() {
    let (env, _) = setup();
    // Default weights: health=40, volume=30, liquidity=30
    // score = (80*40 + 90*30 + 70*30) / 100 = (3200+2700+2100)/100 = 80
    let rank = compute_asset_rank(&env, String::from_str(&env, "USDC"), 80, 90, 70);
    assert_eq!(rank.score, 80);
    assert_eq!(rank.asset_code, String::from_str(&env, "USDC"));
    assert_eq!(rank.timestamp, 1_000_000);
}

#[test]
fn test_compute_zero_scores_return_zero() {
    let (env, _) = setup();
    let rank = compute_asset_rank(&env, String::from_str(&env, "NEW"), 0, 0, 0);
    assert_eq!(rank.score, 0);
}

#[test]
fn test_compute_max_scores_return_100() {
    let (env, _) = setup();
    let rank = compute_asset_rank(&env, String::from_str(&env, "XLM"), 100, 100, 100);
    assert_eq!(rank.score, 100);
}

#[test]
fn test_zero_liquidity_does_not_panic() {
    // Edge case: new asset with no liquidity yet
    let (env, _) = setup();
    let rank = compute_asset_rank(&env, String::from_str(&env, "NEWTKN"), 50, 60, 0);
    // score = (50*40 + 60*30 + 0*30) / 100 = (2000+1800+0)/100 = 38
    assert_eq!(rank.score, 38);
}

// ── compute_all_rankings ───────────────────────────────────────────────────

#[test]
fn test_rankings_sorted_descending_by_score() {
    let (env, _) = setup();
    let mut inputs: Vec<AssetScoreInput> = Vec::new(&env);
    inputs.push_back(make_input(&env, "LOW",  40, 40, 40)); // score 40
    inputs.push_back(make_input(&env, "HIGH", 90, 90, 90)); // score 90
    inputs.push_back(make_input(&env, "MID",  70, 70, 70)); // score 70

    let ranked = compute_all_rankings(&env, inputs);
    assert_eq!(ranked.len(), 3);
    assert_eq!(ranked.get(0).unwrap().asset_code, String::from_str(&env, "HIGH"));
    assert_eq!(ranked.get(1).unwrap().asset_code, String::from_str(&env, "MID"));
    assert_eq!(ranked.get(2).unwrap().asset_code, String::from_str(&env, "LOW"));
    assert_eq!(ranked.get(0).unwrap().rank, 1);
    assert_eq!(ranked.get(2).unwrap().rank, 3);
}

#[test]
fn test_tie_broken_alphabetically() {
    let (env, _) = setup();
    // All scores equal — alphabetical order wins
    let mut inputs: Vec<AssetScoreInput> = Vec::new(&env);
    inputs.push_back(make_input(&env, "USDC", 70, 70, 70));
    inputs.push_back(make_input(&env, "EURC", 70, 70, 70));
    inputs.push_back(make_input(&env, "XLM",  70, 70, 70));

    let ranked = compute_all_rankings(&env, inputs);
    assert_eq!(ranked.get(0).unwrap().asset_code, String::from_str(&env, "EURC"));
    assert_eq!(ranked.get(1).unwrap().asset_code, String::from_str(&env, "USDC"));
    assert_eq!(ranked.get(2).unwrap().asset_code, String::from_str(&env, "XLM"));
}

#[test]
fn test_single_asset_ranks_first() {
    let (env, _) = setup();
    let mut inputs: Vec<AssetScoreInput> = Vec::new(&env);
    inputs.push_back(make_input(&env, "SOLO", 50, 50, 50));

    let ranked = compute_all_rankings(&env, inputs);
    assert_eq!(ranked.len(), 1);
    assert_eq!(ranked.get(0).unwrap().rank, 1);
}

#[test]
fn test_empty_input_returns_empty_output() {
    let (env, _) = setup();
    let inputs: Vec<AssetScoreInput> = Vec::new(&env);
    let ranked = compute_all_rankings(&env, inputs);
    assert_eq!(ranked.len(), 0);
}

#[test]
fn test_rank_numbers_are_contiguous() {
    let (env, _) = setup();
    let mut inputs: Vec<AssetScoreInput> = Vec::new(&env);
    inputs.push_back(make_input(&env, "A", 90, 80, 70));
    inputs.push_back(make_input(&env, "B", 60, 60, 60));
    inputs.push_back(make_input(&env, "C", 30, 40, 50));
    inputs.push_back(make_input(&env, "D", 10, 10, 10));

    let ranked = compute_all_rankings(&env, inputs);
    for (i, entry) in ranked.iter().enumerate() {
        assert_eq!(entry.rank, (i + 1) as u32);
    }
}

// ── Overflow / boundary protection ────────────────────────────────────────

#[test]
fn test_score_capped_at_100_with_max_inputs() {
    let (env, _) = setup();
    let rank = compute_asset_rank(&env, String::from_str(&env, "MAX"), 100, 100, 100);
    assert!(rank.score <= 100, "score must not exceed 100");
}
