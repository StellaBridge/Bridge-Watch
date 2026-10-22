#![cfg(test)]

use bridge_watch_contracts::report_hash::{
    compute_health_report_hash, compute_liquidity_report_hash, compute_mismatch_report_hash,
    compute_price_report_hash, compute_report_hash, verify_report_hash, ReportPayload,
    HASH_SCHEMA_VERSION,
};
use soroban_sdk::{BytesN, Env, String};

fn payload(env: &Env) -> ReportPayload {
    ReportPayload {
        report_type: String::from_str(env, "health"),
        asset_code: String::from_str(env, "USDC"),
        value: 9_500,
        timestamp: 1_000_000,
        nonce: 1,
    }
}

// ---------------------------------------------------------------------------
// Deterministic hash generation
// ---------------------------------------------------------------------------

#[test]
fn test_identical_payloads_hash_identically() {
    let env = Env::default();

    let a = compute_report_hash(&env, &payload(&env));
    let b = compute_report_hash(&env, &payload(&env));

    assert_eq!(a, b);
}

#[test]
fn test_typed_helpers_are_deterministic() {
    let env = Env::default();
    let usdc = String::from_str(&env, "USDC");
    let source = String::from_str(&env, "coingecko");
    let pair = String::from_str(&env, "USDC/XLM");
    let bridge = String::from_str(&env, "stellar-ethereum");

    assert_eq!(
        compute_health_report_hash(&env, &usdc, 9_500, 9_000, 8_800, 9_900, 1_000_000, 7),
        compute_health_report_hash(&env, &usdc, 9_500, 9_000, 8_800, 9_900, 1_000_000, 7)
    );
    assert_eq!(
        compute_price_report_hash(&env, &usdc, 1_000_000, &source, 1_000_000, 7),
        compute_price_report_hash(&env, &usdc, 1_000_000, &source, 1_000_000, 7)
    );
    assert_eq!(
        compute_mismatch_report_hash(&env, &bridge, &usdc, 500, 450, 1_000_000, 7),
        compute_mismatch_report_hash(&env, &bridge, &usdc, 500, 450, 1_000_000, 7)
    );
    assert_eq!(
        compute_liquidity_report_hash(&env, &pair, 10_000, 1, 2, 3, 4, 1_000_000, 7),
        compute_liquidity_report_hash(&env, &pair, 10_000, 1, 2, 3, 4, 1_000_000, 7)
    );
}

#[test]
fn test_result_echoes_schema_version_and_payload() {
    let env = Env::default();
    let p = payload(&env);

    let result = compute_report_hash(&env, &p);

    assert_eq!(result.schema_version, HASH_SCHEMA_VERSION);
    assert_eq!(result.payload, p);
}

// ---------------------------------------------------------------------------
// Collision resistance: every committed field must change the hash
// ---------------------------------------------------------------------------

#[test]
fn test_generic_hash_changes_with_each_field() {
    let env = Env::default();
    let base = compute_report_hash(&env, &payload(&env)).hash;

    let mut mutated = payload(&env);
    mutated.report_type = String::from_str(&env, "price");
    assert_ne!(compute_report_hash(&env, &mutated).hash, base);

    let mut mutated = payload(&env);
    mutated.asset_code = String::from_str(&env, "EURC");
    assert_ne!(compute_report_hash(&env, &mutated).hash, base);

    let mut mutated = payload(&env);
    mutated.value += 1;
    assert_ne!(compute_report_hash(&env, &mutated).hash, base);

    let mut mutated = payload(&env);
    mutated.timestamp += 1;
    assert_ne!(compute_report_hash(&env, &mutated).hash, base);

    let mut mutated = payload(&env);
    mutated.nonce += 1;
    assert_ne!(compute_report_hash(&env, &mutated).hash, base);
}

#[test]
fn test_health_hash_changes_with_each_input() {
    let env = Env::default();
    let usdc = String::from_str(&env, "USDC");
    let eurc = String::from_str(&env, "EURC");
    let base =
        compute_health_report_hash(&env, &usdc, 9_500, 9_000, 8_800, 9_900, 1_000_000, 7).hash;

    let mutants = [
        compute_health_report_hash(&env, &eurc, 9_500, 9_000, 8_800, 9_900, 1_000_000, 7).hash,
        compute_health_report_hash(&env, &usdc, 9_501, 9_000, 8_800, 9_900, 1_000_000, 7).hash,
        compute_health_report_hash(&env, &usdc, 9_500, 9_001, 8_800, 9_900, 1_000_000, 7).hash,
        compute_health_report_hash(&env, &usdc, 9_500, 9_000, 8_801, 9_900, 1_000_000, 7).hash,
        compute_health_report_hash(&env, &usdc, 9_500, 9_000, 8_800, 9_901, 1_000_000, 7).hash,
        compute_health_report_hash(&env, &usdc, 9_500, 9_000, 8_800, 9_900, 1_000_001, 7).hash,
        compute_health_report_hash(&env, &usdc, 9_500, 9_000, 8_800, 9_900, 1_000_000, 8).hash,
    ];

    for mutant in mutants {
        assert_ne!(mutant, base);
    }
}

