#![cfg(test)]

//! Global submission pause (#1704): the guardian can halt writes, every data
//! submission is rejected while paused, unpause waits for the 24-hour timelock,
//! and pause transitions are recorded in the audit history.

use bridge_watch_contracts::{BridgeWatchContract, BridgeWatchContractClient};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Address, Env, String};

const T0: u64 = 1_000_000;
const TIMELOCK_SECS: u64 = 86_400;

fn s(env: &Env, text: &str) -> String {
    String::from_str(env, text)
}

struct Fixture {
    env: Env,
    client: BridgeWatchContractClient<'static>,
    admin: Address,
    guardian: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);
    let contract_id = env.register_contract(None, BridgeWatchContract);
    let client = BridgeWatchContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let guardian = Address::generate(&env);
    client.initialize(&admin);
    client.set_pause_guardian(&admin, &guardian);
    Fixture {
        env,
        client,
        admin,
        guardian,
    }
}

#[test]
fn guardian_pauses_submissions_and_status_reflects_it() {
    let f = setup();

    f.client
        .emergency_pause(&f.guardian, &s(&f.env, "suspicious transfer batch"));

    let status = f.client.get_pause_status();
    assert!(status.is_paused);
    assert_eq!(status.reason, s(&f.env, "suspicious transfer batch"));
    assert_eq!(status.paused_at, T0);
    assert_eq!(status.unpause_available_at, T0 + TIMELOCK_SECS);
}

#[test]
fn admin_can_also_pause() {
    let f = setup();

    f.client.emergency_pause(&f.admin, &s(&f.env, "admin halt"));

    assert!(f.client.get_pause_status().is_paused);
}

#[test]
#[should_panic(expected = "only admin or pause guardian can trigger emergency pause")]
fn unrelated_address_cannot_pause() {
    let f = setup();
    let stranger = Address::generate(&f.env);

    f.client.emergency_pause(&stranger, &s(&f.env, "not authorised"));
}

#[test]
#[should_panic(expected = "globally paused")]
fn paused_contract_rejects_price_submissions() {
    let f = setup();
    let asset = s(&f.env, "USDC");
    f.client.register_asset(&f.admin, &asset);
    f.client.emergency_pause(&f.guardian, &s(&f.env, "halt"));

    f.client.submit_price(&f.admin, &asset, &1_000_000, &s(&f.env, "oracle-1"));
}

#[test]
#[should_panic(expected = "globally paused")]
fn paused_contract_rejects_health_submissions() {
    let f = setup();
    let asset = s(&f.env, "USDC");
    f.client.register_asset(&f.admin, &asset);
    f.client.emergency_pause(&f.guardian, &s(&f.env, "halt"));

    f.client.submit_health(&f.admin, &asset, &80, &80, &80, &80);
}

#[test]
#[should_panic(expected = "globally paused")]
fn paused_contract_rejects_asset_registration() {
    let f = setup();
    f.client.emergency_pause(&f.guardian, &s(&f.env, "halt"));

    f.client.register_asset(&f.admin, &s(&f.env, "EURC"));
}

#[test]
#[should_panic(expected = "unpause timelock has not elapsed yet")]
fn unpause_is_rejected_before_the_timelock_elapses() {
    let f = setup();
    f.client.emergency_pause(&f.guardian, &s(&f.env, "halt"));

    f.env.ledger().set_timestamp(T0 + TIMELOCK_SECS - 1);
    f.client.unpause(&f.admin, &s(&f.env, "too early"));
}

#[test]
#[should_panic(expected = "only admin can unpause the contract")]
fn guardian_cannot_unpause() {
    let f = setup();
    f.client.emergency_pause(&f.guardian, &s(&f.env, "halt"));

    f.env.ledger().set_timestamp(T0 + TIMELOCK_SECS);
    f.client.unpause(&f.guardian, &s(&f.env, "guardian lift"));
}

#[test]
fn unpause_after_the_timelock_restores_submissions() {
    let f = setup();
    let asset = s(&f.env, "USDC");
    f.client.register_asset(&f.admin, &asset);
    f.client.emergency_pause(&f.guardian, &s(&f.env, "halt"));

    f.env.ledger().set_timestamp(T0 + TIMELOCK_SECS);
    f.client.unpause(&f.admin, &s(&f.env, "incident closed"));

    assert!(!f.client.get_pause_status().is_paused);
    // Submissions are accepted again once the pause is lifted.
    f.client.submit_price(&f.admin, &asset, &1_000_000, &s(&f.env, "oracle-1"));
}

#[test]
fn pause_and_unpause_are_recorded_in_the_audit_history() {
    let f = setup();
    f.client.emergency_pause(&f.guardian, &s(&f.env, "halt"));
    f.env.ledger().set_timestamp(T0 + TIMELOCK_SECS);
    f.client.unpause(&f.admin, &s(&f.env, "resolved"));

    let history = f.client.get_pause_history();

    assert_eq!(history.len(), 2);
    let pause = history.get(0).unwrap();
    assert!(pause.paused);
    assert_eq!(pause.caller, f.guardian);
    assert_eq!(pause.timestamp, T0);
    let unpause = history.get(1).unwrap();
    assert!(!unpause.paused);
    assert_eq!(unpause.caller, f.admin);
    assert_eq!(unpause.timestamp, T0 + TIMELOCK_SECS);
}
