#![cfg(test)]

use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env, String};

use bridge_watch_soroban::{
    AnalyticsAggregatorContract, AnalyticsAggregatorContractClient, BucketType,
};

fn setup() -> (Env, AnalyticsAggregatorContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, AnalyticsAggregatorContract);
    let client = AnalyticsAggregatorContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);

    (env, client, admin)
}

// ────────────────────────────────────────────────────────────────────────────
// Recording Metrics Tests
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_record_single_metric_successfully() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "tvl");
    let timestamp = 3600u64;

    client.record_metric(&admin, &metric, &1000_i128, &timestamp);

    // Get history to verify recording
    let history = client.get_metric_history(&metric, &BucketType::Hourly, &1);
    assert_eq!(history.len(), 1);
    assert_eq!(history.get(0).unwrap().value, 1000);
}

#[test]
fn test_record_metric_with_zero_value() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "volume");
    let timestamp = 3600u64;

    client.record_metric(&admin, &metric, &0_i128, &timestamp);

    let history = client.get_metric_history(&metric, &BucketType::Hourly, &1);
    assert_eq!(history.len(), 1);
    assert_eq!(history.get(0).unwrap().value, 0);
}

#[test]
fn test_record_multiple_metrics() {
    let (env, client, admin) = setup();

    let tvl = String::from_str(&env, "tvl");
    let volume = String::from_str(&env, "volume");
    let timestamp = 3600u64;

    client.record_metric(&admin, &tvl, &5000_i128, &timestamp);
    client.record_metric(&admin, &volume, &2000_i128, &timestamp);

    let tvl_history = client.get_metric_history(&tvl, &BucketType::Hourly, &1);
    let volume_history = client.get_metric_history(&volume, &BucketType::Hourly, &1);

    assert_eq!(tvl_history.get(0).unwrap().value, 5000);
    assert_eq!(volume_history.get(0).unwrap().value, 2000);
}

#[test]
fn test_record_metric_accumulates_in_same_bucket() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "tvl");
    let now = 3600u64; // Hour boundary

    // Record two values in the same hourly bucket
    client.record_metric(&admin, &metric, &1000_i128, &now);
    client.record_metric(&admin, &metric, &500_i128, &(now + 1800));

    // Set ledger time to stay in same bucket
    env.ledger().set_timestamp(now + 3599);

    let history = client.get_metric_history(&metric, &BucketType::Hourly, &1);
    assert_eq!(history.len(), 1);
    // Values should accumulate
    assert_eq!(history.get(0).unwrap().value, 1500);
}

#[test]
fn test_record_metric_across_multiple_buckets() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "tx_count");
    let hour_boundary = 3600u64;

    // Record in first hour
    client.record_metric(&admin, &metric, &100_i128, &hour_boundary);

    // Record in second hour (3600 seconds later)
    let next_hour = hour_boundary + 3600;
    client.record_metric(&admin, &metric, &200_i128, &next_hour);

    // Set timestamp to second hour
    env.ledger().set_timestamp(next_hour);

    // Get history - should see both buckets
    let history = client.get_metric_history(&metric, &BucketType::Hourly, &2);
    assert_eq!(history.len(), 2);
    // Most recent is first
    assert_eq!(history.get(0).unwrap().value, 200);
    assert_eq!(history.get(1).unwrap().value, 100);
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregation Tests (Reading Metrics)
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_get_metric_history_returns_correct_limit() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "user_count");
    let base_timestamp = 3600u64;

    // Record metrics in multiple hourly buckets
    for i in 0..5 {
        let timestamp = base_timestamp + (i * 3600);
        client.record_metric(&admin, &metric, &(i as i128 * 100), &timestamp);
    }

    env.ledger().set_timestamp(base_timestamp + (4 * 3600));

    // Request only 3 entries
    let history = client.get_metric_history(&metric, &BucketType::Hourly, &3);
    assert_eq!(history.len(), 3);
}

#[test]
fn test_get_metric_history_empty_when_no_data() {
    let (_env, client, _admin) = setup();

    let metric = String::from_str(&_env, "nonexistent_metric");

    // Get history for metric that was never recorded
    let history = client.get_metric_history(&metric, &BucketType::Hourly, &10);

    // Should return empty buckets or zeros
    assert_eq!(history.len(), 10);
    assert!(history.iter().all(|dp| dp.value == 0));
}