#[test]
fn test_price_hash_changes_with_each_input() {
    let env = Env::default();
    let usdc = String::from_str(&env, "USDC");
    let source = String::from_str(&env, "coingecko");
    let base = compute_price_report_hash(&env, &usdc, 1_000_000, &source, 1_000_000, 7).hash;

    let mutants = [
        compute_price_report_hash(
            &env,
            &String::from_str(&env, "EURC"),
            1_000_000,
            &source,
            1_000_000,
            7,
        )
        .hash,
        compute_price_report_hash(&env, &usdc, 1_000_001, &source, 1_000_000, 7).hash,
        compute_price_report_hash(
            &env,
            &usdc,
            1_000_000,
            &String::from_str(&env, "binance"),
            1_000_000,
            7,
        )
        .hash,
        compute_price_report_hash(&env, &usdc, 1_000_000, &source, 1_000_001, 7).hash,
        compute_price_report_hash(&env, &usdc, 1_000_000, &source, 1_000_000, 8).hash,
    ];

    for mutant in mutants {
        assert_ne!(mutant, base);
    }
}

#[test]
fn test_mismatch_hash_binds_both_supplies_not_just_the_delta() {
    let env = Env::default();
    let bridge = String::from_str(&env, "stellar-ethereum");
    let usdc = String::from_str(&env, "USDC");

    // Both reports carry a delta of 10, but the underlying supplies differ.
    let a = compute_mismatch_report_hash(&env, &bridge, &usdc, 100, 90, 1_000_000, 1);
    let b = compute_mismatch_report_hash(&env, &bridge, &usdc, 110, 100, 1_000_000, 1);

    assert_eq!(a.payload.value, b.payload.value);
    assert_ne!(a.hash, b.hash);
}

#[test]
fn test_mismatch_hash_changes_with_bridge_id() {
    let env = Env::default();
    let usdc = String::from_str(&env, "USDC");

    let a = compute_mismatch_report_hash(
        &env,
        &String::from_str(&env, "stellar-ethereum"),
        &usdc,
        100,
        90,
        1_000_000,
        1,
    );
    let b = compute_mismatch_report_hash(
        &env,
        &String::from_str(&env, "stellar-base"),
        &usdc,
        100,
        90,
        1_000_000,
        1,
    );

    assert_ne!(a.hash, b.hash);
}

#[test]
fn test_liquidity_hash_changes_with_depth_buckets() {
    let env = Env::default();
    let pair = String::from_str(&env, "USDC/XLM");
    let base = compute_liquidity_report_hash(&env, &pair, 10_000, 1, 2, 3, 4, 1_000_000, 7).hash;

    let mutants = [
        compute_liquidity_report_hash(&env, &pair, 10_001, 1, 2, 3, 4, 1_000_000, 7).hash,
        compute_liquidity_report_hash(&env, &pair, 10_000, 2, 2, 3, 4, 1_000_000, 7).hash,
        compute_liquidity_report_hash(&env, &pair, 10_000, 1, 3, 3, 4, 1_000_000, 7).hash,
        compute_liquidity_report_hash(&env, &pair, 10_000, 1, 2, 4, 4, 1_000_000, 7).hash,
        compute_liquidity_report_hash(&env, &pair, 10_000, 1, 2, 3, 5, 1_000_000, 7).hash,
    ];

    for mutant in mutants {
        assert_ne!(mutant, base);
    }
}

// ---------------------------------------------------------------------------
// Verification against a previously committed hash
// ---------------------------------------------------------------------------

#[test]
fn test_verify_accepts_committed_hash_and_rejects_tampering() {
    let env = Env::default();
    let p = payload(&env);
    let committed = compute_report_hash(&env, &p).hash;

    assert!(verify_report_hash(&env, &p, &committed));

    let mut tampered = p.clone();
    tampered.value += 1;
    assert!(!verify_report_hash(&env, &tampered, &committed));
}

#[test]
fn test_verify_rejects_unrelated_hash() {
    let env = Env::default();
    let p = payload(&env);
    let zero: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);

    assert!(!verify_report_hash(&env, &p, &zero));
}

// ---------------------------------------------------------------------------
// Empty and malformed payloads
// ---------------------------------------------------------------------------

#[test]
fn test_empty_payload_hashes_to_a_stable_distinct_value() {
    let env = Env::default();
    let empty = ReportPayload {
        report_type: String::from_str(&env, ""),
        asset_code: String::from_str(&env, ""),
        value: 0,
        timestamp: 0,
        nonce: 0,
    };

    let result = compute_report_hash(&env, &empty);

    assert_eq!(result.schema_version, HASH_SCHEMA_VERSION);
    assert_eq!(result.hash, compute_report_hash(&env, &empty).hash);
    assert_ne!(result.hash, compute_report_hash(&env, &payload(&env)).hash);
}

#[test]
fn test_empty_strings_do_not_collide_with_swapped_fields() {
    let env = Env::default();
    let empty = String::from_str(&env, "");
    let usdc = String::from_str(&env, "USDC");
    let source = String::from_str(&env, "coingecko");

    // Length prefixes keep an empty asset from being confused with an empty source.
    let a = compute_price_report_hash(&env, &empty, 1_000_000, &usdc, 1_000_000, 7);
    let b = compute_price_report_hash(&env, &usdc, 1_000_000, &empty, 1_000_000, 7);

    assert_ne!(a.hash, b.hash);
    assert_ne!(
        compute_price_report_hash(&env, &empty, 1_000_000, &source, 1_000_000, 7).hash,
        a.hash
    );
}

#[test]
fn test_negative_and_zero_values_are_hashed_distinctly() {
    let env = Env::default();
    let usdc = String::from_str(&env, "USDC");
    let source = String::from_str(&env, "coingecko");

    let zero = compute_price_report_hash(&env, &usdc, 0, &source, 0, 0).hash;
    let negative = compute_price_report_hash(&env, &usdc, -1, &source, 0, 0).hash;
    let max = compute_price_report_hash(&env, &usdc, i128::MAX, &source, 0, 0).hash;

    assert_ne!(zero, negative);
    assert_ne!(zero, max);
    assert_ne!(negative, max);
}
