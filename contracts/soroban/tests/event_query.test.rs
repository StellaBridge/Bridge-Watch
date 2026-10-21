#![cfg(test)]

//! Contract event query helpers (issue #1457).
//!
//! `src/event_query.rs` is not declared in `lib.rs`, so it is compiled into this
//! test crate directly. The module reads its storage keys through `crate::keys`;
//! the constants below mirror `src/lib.rs` for that purpose.

#[allow(dead_code)]
#[path = "../src/event_query.rs"]
mod event_query;

mod keys {
    pub const EVENT_REPLAY_LOG: &str = "event_replay_log";
    pub const EVENT_REPLAY_CTR: &str = "event_replay_ctr";
}

use event_query::{
    append_event, query_events, ContractEventFilter, ContractEventQueryResult,
    EVENT_SCHEMA_VERSION, MAX_QUERY_LIMIT,
};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, Address, Env, String};

/// Storage reads and writes need a registered contract to run against.
#[contract]
struct HarnessContract;

fn setup_env() -> (Env, Address) {
    let env = Env::default();
    let contract_id = env.register_contract(None, HarnessContract);
    (env, contract_id)
}

/// Append one event at ledger time `timestamp`.
fn record(env: &Env, cid: &Address, timestamp: u64, event_type: &str, asset: &str, value: i128) {
    env.ledger().set_timestamp(timestamp);
    env.as_contract(cid, || {
        append_event(
            env,
            String::from_str(env, event_type),
            Address::generate(env),
            String::from_str(env, asset),
            value,
        );
    });
}

fn query(
    env: &Env,
    cid: &Address,
    event_type: Option<&str>,
    asset_code: Option<&str>,
    from_ordering_key: u64,
    limit: u32,
) -> ContractEventQueryResult {
    env.as_contract(cid, || {
        query_events(
            env.clone(),
            ContractEventFilter {
                event_type: event_type.map(|t| String::from_str(env, t)),
                asset_code: asset_code.map(|a| String::from_str(env, a)),
                from_ordering_key,
                limit,
            },
        )
    })
}

fn event_ids(result: &ContractEventQueryResult) -> std::vec::Vec<u32> {
    (0..result.events.len())
        .map(|i| result.events.get(i).unwrap().event_id)
        .collect()
}

/// `ordering_key` packs the ledger timestamp into the high 32 bits, so this is
/// the smallest cursor that starts at `timestamp`.
fn ledger_start(timestamp: u64) -> u64 {
    timestamp << 32
}

#[test]
fn test_filters_by_event_type_and_asset_code() {
    let (env, cid) = setup_env();
    record(&env, &cid, 1_000, "health_up", "USDC", 85);
    record(&env, &cid, 1_100, "price_up", "USDC", 1_000_000);
    record(&env, &cid, 1_200, "health_up", "EURC", 90);
    record(&env, &cid, 1_300, "health_up", "USDC", 88);

    let usdc_health = query(&env, &cid, Some("health_up"), Some("USDC"), 0, 10);
    assert_eq!(usdc_health.total_matched, 2);
    assert_eq!(event_ids(&usdc_health), std::vec![1u32, 4]);
    assert!(!usdc_health.has_more);
    for i in 0..usdc_health.events.len() {
        let entry = usdc_health.events.get(i).unwrap();
        assert_eq!(entry.event_type, String::from_str(&env, "health_up"));
        assert_eq!(entry.asset_code, String::from_str(&env, "USDC"));
    }
}

#[test]
fn test_restricts_results_to_an_ordering_key_range() {
    let (env, cid) = setup_env();
    record(&env, &cid, 1_000, "health_up", "USDC", 85);
    record(&env, &cid, 1_100, "price_up", "USDC", 1_000_000);
    record(&env, &cid, 1_200, "health_up", "EURC", 90);
    record(&env, &cid, 1_300, "health_up", "USDC", 88);

    // Ledgers from 1_200 onward: the EURC event and the last USDC event.
    let from_1200 = query(&env, &cid, None, None, ledger_start(1_200), 10);
    assert_eq!(from_1200.total_matched, 2);
    assert_eq!(event_ids(&from_1200), std::vec![3u32, 4]);

    // The same range narrowed by asset code.
    let usdc_from_1200 = query(&env, &cid, None, Some("USDC"), ledger_start(1_200), 10);
    assert_eq!(event_ids(&usdc_from_1200), std::vec![4u32]);
}

