//! On-chain multi-signature emergency halt & recovery (issue #794).
//!
//! Emergency administrative actions — pausing/unpausing the contract and
//! overriding sensitive admin config — were previously single-key operations
//! gated only by `Address::require_auth()` against the contract admin. If the
//! admin key were compromised, an attacker could silence the circuit breaker
//! or disable monitoring rules with a single transaction.
//!
//! This module lets the admin register a set of operator Ed25519 public keys
//! and a signature threshold (`M`-of-`N`). Critical actions then require `M`
//! independently verified Ed25519 signatures — checked on-chain via the
//! Soroban SDK's `env.crypto().ed25519_verify()` — before they take effect.
//! Signatures are bound to a specific action and a strictly increasing nonce
//! so a captured signature cannot be replayed against a different action or
//! resubmitted.
//!
//! This module only handles operator configuration, message construction and
//! threshold signature verification. Applying the verified action (flipping
//! the pause flag, updating a threshold, ...) is the caller's responsibility
//! (see the `*_multisig` entrypoints in `lib.rs`), keeping this module free
//! of any dependency on the rest of the contract's state.

use soroban_sdk::{
    contracttype, symbol_short, xdr::ToXdr, Address, Bytes, BytesN, Env, String, Vec,
};

use crate::keys;

/// Upper bound on the number of registered operators.
pub const MAX_OPERATORS: u32 = 15;

/// Maximum number of audit log entries retained on-chain.
pub const MAX_LOG_ENTRIES: u32 = 200;

/// Domain-separation prefix mixed into every signed message so a signature
/// produced for this module can never be replayed against an unrelated
/// signing scheme within the contract.
const DOMAIN: &[u8] = b"BW_EMERGENCY_MULTISIG_V1";

/// Critical actions that may be authorised through the emergency multisig.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EmergencyAction {
    /// Halt all state-changing contract operations.
    Pause,
    /// Lift a previously triggered multisig pause.
    Unpause,
    /// Administrative config override: update the global supply mismatch
    /// threshold (basis points), bypassing the single-admin path.
    SetMismatchThreshold(i128),
    /// Isolate one bridge (issue #1250): its supply-mismatch submissions are
    /// rejected while every other bridge keeps operating, so a compromised
    /// operator key does not force a platform-wide pause.
    EmergencyBlacklistBridge(String),
    /// Revoke one trusted oracle source (issue #1250) without the admin key,
    /// for a node that has started broadcasting poisoned feeds.
    EmergencyDelistOracleNode(Address),
}

/// One operator's Ed25519 signature over a proposed `EmergencyAction`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OperatorSignature {
    pub operator: BytesN<32>,
    pub signature: BytesN<64>,
}

/// The configured operator set and approval threshold.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MultisigConfig {
    pub operators: Vec<BytesN<32>>,
    pub threshold: u32,
}

/// One executed multisig action, retained for audit purposes.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MultisigActionLog {
    pub nonce: u64,
    pub action: EmergencyAction,
    pub approvers: Vec<BytesN<32>>,
    pub timestamp: u64,
}

/// Register (or rotate) the operator key set and signature threshold.
///
/// # Panics
/// - `operators` is empty or exceeds [`MAX_OPERATORS`].
/// - `threshold` is zero or greater than the number of operators.
/// - `operators` contains a duplicate key.
pub fn configure(env: &Env, operators: Vec<BytesN<32>>, threshold: u32) -> MultisigConfig {
    if operators.is_empty() {
        panic!("emergency multisig requires at least one operator");
    }
    if operators.len() > MAX_OPERATORS {
        panic!("too many emergency multisig operators");
    }
    if threshold == 0 || threshold > operators.len() {
        panic!("emergency multisig threshold must be between 1 and the operator count");
    }
    for i in 0..operators.len() {
        let op = operators.get(i).unwrap();
        let mut j = i + 1;
        while j < operators.len() {
            if operators.get(j).unwrap() == op {
                panic!("duplicate operator key in emergency multisig configuration");
            }
            j += 1;
        }
    }

    let config = MultisigConfig {
        operators,
        threshold,
    };
    env.storage()
        .instance()
        .set(&keys::EMERGENCY_MULTISIG_CONFIG, &config);
    if !env
        .storage()
        .instance()
        .has(&keys::EMERGENCY_MULTISIG_NONCE)
    {
        env.storage()
            .instance()
            .set(&keys::EMERGENCY_MULTISIG_NONCE, &0u64);
    }

    config
}

