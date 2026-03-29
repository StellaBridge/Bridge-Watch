#![cfg(test)]

#[path = "../src/relay/mod.rs"]
mod relay;

use relay::{
    BatchRelayItem, ChainConfig, ChainId, CrossChainRelayContract, CrossChainRelayContractClient,
    MessagePriority, MessageStatus, RelayError, StateProof,
};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger},
    Address, Bytes, BytesN, Env, IntoVal, Symbol, Vec,
};

fn setup_context() -> (Env, soroban_sdk::Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CrossChainRelayContract);
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let sender = Address::generate(&env);

    client.initialize(&admin, &300);
    client.register_relay_operator(&operator, &BytesN::from_array(&env, &[9u8; 32]));

    (env, contract_id, operator, sender)
}

fn make_signature(env: &Env, message_id: &BytesN<32>, public_key: &BytesN<32>) -> BytesN<64> {
    let mut payload = [0u8; 64];
    payload[..32].copy_from_slice(&message_id.to_array());
    payload[32..].copy_from_slice(&public_key.to_array());

    let digest: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, &payload))
        .into();
    let d = digest.to_array();

    let mut out = [0u8; 64];
    let mut i = 0usize;
    while i < 32 {
        out[i] = d[i];
        out[i + 32] = d[i];
        i += 1;
    }

    BytesN::from_array(env, &out)
}

fn make_valid_proof(
    env: &Env,
    chain_id: ChainId,
    block_number: u64,
    validator_key: BytesN<32>,
) -> StateProof {
    let proof_data = Bytes::from_slice(env, b"integration-proof");
    let state_root: BytesN<32> = env.crypto().sha256(&proof_data).into();

    let mut attestation = Bytes::new(env);

    let chain: u32 = match chain_id {
        ChainId::Stellar => 0,
        ChainId::Ethereum => 1,
        ChainId::Polygon => 2,
        ChainId::Base => 3,
    };

    for b in chain.to_be_bytes() {
        attestation.push_back(b);
    }

    for b in block_number.to_be_bytes() {
        attestation.push_back(b);
    }

    for b in state_root.to_array() {
        attestation.push_back(b);
    }

    for b in validator_key.to_array() {
        attestation.push_back(b);
    }

    let digest: BytesN<32> = env.crypto().sha256(&attestation).into();
    let d = digest.to_array();
    let mut sig = [0u8; 64];
    let mut i = 0usize;
    while i < 32 {
        sig[i] = d[i];
        sig[i + 32] = d[i];
        i += 1;
    }

    StateProof {
        chain_id,
        block_number,
        state_root,
        proof_data,
        validator_key,
        signature: BytesN::from_array(env, &sig),
    }
}

fn assert_has_event(env: &Env, contract: &Address, expected_topic: Symbol) {
    let events = env.events().all();
    let mut found = false;

    for i in 0..events.len() {
        let (addr, topics, _data) = events.get(i).unwrap();
        if addr == *contract && !topics.is_empty() {
            let topic_val = topics.get(0).unwrap();
            let expected_val = expected_topic.into_val(env);
            if topic_val.get_payload() == expected_val.get_payload() {
                found = true;
                break;
            }
        }
    }

    assert!(found, "expected event topic not found");
}

#[test]
fn integration_message_lifecycle_state_transition() {
    let (env, contract_id, operator, sender) = setup_context();
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    let msg_id = client.send_message(
        &ChainId::Ethereum,
        &ChainId::Polygon,
        &sender,
        &Bytes::from_slice(&env, b"state-transition"),
        &0,
        &MessagePriority::High,
        &0,
        &20_000,
    );

    let proof = make_valid_proof(
        &env,
        ChainId::Ethereum,
        101,
        BytesN::from_array(&env, &[9u8; 32]),
    );

    assert!(client.verify_message(&msg_id, &proof));

    let op = client.get_operator(&operator).unwrap();
    let sig = make_signature(&env, &msg_id, &op.public_key);
    assert!(client.relay_message(&operator, &msg_id, &sig));

    let msg = client.get_message(&msg_id).unwrap();
    assert_eq!(msg.status, MessageStatus::Relayed);
}

#[test]
fn error_condition_rejects_invalid_signature() {
    let (env, contract_id, operator, sender) = setup_context();
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    let msg_id = client.send_message(
        &ChainId::Stellar,
        &ChainId::Base,
        &sender,
        &Bytes::from_slice(&env, b"bad-signature"),
        &0,
        &MessagePriority::Medium,
        &0,
        &20_000,
    );

    let bad_sig = BytesN::from_array(&env, &[0u8; 64]);
    let result = client.try_relay_message(&operator, &msg_id, &bad_sig);
    assert_eq!(result, Err(Ok(RelayError::InvalidSignature)));
}

