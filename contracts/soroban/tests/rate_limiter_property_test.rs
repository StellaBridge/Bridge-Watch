//! Property-style tests for rate limiter window consumption (issue #1711).
//!
//! This file is compiled as an in-crate module through `src/lib.rs`, not as an
//! integration test. `rate_limiter` is only built under `cfg(test)`, so an
//! external test crate cannot import it.
//!
//! Randomised cases use a fixed-seed generator, so every run exercises the same
//! sequences and any failure reproduces with the seed in the message.
//!
//! The limiter uses fixed windows. Each window starts at the user's first
//! consumption in it and resets once its length has elapsed. The properties
//! checked here are therefore per window: accepted volume inside one window
//! never exceeds that window's limit, and resets land exactly on the boundary.

use crate::rate_limiter::{
    ConsumeResult, RateLimitError, RateLimiterContract, RateLimiterContractClient, UserLimits,
    DAY_SECS, DEFAULT_COOLDOWN_SECS, DEFAULT_DAILY_COUNT, DEFAULT_DAILY_LIMIT,
    DEFAULT_MONTHLY_COUNT, DEFAULT_MONTHLY_LIMIT, DEFAULT_WEEKLY_COUNT, DEFAULT_WEEKLY_LIMIT,
    WEEK_SECS,
};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{Address, Env};

const NOW: u64 = 1_000_000;

fn setup() -> (Env, RateLimiterContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, RateLimiterContract);
    let client = RateLimiterContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    env.ledger().set_timestamp(NOW);
    client.initialize(&admin);
    (env, client, admin)
}

/// Fixed-seed xorshift generator. Keeps the randomised cases reproducible
/// without adding a property-testing dependency.
struct XorShift(u64);

impl XorShift {
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    /// Value in `lo..=hi`.
    fn range(&mut self, lo: u64, hi: u64) -> u64 {
        lo + self.next_u64() % (hi - lo + 1)
    }
}

/// Mirror of one rolling window in the contract, used as the reference model.
#[derive(Default)]
struct WindowModel {
    start: Option<u64>,
    used: i128,
}

impl WindowModel {
    /// Same rule as the contract's `decayed_usage`: the window restarts at
    /// `now` on first use and again once `secs` have elapsed.
    fn roll(&mut self, now: u64, secs: u64) {
        match self.start {
            Some(start) if now < start + secs => {}
            _ => {
                self.start = Some(now);
                self.used = 0;
            }
        }
    }
}

fn custom_limits(daily: i128) -> UserLimits {
    UserLimits {
        daily_value: daily,
        weekly_value: DEFAULT_WEEKLY_LIMIT,
        monthly_value: DEFAULT_MONTHLY_LIMIT,
        daily_count: DEFAULT_DAILY_COUNT,
        weekly_count: DEFAULT_WEEKLY_COUNT,
        monthly_count: DEFAULT_MONTHLY_COUNT,
    }
}

#[test]
fn prop_window_model_matches_contract_over_simulated_ledger_sequences() {
    for seed in 1..=10u64 {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let mut rng = XorShift(seed);
        let mut now = NOW;
        let mut daily = WindowModel::default();
        let mut weekly = WindowModel::default();
        let mut cooldown_until = 0u64;

        for _ in 0..40 {
            // Advance by up to 3 hours. 40 steps stay well inside one week.
            now += rng.range(0, DAY_SECS / 8);
            env.ledger().set_timestamp(now);
            let amount = rng.range(1, 400_000_000) as i128;

            if now < cooldown_until {
                assert!(
                    client.try_consume_limit(&user, &amount).is_err(),
                    "seed {seed}: consume during cooldown must be an error"
                );
                continue;
            }

            daily.roll(now, DAY_SECS);
            weekly.roll(now, WEEK_SECS);
            let expected_rejection = if daily.used + amount > DEFAULT_DAILY_LIMIT {
                Some(RateLimitError::DailyValueLimitExceeded as u32)
            } else if weekly.used + amount > DEFAULT_WEEKLY_LIMIT {
                Some(RateLimitError::WeeklyValueLimitExceeded as u32)
            } else {
                None
            };

            match (client.try_consume_limit(&user, &amount), expected_rejection) {
                (Ok(Ok(ConsumeResult::Allowed)), None) => {
                    daily.used += amount;
                    weekly.used += amount;
                }
                (Ok(Ok(ConsumeResult::Rejected(code))), Some(expected)) => {
                    assert_eq!(code, expected, "seed {seed}: wrong rejection code");
                    cooldown_until = now + DEFAULT_COOLDOWN_SECS;
                }
                (_, expected) => {
                    panic!("seed {seed}: contract outcome differs from model ({expected:?})")
                }
            }

            // Stored usage is written on every non-cooldown attempt, so it must
            // match the model after each step.
            let usage = client.get_user_usage(&user);
            assert_eq!(
                usage.daily.value_used, daily.used,
                "seed {seed}: daily usage drifted from model"
            );
            assert_eq!(
                usage.weekly.value_used, weekly.used,
                "seed {seed}: weekly usage drifted from model"
            );
            assert!(
                daily.used <= DEFAULT_DAILY_LIMIT,
                "seed {seed}: daily cap exceeded"
            );
            assert!(
                weekly.used <= DEFAULT_WEEKLY_LIMIT,
                "seed {seed}: weekly cap exceeded"
            );
        }
    }
}

