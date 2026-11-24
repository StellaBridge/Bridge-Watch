//! Property-style tests for `fee_distribution` rounding fairness (issue #1710).
//!
//! `proptest` is not a dependency of this crate, so each property is checked
//! over a deterministic sequence of inputs produced by a seeded SplitMix64
//! generator. A failing case reproduces exactly from the seed and the
//! iteration index that appears in the assertion message.
//!
//! The contract splits fees into staker / governance / treasury buckets
//! (`DistributionRatios`), so the "lp + relayer + treasury" invariant from the
//! issue is checked as "stakers + governance + treasury" here.

use bridge_watch_contracts::fee_distribution::{
    DistributionRatios, FeeDistributionContract, FeeDistributionContractClient,
    MIN_DISBURSEMENT_THRESHOLD,
};
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, Vec,
};

const SEED: u64 = 0x1710_F00D;
const BPS_DENOM: i128 = 10_000;
const STAKER_BPS: i128 = 5_000;
const GOVERNANCE_BPS: i128 = 3_000;
const ITERATIONS: u32 = 256;

/// Deterministic SplitMix64 generator so every run checks the same inputs.
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        Rng(seed)
    }

    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform-ish integer in `lo..=hi`.
    fn range(&mut self, lo: i128, hi: i128) -> i128 {
        let span = (hi - lo + 1) as u128;
        lo + (self.next_u64() as u128 % span) as i128
    }
}

/// A freshly deployed contract with a 50 / 30 / 20 split and one fee token.
struct Deployed {
    env: Env,
    contract: Address,
    admin: Address,
    treasury: Address,
    staking_token: Address,
    fee_token: Address,
}

fn deploy(threshold: i128) -> Deployed {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let staking_token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let fee_token = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let contract = env.register_contract(None, FeeDistributionContract);

    let ratios = DistributionRatios {
        stakers_bps: STAKER_BPS as u32,
        governance_bps: GOVERNANCE_BPS as u32,
        treasury_bps: 2_000,
    };
    {
        let c = FeeDistributionContractClient::new(&env, &contract);
        c.initialize(&admin, &treasury, &staking_token, &ratios);
        c.add_fee_token(&fee_token);
        c.add_collector(&admin);
        c.set_min_disbursement_threshold(&threshold);
    }

    Deployed {
        env,
        contract,
        admin,
        treasury,
        staking_token,
        fee_token,
    }
}

/// Mint `amount` fee tokens to the collector and deposit them into the pool.
fn fund_and_collect(d: &Deployed, amount: i128) {
    StellarAssetClient::new(&d.env, &d.fee_token).mint(&d.admin, &amount);
    FeeDistributionContractClient::new(&d.env, &d.contract).collect_fees(
        &d.admin,
        &d.fee_token,
        &amount,
    );
}

/// Run one distribution round over every registered fee token.
fn distribute(d: &Deployed) {
    let no_tokens: Vec<Address> = Vec::new(&d.env);
    FeeDistributionContractClient::new(&d.env, &d.contract).distribute_fees(&no_tokens);
}

// ── Conservation ──────────────────────────────────────────────────────────────

/// For any collected fee, the three buckets never sum to more than the fee,
/// and in fact sum to it exactly because treasury takes the rounding remainder.
#[test]
fn split_never_exceeds_collected_fee_across_seeded_amounts() {
    let mut rng = Rng::new(SEED);
    for i in 0..ITERATIONS {
        let amount = rng.range(1, 10_i128.pow(15));
        let d = deploy(0);
        fund_and_collect(&d, amount);
        distribute(&d);

        let c = FeeDistributionContractClient::new(&d.env, &d.contract);
        let rec = c.get_distribution_record(&0).expect("one distribution record");
        let ctx = format!("iteration {i}, fee {amount}");

        let sum = rec.stakers_amount + rec.governance_amount + rec.treasury_amount;
        assert!(sum <= amount, "{ctx}: buckets sum to {sum}, above the collected fee");
        assert_eq!(sum, amount, "{ctx}: rounding remainder must be fully allocated");
        assert!(rec.stakers_amount >= 0 && rec.governance_amount >= 0 && rec.treasury_amount >= 0,
            "{ctx}: a bucket is negative");

        // Each non-treasury bucket rounds down exactly as `amount * bps / 10_000`.
        assert_eq!(rec.stakers_amount, amount * STAKER_BPS / BPS_DENOM, "{ctx}: stakers bucket");
        assert_eq!(rec.governance_amount, amount * GOVERNANCE_BPS / BPS_DENOM, "{ctx}: governance bucket");

        // The treasury transfer that backs the bucket must match what was booked.
        let received = TokenClient::new(&d.env, &d.fee_token).balance(&d.treasury);
        assert_eq!(received, rec.treasury_amount, "{ctx}: treasury transfer");
    }
}

