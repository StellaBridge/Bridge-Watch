#![cfg(test)]

//! Emergency multisig threshold verification (issue #1456).
//!
//! Drives `bridge_watch_contracts::emergency_multisig` against a registered
//! harness contract, covering M-of-N quorum enforcement, signer authorisation,
//! duplicate-signature rejection, nonce and action binding, and operator key
//! rotation.

use bridge_watch_contracts::emergency_multisig::{
    build_message, configure, get_config, get_log, get_nonce, verify_and_execute,
    EmergencyAction, OperatorSignature, MAX_OPERATORS,
};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::testutils::Ledger;
use soroban_sdk::{contract, Address, Bytes, BytesN, Env, Vec};

type Keypair = (SigningKey, [u8; 32]);

/// Storage-touching functions in the emergency multisig module must run inside
/// a contract invocation, so the tests execute against this registered harness.
#[contract]
struct HarnessContract;

fn setup_env() -> (Env, Address) {
    let env = Env::default();
    let contract_id = env.register_contract(None, HarnessContract);
    (env, contract_id)
}

/// Deterministically derive an Ed25519 keypair from a single seed byte.
fn keypair(seed: u8) -> Keypair {
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

fn operators_from(env: &Env, keys: &[&Keypair]) -> Vec<BytesN<32>> {
    let mut v: Vec<BytesN<32>> = Vec::new(env);
    for (_, raw) in keys {
        v.push_back(BytesN::from_array(env, raw));
    }
    v
}

/// One signature per signer over `action` at `nonce`.
fn signatures(
    env: &Env,
    cid: &Address,
    action: &EmergencyAction,
    nonce: u64,
    signers: &[&Keypair],
) -> Vec<OperatorSignature> {
    let message = env.as_contract(cid, || build_message(env, action, nonce));
    let mut sigs: Vec<OperatorSignature> = Vec::new(env);
    for (sk, raw) in signers {
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(env, raw),
            signature: sign(env, sk, &message),
        });
    }
    sigs
}

#[test]
fn test_quorum_of_operators_executes_and_records_approvers() {
    let (env, cid) = setup_env();
    env.ledger().set_timestamp(42);
    let k0 = keypair(1);
    let k1 = keypair(2);
    let k2 = keypair(3);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1, &k2]), 2);
    });

    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0, &k1]);
    env.as_contract(&cid, || {
        let approvers = verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
        assert_eq!(approvers.len(), 2);
        assert_eq!(approvers.get(0).unwrap(), BytesN::from_array(&env, &k0.1));
        assert_eq!(approvers.get(1).unwrap(), BytesN::from_array(&env, &k1.1));

        assert_eq!(get_nonce(&env), 1);
        let log = get_log(&env);
        assert_eq!(log.len(), 1);
        let entry = log.get(0).unwrap();
        assert_eq!(entry.nonce, 1);
        assert_eq!(entry.action, EmergencyAction::Pause);
        assert_eq!(entry.approvers.len(), 2);
        assert_eq!(entry.timestamp, 42);
    });
}

#[test]
fn test_signatures_above_threshold_are_all_counted() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    let k2 = keypair(3);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1, &k2]), 2);
    });

    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0, &k1, &k2]);
    env.as_contract(&cid, || {
        let approvers = verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
        assert_eq!(approvers.len(), 3);
    });
}

#[test]
#[should_panic(expected = "insufficient emergency multisig signatures")]
fn test_rejects_submission_below_threshold_count() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    let k2 = keypair(3);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1, &k2]), 2);
    });

    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
    });
}

#[test]
#[should_panic(expected = "duplicate operator signature")]
fn test_duplicate_signature_from_one_operator_cannot_meet_quorum() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1]), 2);
    });

    // Two valid signatures from the same operator would satisfy the count alone;
    // the duplicate check must reject them before the quorum is considered met.
    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0, &k0]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
    });
}

#[test]
#[should_panic(expected = "unregistered emergency multisig operator")]
fn test_rejects_signature_from_non_operator_key() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    let outsider = keypair(99);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1]), 2);
    });

    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0, &outsider]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
    });
}

#[test]
#[should_panic(expected = "unregistered emergency multisig operator")]
fn test_rotated_out_operator_key_can_no_longer_sign() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    let k2 = keypair(3);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1, &k2]), 2);
        // Rotate k0 out of the operator set.
        configure(&env, operators_from(&env, &[&k1, &k2]), 2);
    });

    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0, &k1]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
    });
}

#[test]
#[should_panic]
fn test_rejects_signature_over_a_different_nonce() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1]), 2);
    });

    // Signed for nonce 999 but submitted for nonce 1: the ed25519 check traps.
    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 999, &[&k0, &k1]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
    });
}

#[test]
#[should_panic]
fn test_signature_for_one_action_cannot_authorise_another() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1]), 2);
    });

    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0, &k1]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Unpause, sigs, 1);
    });
}

#[test]
#[should_panic(expected = "invalid emergency multisig nonce")]
fn test_replayed_nonce_is_rejected_after_execution() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1]), 2);
    });

    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0, &k1]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Pause, sigs.clone(), 1);
        // Same valid signatures, same nonce: the consumed nonce must block it.
        verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
    });
}

#[test]
#[should_panic(expected = "invalid emergency multisig nonce")]
fn test_skipping_a_nonce_is_rejected() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1]), 2);
    });

    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 2, &[&k0, &k1]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Pause, sigs, 2);
    });
}

#[test]
#[should_panic(expected = "emergency multisig is not configured")]
fn test_rejects_execution_before_configuration() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let sigs = signatures(&env, &cid, &EmergencyAction::Pause, 1, &[&k0]);
    env.as_contract(&cid, || {
        verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
    });
}

#[test]
fn test_configure_stores_threshold_and_operator_set() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    let k2 = keypair(3);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1, &k2]), 2);
        let config = get_config(&env).unwrap();
        assert_eq!(config.threshold, 2);
        assert_eq!(config.operators.len(), 3);
        assert_eq!(get_nonce(&env), 0);
    });
}

#[test]
#[should_panic(expected = "at least one operator")]
fn test_configure_rejects_empty_operator_set() {
    let (env, cid) = setup_env();
    let operators: Vec<BytesN<32>> = Vec::new(&env);
    env.as_contract(&cid, || {
        configure(&env, operators, 1);
    });
}

#[test]
#[should_panic(expected = "threshold must be between 1")]
fn test_configure_rejects_zero_threshold() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1]), 0);
    });
}

#[test]
#[should_panic(expected = "threshold must be between 1")]
fn test_configure_rejects_threshold_above_operator_count() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    let k1 = keypair(2);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k1]), 3);
    });
}

#[test]
#[should_panic(expected = "duplicate operator")]
fn test_configure_rejects_duplicate_operator_keys() {
    let (env, cid) = setup_env();
    let k0 = keypair(1);
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &[&k0, &k0]), 2);
    });
}

#[test]
#[should_panic(expected = "too many emergency multisig operators")]
fn test_configure_rejects_more_than_max_operators() {
    let (env, cid) = setup_env();
    let keys: std::vec::Vec<Keypair> = (1..=(MAX_OPERATORS as u8 + 1)).map(keypair).collect();
    let refs: std::vec::Vec<&Keypair> = keys.iter().collect();
    env.as_contract(&cid, || {
        configure(&env, operators_from(&env, &refs), 2);
    });
}
