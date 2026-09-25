#![cfg(test)]

use bridge_watch_contracts::oracle_hub::{
    calculate_required_quorum, OracleHubContract, OracleHubContractClient, OracleHubError,
    DEFAULT_MAX_STALENESS_SECS, MIN_MAX_STALENESS_SECS, STALENESS_TIMELOCK_SECS,
};
use soroban_sdk::testutils::Ledger;
use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};

fn setup_client() -> (
    Env,
    OracleHubContractClient<'static>,
    Address,
    Address,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, OracleHubContract);
    let client = OracleHubContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let node1 = Address::generate(&env);
    let node2 = Address::generate(&env);
    let node3 = Address::generate(&env);
    let node4 = Address::generate(&env);

    (env, client, admin, node1, node2, node3, node4)
}

#[test]
fn test_quorum_calculation() {
    assert_eq!(calculate_required_quorum(0), 0);
    assert_eq!(calculate_required_quorum(1), 1);
    assert_eq!(calculate_required_quorum(2), 1);
    assert_eq!(calculate_required_quorum(3), 1);
    assert_eq!(calculate_required_quorum(4), 3); // N=4, f=1, 2f+1=3
    assert_eq!(calculate_required_quorum(7), 5); // N=7, f=2, 2f+1=5
    assert_eq!(calculate_required_quorum(10), 7); // N=10, f=3, 2f+1=7
}

#[test]
fn test_register_and_get_oracle_node() {
    let (_env, client, admin, node1, _, _, _) = setup_client();

    client.register_oracle_node(&admin, &node1, &100);

    let info = client
        .get_oracle_node(&node1)
        .expect("node should be registered");
    assert_eq!(info.node_address, node1);
    assert_eq!(info.stake_weight, 100);
    assert!(info.is_active);
    assert!(!info.is_slashed);
    assert_eq!(info.slash_count, 0);
}

#[test]
fn test_submit_bft_aggregate_valid_quorum() {
    let (env, client, admin, node1, node2, node3, node4) = setup_client();

    // Register 4 nodes (N=4, f=1, required quorum = 3)
    client.register_oracle_node(&admin, &node1, &10);
    client.register_oracle_node(&admin, &node2, &10);
    client.register_oracle_node(&admin, &node3, &10);
    client.register_oracle_node(&admin, &node4, &10);

    let asset = String::from_str(&env, "USDC");
    let reporting = vec![&env, node1.clone(), node2.clone(), node3.clone()];

    let state = client.submit_bft_aggregate(
        &admin,
        &asset,
        &100_000_000,
        &100_005_000,
        &2_000,
        &reporting,
    );

    assert!(state.is_valid_quorum);
    assert_eq!(state.valid_count, 3);
    assert_eq!(state.required_quorum, 3);

    let stored = client
        .get_bft_aggregate(&asset)
        .expect("state should be stored");
    assert_eq!(stored.consensus_price, 100_000_000);
}

#[test]
fn test_submit_bft_aggregate_insufficient_quorum() {
    let (env, client, admin, node1, node2, node3, node4) = setup_client();

    // Register 4 nodes (N=4, required quorum = 3)
    client.register_oracle_node(&admin, &node1, &10);
    client.register_oracle_node(&admin, &node2, &10);
    client.register_oracle_node(&admin, &node3, &10);
    client.register_oracle_node(&admin, &node4, &10);

    let asset = String::from_str(&env, "XLM");
    // Only 2 nodes report (below required quorum of 3)
    let reporting = vec![&env, node1, node2];

    let state =
        client.submit_bft_aggregate(&admin, &asset, &50_000_000, &50_000_000, &1_000, &reporting);

    assert!(!state.is_valid_quorum);
    assert_eq!(state.valid_count, 2);
    assert_eq!(state.required_quorum, 3);
    assert!(client.get_bft_aggregate(&asset).is_none());
}

#[test]
fn test_slash_oracle_node() {
    let (env, client, admin, node1, _, _, _) = setup_client();

    client.register_oracle_node(&admin, &node1, &50);

    let asset = String::from_str(&env, "USDC");
    client.slash_oracle_node(&admin, &node1, &asset, &550, &1);

    let info = client.get_oracle_node(&node1).expect("node should exist");
    assert!(info.is_slashed);
    assert!(!info.is_active);
    assert_eq!(info.slash_count, 1);
}

#[test]
fn test_submit_bft_aggregate_sybil_duplicate_nodes_rejected() {
    let (env, client, admin, node1, node2, node3, node4) = setup_client();

    client.register_oracle_node(&admin, &node1, &10);
    client.register_oracle_node(&admin, &node2, &10);
    client.register_oracle_node(&admin, &node3, &10);
    client.register_oracle_node(&admin, &node4, &10);

    let asset = String::from_str(&env, "USDT");
    let reporting = vec![&env, node1.clone(), node1.clone(), node1.clone()];

    let state = client.submit_bft_aggregate(
        &admin,
        &asset,
        &100_000_000,
        &100_000_000,
        &1_000,
        &reporting,
    );

    assert!(!state.is_valid_quorum);
    assert_eq!(state.valid_count, 1);
    assert_eq!(state.required_quorum, 3);
}

// ── Price staleness (issue #1247) ────────────────────────────────────────────