// ── Monotonic accumulation ────────────────────────────────────────────────────

/// Across many collect-and-distribute rounds with a live staker, totals and
/// per-share accumulators only ever increase, and their final value equals the
/// sum of every distribution record.
#[test]
fn accumulators_and_totals_are_monotonic_across_rounds() {
    let mut rng = Rng::new(SEED ^ 0xA5A5_A5A5);
    let d = deploy(0);
    let staker = Address::generate(&d.env);
    StellarAssetClient::new(&d.env, &d.staking_token).mint(&staker, &1_000_000_000);
    FeeDistributionContractClient::new(&d.env, &d.contract).stake_for_fees(
        &staker,
        &1_000_000,
        &false,
    );

    let mut prev_collected = 0_i128;
    let mut prev_distributed = 0_i128;
    let mut prev_acc = 0_i128;
    let mut prev_governance = 0_i128;
    let mut recorded_total = 0_i128;

    for round in 0..ITERATIONS {
        let amount = rng.range(1, 10_i128.pow(12));
        fund_and_collect(&d, amount);
        distribute(&d);

        let c = FeeDistributionContractClient::new(&d.env, &d.contract);
        let pool = c.get_fee_pool(&d.fee_token).expect("fee pool exists");
        let ctx = format!("round {round}, fee {amount}");

        assert!(pool.total_collected >= prev_collected, "{ctx}: total_collected decreased");
        assert!(pool.total_distributed >= prev_distributed, "{ctx}: total_distributed decreased");
        assert!(pool.acc_fee_per_share >= prev_acc, "{ctx}: acc_fee_per_share decreased");
        assert!(pool.governance_pool >= prev_governance, "{ctx}: governance_pool decreased");

        prev_collected = pool.total_collected;
        prev_distributed = pool.total_distributed;
        prev_acc = pool.acc_fee_per_share;
        prev_governance = pool.governance_pool;

        let rec = c.get_distribution_record(&round).expect("record per round");
        assert_eq!(rec.total_amount, amount, "{ctx}: record should cover the round's fee");
        recorded_total += rec.total_amount;
    }

    let c = FeeDistributionContractClient::new(&d.env, &d.contract);
    let pool = c.get_fee_pool(&d.fee_token).expect("fee pool exists");
    assert_eq!(pool.total_distributed, recorded_total, "distributed total must equal the sum of records");
}

// ── Fair share across variable weights ────────────────────────────────────────

/// With 2 to 5 stakers of random weight, each staker's claim never exceeds
/// their exact proportional share, and the total left unclaimed is bounded by
/// one unit per staker (the floor-rounding loss).
#[test]
fn staker_rewards_are_proportional_and_never_overpay() {
    let mut rng = Rng::new(SEED ^ 0x0F0F_0F0F);
    for i in 0..ITERATIONS / 4 {
        let d = deploy(0);
        let c = FeeDistributionContractClient::new(&d.env, &d.contract);

        let n = rng.range(2, 5);
        let mut stakers: std::vec::Vec<(Address, i128)> = std::vec::Vec::new();
        let mut total_weight = 0_i128;
        for _ in 0..n {
            let weight = rng.range(1, 1_000_000_000);
            let s = Address::generate(&d.env);
            StellarAssetClient::new(&d.env, &d.staking_token).mint(&s, &weight);
            c.stake_for_fees(&s, &weight, &false);
            total_weight += weight;
            stakers.push((s, weight));
        }

        let amount = rng.range(1, 10_i128.pow(12));
        fund_and_collect(&d, amount);
        distribute(&d);

        let staker_pool = c.get_distribution_record(&0).expect("record").stakers_amount;
        let mut claimed_total = 0_i128;
        for (addr, weight) in &stakers {
            let pending = c.get_pending_rewards(addr, &d.fee_token);
            let exact_floor = staker_pool * weight / total_weight;
            let ctx = format!("iteration {i}, weight {weight}, total {total_weight}");

            assert!(pending <= exact_floor, "{ctx}: staker overpaid ({pending} > {exact_floor})");
            assert!(exact_floor - pending <= 1, "{ctx}: staker lost more than one unit to rounding");
            claimed_total += pending;
        }

        let ctx = format!("iteration {i}, stakers {n}, pool {staker_pool}");
        assert!(claimed_total <= staker_pool, "{ctx}: claims exceed the stakers bucket");
        assert!(
            staker_pool - claimed_total <= n,
            "{ctx}: dust left unclaimed ({}) exceeds one unit per staker",
            staker_pool - claimed_total
        );
    }
}

