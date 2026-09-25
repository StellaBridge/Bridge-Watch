#![cfg(test)]

//! Targeted emergency actions (issue #1250): blacklisting one bridge and
//! delisting one trusted oracle node through the emergency multisig, without
//! the admin key and without pausing the platform.

use bridge_watch_contracts::emergency_multisig::{
    build_message, EmergencyAction, OperatorSignature,
};
use bridge_watch_contracts::{BridgeWatchContract, BridgeWatchContractClient};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Address, Bytes, BytesN, Env, String, Vec};

fn keypair(seed: u8) -> (SigningKey, [u8; 32]) {
    let signing_key = SigningKey::from_bytes(&[seed; 32]);
    let verifying_key = signing_key.verifying_key().to_bytes();
    (signing_key, verifying_key)
}

fn sign(env: &Env, signing_key: &SigningKey, message: &Bytes) -> BytesN<64> {
    let mut buf = [0u8; 512];
    let len = message.len() as usize;
    message.copy_into_slice(&mut buf[..len]);
    BytesN::from_array(env, &signing_key.sign(&buf[..len]).to_bytes())
}

struct Fixture {
    env: Env,
    client: BridgeWatchContractClient<'static>,
    admin: Address,
    keys: [(SigningKey, [u8; 32]); 3],
}

/// Contract with a 2-of-3 emergency multisig configured.
fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);
    let contract_id = env.register_contract(None, BridgeWatchContract);
    let client = BridgeWatchContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let keys = [keypair(1), keypair(2), keypair(3)];
    let mut operators: Vec<BytesN<32>> = Vec::new(&env);
    for (_, raw) in keys.iter() {
        operators.push_back(BytesN::from_array(&env, raw));
    }
    client.configure_emergency_multisig(&admin, &operators, &2);
    Fixture {
        env,
        client,
        admin,
        keys,
    }
}

/// Two operator signatures over `action` at the multisig's next nonce.
fn approvals(f: &Fixture, action: &EmergencyAction, nonce: u64) -> Vec<OperatorSignature> {
    let message = f
        .env
        .as_contract(&f.client.address, || build_message(&f.env, action, nonce));
    let mut sigs: Vec<OperatorSignature> = Vec::new(&f.env);
    for (sk, raw) in f.keys.iter().take(2) {
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&f.env, raw),
            signature: sign(&f.env, sk, &message),
        });
    }
    sigs
}

fn s(env: &Env, text: &str) -> String {
    String::from_str(env, text)
}

#[test]
fn blacklisting_a_bridge_isolates_only_that_bridge() {
    let f = setup();
    let bridge_a = s(&f.env, "bridge-a");
    let bridge_b = s(&f.env, "bridge-b");
    let asset = s(&f.env, "USDC");

    let nonce = f.client.get_emergency_multisig_nonce();
    let action = EmergencyAction::EmergencyBlacklistBridge(bridge_a.clone());
    f.client
        .blacklist_bridge_multisig(&bridge_a, &approvals(&f, &action, nonce), &nonce);

    assert!(f.client.is_bridge_blacklisted(&bridge_a));
    assert!(!f.client.is_bridge_blacklisted(&bridge_b));
    assert_eq!(f.client.get_blacklisted_bridges().len(), 1);
    assert!(
        !f.client.is_paused(),
        "a targeted action must not pause the platform"
    );

    // The audit log records the action with its argument and the approvers.
    let log = f.client.get_emergency_multisig_log();
    let entry = log.get(log.len() - 1).unwrap();
    assert_eq!(entry.action, action);
    assert_eq!(entry.nonce, nonce);
    assert_eq!(entry.approvers.len(), 2);

    // Submissions for the blacklisted bridge are rejected; other bridges keep working.
    assert!(f
        .client
        .try_record_supply_mismatch(&bridge_a, &asset, &1_000_000, &1_001_000)
        .is_err());
    f.client
        .record_supply_mismatch(&bridge_b, &asset, &1_000_000, &1_001_000);
    assert_eq!(f.client.get_supply_mismatches(&bridge_b).len(), 1);
    assert_eq!(f.client.get_supply_mismatches(&bridge_a).len(), 0);
}

#[test]
fn blacklisting_twice_is_idempotent() {
    let f = setup();
    let bridge = s(&f.env, "bridge-a");
    for _ in 0..2 {
        let nonce = f.client.get_emergency_multisig_nonce();
        let action = EmergencyAction::EmergencyBlacklistBridge(bridge.clone());
        f.client
            .blacklist_bridge_multisig(&bridge, &approvals(&f, &action, nonce), &nonce);
    }
    assert_eq!(f.client.get_blacklisted_bridges().len(), 1);
}

