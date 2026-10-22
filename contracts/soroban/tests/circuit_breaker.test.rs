#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};
use bridge_watch_contracts::circuit_breaker::{
    AlertType, CircuitBreakerContract, CircuitBreakerContractClient, GuardianRole, PauseLevel,
    PauseScope,
};

fn setup() -> (Env, CircuitBreakerContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let contract_id = env.register_contract(None, CircuitBreakerContract);
    let client = CircuitBreakerContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    // guardian_threshold=2, recovery_delay_warning=3600, recovery_delay_partial=7200,
    // recovery_delay_full=14400, max_whitelist_size=100
    client.initialize(&admin, &2, &3600, &7200, &14400, &100);

    (env, client, admin)
}

fn add_emergency_guardian(
    client: &CircuitBreakerContractClient,
    admin: &Address,
) -> Address {
    let env = client.env();
    let guardian = Address::generate(env);
    client.add_guardian(admin, &guardian, &GuardianRole::EmergencyGuardian);
    guardian
}

fn add_standard_guardian(
    client: &CircuitBreakerContractClient,
    admin: &Address,
) -> Address {
    let env = client.env();
    let guardian = Address::generate(env);
    client.add_guardian(admin, &guardian, &GuardianRole::StandardGuardian);
    guardian
}

// ── Initialization ─────────────────────────────────────────────────────────

#[test]
fn test_double_initialize_panics() {
    let (_, client, admin) = setup();
    // Second initialize should panic
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.initialize(&admin, &2, &3600, &7200, &14400, &100);
    }));
    assert!(result.is_err());
}

// ── Guardian Management ────────────────────────────────────────────────────

#[test]
fn test_add_and_verify_emergency_guardian() {
    let (_, client, admin) = setup();
    let guardian = Address::generate(client.env());

    client.add_guardian(&admin, &guardian, &GuardianRole::EmergencyGuardian);

    let guardians = client.get_guardians();
    assert_eq!(guardians.len(), 1);
    let g = guardians.get(0).unwrap();
    assert_eq!(g.address, guardian);
    assert!(g.active);
}

#[test]
fn test_remove_guardian() {
    let (_, client, admin) = setup();
    let guardian = add_emergency_guardian(&client, &admin);

    client.remove_guardian(&admin, &guardian);

    let guardians = client.get_guardians();
    let g = guardians.get(0).unwrap();
    assert!(!g.active);
}

// ── Pause Activation ───────────────────────────────────────────────────────

#[test]
fn test_pause_global_sets_is_paused_true() {
    let (env, client, admin) = setup();
    let guardian = add_emergency_guardian(&client, &admin);

    client.pause_global(&guardian, &String::from_str(&env, "emergency test"));

    assert!(client.is_paused(&PauseScope::Global));
    assert!(client.is_paused(&PauseScope::Bridge(String::from_str(&env, "any-bridge"))));
}

#[test]
fn test_pause_bridge_scoped() {
    let (env, client, admin) = setup();
    let guardian = add_standard_guardian(&client, &admin);
    let bridge_id = String::from_str(&env, "bridge-alpha");

    client.pause_bridge(&guardian, &bridge_id, &String::from_str(&env, "suspicious volume"));

    assert!(client.is_paused(&PauseScope::Bridge(bridge_id.clone())));
    // Asset scope must NOT be paused
    assert!(!client.is_paused(&PauseScope::Asset(String::from_str(&env, "USDC"))));
}

#[test]
fn test_pause_asset_scoped() {
    let (env, client, admin) = setup();
    let guardian = add_standard_guardian(&client, &admin);
    let asset_code = String::from_str(&env, "USDC");

    client.pause_asset(&guardian, &asset_code, &String::from_str(&env, "supply mismatch"));

    assert!(client.is_paused(&PauseScope::Asset(asset_code)));
    assert!(!client.is_paused(&PauseScope::Global));
}

// ── Threshold Trigger Config ───────────────────────────────────────────────

#[test]
fn test_set_trigger_config_stored_by_admin() {
    let (_, client, admin) = setup();

    client.set_trigger_config(
        &admin,
        &AlertType::VolumeSpike,
        &500_000_i128,
        &PauseLevel::Partial,
        &3600_u64,
    );

    // If no panic occurred the config was accepted
}

#[test]
#[should_panic]
fn test_set_trigger_config_rejected_for_non_admin() {
    let (_, client, _admin) = setup();
    let rogue = Address::generate(client.env());

    client.set_trigger_config(
        &rogue,
        &AlertType::VolumeSpike,
        &500_000_i128,
        &PauseLevel::Full,
        &3600_u64,
    );
}

// ── Whitelist ──────────────────────────────────────────────────────────────

#[test]
fn test_whitelist_address() {
    let (_, client, admin) = setup();
    let addr = Address::generate(client.env());

    client.add_to_address_whitelist(&admin, &addr);

    assert!(client.is_whitelisted_address(&addr));
}

#[test]
fn test_whitelist_asset() {
    let (env, client, admin) = setup();
    let asset = String::from_str(&env, "XLM");

    client.add_asset_to_whitelist(&admin, &asset);

    assert!(client.is_whitelisted_asset(&asset));
}

// ── Volume Cap ─────────────────────────────────────────────────────────────

#[test]
fn test_effective_volume_cap_default_when_not_paused() {
    let (_, client, _) = setup();
    let cap = client.effective_volume_cap_bps(&PauseScope::Global);
    assert_eq!(cap, 10_000); // 100% — no restriction when not paused
}

#[test]
fn test_effective_volume_cap_reduced_on_global_pause() {
    let (env, client, admin) = setup();
    let guardian = add_emergency_guardian(&client, &admin);

    client.pause_global(&guardian, &String::from_str(&env, "drain detected"));

    let cap = client.effective_volume_cap_bps(&PauseScope::Global);
    assert!(cap < 10_000, "volume cap should be below 100% during full pause");
}

// ── Recovery (cooldown) ────────────────────────────────────────────────────

#[test]
fn test_start_cooldown_after_pause() {
    let (env, client, admin) = setup();
    let guardian = add_emergency_guardian(&client, &admin);

    client.pause_global(&guardian, &String::from_str(&env, "spike"));

    // pause_id 1 was created; start cooldown via admin
    client.start_cooldown(&admin, &1u32);
}

#[test]
fn test_recovery_request_by_standard_guardian() {
    let (env, client, admin) = setup();
    let eg = add_emergency_guardian(&client, &admin);
    let sg = add_standard_guardian(&client, &admin);

    client.pause_global(&eg, &String::from_str(&env, "anomaly"));
    client.request_recovery(&sg, &1u32);
}