#[test]
fn prop_users_are_isolated_and_global_usage_is_sum_of_accepted_volume() {
    for seed in 1..=10u64 {
        let (env, client, _admin) = setup();
        let users = [
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
            Address::generate(&env),
        ];
        let mut rng = XorShift(seed);
        let mut accepted = [0i128; 4];

        for _ in 0..60 {
            let idx = rng.range(0, 3) as usize;
            let amount = rng.range(1, 50_000_000) as i128;
            if let Ok(Ok(ConsumeResult::Allowed)) = client.try_consume_limit(&users[idx], &amount) {
                accepted[idx] += amount;
            }
        }

        let mut total = 0i128;
        for (idx, user) in users.iter().enumerate() {
            let usage = client.get_user_usage(user);
            assert_eq!(
                usage.daily.value_used, accepted[idx],
                "seed {seed}: user {idx} usage"
            );
            assert!(
                accepted[idx] <= DEFAULT_DAILY_LIMIT,
                "seed {seed}: user {idx} cap"
            );
            total += accepted[idx];
        }
        assert_eq!(
            client.get_global_usage().daily.value_used,
            total,
            "seed {seed}: global usage"
        );
    }
}

#[test]
fn test_daily_window_resets_exactly_one_day_after_first_consumption() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);

    assert_eq!(
        client.consume_limit(&user, &DEFAULT_DAILY_LIMIT),
        ConsumeResult::Allowed
    );

    env.ledger().set_timestamp(NOW + DAY_SECS - 1);
    let probe = client.check_limit(&user, &1);
    assert!(!probe.allowed);
    assert_eq!(probe.daily_remaining_value, 0);

    env.ledger().set_timestamp(NOW + DAY_SECS);
    let probe = client.check_limit(&user, &DEFAULT_DAILY_LIMIT);
    assert!(probe.allowed);
    assert_eq!(probe.daily_remaining_value, DEFAULT_DAILY_LIMIT);
    // The weekly window has not elapsed, so its consumption still counts.
    assert_eq!(
        probe.weekly_remaining_value,
        DEFAULT_WEEKLY_LIMIT - DEFAULT_DAILY_LIMIT
    );
}

#[test]
fn test_limit_update_keeps_consumed_usage() {
    let (env, client, admin) = setup();
    let user = Address::generate(&env);
    assert_eq!(
        client.consume_limit(&user, &300_000_000),
        ConsumeResult::Allowed
    );

    client.update_user_limit(&admin, &user, &custom_limits(500_000_000));

    assert_eq!(client.get_user_usage(&user).daily.value_used, 300_000_000);
    let probe = client.check_limit(&user, &200_000_001);
    assert!(!probe.allowed);
    assert_eq!(probe.daily_remaining_value, 200_000_000);
    assert!(client.check_limit(&user, &200_000_000).allowed);
}

#[test]
fn test_lowering_limit_below_usage_blocks_without_resetting_usage() {
    let (env, client, admin) = setup();
    let user = Address::generate(&env);
    assert_eq!(
        client.consume_limit(&user, &300_000_000),
        ConsumeResult::Allowed
    );

    client.update_user_limit(&admin, &user, &custom_limits(200_000_000));

    assert_eq!(client.get_user_usage(&user).daily.value_used, 300_000_000);
    let probe = client.check_limit(&user, &1);
    assert!(!probe.allowed);
    assert_eq!(probe.daily_remaining_value, -100_000_000);
    assert_eq!(
        client.consume_limit(&user, &1),
        ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
    );
}