#[test]
#[should_panic]
fn a_signature_for_one_bridge_cannot_blacklist_another() {
    let f = setup();
    let nonce = f.client.get_emergency_multisig_nonce();
    let signed_for = EmergencyAction::EmergencyBlacklistBridge(s(&f.env, "bridge-a"));
    let sigs = approvals(&f, &signed_for, nonce);
    f.client
        .blacklist_bridge_multisig(&s(&f.env, "bridge-b"), &sigs, &nonce);
}

#[test]
#[should_panic(expected = "invalid emergency multisig nonce")]
fn a_blacklist_approval_cannot_be_replayed() {
    let f = setup();
    let bridge = s(&f.env, "bridge-a");
    let nonce = f.client.get_emergency_multisig_nonce();
    let action = EmergencyAction::EmergencyBlacklistBridge(bridge.clone());
    let sigs = approvals(&f, &action, nonce);
    f.client.blacklist_bridge_multisig(&bridge, &sigs, &nonce);
    f.client.blacklist_bridge_multisig(&bridge, &sigs, &nonce);
}

#[test]
fn admin_lifts_a_bridge_blacklist() {
    let f = setup();
    let bridge = s(&f.env, "bridge-a");
    let asset = s(&f.env, "USDC");
    let nonce = f.client.get_emergency_multisig_nonce();
    let action = EmergencyAction::EmergencyBlacklistBridge(bridge.clone());
    f.client
        .blacklist_bridge_multisig(&bridge, &approvals(&f, &action, nonce), &nonce);

    f.client.remove_bridge_from_blacklist(&f.admin, &bridge);
    assert!(!f.client.is_bridge_blacklisted(&bridge));
    f.client
        .record_supply_mismatch(&bridge, &asset, &1_000_000, &1_001_000);
    assert_eq!(f.client.get_supply_mismatches(&bridge).len(), 1);
}

#[test]
#[should_panic(expected = "only admin can lift a bridge blacklist")]
fn only_admin_lifts_a_bridge_blacklist() {
    let f = setup();
    let bridge = s(&f.env, "bridge-a");
    let nonce = f.client.get_emergency_multisig_nonce();
    let action = EmergencyAction::EmergencyBlacklistBridge(bridge.clone());
    f.client
        .blacklist_bridge_multisig(&bridge, &approvals(&f, &action, nonce), &nonce);
    f.client
        .remove_bridge_from_blacklist(&Address::generate(&f.env), &bridge);
}

#[test]
#[should_panic(expected = "bridge is not blacklisted")]
fn lifting_an_unknown_blacklist_is_rejected() {
    let f = setup();
    f.client
        .remove_bridge_from_blacklist(&f.admin, &s(&f.env, "never"));
}

#[test]
fn delisting_an_oracle_node_revokes_only_that_source() {
    let f = setup();
    let node = Address::generate(&f.env);
    let other = Address::generate(&f.env);
    f.client
        .register_trusted_source(&f.admin, &node, &s(&f.env, "poisoned feed"));
    f.client
        .register_trusted_source(&f.admin, &other, &s(&f.env, "healthy feed"));
    assert!(f.client.is_trusted_source(&node));

    let nonce = f.client.get_emergency_multisig_nonce();
    let action = EmergencyAction::EmergencyDelistOracleNode(node.clone());
    f.client
        .delist_oracle_node_multisig(&node, &approvals(&f, &action, nonce), &nonce);

    assert!(!f.client.is_trusted_source(&node));
    assert!(f.client.is_trusted_source(&other));
    assert!(!f.client.is_paused());
    let log = f.client.get_emergency_multisig_log();
    assert_eq!(log.get(log.len() - 1).unwrap().action, action);
    // The revocation is attributed to the contract itself, not to any key.
    let record = f.client.get_trusted_source(&node).unwrap();
    assert_eq!(record.revoked_by, Some(f.client.address.clone()));
}

#[test]
#[should_panic(expected = "source not registered")]
fn delisting_an_unknown_node_is_rejected() {
    let f = setup();
    let node = Address::generate(&f.env);
    let nonce = f.client.get_emergency_multisig_nonce();
    let action = EmergencyAction::EmergencyDelistOracleNode(node.clone());
    f.client
        .delist_oracle_node_multisig(&node, &approvals(&f, &action, nonce), &nonce);
}

#[test]
#[should_panic]
fn a_delist_signature_is_bound_to_the_node() {
    let f = setup();
    let node = Address::generate(&f.env);
    let victim = Address::generate(&f.env);
    f.client
        .register_trusted_source(&f.admin, &victim, &s(&f.env, "healthy feed"));
    let nonce = f.client.get_emergency_multisig_nonce();
    let signed_for = EmergencyAction::EmergencyDelistOracleNode(node);
    let sigs = approvals(&f, &signed_for, nonce);
    f.client.delist_oracle_node_multisig(&victim, &sigs, &nonce);
}