/// Return the current operator set/threshold, if configured.
pub fn get_config(env: &Env) -> Option<MultisigConfig> {
    env.storage()
        .instance()
        .get(&keys::EMERGENCY_MULTISIG_CONFIG)
}

/// Return the last consumed nonce (0 if none has been consumed yet).
pub fn get_nonce(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&keys::EMERGENCY_MULTISIG_NONCE)
        .unwrap_or(0)
}

/// Return the emergency multisig audit log, oldest first.
pub fn get_log(env: &Env) -> Vec<MultisigActionLog> {
    env.storage()
        .persistent()
        .get(&keys::EMERGENCY_MULTISIG_LOG)
        .unwrap_or_else(|| Vec::new(env))
}

fn action_tag(action: &EmergencyAction) -> u32 {
    match action {
        EmergencyAction::Pause => 1,
        EmergencyAction::Unpause => 2,
        EmergencyAction::SetMismatchThreshold(_) => 3,
        EmergencyAction::EmergencyBlacklistBridge(_) => 4,
        EmergencyAction::EmergencyDelistOracleNode(_) => 5,
    }
}

fn append_u32(buf: &mut Bytes, value: u32) {
    let bytes = value.to_be_bytes();
    for b in bytes {
        buf.push_back(b);
    }
}

fn append_u64(buf: &mut Bytes, value: u64) {
    let bytes = value.to_be_bytes();
    for b in bytes {
        buf.push_back(b);
    }
}

fn append_i128(buf: &mut Bytes, value: i128) {
    let bytes = value.to_be_bytes();
    for b in bytes {
        buf.push_back(b);
    }
}

/// Append a length-prefixed byte string, so two variable-length arguments
/// can never be re-split into a different (id, address) pair.
fn append_bytes(buf: &mut Bytes, value: &Bytes) {
    append_u32(buf, value.len());
    for b in value.iter() {
        buf.push_back(b);
    }
}

/// Build the canonical byte payload operators must sign for `action` at
/// `nonce`. Binding the action's own parameters and the nonce into the
/// message means a valid signature cannot be reused for a different action,
/// a different parameter value, or replayed once its nonce is consumed.
pub fn build_message(env: &Env, action: &EmergencyAction, nonce: u64) -> Bytes {
    let mut data = Bytes::from_slice(env, DOMAIN);
    append_u32(&mut data, action_tag(action));
    match action {
        EmergencyAction::Pause | EmergencyAction::Unpause => {}
        EmergencyAction::SetMismatchThreshold(value) => append_i128(&mut data, *value),
        // Canonical XDR encodings, so the signed bytes are exactly what the
        // contract decodes and an id or address cannot be substituted.
        EmergencyAction::EmergencyBlacklistBridge(bridge_id) => {
            append_bytes(&mut data, &bridge_id.clone().to_xdr(env))
        }
        EmergencyAction::EmergencyDelistOracleNode(node) => {
            append_bytes(&mut data, &node.clone().to_xdr(env))
        }
    }
    append_u64(&mut data, nonce);
    data
}