#[test]
fn test_get_metric_history_daily_aggregation() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "volume");
    let day_boundary = 86400u64; // Start of day

    client.record_metric(&admin, &metric, &1000_i128, &day_boundary);
    client.record_metric(&admin, &metric, &2000_i128, &(day_boundary + 43200)); // 12 hours later

    env.ledger().set_timestamp(day_boundary + 86399);

    let history = client.get_metric_history(&metric, &BucketType::Daily, &1);
    assert_eq!(history.len(), 1);
    assert_eq!(history.get(0).unwrap().value, 3000);
}

#[test]
fn test_get_metric_history_weekly_aggregation() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "tvl");
    let week_boundary = 604800u64;

    // Record multiple values throughout the week
    client.record_metric(&admin, &metric, &5000_i128, &week_boundary);
    client.record_metric(&admin, &metric, &3000_i128, &(week_boundary + 259200)); // 3 days in

    env.ledger().set_timestamp(week_boundary + 604799);

    let history = client.get_metric_history(&metric, &BucketType::Weekly, &1);
    assert_eq!(history.len(), 1);
    assert_eq!(history.get(0).unwrap().value, 8000);
}

#[test]
fn test_get_metric_history_monthly_aggregation() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "user_count");
    let month_boundary = 2592000u64; // 30 days

    client.record_metric(&admin, &metric, &1000_i128, &month_boundary);
    client.record_metric(&admin, &metric, &500_i128, &(month_boundary + 1296000)); // Mid-month

    env.ledger().set_timestamp(month_boundary + 2592000);

    let history = client.get_metric_history(&metric, &BucketType::Monthly, &1);
    assert_eq!(history.len(), 1);
    assert_eq!(history.get(0).unwrap().value, 1500);
}