#[test]
fn access_control_deactivated_operator_cannot_relay() {
    let (env, contract_id, operator, sender) = setup_context();
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    let msg_id = client.send_message(
        &ChainId::Stellar,
        &ChainId::Ethereum,
        &sender,
        &Bytes::from_slice(&env, b"operator-check"),
        &0,
        &MessagePriority::High,
        &0,
        &20_000,
    );

    client.deactivate_relay_operator(&operator);

    let op = client.get_operator(&operator).unwrap();
    let sig = make_signature(&env, &msg_id, &op.public_key);

    let result = client.try_relay_message(&operator, &msg_id, &sig);
    assert_eq!(result, Err(Ok(RelayError::OperatorNotActive)));
}

#[test]
fn edge_case_payload_boundary() {
    let (env, contract_id, _operator, sender) = setup_context();
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    let max_payload = Bytes::from_slice(&env, &[0xAB; 16_384]);
    let _msg_id = client.send_message(
        &ChainId::Stellar,
        &ChainId::Ethereum,
        &sender,
        &max_payload,
        &0,
        &MessagePriority::Low,
        &0,
        &500_000,
    );

    let too_large = Bytes::from_slice(&env, &[0xCD; 16_385]);
    let result = client.try_send_message(
        &ChainId::Stellar,
        &ChainId::Ethereum,
        &sender,
        &too_large,
        &1,
        &MessagePriority::Low,
        &0,
        &500_000,
    );

    assert_eq!(result, Err(Ok(RelayError::PayloadTooLarge)));
}

#[test]
fn event_emission_message_sent_and_relayed() {
    let (env, contract_id, operator, sender) = setup_context();
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    let msg_id = client.send_message(
        &ChainId::Stellar,
        &ChainId::Base,
        &sender,
        &Bytes::from_slice(&env, b"event-check"),
        &0,
        &MessagePriority::Critical,
        &0,
        &20_000,
    );

    assert_has_event(&env, &client.address, symbol_short!("msg_sent"));

    let op = client.get_operator(&operator).unwrap();
    let sig = make_signature(&env, &msg_id, &op.public_key);
    let _ = client.relay_message(&operator, &msg_id, &sig);

    assert_has_event(&env, &client.address, symbol_short!("msg_rly"));
}

#[test]
fn gas_proxy_batch_relay_matches_single_relay_outcomes() {
    let (env, contract_id, operator, sender) = setup_context();
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    let first = client.send_message(
        &ChainId::Stellar,
        &ChainId::Polygon,
        &sender,
        &Bytes::from_slice(&env, b"m1"),
        &0,
        &MessagePriority::High,
        &0,
        &20_000,
    );

    let second = client.send_message(
        &ChainId::Stellar,
        &ChainId::Polygon,
        &sender,
        &Bytes::from_slice(&env, b"m2"),
        &1,
        &MessagePriority::High,
        &0,
        &20_000,
    );

    let op = client.get_operator(&operator).unwrap();
    let s1 = make_signature(&env, &first, &op.public_key);
    let s2 = make_signature(&env, &second, &op.public_key);

    let mut batch = Vec::<BatchRelayItem>::new(&env);
    batch.push_back(BatchRelayItem {
        message_id: first,
        signature: s1,
    });
    batch.push_back(BatchRelayItem {
        message_id: second,
        signature: s2,
    });

    let batch_result = client.batch_relay(&operator, &batch);
    assert_eq!(batch_result.success_count, 2);
    assert_eq!(batch_result.failure_count, 0);

    let metrics = client.get_metrics();
    let total_relayed_key = Bytes::from_slice(&env, b"total_relayed");
    assert_eq!(metrics.get(total_relayed_key), Some(2));
}

#[test]
fn fee_model_regression_linear_pricing() {
    let (env, contract_id, _operator, _sender) = setup_context();
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    client.configure_chain(&ChainConfig {
        chain_id: ChainId::Ethereum,
        base_fee: 100,
        fee_per_byte: 10,
        is_enabled: true,
    });

    let short_payload = Bytes::from_slice(&env, b"12345");
    let long_payload = Bytes::from_slice(&env, b"1234567890");

    let short_fee = client.estimate_fee(&ChainId::Ethereum, &short_payload);
    let long_fee = client.estimate_fee(&ChainId::Ethereum, &long_payload);

    assert_eq!(short_fee, 150);
    assert_eq!(long_fee, 200);
    assert!(long_fee > short_fee);
}

#[test]
fn expired_messages_are_cleaned_from_queue() {
    let (env, contract_id, _operator, sender) = setup_context();
    let client = CrossChainRelayContractClient::new(&env, &contract_id);

    let _ = client.send_message(
        &ChainId::Stellar,
        &ChainId::Ethereum,
        &sender,
        &Bytes::from_slice(&env, b"expire-me"),
        &0,
        &MessagePriority::Medium,
        &1,
        &20_000,
    );

    assert_eq!(client.get_message_queue().len(), 1);

    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(2);
    });

    let cleaned = client.cleanup_expired_messages(&10);
    assert_eq!(cleaned, 1);
    assert_eq!(client.get_message_queue().len(), 0);
}