/// Verify a threshold of operator signatures over `action` at `nonce`.
///
/// On success the nonce is consumed and an audit log entry is appended. The
/// list of approving operator public keys is returned so callers can surface
/// it in their own events/activity logs.
///
/// # Panics
/// - No multisig configuration has been set.
/// - `nonce` is not exactly one greater than the last consumed nonce.
/// - Fewer signatures than the configured threshold were supplied.
/// - A signature is attributed to a key that is not a configured operator.
/// - The same operator key signs more than once in the same call.
/// - Any signature fails Ed25519 verification.
pub fn verify_and_execute(
    env: &Env,
    action: EmergencyAction,
    signatures: Vec<OperatorSignature>,
    nonce: u64,
) -> Vec<BytesN<32>> {
    let config: MultisigConfig =
        get_config(env).unwrap_or_else(|| panic!("emergency multisig is not configured"));

    let expected_nonce = get_nonce(env) + 1;
    if nonce != expected_nonce {
        panic!("invalid emergency multisig nonce");
    }

    if signatures.len() < config.threshold {
        panic!("insufficient emergency multisig signatures");
    }

    let message = build_message(env, &action, nonce);

    let mut approvers: Vec<BytesN<32>> = Vec::new(env);
    for sig in signatures.iter() {
        let mut is_operator = false;
        for op in config.operators.iter() {
            if op == sig.operator {
                is_operator = true;
                break;
            }
        }
        if !is_operator {
            panic!("signature from unregistered emergency multisig operator");
        }

        for existing in approvers.iter() {
            if existing == sig.operator {
                panic!("duplicate operator signature in emergency multisig submission");
            }
        }

        // Traps if the signature does not verify against `message`.
        env.crypto()
            .ed25519_verify(&sig.operator, &message, &sig.signature);

        approvers.push_back(sig.operator.clone());
    }

    if approvers.len() < config.threshold {
        panic!("insufficient valid emergency multisig signatures");
    }

    env.storage()
        .instance()
        .set(&keys::EMERGENCY_MULTISIG_NONCE, &nonce);

    let entry = MultisigActionLog {
        nonce,
        action: action.clone(),
        approvers: approvers.clone(),
        timestamp: env.ledger().timestamp(),
    };
    let mut log = get_log(env);
    log.push_back(entry);
    if log.len() > MAX_LOG_ENTRIES {
        let mut trimmed: Vec<MultisigActionLog> = Vec::new(env);
        for i in 1..log.len() {
            trimmed.push_back(log.get(i).unwrap());
        }
        log = trimmed;
    }
    env.storage()
        .persistent()
        .set(&keys::EMERGENCY_MULTISIG_LOG, &log);

    env.events().publish(
        (symbol_short!("ems_exec"), action_tag(&action)),
        (nonce, approvers.len()),
    );

    approvers
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use soroban_sdk::contract;
    use soroban_sdk::testutils::{Address as _, Ledger};

    /// Storage-touching functions in this module assume they run inside a
    /// contract invocation. `TestHarnessContract` gives the test suite a
    /// registered contract instance to execute against via `env.as_contract`.
    #[contract]
    struct TestHarnessContract;

    fn setup_env() -> (Env, Address) {
        let env = Env::default();
        let contract_id = env.register_contract(None, TestHarnessContract);
        (env, contract_id)
    }

    /// Deterministically derive an Ed25519 keypair from a single seed byte.
    fn keypair(seed: u8) -> (SigningKey, [u8; 32]) {
        let signing_key = SigningKey::from_bytes(&[seed; 32]);
        let verifying_key = signing_key.verifying_key().to_bytes();
        (signing_key, verifying_key)
    }

    fn sign(env: &Env, signing_key: &SigningKey, message: &Bytes) -> BytesN<64> {
        let mut buf = [0u8; 512];
        let len = message.len() as usize;
        message.copy_into_slice(&mut buf[..len]);
        let signature = signing_key.sign(&buf[..len]);
        BytesN::from_array(env, &signature.to_bytes())
    }

    fn operators_from(env: &Env, raws: &[[u8; 32]]) -> Vec<BytesN<32>> {
        let mut v: Vec<BytesN<32>> = Vec::new(env);
        for raw in raws {
            v.push_back(BytesN::from_array(env, raw));
        }
        v
    }

    #[test]
    fn test_configure_and_get_config() {
        let (env, cid) = setup_env();
        let (_sk0, pk0) = keypair(1);
        let (_sk1, pk1) = keypair(2);
        let (_sk2, pk2) = keypair(3);
        let operators = operators_from(&env, &[pk0, pk1, pk2]);

        env.as_contract(&cid, || {
            let config = configure(&env, operators, 2);
            assert_eq!(config.threshold, 2);
            assert_eq!(config.operators.len(), 3);
            assert_eq!(get_config(&env).unwrap().threshold, 2);
            assert_eq!(get_nonce(&env), 0);
        });
    }

    #[test]
    #[should_panic(expected = "at least one operator")]
    fn test_configure_rejects_empty_operators() {
        let (env, cid) = setup_env();
        let operators: Vec<BytesN<32>> = Vec::new(&env);
        env.as_contract(&cid, || {
            configure(&env, operators, 1);
        });
    }

    #[test]
    #[should_panic(expected = "threshold must be between 1")]
    fn test_configure_rejects_threshold_above_operator_count() {
        let (env, cid) = setup_env();
        let (_sk0, pk0) = keypair(1);
        let (_sk1, pk1) = keypair(2);
        let operators = operators_from(&env, &[pk0, pk1]);
        env.as_contract(&cid, || {
            configure(&env, operators, 3);
        });
    }

    #[test]
    #[should_panic(expected = "threshold must be between 1")]
    fn test_configure_rejects_zero_threshold() {
        let (env, cid) = setup_env();
        let (_sk0, pk0) = keypair(1);
        let (_sk1, pk1) = keypair(2);
        let operators = operators_from(&env, &[pk0, pk1]);
        env.as_contract(&cid, || {
            configure(&env, operators, 0);
        });
    }

    #[test]
    #[should_panic(expected = "duplicate operator")]
    fn test_configure_rejects_duplicate_operators() {
        let (env, cid) = setup_env();
        let (_sk0, pk0) = keypair(1);
        let operators = operators_from(&env, &[pk0, pk0]);
        env.as_contract(&cid, || {
            configure(&env, operators, 2);
        });
    }

    #[test]
    fn test_verify_and_execute_succeeds_with_threshold_signatures() {
        let (env, cid) = setup_env();
        env.ledger().set_timestamp(1_000);
        let (sk0, pk0) = keypair(1);
        let (sk1, pk1) = keypair(2);
        let (_sk2, pk2) = keypair(3);
        let operators = operators_from(&env, &[pk0, pk1, pk2]);
        env.as_contract(&cid, || {
            configure(&env, operators, 2);
        });

        let message = env.as_contract(&cid, || build_message(&env, &EmergencyAction::Pause, 1));
        let mut sigs: Vec<OperatorSignature> = Vec::new(&env);
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &message),
        });
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk1),
            signature: sign(&env, &sk1, &message),
        });

        env.as_contract(&cid, || {
            let approvers = verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
            assert_eq!(approvers.len(), 2);
            assert_eq!(get_nonce(&env), 1);

            let log = get_log(&env);
            assert_eq!(log.len(), 1);
            assert_eq!(log.get(0).unwrap().nonce, 1);
            assert_eq!(log.get(0).unwrap().action, EmergencyAction::Pause);
        });
    }

    #[test]
    #[should_panic(expected = "insufficient emergency multisig signatures")]
    fn test_verify_and_execute_rejects_below_threshold_count() {
        let (env, cid) = setup_env();
        let (sk0, pk0) = keypair(1);
        let (_sk1, pk1) = keypair(2);
        let (_sk2, pk2) = keypair(3);
        let operators = operators_from(&env, &[pk0, pk1, pk2]);
        env.as_contract(&cid, || {
            configure(&env, operators, 2);
        });

        let message = env.as_contract(&cid, || build_message(&env, &EmergencyAction::Pause, 1));
        let mut sigs: Vec<OperatorSignature> = Vec::new(&env);
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &message),
        });

        env.as_contract(&cid, || {
            verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
        });
    }

    #[test]
    #[should_panic]
    fn test_verify_and_execute_rejects_invalid_signature() {
        let (env, cid) = setup_env();
        let (sk0, pk0) = keypair(1);
        let (sk1, pk1) = keypair(2);
        let operators = operators_from(&env, &[pk0, pk1]);
        env.as_contract(&cid, || {
            configure(&env, operators, 2);
        });

        // Sign the wrong message (wrong nonce) so verification fails.
        let wrong_message =
            env.as_contract(&cid, || build_message(&env, &EmergencyAction::Pause, 999));
        let mut sigs: Vec<OperatorSignature> = Vec::new(&env);
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &wrong_message),
        });
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk1),
            signature: sign(&env, &sk1, &wrong_message),
        });

        env.as_contract(&cid, || {
            verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
        });
    }

    #[test]
    #[should_panic(expected = "unregistered emergency multisig operator")]
    fn test_verify_and_execute_rejects_non_operator_signer() {
        let (env, cid) = setup_env();
        let (sk0, pk0) = keypair(1);
        let (_sk1, pk1) = keypair(2);
        let operators = operators_from(&env, &[pk0, pk1]);
        env.as_contract(&cid, || {
            configure(&env, operators, 2);
        });

        let (outsider_sk, outsider_raw) = keypair(99);

        let message = env.as_contract(&cid, || build_message(&env, &EmergencyAction::Pause, 1));
        let mut sigs: Vec<OperatorSignature> = Vec::new(&env);
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &message),
        });
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &outsider_raw),
            signature: sign(&env, &outsider_sk, &message),
        });

        env.as_contract(&cid, || {
            verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
        });
    }

    #[test]
    #[should_panic(expected = "duplicate operator signature")]
    fn test_verify_and_execute_rejects_duplicate_signer_in_submission() {
        let (env, cid) = setup_env();
        let (sk0, pk0) = keypair(1);
        let (_sk1, pk1) = keypair(2);
        let (_sk2, pk2) = keypair(3);
        let operators = operators_from(&env, &[pk0, pk1, pk2]);
        env.as_contract(&cid, || {
            configure(&env, operators, 2);
        });

        let message = env.as_contract(&cid, || build_message(&env, &EmergencyAction::Pause, 1));
        let mut sigs: Vec<OperatorSignature> = Vec::new(&env);
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &message),
        });
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &message),
        });

        env.as_contract(&cid, || {
            verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
        });
    }

    #[test]
    #[should_panic(expected = "invalid emergency multisig nonce")]
    fn test_verify_and_execute_rejects_replayed_nonce() {
        let (env, cid) = setup_env();
        env.ledger().set_timestamp(1_000);
        let (sk0, pk0) = keypair(1);
        let (sk1, pk1) = keypair(2);
        let operators = operators_from(&env, &[pk0, pk1]);
        env.as_contract(&cid, || {
            configure(&env, operators, 2);
        });

        let message = env.as_contract(&cid, || build_message(&env, &EmergencyAction::Pause, 1));
        let mut sigs: Vec<OperatorSignature> = Vec::new(&env);
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &message),
        });
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk1),
            signature: sign(&env, &sk1, &message),
        });

        env.as_contract(&cid, || {
            verify_and_execute(&env, EmergencyAction::Pause, sigs.clone(), 1);
            // Replay the exact same call (same nonce) — must fail even though
            // the signatures themselves were valid the first time.
            verify_and_execute(&env, EmergencyAction::Pause, sigs, 1);
        });
    }

    #[test]
    fn test_targeted_actions_have_distinct_tags_and_bound_arguments() {
        let (env, cid) = setup_env();
        env.as_contract(&cid, || {
            let bridge_a =
                EmergencyAction::EmergencyBlacklistBridge(String::from_str(&env, "bridge-a"));
            let bridge_b =
                EmergencyAction::EmergencyBlacklistBridge(String::from_str(&env, "bridge-b"));
            let node = EmergencyAction::EmergencyDelistOracleNode(Address::generate(&env));

            assert_eq!(action_tag(&bridge_a), 4);
            assert_eq!(action_tag(&node), 5);
            // The argument is part of the signed message: the same nonce with
            // a different bridge id or a different action is a different message.
            assert_ne!(
                build_message(&env, &bridge_a, 1),
                build_message(&env, &bridge_b, 1)
            );
            assert_ne!(
                build_message(&env, &bridge_a, 1),
                build_message(&env, &node, 1)
            );
            assert_ne!(
                build_message(&env, &bridge_a, 1),
                build_message(&env, &bridge_a, 2)
            );
            assert_eq!(
                build_message(&env, &bridge_a, 1),
                build_message(&env, &bridge_a, 1)
            );
        });
    }

    #[test]
    fn test_verify_and_execute_records_a_targeted_action() {
        let (env, cid) = setup_env();
        env.ledger().set_timestamp(7_000);
        let (sk0, pk0) = keypair(4);
        let (sk1, pk1) = keypair(5);
        let operators = operators_from(&env, &[pk0, pk1]);
        env.as_contract(&cid, || {
            configure(&env, operators, 2);
        });

        let action = EmergencyAction::EmergencyBlacklistBridge(String::from_str(&env, "bridge-x"));
        let message = env.as_contract(&cid, || build_message(&env, &action, 1));
        let mut sigs: Vec<OperatorSignature> = Vec::new(&env);
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &message),
        });
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk1),
            signature: sign(&env, &sk1, &message),
        });

        env.as_contract(&cid, || {
            let approvers = verify_and_execute(&env, action.clone(), sigs, 1);
            assert_eq!(approvers.len(), 2);
            let log = get_log(&env);
            assert_eq!(log.get(0).unwrap().action, action);
        });
    }

    #[test]
    fn test_verify_and_execute_threshold_admin_config_override() {
        let (env, cid) = setup_env();
        env.ledger().set_timestamp(5_000);
        let (sk0, pk0) = keypair(7);
        let (sk1, pk1) = keypair(8);
        let (sk2, pk2) = keypair(9);
        let operators = operators_from(&env, &[pk0, pk1, pk2]);
        env.as_contract(&cid, || {
            configure(&env, operators, 3);
        });

        let action = EmergencyAction::SetMismatchThreshold(25);
        let message = env.as_contract(&cid, || build_message(&env, &action, 1));

        let mut sigs: Vec<OperatorSignature> = Vec::new(&env);
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk0),
            signature: sign(&env, &sk0, &message),
        });
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk1),
            signature: sign(&env, &sk1, &message),
        });
        sigs.push_back(OperatorSignature {
            operator: BytesN::from_array(&env, &pk2),
            signature: sign(&env, &sk2, &message),
        });

        env.as_contract(&cid, || {
            let approvers = verify_and_execute(&env, action.clone(), sigs, 1);
            assert_eq!(approvers.len(), 3);

            let log = get_log(&env);
            assert_eq!(
                log.get(0).unwrap().action,
                EmergencyAction::SetMismatchThreshold(25)
            );
        });
    }
}