/// Register four nodes and submit a quorum aggregate at the current ledger time.
fn submit_quorum_aggregate(
    env: &Env,
    client: &OracleHubContractClient,
    admin: &Address,
    nodes: [&Address; 4],
) -> String {
    for node in nodes.iter() {
        client.register_oracle_node(admin, node, &10);
    }
    let asset = String::from_str(env, "USDC");
    let reporting = vec![env, nodes[0].clone(), nodes[1].clone(), nodes[2].clone()];
    let state = client.submit_bft_aggregate(
        admin,
        &asset,
        &100_000_000,
        &100_005_000,
        &2_000,
        &reporting,
    );
    assert!(state.is_valid_quorum);
    asset
}

#[test]
fn test_get_aggregate_state_serves_a_fresh_price() {
    let (env, client, admin, n1, n2, n3, n4) = setup_client();
    env.ledger().set_timestamp(10_000);
    let asset = submit_quorum_aggregate(&env, &client, &admin, [&n1, &n2, &n3, &n4]);

    env.ledger()
        .set_timestamp(10_000 + DEFAULT_MAX_STALENESS_SECS);
    let state = client.get_aggregate_state(&asset);
    assert_eq!(state.consensus_price, 100_000_000);
    assert_eq!(state.timestamp, 10_000);
}

#[test]
fn test_get_aggregate_state_rejects_a_stale_price() {
    let (env, client, admin, n1, n2, n3, n4) = setup_client();
    env.ledger().set_timestamp(10_000);
    let asset = submit_quorum_aggregate(&env, &client, &admin, [&n1, &n2, &n3, &n4]);

    env.ledger()
        .set_timestamp(10_000 + DEFAULT_MAX_STALENESS_SECS + 1);
    assert_eq!(
        client.try_get_aggregate_state(&asset),
        Err(Ok(OracleHubError::PriceStale))
    );
    // The raw read is unaffected, so indexers can still see what was stored.
    assert!(client.get_bft_aggregate(&asset).is_some());
}

#[test]
fn test_get_aggregate_state_reports_missing_aggregate() {
    let (env, client, _, _, _, _, _) = setup_client();
    assert_eq!(
        client.try_get_aggregate_state(&String::from_str(&env, "NOPE")),
        Err(Ok(OracleHubError::NoAggregate))
    );
}

#[test]
fn test_staleness_bound_defaults_and_requires_admin() {
    let (env, client, admin, _, _, _, _) = setup_client();
    assert_eq!(client.get_max_staleness(), DEFAULT_MAX_STALENESS_SECS);

    // Nothing can be proposed before an admin exists.
    assert_eq!(
        client.try_propose_max_staleness(&admin, &7_200),
        Err(Ok(OracleHubError::NotInitialized))
    );
    client.initialize(&admin);
    assert_eq!(
        client.try_initialize(&admin),
        Err(Ok(OracleHubError::AlreadyInitialized))
    );

    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_propose_max_staleness(&stranger, &7_200),
        Err(Ok(OracleHubError::Unauthorized))
    );
    assert_eq!(
        client.try_propose_max_staleness(&admin, &(MIN_MAX_STALENESS_SECS - 1)),
        Err(Ok(OracleHubError::InvalidStaleness))
    );
}

#[test]
fn test_staleness_change_waits_out_the_timelock() {
    let (env, client, admin, n1, n2, n3, n4) = setup_client();
    env.ledger().set_timestamp(50_000);
    client.initialize(&admin);
    let asset = submit_quorum_aggregate(&env, &client, &admin, [&n1, &n2, &n3, &n4]);

    assert_eq!(
        client.try_apply_max_staleness(),
        Err(Ok(OracleHubError::NoPendingChange))
    );
    let pending = client.propose_max_staleness(&admin, &7_200);
    assert_eq!(pending.effective_at, 50_000 + STALENESS_TIMELOCK_SECS);
    assert_eq!(client.get_pending_staleness(), Some(pending.clone()));

    // Still the default until the timelock elapses: a two-hour-old price is stale.
    env.ledger().set_timestamp(50_000 + 7_000);
    assert_eq!(client.get_max_staleness(), DEFAULT_MAX_STALENESS_SECS);
    assert_eq!(
        client.try_apply_max_staleness(),
        Err(Ok(OracleHubError::TimelockPending))
    );
    assert_eq!(
        client.try_get_aggregate_state(&asset),
        Err(Ok(OracleHubError::PriceStale))
    );

    // After the timelock anyone may apply it, and the bound takes effect.
    env.ledger().set_timestamp(pending.effective_at);
    assert_eq!(client.apply_max_staleness(), 7_200);
    assert_eq!(client.get_max_staleness(), 7_200);
    assert_eq!(client.get_pending_staleness(), None);

    // Re-submit at the new time so the aggregate is 7 000 s old under a 7 200 s bound.
    let reporting = vec![&env, n1.clone(), n2.clone(), n3.clone()];
    client.submit_bft_aggregate(
        &admin,
        &asset,
        &101_000_000,
        &101_000_000,
        &1_000,
        &reporting,
    );
    env.ledger().set_timestamp(pending.effective_at + 7_000);
    assert_eq!(
        client.get_aggregate_state(&asset).consensus_price,
        101_000_000
    );
    env.ledger().set_timestamp(pending.effective_at + 7_201);
    assert_eq!(
        client.try_get_aggregate_state(&asset),
        Err(Ok(OracleHubError::PriceStale))
    );
}

#[test]
fn test_future_timestamp_counts_as_fresh() {
    let (env, client, admin, n1, n2, n3, n4) = setup_client();
    env.ledger().set_timestamp(90_000);
    let asset = submit_quorum_aggregate(&env, &client, &admin, [&n1, &n2, &n3, &n4]);
    // A ledger clock that moves backwards must not underflow into "stale".
    env.ledger().set_timestamp(80_000);
    assert!(client.try_get_aggregate_state(&asset).is_ok());
}