#[test]
fn test_returns_events_in_ascending_ordering_key_order() {
    let (env, cid) = setup_env();
    // Same timestamp for all three: order must come from the sequence number.
    record(&env, &cid, 500, "health_up", "USDC", 1);
    record(&env, &cid, 500, "health_up", "USDC", 2);
    record(&env, &cid, 500, "health_up", "USDC", 3);

    let result = query(&env, &cid, None, None, 0, 10);
    assert_eq!(event_ids(&result), std::vec![1u32, 2, 3]);
    let ordering_keys: std::vec::Vec<u64> = (0..result.events.len())
        .map(|i| result.events.get(i).unwrap().ordering_key)
        .collect();
    assert!(ordering_keys.windows(2).all(|pair| pair[0] < pair[1]));
}

#[test]
fn test_pagination_cursor_visits_every_matching_event_exactly_once() {
    let (env, cid) = setup_env();
    // price_up events are sequences 1, 3, 4, 6, 7; health_up events are 2 and 5.
    record(&env, &cid, 500, "price_up", "USDC", 1);
    record(&env, &cid, 500, "health_up", "USDC", 2);
    record(&env, &cid, 500, "price_up", "USDC", 3);
    record(&env, &cid, 500, "price_up", "USDC", 4);
    record(&env, &cid, 500, "health_up", "USDC", 5);
    record(&env, &cid, 500, "price_up", "USDC", 6);
    record(&env, &cid, 500, "price_up", "USDC", 7);

    let first = query(&env, &cid, Some("price_up"), None, 0, 2);
    assert_eq!(event_ids(&first), std::vec![1u32, 3]);
    assert_eq!(first.total_matched, 5);
    assert!(first.has_more);

    let mut collected = event_ids(&first);
    let mut cursor = first.events.get(first.events.len() - 1).unwrap().ordering_key + 1;
    let mut current = first;
    while current.has_more {
        let page = query(&env, &cid, Some("price_up"), None, cursor, 2);
        collected.extend(event_ids(&page));
        cursor = page.events.get(page.events.len() - 1).unwrap().ordering_key + 1;
        current = page;
    }

    assert_eq!(collected, std::vec![1u32, 3, 4, 6, 7]);
    assert!(!current.has_more);
}

#[test]
fn test_returns_empty_result_when_nothing_matches() {
    let (env, cid) = setup_env();
    record(&env, &cid, 1_000, "health_up", "USDC", 85);

    let no_asset_match = query(&env, &cid, None, Some("XLM"), 0, 10);
    assert_eq!(no_asset_match.total_matched, 0);
    assert!(no_asset_match.events.is_empty());
    assert!(!no_asset_match.has_more);

    // A cursor past the last event also yields an empty page.
    let past_end = query(&env, &cid, None, None, ledger_start(2_000), 10);
    assert!(past_end.events.is_empty());
    assert_eq!(past_end.total_matched, 0);
}

#[test]
fn test_enforces_the_maximum_page_size() {
    let (env, cid) = setup_env();
    let total_events = MAX_QUERY_LIMIT + 5;
    for value in 0..total_events {
        record(&env, &cid, 1_000, "health_up", "USDC", value as i128);
    }

    let capped = query(&env, &cid, None, None, 0, 1_000);
    assert_eq!(capped.events.len(), MAX_QUERY_LIMIT);
    assert_eq!(capped.total_matched, total_events);
    assert!(capped.has_more);
}

#[test]
fn test_zero_limit_falls_back_to_a_default_page_of_fifty() {
    let (env, cid) = setup_env();
    for value in 0..60 {
        record(&env, &cid, 1_000, "health_up", "USDC", value);
    }

    let default_page = query(&env, &cid, None, None, 0, 0);
    assert_eq!(default_page.events.len(), 50);
    assert_eq!(default_page.total_matched, 60);
    assert!(default_page.has_more);
}

#[test]
fn test_records_carry_the_schema_version_and_subject_as_asset_code() {
    let (env, cid) = setup_env();
    record(&env, &cid, 1_000, "health_up", "USDC", 85);

    let result = query(&env, &cid, None, None, 0, 10);
    assert_eq!(result.schema_version, EVENT_SCHEMA_VERSION);
    let entry = result.events.get(0).unwrap();
    assert_eq!(entry.schema_version, EVENT_SCHEMA_VERSION);
    assert_eq!(entry.asset_code, String::from_str(&env, "USDC"));
    assert_eq!(entry.value, 85);
    assert_eq!(entry.timestamp, 1_000);
}