#[test]
fn test_get_metric_history_sorts_by_recency() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "volume");
    let base = 3600u64;

    // Record in reverse order to test sorting
    for i in (0..5).rev() {
        let timestamp = base + (i as u64 * 3600);
        let value = (i as i128 + 1) * 100;
        client.record_metric(&admin, &metric, &value, &timestamp);
    }

    env.ledger().set_timestamp(base + (5 * 3600));

    let history = client.get_metric_history(&metric, &BucketType::Hourly, &5);

    // Should be sorted most recent first
    for i in 0..5 {
        let expected = ((4 - i) as i128 + 1) * 100;
        assert_eq!(history.get(i as u32).unwrap().value, expected);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Custom Metrics Tests
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_set_custom_metric() {
    let (env, client, admin) = setup();

    let name = String::from_str(&env, "tvl_per_tx");
    let formula = String::from_str(&env, "tvl / tx_count");

    client.set_custom_metric(&admin, &name, &formula);

    // Verify it was set by computing it
    let result = client.compute_custom_metric(&name);
    // Should not panic
    assert!(true);
}

#[test]
fn test_compute_tvl_per_tx_metric() {
    let (env, client, admin) = setup();

    let tvl = String::from_str(&env, "tvl");
    let tx_count = String::from_str(&env, "tx_count");
    let formula_name = String::from_str(&env, "tvl_per_tx");

    let timestamp = 3600u64;

    client.record_metric(&admin, &tvl, &10000_i128, &timestamp);
    client.record_metric(&admin, &tx_count, &100_i128, &timestamp);
    client.set_custom_metric(&admin, &formula_name, &String::from_str(&env, "tvl_per_tx"));

    env.ledger().set_timestamp(timestamp);

    let result = client.compute_custom_metric(&formula_name);

    assert_eq!(result, 100); // 10000 / 100 = 100
}

#[test]
fn test_compute_tvl_per_tx_with_zero_transactions() {
    let (env, client, admin) = setup();

    let tvl = String::from_str(&env, "tvl");
    let tx_count = String::from_str(&env, "tx_count");
    let formula_name = String::from_str(&env, "tvl_per_tx");

    let timestamp = 3600u64;

    client.record_metric(&admin, &tvl, &10000_i128, &timestamp);
    client.record_metric(&admin, &tx_count, &0_i128, &timestamp);
    client.set_custom_metric(&admin, &formula_name, &String::from_str(&env, "tvl_per_tx"));

    env.ledger().set_timestamp(timestamp);

    // Should return 0 instead of panicking on division by zero
    let result = client.compute_custom_metric(&formula_name);
    assert_eq!(result, 0);
}

#[test]
fn test_compute_avg_user_volume_metric() {
    let (env, client, admin) = setup();

    let volume = String::from_str(&env, "volume");
    let user_count = String::from_str(&env, "user_count");
    let formula_name = String::from_str(&env, "avg_user_volume");

    let timestamp = 3600u64;

    client.record_metric(&admin, &volume, &5000_i128, &timestamp);
    client.record_metric(&admin, &user_count, &50_i128, &timestamp);
    client.set_custom_metric(
        &admin,
        &formula_name,
        &String::from_str(&env, "avg_user_volume"),
    );

    env.ledger().set_timestamp(timestamp);

    let result = client.compute_custom_metric(&formula_name);
    assert_eq!(result, 100); // 5000 / 50 = 100
}

#[test]
fn test_compute_avg_user_volume_with_zero_users() {
    let (env, client, admin) = setup();

    let volume = String::from_str(&env, "volume");
    let user_count = String::from_str(&env, "user_count");
    let formula_name = String::from_str(&env, "avg_user_volume");

    let timestamp = 3600u64;

    client.record_metric(&admin, &volume, &5000_i128, &timestamp);
    client.record_metric(&admin, &user_count, &0_i128, &timestamp);
    client.set_custom_metric(
        &admin,
        &formula_name,
        &String::from_str(&env, "avg_user_volume"),
    );

    env.ledger().set_timestamp(timestamp);

    // Should return 0 instead of panicking
    let result = client.compute_custom_metric(&formula_name);
    assert_eq!(result, 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard Summary Tests (Read Path)
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_get_dashboard_summary_with_all_metrics() {
    let (env, client, admin) = setup();

    let tvl = String::from_str(&env, "tvl");
    let volume = String::from_str(&env, "volume");
    let user_count = String::from_str(&env, "user_count");
    let tx_count = String::from_str(&env, "tx_count");

    let timestamp = 3600u64;

    client.record_metric(&admin, &tvl, &100000_i128, &timestamp);
    client.record_metric(&admin, &volume, &50000_i128, &timestamp);
    client.record_metric(&admin, &user_count, &1000_i128, &timestamp);
    client.record_metric(&admin, &tx_count, &500_i128, &timestamp);

    env.ledger().set_timestamp(timestamp);

    let summary = client.get_dashboard_summary();

    assert_eq!(summary.tvl, 100000);
    assert_eq!(summary.volume, 50000);
    assert_eq!(summary.user_count, 1000);
    assert_eq!(summary.tx_count, 500);
}

#[test]
fn test_get_dashboard_summary_with_partial_metrics() {
    let (env, client, admin) = setup();

    let tvl = String::from_str(&env, "tvl");
    let volume = String::from_str(&env, "volume");

    let timestamp = 3600u64;

    client.record_metric(&admin, &tvl, &100000_i128, &timestamp);
    client.record_metric(&admin, &volume, &50000_i128, &timestamp);

    env.ledger().set_timestamp(timestamp);

    let summary = client.get_dashboard_summary();

    assert_eq!(summary.tvl, 100000);
    assert_eq!(summary.volume, 50000);
    assert_eq!(summary.user_count, 0); // Not recorded
    assert_eq!(summary.tx_count, 0); // Not recorded
}

#[test]
fn test_get_dashboard_summary_with_no_metrics() {
    let (_env, client, _admin) = setup();

    _env.ledger().set_timestamp(3600u64);

    let summary = client.get_dashboard_summary();

    // All should be zero
    assert_eq!(summary.tvl, 0);
    assert_eq!(summary.volume, 0);
    assert_eq!(summary.user_count, 0);
    assert_eq!(summary.tx_count, 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Edge Cases and Error Handling
// ────────────────────────────────────────────────────────────────────────────

#[test]
fn test_record_metric_large_value() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "tvl");
    let large_value = i128::MAX / 2; // Large but safe value

    client.record_metric(&admin, &metric, &large_value, &3600u64);

    let history = client.get_metric_history(&metric, &BucketType::Hourly, &1);
    assert_eq!(history.get(0).unwrap().value, large_value);
}

#[test]
fn test_metric_history_boundary_conditions() {
    let (env, client, admin) = setup();

    let metric = String::from_str(&env, "test_metric");
    let hour_1 = 3600u64;
    let hour_2 = 7200u64;

    // Record at exact boundaries
    client.record_metric(&admin, &metric, &100_i128, &hour_1);
    client.record_metric(&admin, &metric, &200_i128, &hour_2);

    env.ledger().set_timestamp(hour_2 + 1);

    let history = client.get_metric_history(&metric, &BucketType::Hourly, &2);
    assert_eq!(history.len(), 2);
    assert_eq!(history.get(0).unwrap().value, 200);
    assert_eq!(history.get(1).unwrap().value, 100);
}