// ── Sub-basis-point dust ──────────────────────────────────────────────────────

/// Fees too small for a basis-point share round the staker and governance
/// buckets down to zero, and the whole amount is kept by treasury. Nothing is
/// created or lost.
#[test]
fn sub_basis_point_fees_round_down_and_treasury_keeps_the_remainder() {
    // Exhaustive for the smallest fees, then a seeded sample across the full
    // sub-basis-point range (below BPS_DENOM units).
    let mut amounts: std::vec::Vec<i128> = (1..=32).collect();
    let mut rng = Rng::new(SEED ^ 0xD057);
    for _ in 0..32 {
        amounts.push(rng.range(33, BPS_DENOM - 1));
    }

    for amount in amounts {
        let d = deploy(0);
        fund_and_collect(&d, amount);
        distribute(&d);

        let c = FeeDistributionContractClient::new(&d.env, &d.contract);
        let rec = c.get_distribution_record(&0).expect("record");
        let ctx = format!("fee {amount}");

        assert_eq!(rec.stakers_amount, amount * STAKER_BPS / BPS_DENOM, "{ctx}: stakers");
        assert_eq!(rec.governance_amount, amount * GOVERNANCE_BPS / BPS_DENOM, "{ctx}: governance");
        assert_eq!(
            rec.treasury_amount,
            amount - rec.stakers_amount - rec.governance_amount,
            "{ctx}: treasury must hold the remainder"
        );
        assert_eq!(
            rec.stakers_amount + rec.governance_amount + rec.treasury_amount,
            amount,
            "{ctx}: no value created or lost"
        );
    }

    // A single stroop is entirely treasury's: no staker or governance share.
    let d = deploy(0);
    fund_and_collect(&d, 1);
    distribute(&d);
    let rec = FeeDistributionContractClient::new(&d.env, &d.contract)
        .get_distribution_record(&0)
        .expect("record");
    assert_eq!(rec.stakers_amount, 0);
    assert_eq!(rec.governance_amount, 0);
    assert_eq!(rec.treasury_amount, 1);
}

/// Dust below the disbursement threshold stays pending and is not split. Once
/// the accumulated pending amount clears the threshold, one round distributes
/// all of it, so no dust is dropped.
#[test]
fn dust_below_disbursement_threshold_stays_pending_until_it_clears() {
    let d = deploy(MIN_DISBURSEMENT_THRESHOLD);
    let c = FeeDistributionContractClient::new(&d.env, &d.contract);

    let first = MIN_DISBURSEMENT_THRESHOLD / 3;
    fund_and_collect(&d, first);
    distribute(&d);
    assert_eq!(c.get_distribution_count(), 0, "sub-threshold fee must not distribute");
    assert_eq!(c.get_fee_pool(&d.fee_token).expect("pool").pending, first);

    fund_and_collect(&d, MIN_DISBURSEMENT_THRESHOLD);
    distribute(&d);
    assert_eq!(c.get_distribution_count(), 1, "cleared threshold must distribute once");
    let rec = c.get_distribution_record(&0).expect("record");
    assert_eq!(rec.total_amount, first + MIN_DISBURSEMENT_THRESHOLD);
    assert_eq!(
        rec.stakers_amount + rec.governance_amount + rec.treasury_amount,
        rec.total_amount,
        "buffered dust must be fully allocated"
    );
}
