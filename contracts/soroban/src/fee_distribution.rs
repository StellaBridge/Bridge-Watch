//! # Fee Distribution Contract
//!
//! Collects protocol fees from Bridge Watch services and distributes them to
//! stakers, governance token holders, and the treasury based on configurable
//! allocation ratios.
//!
//! ## Economic Model
//!
//! Fees flow through three stages:
//! 1. **Collection** – authorised protocol contracts deposit fee tokens.
//! 2. **Distribution** – pending fees are split by the configured ratios and
//!    credited to each bucket (stakers, governance, treasury).
//! 3. **Claiming** – stakers pull their rewards; governance vesting schedules
//!    unlock linearly; treasury receives its share on every distribution.
//!
//! ### Fair-Share Algorithm (Dividend-Per-Share)
//!
//! Each fee token maintains an `acc_fee_per_share` accumulator (scaled by
//! `PRECISION = 1e12`).  When fees are distributed to stakers:
//!
//! ```text
//! acc_fee_per_share += staker_amount * PRECISION / total_staked
//! ```
//!
//! Each staker stores a `reward_debt` snapshot taken when they last changed
//! their stake.  Their claimable reward is:
//!
//! ```text
//! pending = stake * acc_fee_per_share / PRECISION - reward_debt
//! ```
//!
//! Late stakers are therefore excluded from fees distributed before their
//! entry — a provably fair allocation.
//!
//! ### Vesting
//!
//! Governance pool allocations may be locked in linear vesting schedules
//! created by the admin.  A cliff period must pass before any tokens vest.
//! After the cliff, tokens vest proportionally to elapsed / total duration.
//!
//! ### Compounding
//!
//! Stakers may opt in to auto-compounding.  When enabled, claimed rewards are
//! re-added to the staker's stake weight rather than transferred out, increasing
//! their share of future fee rounds.

#![allow(unused)]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Vec};

// ─── Constants ────────────────────────────────────────────────────────────────

/// Precision factor for per-share arithmetic (1 × 10^12).
const PRECISION: i128 = 1_000_000_000_000i128;

/// Denominator for basis-point calculations (10 000 = 100 %).
const BPS_DENOM: u32 = 10_000;

/// Default minimum amount (1 XLM = 10 000 000 stroops) that must accrue before
/// a balance transfer is made. Smaller amounts stay in a pending buffer so
/// micro-transactions do not burn CPU instructions or grow storage with dust.
pub const MIN_DISBURSEMENT_THRESHOLD: i128 = 10_000_000;

// ─── Data Structures ──────────────────────────────────────────────────────────

/// Compound key used to address per-(staker, token) storage slots.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakerTokenKey {
    pub staker: Address,
    pub token: Address,
}

/// Distribution ratios expressed in basis points; must sum to `BPS_DENOM`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionRatios {
    /// Fraction of each distribution credited to the staking pool.
    pub stakers_bps: u32,
    /// Fraction credited to the governance vesting pool.
    pub governance_bps: u32,
    /// Fraction swept directly to the treasury address.
    pub treasury_bps: u32,
}

/// Runtime state for a single fee-token pool.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeePool {
    /// The token this pool tracks.
    pub token: Address,
    /// Cumulative fees ever deposited into this pool.
    pub total_collected: i128,
    /// Cumulative fees ever distributed from this pool.
    pub total_distributed: i128,
    /// Fees collected but not yet distributed (pending the next distribution).
    pub pending: i128,
    /// Accumulated staker-fee per unit staked, scaled by `PRECISION`.
    /// Increases monotonically on every distribution.
    pub acc_fee_per_share: i128,
    /// Governance allocation waiting to be placed into vesting schedules.
    pub governance_pool: i128,
    /// Ledger timestamp of the most recent distribution for this token.
    pub last_distribution_time: u64,
}

/// Linear vesting schedule for a governance-pool allocation.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSchedule {
    /// Address entitled to the vested tokens.
    pub beneficiary: Address,
    /// Token being vested.
    pub token: Address,
    /// Total tokens subject to this schedule.
    pub total_amount: i128,
    /// Tokens already claimed against this schedule.
    pub claimed_amount: i128,
    /// Ledger timestamp at which vesting began.
    pub start_time: u64,
    /// Total vesting duration in seconds.
    pub duration: u64,
    /// Seconds after `start_time` before any tokens become claimable.
    pub cliff: u64,
}

/// Immutable record written after each distribution round.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DistributionRecord {
    pub token: Address,
    pub total_amount: i128,
    pub stakers_amount: i128,
    pub governance_amount: i128,
    pub treasury_amount: i128,
    pub timestamp: u64,
    pub distribution_id: u32,
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum FeeDistDataKey {
    /// Admin address (privileged operations).
    Admin,
    /// Recipient of the treasury allocation on each distribution.
    Treasury,
    /// Single staking token accepted by `stake_for_fees`.
    StakingToken,
    /// Total units currently staked across all stakers.
    TotalStaked,
    /// Current staker / governance / treasury split.
    Ratios,
    /// Per-token fee pool state.
    FeePool(Address),
    /// Staked balance per staker.
    StakerAmount(Address),
    /// Per (staker, token) reward-debt snapshot.
    StakerDebt(StakerTokenKey),
    /// Per (staker, token) unclaimed rewards accumulated by `harvest_rewards`.
    StakerPending(StakerTokenKey),
    /// Ledger timestamp of first stake (informational).
    StakerTime(Address),
    /// Whether a staker has opted into auto-compounding.
    StakerCompound(Address),
    /// Vesting schedule by sequential integer ID.
    Vesting(u32),
    /// Total vesting schedules ever created.
    VestingCount,
    /// Distribution record by sequential integer ID.
    Distribution(u32),
    /// Total distribution records ever written.
    DistributionCount,
    /// Authorised fee-collector addresses (Vec<Address>).
    Collectors,
    /// Registered fee-token addresses (Vec<Address>).
    Tokens,
    /// Emergency halt flag — blocks deposits, distributions, and claims.
    Emergency,
    /// Minimum seconds between automatic distributions (0 = disabled).
    DistributionInterval,
    /// Ledger timestamp of the last automatic distribution.
    LastAutoDistribution,
    /// Minimum amount required before a fee disbursement transfer is made.
    MinDisbursement,
    /// Per-token treasury allocation buffered until it clears the threshold.
    TreasuryBuffer(Address),
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct FeeDistributionContract;

#[contractimpl]
impl FeeDistributionContract {

    // ── Initialisation ────────────────────────────────────────────────────────

    /// Initialise the fee distribution contract.
    ///
    /// Must be called exactly once.  The admin is the only address allowed to
    /// invoke privileged operations (ratio updates, token registration, vesting
    /// creation, emergency controls, etc.).
    ///
    /// # Parameters
    /// - `admin`         – privileged administrator address.
    /// - `treasury`      – receives the treasury slice of every distribution.
    /// - `staking_token` – the single token users stake to earn fee rewards.
    /// - `ratios`        – initial allocation ratios (must sum to 10 000).
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        staking_token: Address,
        ratios: DistributionRatios,
    ) {
        if env.storage().instance().has(&FeeDistDataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        Self::validate_ratios(&ratios);

        env.storage().instance().set(&FeeDistDataKey::Admin, &admin);
        env.storage().instance().set(&FeeDistDataKey::Treasury, &treasury);
        env.storage().instance().set(&FeeDistDataKey::StakingToken, &staking_token);
        env.storage().instance().set(&FeeDistDataKey::Ratios, &ratios);
        env.storage().instance().set(&FeeDistDataKey::TotalStaked, &0i128);
        env.storage().instance().set(&FeeDistDataKey::VestingCount, &0u32);
        env.storage().instance().set(&FeeDistDataKey::DistributionCount, &0u32);
        env.storage().instance().set(&FeeDistDataKey::Emergency, &false);
        env.storage().instance().set(&FeeDistDataKey::DistributionInterval, &0u64);
        env.storage().instance().set(&FeeDistDataKey::LastAutoDistribution, &0u64);
        env.storage().instance().set(&FeeDistDataKey::MinDisbursement, &MIN_DISBURSEMENT_THRESHOLD);

        let empty_addrs: Vec<Address> = Vec::new(&env);
        env.storage().instance().set(&FeeDistDataKey::Collectors, &empty_addrs.clone());
        env.storage().instance().set(&FeeDistDataKey::Tokens, &empty_addrs);
    }

    // ── Admin: configuration ──────────────────────────────────────────────────

    /// Update distribution ratios.  The three values must sum to 10 000.
    /// Admin only.
    pub fn update_ratios(env: Env, ratios: DistributionRatios) {
        Self::require_admin(&env);
        Self::validate_ratios(&ratios);
        env.storage().instance().set(&FeeDistDataKey::Ratios, &ratios);
    }

    /// Register a token as an accepted fee currency.  Creates an empty
    /// `FeePool` if one does not already exist.  Admin only.
    pub fn add_fee_token(env: Env, token: Address) {
        Self::require_admin(&env);

        let mut tokens: Vec<Address> = env
            .storage().instance().get(&FeeDistDataKey::Tokens).unwrap();

        // Idempotent — skip if already registered.
        for t in tokens.iter() {
            if t == token {
                return;
            }
        }
        tokens.push_back(token.clone());
        env.storage().instance().set(&FeeDistDataKey::Tokens, &tokens);

        // Initialise the pool only when first registered.
        if !env.storage().persistent().has(&FeeDistDataKey::FeePool(token.clone())) {
            let pool = FeePool {
                token: token.clone(),
                total_collected: 0,
                total_distributed: 0,
                pending: 0,
                acc_fee_per_share: 0,
                governance_pool: 0,
                last_distribution_time: env.ledger().timestamp(),
            };
            env.storage().persistent().set(&FeeDistDataKey::FeePool(token), &pool);
        }
    }

    /// Authorise an address to call `collect_fees`.  Admin only.
    pub fn add_collector(env: Env, collector: Address) {
        Self::require_admin(&env);
        let mut collectors: Vec<Address> = env
            .storage().instance().get(&FeeDistDataKey::Collectors).unwrap();
        for c in collectors.iter() {
            if c == collector {
                return;
            }
        }
        collectors.push_back(collector);
        env.storage().instance().set(&FeeDistDataKey::Collectors, &collectors);
    }

    /// Remove a fee collector authorisation.  Admin only.
    pub fn remove_collector(env: Env, collector: Address) {
        Self::require_admin(&env);
        let collectors: Vec<Address> = env
            .storage().instance().get(&FeeDistDataKey::Collectors).unwrap();
        let mut updated: Vec<Address> = Vec::new(&env);
        for c in collectors.iter() {
            if c != collector {
                updated.push_back(c);
            }
        }
        env.storage().instance().set(&FeeDistDataKey::Collectors, &updated);
    }

    /// Set the minimum interval (seconds) between automatic distributions.
    /// Pass `0` to disable automatic triggering.  Admin only.
    pub fn set_distribution_interval(env: Env, interval_secs: u64) {
        Self::require_admin(&env);
        env.storage().instance().set(&FeeDistDataKey::DistributionInterval, &interval_secs);
    }

    /// Set the minimum disbursement threshold.  Pending fees, treasury
    /// allocations and staker claims below this amount are buffered instead of
    /// transferred.  Pass `0` to disable buffering.  Admin only.
    pub fn set_min_disbursement_threshold(env: Env, threshold: i128) {
        Self::require_admin(&env);
        if threshold < 0 {
            panic!("threshold must be non-negative");
        }
        env.storage().instance().set(&FeeDistDataKey::MinDisbursement, &threshold);
    }

    /// Force-transfer any buffered treasury dust for `token`, regardless of the
    /// threshold.  Returns the amount transferred.  Admin only.
    pub fn flush_treasury_buffer(env: Env, token: Address) -> i128 {
        Self::require_admin(&env);
        let key = FeeDistDataKey::TreasuryBuffer(token.clone());
        let buffered: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if buffered == 0 {
            return 0;
        }
        env.storage().persistent().remove(&key);
        let treasury: Address = env.storage().instance().get(&FeeDistDataKey::Treasury).unwrap();
        token::Client::new(&env, &token)
            .transfer(&env.current_contract_address(), &treasury, &buffered);
        buffered
    }

    /// Update the treasury address.  Admin only.
    pub fn update_treasury(env: Env, new_treasury: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(&FeeDistDataKey::Treasury, &new_treasury);
    }

    // ── Fee Collection ─────────────────────────────────────────────────────────

    /// Collect fees from an authorised protocol service.
    ///
    /// Transfers `amount` of `token` from `collector` into this contract.
    /// The collector must be either the admin or a registered fee collector.
    /// Triggers an automatic distribution if the configured interval has elapsed.
    ///
    /// # Panics
    /// - `amount` ≤ 0
    /// - `collector` is not authorised
    /// - `token` is not a registered fee token
    /// - contract is in emergency mode
    pub fn collect_fees(env: Env, collector: Address, token: Address, amount: i128) {
        collector.require_auth();
        Self::require_not_emergency(&env);

        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Verify authorisation.
        let admin: Address = env.storage().instance().get(&FeeDistDataKey::Admin).unwrap();
        if admin != collector {
            let collectors: Vec<Address> = env
                .storage().instance().get(&FeeDistDataKey::Collectors).unwrap();
            let mut authorised = false;
            for c in collectors.iter() {
                if c == collector {
                    authorised = true;
                    break;
                }
            }
            if !authorised {
                panic!("unauthorized collector");
            }
        }

        Self::require_token_supported(&env, &token);

        // Pull tokens into the contract.
        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &token).transfer(&collector, &contract_addr, &amount);

        // Credit the pending pool.
        let mut pool: FeePool = env
            .storage().persistent()
            .get(&FeeDistDataKey::FeePool(token.clone()))
            .unwrap();
        pool.total_collected = pool.total_collected.checked_add(amount).expect("overflow");
        pool.pending = pool.pending.checked_add(amount).expect("overflow");
        env.storage().persistent().set(&FeeDistDataKey::FeePool(token), &pool);

        // Auto-distribute if the interval has elapsed.
        Self::maybe_auto_distribute(&env);
    }

    // ── Distribution ───────────────────────────────────────────────────────────

    /// Distribute pending fees across all (or a specified subset of) tokens.
    ///
    /// Permissionless — any address may call this.  Pass an empty `Vec` to
    /// process every registered fee token.
    ///
    /// Each distribution:
    /// - Updates `acc_fee_per_share` for stakers.
    /// - Accrues governance allocation to `governance_pool`.
    /// - Transfers the treasury slice directly to the treasury address.
    /// - Writes an immutable `DistributionRecord` for historical tracking.
    pub fn distribute_fees(env: Env, tokens: Vec<Address>) {
        Self::require_not_emergency(&env);

        let tokens_to_process: Vec<Address> = if tokens.is_empty() {
            env.storage().instance().get(&FeeDistDataKey::Tokens).unwrap()
        } else {
            tokens
        };

        Self::do_distribute(&env, tokens_to_process);
    }

    // ── Staking ─────────────────────────────────────────────────────────────

    /// Stake tokens to participate in fee distributions.
    ///
    /// Harvests pending rewards for the staker before adjusting their stake
    /// weight so that the fair-share invariant is preserved.  New stakers do
    /// not receive fees distributed before this call.
    ///
    /// # Parameters
    /// - `staker`           – address staking; must sign.
    /// - `amount`           – units of the registered staking token to lock.
    /// - `enable_compound`  – if `true`, future claims re-stake rather than
    ///                        transfer out.
    pub fn stake_for_fees(
        env: Env,
        staker: Address,
        amount: i128,
        enable_compound: bool,
    ) {
        staker.require_auth();
        Self::require_not_emergency(&env);

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let supported_tokens: Vec<Address> = env
            .storage().instance().get(&FeeDistDataKey::Tokens).unwrap();

        // Harvest first to avoid diluting existing rewards.
        Self::harvest_rewards(&env, &staker, &supported_tokens);

        // Transfer staking tokens in.
        let staking_token: Address = env
            .storage().instance().get(&FeeDistDataKey::StakingToken).unwrap();
        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &staking_token).transfer(&staker, &contract_addr, &amount);

        // Update staker balance.
        let current_stake: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerAmount(staker.clone()))
            .unwrap_or(0);
        let new_stake = current_stake.checked_add(amount).expect("overflow");
        env.storage().persistent().set(&FeeDistDataKey::StakerAmount(staker.clone()), &new_stake);

        // Sync reward debts so the new weight does not claim pre-stake fees.
        Self::sync_debts(&env, &staker, new_stake, &supported_tokens);

        // Record stake timestamp only on first stake.
        if current_stake == 0 {
            env.storage().persistent().set(
                &FeeDistDataKey::StakerTime(staker.clone()),
                &env.ledger().timestamp(),
            );
        }

        env.storage().persistent()
            .set(&FeeDistDataKey::StakerCompound(staker.clone()), &enable_compound);

        // Update global total.
        let total_staked: i128 = env.storage().instance().get(&FeeDistDataKey::TotalStaked).unwrap();
        env.storage().instance().set(
            &FeeDistDataKey::TotalStaked,
            &(total_staked.checked_add(amount).expect("overflow")),
        );
    }

    /// Unstake tokens and harvest pending rewards.
    ///
    /// Returns `amount` of the staking token to `staker` after harvesting any
    /// outstanding fee rewards.
    ///
    /// # Panics
    /// - `amount` ≤ 0 or exceeds the staker's current balance.
    pub fn unstake(env: Env, staker: Address, amount: i128) {
        staker.require_auth();

        let current_stake: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerAmount(staker.clone()))
            .unwrap_or(0);

        if amount <= 0 || amount > current_stake {
            panic!("invalid unstake amount");
        }

        let supported_tokens: Vec<Address> = env
            .storage().instance().get(&FeeDistDataKey::Tokens).unwrap();

        // Harvest before reducing weight.
        Self::harvest_rewards(&env, &staker, &supported_tokens);

        let new_stake = current_stake.checked_sub(amount).expect("underflow");
        env.storage().persistent().set(&FeeDistDataKey::StakerAmount(staker.clone()), &new_stake);

        // Re-sync debts at the new, lower weight.
        Self::sync_debts(&env, &staker, new_stake, &supported_tokens);

        // Return staking tokens.
        let staking_token: Address = env
            .storage().instance().get(&FeeDistDataKey::StakingToken).unwrap();
        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &staking_token).transfer(&contract_addr, &staker, &amount);

        // Update global total.
        let total_staked: i128 = env.storage().instance().get(&FeeDistDataKey::TotalStaked).unwrap();
        env.storage().instance().set(
            &FeeDistDataKey::TotalStaked,
            &(total_staked.checked_sub(amount).expect("underflow")),
        );
    }

    // ── Claiming ───────────────────────────────────────────────────────────────

    /// Claim accumulated fee rewards for a specific token.
    ///
    /// When compound mode is enabled the reward is added back to the staker's
    /// stake weight (increasing their share of future distributions) rather
    /// than transferred out.
    ///
    /// # Panics
    /// - Nothing to claim.
    /// - Contract is in emergency mode.
    pub fn claim_fees(env: Env, staker: Address, token: Address) {
        staker.require_auth();
        Self::require_not_emergency(&env);

        let supported_tokens: Vec<Address> = env
            .storage().instance().get(&FeeDistDataKey::Tokens).unwrap();
        Self::harvest_rewards(&env, &staker, &supported_tokens);

        let key = StakerTokenKey { staker: staker.clone(), token: token.clone() };
        let pending: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerPending(key.clone()))
            .unwrap_or(0);

        if pending == 0 {
            panic!("nothing to claim");
        }

        env.storage().persistent().set(&FeeDistDataKey::StakerPending(key), &0i128);

        let compound: bool = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerCompound(staker.clone()))
            .unwrap_or(false);

        if compound {
            // Re-stake: boost the staker's weight by the pending reward amount.
            let current_stake: i128 = env
                .storage().persistent()
                .get(&FeeDistDataKey::StakerAmount(staker.clone()))
                .unwrap_or(0);
            let new_stake = current_stake.checked_add(pending).expect("overflow");
            env.storage().persistent()
                .set(&FeeDistDataKey::StakerAmount(staker.clone()), &new_stake);

            Self::sync_debts(&env, &staker, new_stake, &supported_tokens);

            let total_staked: i128 = env
                .storage().instance().get(&FeeDistDataKey::TotalStaked).unwrap();
            env.storage().instance().set(
                &FeeDistDataKey::TotalStaked,
                &(total_staked.checked_add(pending).expect("overflow")),
            );
        } else {
            let contract_addr = env.current_contract_address();
            token::Client::new(&env, &token).transfer(&contract_addr, &staker, &pending);
        }
    }

    /// Compound rewards for a staker without requiring their signature.
    ///
    /// The staker must have compound mode enabled.  This allows keeper bots or
    /// automation scripts to trigger compounding on behalf of opted-in stakers.
    ///
    /// # Panics
    /// - Staker has not enabled compound mode.
    pub fn compound_rewards(env: Env, staker: Address, token: Address) {
        let compound: bool = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerCompound(staker.clone()))
            .unwrap_or(false);
        if !compound {
            panic!("compounding not enabled for staker");
        }

        let supported_tokens: Vec<Address> = env
            .storage().instance().get(&FeeDistDataKey::Tokens).unwrap();
        Self::harvest_rewards(&env, &staker, &supported_tokens);

        let key = StakerTokenKey { staker: staker.clone(), token: token.clone() };
        let pending: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerPending(key.clone()))
            .unwrap_or(0);

        if pending == 0 {
            return;
        }

        env.storage().persistent().set(&FeeDistDataKey::StakerPending(key), &0i128);

        let current_stake: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerAmount(staker.clone()))
            .unwrap_or(0);
        let new_stake = current_stake.checked_add(pending).expect("overflow");
        env.storage().persistent().set(&FeeDistDataKey::StakerAmount(staker.clone()), &new_stake);

        Self::sync_debts(&env, &staker, new_stake, &supported_tokens);

        let total_staked: i128 = env
            .storage().instance().get(&FeeDistDataKey::TotalStaked).unwrap();
        env.storage().instance().set(
            &FeeDistDataKey::TotalStaked,
            &(total_staked.checked_add(pending).expect("overflow")),
        );
    }

    // ── Vesting ────────────────────────────────────────────────────────────────

    /// Create a governance-allocation vesting schedule.
    ///
    /// Draws `amount` from the specified token's `governance_pool` bucket and
    /// locks it into a new linear vesting schedule.  Admin only.
    ///
    /// # Parameters
    /// - `beneficiary`    – address that will claim the vested tokens.
    /// - `token`          – fee token being vested.
    /// - `amount`         – tokens to vest.
    /// - `duration_secs`  – total vesting window in seconds.
    /// - `cliff_secs`     – seconds that must pass before any tokens vest.
    ///
    /// # Panics
    /// - `amount` > governance pool balance.
    /// - `cliff_secs` > `duration_secs`.
    pub fn create_vesting_schedule(
        env: Env,
        beneficiary: Address,
        token: Address,
        amount: i128,
        duration_secs: u64,
        cliff_secs: u64,
    ) {
        Self::require_admin(&env);
        Self::require_not_emergency(&env);

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if duration_secs == 0 {
            panic!("duration must be positive");
        }
        if cliff_secs > duration_secs {
            panic!("cliff cannot exceed duration");
        }

        let mut pool: FeePool = env
            .storage().persistent()
            .get(&FeeDistDataKey::FeePool(token.clone()))
            .expect("unknown token");

        if pool.governance_pool < amount {
            panic!("insufficient governance pool balance");
        }

        pool.governance_pool = pool.governance_pool.checked_sub(amount).expect("underflow");
        env.storage().persistent().set(&FeeDistDataKey::FeePool(token.clone()), &pool);

        let mut count: u32 = env.storage().instance().get(&FeeDistDataKey::VestingCount).unwrap();
        let schedule = VestingSchedule {
            beneficiary,
            token,
            total_amount: amount,
            claimed_amount: 0,
            start_time: env.ledger().timestamp(),
            duration: duration_secs,
            cliff: cliff_secs,
        };
        env.storage().persistent().set(&FeeDistDataKey::Vesting(count), &schedule);
        count = count.checked_add(1).expect("overflow");
        env.storage().instance().set(&FeeDistDataKey::VestingCount, &count);
    }

    /// Claim vested tokens from a vesting schedule.
    ///
    /// Releases all tokens vested since the last claim, subject to the cliff.
    /// Any address may initiate the call, but the beneficiary address is the
    /// one that must sign (via `require_auth`).
    ///
    /// # Panics
    /// - Cliff period has not yet elapsed.
    /// - Nothing has vested since the last claim.
    pub fn claim_vested(env: Env, vesting_id: u32) {
        let mut schedule: VestingSchedule = env
            .storage().persistent()
            .get(&FeeDistDataKey::Vesting(vesting_id))
            .expect("vesting schedule not found");

        schedule.beneficiary.require_auth();

        let now = env.ledger().timestamp();
        let elapsed = now.saturating_sub(schedule.start_time);

        if elapsed < schedule.cliff {
            panic!("cliff period not reached");
        }

        // Linear vesting: vested_total = total * min(elapsed, duration) / duration
        let vested_total: i128 = if elapsed >= schedule.duration {
            schedule.total_amount
        } else {
            // Use u128 arithmetic to avoid overflow on large amounts × elapsed.
            let num = (schedule.total_amount as u128)
                .checked_mul(elapsed as u128)
                .expect("overflow");
            (num / schedule.duration as u128) as i128
        };

        let claimable = vested_total
            .checked_sub(schedule.claimed_amount)
            .expect("underflow");

        if claimable <= 0 {
            panic!("nothing vested to claim");
        }

        schedule.claimed_amount = schedule.claimed_amount
            .checked_add(claimable)
            .expect("overflow");
        env.storage().persistent().set(&FeeDistDataKey::Vesting(vesting_id), &schedule);

        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &schedule.token)
            .transfer(&contract_addr, &schedule.beneficiary, &claimable);
    }

    // ── Emergency ──────────────────────────────────────────────────────────────

    /// Activate or deactivate emergency mode.  Admin only.
    ///
    /// While active, `collect_fees`, `distribute_fees`, `stake_for_fees`, and
    /// `claim_fees` are all blocked so the admin can drain funds safely.
    pub fn set_emergency(env: Env, active: bool) {
        Self::require_admin(&env);
        env.storage().instance().set(&FeeDistDataKey::Emergency, &active);
    }

    /// Emergency withdrawal of any token to a specified recipient.
    ///
    /// Emergency mode must be active.  Admin only.
    pub fn emergency_withdraw(env: Env, token: Address, recipient: Address, amount: i128) {
        Self::require_admin(&env);
        let emergency: bool = env.storage().instance().get(&FeeDistDataKey::Emergency).unwrap();
        if !emergency {
            panic!("emergency mode not active");
        }
        let contract_addr = env.current_contract_address();
        token::Client::new(&env, &token).transfer(&contract_addr, &recipient, &amount);
    }

    // ── Queries ────────────────────────────────────────────────────────────────

    /// Return the current distribution ratios.
    pub fn get_ratios(env: Env) -> DistributionRatios {
        env.storage().instance().get(&FeeDistDataKey::Ratios).unwrap()
    }

    /// Return the fee pool state for `token`, or `None` if not registered.
    pub fn get_fee_pool(env: Env, token: Address) -> Option<FeePool> {
        env.storage().persistent().get(&FeeDistDataKey::FeePool(token))
    }

    /// Return the total staked units across all stakers.
    pub fn get_total_staked(env: Env) -> i128 {
        env.storage().instance().get(&FeeDistDataKey::TotalStaked).unwrap()
    }

    /// Return the staked balance for `staker`.
    pub fn get_staker_amount(env: Env, staker: Address) -> i128 {
        env.storage().persistent()
            .get(&FeeDistDataKey::StakerAmount(staker))
            .unwrap_or(0)
    }

    /// Return the harvestable reward balance for `staker` on `token`.
    ///
    /// Includes both previously harvested (stored) and live (unaccounted)
    /// rewards based on the current `acc_fee_per_share`.
    pub fn get_pending_rewards(env: Env, staker: Address, token: Address) -> i128 {
        let stake: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerAmount(staker.clone()))
            .unwrap_or(0);
        if stake == 0 {
            return 0;
        }
        let pool: FeePool = match env
            .storage().persistent()
            .get(&FeeDistDataKey::FeePool(token.clone()))
        {
            Some(p) => p,
            None => return 0,
        };
        let key = StakerTokenKey { staker: staker.clone(), token };
        let debt: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerDebt(key.clone()))
            .unwrap_or(0);
        let stored_pending: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerPending(key))
            .unwrap_or(0);
        let accrued = stake
            .checked_mul(pool.acc_fee_per_share).expect("overflow")
            / PRECISION;
        let live_rewards = accrued.saturating_sub(debt);
        stored_pending.checked_add(live_rewards).expect("overflow")
    }

    /// Return a distribution record by ID, or `None`.
    pub fn get_distribution_record(env: Env, id: u32) -> Option<DistributionRecord> {
        env.storage().persistent().get(&FeeDistDataKey::Distribution(id))
    }

    /// Return the total number of distribution records ever written.
    pub fn get_distribution_count(env: Env) -> u32 {
        env.storage().instance().get(&FeeDistDataKey::DistributionCount).unwrap()
    }

    /// Return a vesting schedule by ID, or `None`.
    pub fn get_vesting_schedule(env: Env, id: u32) -> Option<VestingSchedule> {
        env.storage().persistent().get(&FeeDistDataKey::Vesting(id))
    }

    /// Return the total number of vesting schedules ever created.
    pub fn get_vesting_count(env: Env) -> u32 {
        env.storage().instance().get(&FeeDistDataKey::VestingCount).unwrap()
    }

    /// Return all registered fee token addresses.
    pub fn get_supported_tokens(env: Env) -> Vec<Address> {
        env.storage().instance().get(&FeeDistDataKey::Tokens).unwrap()
    }

    /// Return whether emergency mode is currently active.
    pub fn is_emergency(env: Env) -> bool {
        env.storage().instance().get(&FeeDistDataKey::Emergency).unwrap()
    }

    /// Return the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&FeeDistDataKey::Admin).unwrap()
    }

    /// Return the treasury address.
    pub fn get_min_disbursement_threshold(env: Env) -> i128 {
        Self::min_disbursement(&env)
    }

    /// Treasury allocation for `token` buffered below the disbursement threshold.
    pub fn get_treasury_buffer(env: Env, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&FeeDistDataKey::TreasuryBuffer(token))
            .unwrap_or(0)
    }

    pub fn get_treasury(env: Env) -> Address {
        env.storage().instance().get(&FeeDistDataKey::Treasury).unwrap()
    }

    // ── Internal helpers ───────────────────────────────────────────────────────

    /// Active minimum disbursement threshold (defaults for pre-upgrade state).
    fn min_disbursement(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&FeeDistDataKey::MinDisbursement)
            .unwrap_or(MIN_DISBURSEMENT_THRESHOLD)
    }

    /// Require the caller to be the admin; panics otherwise.
    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&FeeDistDataKey::Admin).unwrap();
        admin.require_auth();
    }

    /// Panics if emergency mode is active.
    fn require_not_emergency(env: &Env) {
        let emergency: bool = env.storage().instance().get(&FeeDistDataKey::Emergency).unwrap();
        if emergency {
            panic!("contract is in emergency mode");
        }
    }

    /// Panics if `token` is not in the registered token list.
    fn require_token_supported(env: &Env, token: &Address) {
        let tokens: Vec<Address> = env.storage().instance().get(&FeeDistDataKey::Tokens).unwrap();
        for t in tokens.iter() {
            if &t == token {
                return;
            }
        }
        panic!("token not supported");
    }

    /// Panics if the three ratio values do not sum to `BPS_DENOM`.
    fn validate_ratios(ratios: &DistributionRatios) {
        let sum = ratios.stakers_bps
            .checked_add(ratios.governance_bps).expect("overflow")
            .checked_add(ratios.treasury_bps).expect("overflow");
        if sum != BPS_DENOM {
            panic!("ratios must sum to 10000");
        }
    }

    /// Return `amount * bps / BPS_DENOM`.
    fn bps_of(amount: i128, bps: u32) -> i128 {
        amount
            .checked_mul(bps as i128).expect("overflow")
            / BPS_DENOM as i128
    }

    /// Move any unaccounted per-token rewards into `StakerPending` for `staker`.
    ///
    /// Must be called before any change to stake weight to preserve the
    /// fair-share invariant.
    fn harvest_rewards(env: &Env, staker: &Address, tokens: &Vec<Address>) {
        let stake: i128 = env
            .storage().persistent()
            .get(&FeeDistDataKey::StakerAmount(staker.clone()))
            .unwrap_or(0);
        if stake == 0 {
            return;
        }
        for token in tokens.iter() {
            let pool: FeePool = match env
                .storage().persistent()
                .get(&FeeDistDataKey::FeePool(token.clone()))
            {
                Some(p) => p,
                None => continue,
            };
            let key = StakerTokenKey { staker: staker.clone(), token: token.clone() };
            let debt: i128 = env
                .storage().persistent()
                .get(&FeeDistDataKey::StakerDebt(key.clone()))
                .unwrap_or(0);
            let accrued = stake
                .checked_mul(pool.acc_fee_per_share).expect("overflow")
                / PRECISION;
            let new_rewards = accrued.saturating_sub(debt);
            if new_rewards > 0 {
                let pending_key = StakerTokenKey { staker: staker.clone(), token };
                let existing: i128 = env
                    .storage().persistent()
                    .get(&FeeDistDataKey::StakerPending(pending_key.clone()))
                    .unwrap_or(0);
                env.storage().persistent().set(
                    &FeeDistDataKey::StakerPending(pending_key),
                    &(existing.checked_add(new_rewards).expect("overflow")),
                );
                // Advance the debt checkpoint.
                env.storage().persistent().set(&FeeDistDataKey::StakerDebt(key), &accrued);
            }
        }
    }

    /// Rewrite `StakerDebt` for every token based on a new stake weight.
    ///
    /// Called after any stake-weight change (stake / unstake / compound) so the
    /// staker's future rewards accrue from the current accumulator.
    fn sync_debts(env: &Env, staker: &Address, new_stake: i128, tokens: &Vec<Address>) {
        for token in tokens.iter() {
            let pool: FeePool = match env
                .storage().persistent()
                .get(&FeeDistDataKey::FeePool(token.clone()))
            {
                Some(p) => p,
                None => continue,
            };
            let key = StakerTokenKey { staker: staker.clone(), token };
            let debt = new_stake
                .checked_mul(pool.acc_fee_per_share).expect("overflow")
                / PRECISION;
            env.storage().persistent().set(&FeeDistDataKey::StakerDebt(key), &debt);
        }
    }

    /// Trigger a distribution if the configured auto-distribution interval has
    /// elapsed since the last one.
    fn maybe_auto_distribute(env: &Env) {
        let interval: u64 = env
            .storage().instance()
            .get(&FeeDistDataKey::DistributionInterval)
            .unwrap();
        if interval == 0 {
            return;
        }
        let last: u64 = env
            .storage().instance()
            .get(&FeeDistDataKey::LastAutoDistribution)
            .unwrap();
        let now = env.ledger().timestamp();
        if now >= last.saturating_add(interval) {
            let tokens: Vec<Address> = env
                .storage().instance()
                .get(&FeeDistDataKey::Tokens)
                .unwrap();
            Self::do_distribute(env, tokens);
        }
    }

    /// Core distribution logic shared by `distribute_fees` and
    /// `maybe_auto_distribute`.
    fn do_distribute(env: &Env, tokens: Vec<Address>) {
        let ratios: DistributionRatios = env
            .storage().instance().get(&FeeDistDataKey::Ratios).unwrap();
        let total_staked: i128 = env
            .storage().instance().get(&FeeDistDataKey::TotalStaked).unwrap();
        let treasury: Address = env
            .storage().instance().get(&FeeDistDataKey::Treasury).unwrap();
        let contract_addr = env.current_contract_address();
        let threshold = Self::min_disbursement(env);

        for token in tokens.iter() {
            let mut pool: FeePool = match env
                .storage().persistent()
                .get(&FeeDistDataKey::FeePool(token.clone()))
            {
                Some(p) => p,
                None => continue,
            };

            // Dust buffer: leave small accruals pending until they clear the
            // threshold rather than running a distribution round for them.
            if pool.pending == 0 || pool.pending < threshold {
                continue;
            }

            let pending = pool.pending;

            let stakers_amt = Self::bps_of(pending, ratios.stakers_bps);
            let governance_amt = Self::bps_of(pending, ratios.governance_bps);
            // Treasury gets the remainder to avoid rounding dust.
            let treasury_amt = pending
                .checked_sub(stakers_amt).expect("underflow")
                .checked_sub(governance_amt).expect("underflow");

            // Update the per-share accumulator.
            // If no one is staked, route the stakers' portion to governance.
            if total_staked > 0 && stakers_amt > 0 {
                let delta = stakers_amt
                    .checked_mul(PRECISION).expect("overflow")
                    / total_staked;
                pool.acc_fee_per_share = pool.acc_fee_per_share
                    .checked_add(delta).expect("overflow");
            } else if stakers_amt > 0 {
                // No stakers — send orphan staker fees to governance pool.
                pool.governance_pool = pool.governance_pool
                    .checked_add(stakers_amt).expect("overflow");
            }

            pool.governance_pool = pool.governance_pool
                .checked_add(governance_amt).expect("overflow");

            // Sweep treasury once its buffered allocation clears the threshold.
            let buffer_key = FeeDistDataKey::TreasuryBuffer(token.clone());
            let buffered: i128 = env.storage().persistent().get(&buffer_key).unwrap_or(0);
            let treasury_due = buffered.checked_add(treasury_amt).expect("overflow");
            if treasury_due > 0 && treasury_due >= threshold {
                token::Client::new(env, &token)
                    .transfer(&contract_addr, &treasury, &treasury_due);
                if buffered > 0 {
                    env.storage().persistent().remove(&buffer_key);
                }
            } else if treasury_amt > 0 {
                env.storage().persistent().set(&buffer_key, &treasury_due);
            }

            pool.total_distributed = pool.total_distributed
                .checked_add(pending).expect("overflow");
            pool.pending = 0;
            pool.last_distribution_time = env.ledger().timestamp();
            env.storage().persistent().set(&FeeDistDataKey::FeePool(token.clone()), &pool);

            // Write immutable history record.
            let mut count: u32 = env
                .storage().instance()
                .get(&FeeDistDataKey::DistributionCount)
                .unwrap();
            let record = DistributionRecord {
                token: token.clone(),
                total_amount: pending,
                stakers_amount: stakers_amt,
                governance_amount: governance_amt,
                treasury_amount: treasury_amt,
                timestamp: env.ledger().timestamp(),
                distribution_id: count,
            };
            env.storage().persistent().set(&FeeDistDataKey::Distribution(count), &record);
            count = count.checked_add(1).expect("overflow");
            env.storage().instance().set(&FeeDistDataKey::DistributionCount, &count);
        }

        env.storage().instance().set(
            &FeeDistDataKey::LastAutoDistribution,
            &env.ledger().timestamp(),
        );
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token::{Client as TokenClient, StellarAssetClient},
        Env, Vec,
    };

    // ── Test helpers ──────────────────────────────────────────────────────────

    struct TestEnv {
        env: Env,
        contract: Address,
        admin: Address,
        treasury: Address,
        staking_token: Address,
        fee_token: Address,
    }

    fn setup() -> TestEnv {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // Deploy a Stellar Asset Contract for the staking token.
        let staking_token = env.register_stellar_asset_contract_v2(admin.clone()).address();

        // Deploy a Stellar Asset Contract for the fee token.
        let fee_token = env.register_stellar_asset_contract_v2(admin.clone()).address();

        let contract = env.register_contract(None, FeeDistributionContract);
        let client = FeeDistributionContractClient::new(&env, &contract);

        let ratios = DistributionRatios {
            stakers_bps: 5_000,
            governance_bps: 3_000,
            treasury_bps: 2_000,
        };
        client.initialize(&admin, &treasury, &staking_token, &ratios);
        client.add_fee_token(&fee_token);

        TestEnv { env, contract, admin, treasury, staking_token, fee_token }
    }

    /// Mint `amount` fee tokens directly to `to`.
    fn mint_fee(t: &TestEnv, to: &Address, amount: i128) {
        StellarAssetClient::new(&t.env, &t.fee_token).mint(to, &amount);
    }

    /// Mint `amount` staking tokens directly to `to`.
    fn mint_stake(t: &TestEnv, to: &Address, amount: i128) {
        StellarAssetClient::new(&t.env, &t.staking_token).mint(to, &amount);
    }

    fn client(t: &TestEnv) -> FeeDistributionContractClient {
        FeeDistributionContractClient::new(&t.env, &t.contract)
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_sets_state() {
        let t = setup();
        let c = client(&t);

        assert_eq!(c.get_total_staked(), 0);
        assert_eq!(c.get_distribution_count(), 0);
        assert_eq!(c.get_vesting_count(), 0);
        assert!(!c.is_emergency());
        assert_eq!(c.get_admin(), t.admin);
        assert_eq!(c.get_treasury(), t.treasury);

        let ratios = c.get_ratios();
        assert_eq!(ratios.stakers_bps, 5_000);
        assert_eq!(ratios.governance_bps, 3_000);
        assert_eq!(ratios.treasury_bps, 2_000);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_twice_panics() {
        let t = setup();
        client(&t).initialize(
            &t.admin,
            &t.treasury,
            &t.staking_token,
            &DistributionRatios { stakers_bps: 5_000, governance_bps: 3_000, treasury_bps: 2_000 },
        );
    }

    // ── Ratio validation ──────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "ratios must sum to 10000")]
    fn test_invalid_ratios_panic() {
        let t = setup();
        client(&t).update_ratios(&DistributionRatios {
            stakers_bps: 5_000,
            governance_bps: 3_000,
            treasury_bps: 1_000, // only 9 000
        });
    }

    #[test]
    fn test_update_ratios() {
        let t = setup();
        let c = client(&t);
        c.update_ratios(&DistributionRatios {
            stakers_bps: 6_000,
            governance_bps: 2_000,
            treasury_bps: 2_000,
        });
        let r = c.get_ratios();
        assert_eq!(r.stakers_bps, 6_000);
    }

    // ── Token & collector management ──────────────────────────────────────────

    #[test]
    fn test_add_fee_token() {
        let t = setup();
        let tokens = client(&t).get_supported_tokens();
        assert_eq!(tokens.len(), 1);
    }

    #[test]
    fn test_add_fee_token_idempotent() {
        let t = setup();
        let c = client(&t);
        c.add_fee_token(&t.fee_token);
        c.add_fee_token(&t.fee_token);
        assert_eq!(c.get_supported_tokens().len(), 1);
    }

    #[test]
    fn test_add_and_remove_collector() {
        let t = setup();
        let c = client(&t);
        let collector = Address::generate(&t.env);
        c.add_collector(&collector);

        // Collector can now collect fees — just verify no panic during setup.
        // Remove it again.
        c.remove_collector(&collector);
    }

    // ── Fee collection ────────────────────────────────────────────────────────

    #[test]
    fn test_collect_fees_updates_pool() {
        let t = setup();
        let c = client(&t);
        let collector = Address::generate(&t.env);
        c.add_collector(&collector);
        mint_fee(&t, &collector, 1_000);

        c.collect_fees(&collector, &t.fee_token, &1_000);

        let pool = c.get_fee_pool(&t.fee_token).unwrap();
        assert_eq!(pool.total_collected, 1_000);
        assert_eq!(pool.pending, 1_000);
    }

    #[test]
    #[should_panic(expected = "unauthorized collector")]
    fn test_collect_fees_unauthorized_panics() {
        let t = setup();
        let bad_actor = Address::generate(&t.env);
        mint_fee(&t, &bad_actor, 500);
        client(&t).collect_fees(&bad_actor, &t.fee_token, &500);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_collect_fees_zero_amount_panics() {
        let t = setup();
        client(&t).collect_fees(&t.admin, &t.fee_token, &0);
    }

    #[test]
    #[should_panic(expected = "token not supported")]
    fn test_collect_fees_unsupported_token_panics() {
        let t = setup();
        let unknown = Address::generate(&t.env);
        client(&t).collect_fees(&t.admin, &unknown, &100);
    }

    #[test]
    fn test_admin_can_collect_without_collector_registration() {
        let t = setup();
        mint_fee(&t, &t.admin, 500);
        client(&t).collect_fees(&t.admin, &t.fee_token, &500);
        let pool = client(&t).get_fee_pool(&t.fee_token).unwrap();
        assert_eq!(pool.pending, 500);
    }

    // ── Distribution ──────────────────────────────────────────────────────────

    #[test]
    fn test_distribute_fees_splits_correctly() {
        let t = setup();
        let c = client(&t);

        // Stake so that the staker bucket is non-zero.
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);

        // Collect 10 000 fee tokens.
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);

        let treasury_before = TokenClient::new(&t.env, &t.fee_token).balance(&t.treasury);
        c.distribute_fees(&Vec::new(&t.env));
        let treasury_after = TokenClient::new(&t.env, &t.fee_token).balance(&t.treasury);

        // Treasury should receive exactly 20 % = 2 000.
        assert_eq!(treasury_after - treasury_before, 2_000);

        let pool = c.get_fee_pool(&t.fee_token).unwrap();
        assert_eq!(pool.pending, 0);
        assert_eq!(pool.total_distributed, 10_000);
        // Governance pool receives 30 % = 3 000.
        assert_eq!(pool.governance_pool, 3_000);
        assert_eq!(c.get_distribution_count(), 1);
    }

    #[test]
    fn test_distribute_writes_history_record() {
        let t = setup();
        let c = client(&t);
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);
        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);
        c.distribute_fees(&Vec::new(&t.env));

        let rec = c.get_distribution_record(&0).unwrap();
        assert_eq!(rec.total_amount, 1_000);
        assert_eq!(rec.stakers_amount, 500);
        assert_eq!(rec.governance_amount, 300);
        assert_eq!(rec.treasury_amount, 200);
    }

    #[test]
    fn test_distribute_no_pending_is_noop() {
        let t = setup();
        client(&t).distribute_fees(&Vec::new(&t.env));
        assert_eq!(client(&t).get_distribution_count(), 0);
    }

    #[test]
    fn test_distribute_no_stakers_routes_to_governance() {
        let t = setup();
        let c = client(&t);

        // No stakers — stakers' 50 % portion should flow to governance.
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);
        c.distribute_fees(&Vec::new(&t.env));

        let pool = c.get_fee_pool(&t.fee_token).unwrap();
        // governance_pool = 30 % (governance) + 50 % (orphan staker) = 80 % = 8 000
        assert_eq!(pool.governance_pool, 8_000);
    }

    // ── Staking ───────────────────────────────────────────────────────────────

    #[test]
    fn test_stake_and_get_amount() {
        let t = setup();
        let c = client(&t);
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 500);
        c.stake_for_fees(&staker, &500, &false);

        assert_eq!(c.get_staker_amount(&staker), 500);
        assert_eq!(c.get_total_staked(), 500);
    }

    #[test]
    fn test_multiple_stakes_accumulate() {
        let t = setup();
        let c = client(&t);
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &600, &false);
        c.stake_for_fees(&staker, &400, &false);
        assert_eq!(c.get_staker_amount(&staker), 1_000);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_stake_zero_panics() {
        let t = setup();
        client(&t).stake_for_fees(&t.admin, &0, &false);
    }

    #[test]
    fn test_unstake_returns_tokens() {
        let t = setup();
        let c = client(&t);
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);

        let bal_before = TokenClient::new(&t.env, &t.staking_token).balance(&staker);
        c.unstake(&staker, &1_000);
        let bal_after = TokenClient::new(&t.env, &t.staking_token).balance(&staker);

        assert_eq!(bal_after - bal_before, 1_000);
        assert_eq!(c.get_staker_amount(&staker), 0);
        assert_eq!(c.get_total_staked(), 0);
    }

    #[test]
    #[should_panic(expected = "invalid unstake amount")]
    fn test_unstake_more_than_staked_panics() {
        let t = setup();
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 100);
        client(&t).stake_for_fees(&staker, &100, &false);
        client(&t).unstake(&staker, &200);
    }

    #[test]
    #[should_panic(expected = "invalid unstake amount")]
    fn test_unstake_zero_panics() {
        let t = setup();
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 100);
        client(&t).stake_for_fees(&staker, &100, &false);
        client(&t).unstake(&staker, &0);
    }

    // ── Fair-share calculation ────────────────────────────────────────────────

    #[test]
    fn test_late_staker_excludes_pre_stake_fees() {
        let t = setup();
        let c = client(&t);

        // Early staker stakes 1 000.
        let early = Address::generate(&t.env);
        mint_stake(&t, &early, 1_000);
        c.stake_for_fees(&early, &1_000, &false);

        // Distribute 1 000 fee tokens — early staker earns 50 % = 500.
        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);
        c.distribute_fees(&Vec::new(&t.env));

        // Late staker joins AFTER the distribution.
        let late = Address::generate(&t.env);
        mint_stake(&t, &late, 1_000);
        c.stake_for_fees(&late, &1_000, &false);

        // Late staker's pending rewards should be zero.
        assert_eq!(c.get_pending_rewards(&late, &t.fee_token), 0);
        // Early staker's pending rewards should be 500.
        assert_eq!(c.get_pending_rewards(&early, &t.fee_token), 500);
    }

    #[test]
    fn test_two_stakers_split_rewards_proportionally() {
        let t = setup();
        let c = client(&t);

        let alice = Address::generate(&t.env);
        let bob = Address::generate(&t.env);
        mint_stake(&t, &alice, 3_000);
        mint_stake(&t, &bob, 1_000);

        c.stake_for_fees(&alice, &3_000, &false);
        c.stake_for_fees(&bob, &1_000, &false);

        // 4 000 total staked; distribute 4 000 fee tokens → stakers get 50 % = 2 000.
        mint_fee(&t, &t.admin, 4_000);
        c.collect_fees(&t.admin, &t.fee_token, &4_000);
        c.distribute_fees(&Vec::new(&t.env));

        // alice = 3/4 of 2 000 = 1 500; bob = 1/4 = 500.
        assert_eq!(c.get_pending_rewards(&alice, &t.fee_token), 1_500);
        assert_eq!(c.get_pending_rewards(&bob, &t.fee_token), 500);
    }

    // ── Claiming ──────────────────────────────────────────────────────────────

    #[test]
    fn test_claim_fees_transfers_tokens() {
        let t = setup();
        let c = client(&t);
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);

        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);
        c.distribute_fees(&Vec::new(&t.env));

        let bal_before = TokenClient::new(&t.env, &t.fee_token).balance(&staker);
        c.claim_fees(&staker, &t.fee_token);
        let bal_after = TokenClient::new(&t.env, &t.fee_token).balance(&staker);

        // 50 % of 1 000 = 500
        assert_eq!(bal_after - bal_before, 500);
        // Pending should now be zero.
        assert_eq!(c.get_pending_rewards(&staker, &t.fee_token), 0);
    }

    #[test]
    #[should_panic(expected = "nothing to claim")]
    fn test_claim_fees_nothing_to_claim_panics() {
        let t = setup();
        let staker = Address::generate(&t.env);
        client(&t).claim_fees(&staker, &t.fee_token);
    }

    // ── Compounding ───────────────────────────────────────────────────────────

    #[test]
    fn test_claim_fees_with_compound_increases_stake() {
        let t = setup();
        let c = client(&t);
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &true); // compound enabled

        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);
        c.distribute_fees(&Vec::new(&t.env));

        // Staker receives 500 (50 % of 1 000); compounding re-stakes it.
        let bal_before = TokenClient::new(&t.env, &t.fee_token).balance(&staker);
        c.claim_fees(&staker, &t.fee_token);
        let bal_after = TokenClient::new(&t.env, &t.fee_token).balance(&staker);

        // No fee tokens transferred out.
        assert_eq!(bal_after, bal_before);
        // Stake weight increased by 500.
        assert_eq!(c.get_staker_amount(&staker), 1_500);
        assert_eq!(c.get_total_staked(), 1_500);
    }

    #[test]
    fn test_compound_rewards_keeper_call() {
        let t = setup();
        let c = client(&t);
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &true);

        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);
        c.distribute_fees(&Vec::new(&t.env));

        // Keeper triggers compound.
        c.compound_rewards(&staker, &t.fee_token);
        assert_eq!(c.get_staker_amount(&staker), 1_500);
    }

    #[test]
    #[should_panic(expected = "compounding not enabled for staker")]
    fn test_compound_rewards_not_enabled_panics() {
        let t = setup();
        let staker = Address::generate(&t.env);
        client(&t).compound_rewards(&staker, &t.fee_token);
    }

    // ── Vesting ────────────────────────────────────────────────────────────────

    fn advance_time(env: &Env, secs: u64) {
        let current = env.ledger().timestamp();
        env.ledger().set_timestamp(current + secs);
    }

    #[test]
    fn test_create_vesting_schedule() {
        let t = setup();
        let c = client(&t);

        // Seed the governance pool.
        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);
        c.distribute_fees(&Vec::new(&t.env));

        // governance_pool = 30 % of 10 000 = 3 000.
        let beneficiary = Address::generate(&t.env);
        c.create_vesting_schedule(&beneficiary, &t.fee_token, &1_000, &1_000, &0);

        assert_eq!(c.get_vesting_count(), 1);
        let schedule = c.get_vesting_schedule(&0).unwrap();
        assert_eq!(schedule.total_amount, 1_000);
        assert_eq!(schedule.claimed_amount, 0);

        // Governance pool should be reduced by 1 000.
        let pool = c.get_fee_pool(&t.fee_token).unwrap();
        assert_eq!(pool.governance_pool, 2_000);
    }

    #[test]
    fn test_claim_vested_linear() {
        let t = setup();
        let c = client(&t);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);
        c.distribute_fees(&Vec::new(&t.env));

        let beneficiary = Address::generate(&t.env);
        // 1 000 tokens over 1 000 seconds, no cliff.
        c.create_vesting_schedule(&beneficiary, &t.fee_token, &1_000, &1_000, &0);

        // Advance to halfway point.
        advance_time(&t.env, 500);

        let bal_before = TokenClient::new(&t.env, &t.fee_token).balance(&beneficiary);
        c.claim_vested(&0);
        let bal_after = TokenClient::new(&t.env, &t.fee_token).balance(&beneficiary);

        // Should have received 500 (50 %).
        assert_eq!(bal_after - bal_before, 500);

        let schedule = c.get_vesting_schedule(&0).unwrap();
        assert_eq!(schedule.claimed_amount, 500);
    }

    #[test]
    fn test_claim_vested_full_after_duration() {
        let t = setup();
        let c = client(&t);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);
        c.distribute_fees(&Vec::new(&t.env));

        let beneficiary = Address::generate(&t.env);
        c.create_vesting_schedule(&beneficiary, &t.fee_token, &1_000, &1_000, &0);

        advance_time(&t.env, 2_000); // past the end

        let bal_before = TokenClient::new(&t.env, &t.fee_token).balance(&beneficiary);
        c.claim_vested(&0);
        let bal_after = TokenClient::new(&t.env, &t.fee_token).balance(&beneficiary);

        assert_eq!(bal_after - bal_before, 1_000);
    }

    #[test]
    #[should_panic(expected = "cliff period not reached")]
    fn test_claim_vested_before_cliff_panics() {
        let t = setup();
        let c = client(&t);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);
        c.distribute_fees(&Vec::new(&t.env));

        let beneficiary = Address::generate(&t.env);
        // 500-second cliff.
        c.create_vesting_schedule(&beneficiary, &t.fee_token, &1_000, &1_000, &500);

        advance_time(&t.env, 100); // before cliff
        c.claim_vested(&0);
    }

    #[test]
    fn test_claim_vested_after_cliff() {
        let t = setup();
        let c = client(&t);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);
        c.distribute_fees(&Vec::new(&t.env));

        let beneficiary = Address::generate(&t.env);
        c.create_vesting_schedule(&beneficiary, &t.fee_token, &1_000, &1_000, &500);

        advance_time(&t.env, 750); // past cliff, 75 % vested
        c.claim_vested(&0);

        let schedule = c.get_vesting_schedule(&0).unwrap();
        assert_eq!(schedule.claimed_amount, 750);
    }

    #[test]
    #[should_panic(expected = "insufficient governance pool balance")]
    fn test_create_vesting_insufficient_governance_pool_panics() {
        let t = setup();
        let c = client(&t);
        // No distributions → governance pool is 0.
        let beneficiary = Address::generate(&t.env);
        c.create_vesting_schedule(&beneficiary, &t.fee_token, &1_000, &1_000, &0);
    }

    #[test]
    #[should_panic(expected = "cliff cannot exceed duration")]
    fn test_create_vesting_cliff_exceeds_duration_panics() {
        let t = setup();
        let c = client(&t);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);
        c.distribute_fees(&Vec::new(&t.env));

        let beneficiary = Address::generate(&t.env);
        c.create_vesting_schedule(&beneficiary, &t.fee_token, &1_000, &500, &1_000);
    }

    // ── Emergency ─────────────────────────────────────────────────────────────

    #[test]
    fn test_emergency_mode_blocks_collect() {
        let t = setup();
        let c = client(&t);
        c.set_emergency(&true);
        assert!(c.is_emergency());
    }

    #[test]
    #[should_panic(expected = "contract is in emergency mode")]
    fn test_collect_fees_during_emergency_panics() {
        let t = setup();
        let c = client(&t);
        c.set_emergency(&true);
        mint_fee(&t, &t.admin, 100);
        c.collect_fees(&t.admin, &t.fee_token, &100);
    }

    #[test]
    #[should_panic(expected = "contract is in emergency mode")]
    fn test_distribute_during_emergency_panics() {
        let t = setup();
        let c = client(&t);
        c.set_emergency(&true);
        c.distribute_fees(&Vec::new(&t.env));
    }

    #[test]
    #[should_panic(expected = "contract is in emergency mode")]
    fn test_stake_during_emergency_panics() {
        let t = setup();
        let c = client(&t);
        c.set_emergency(&true);
        let staker = Address::generate(&t.env);
        c.stake_for_fees(&staker, &100, &false);
    }

    #[test]
    #[should_panic(expected = "emergency mode not active")]
    fn test_emergency_withdraw_without_emergency_mode_panics() {
        let t = setup();
        let recipient = Address::generate(&t.env);
        client(&t).emergency_withdraw(&t.fee_token, &recipient, &100);
    }

    #[test]
    fn test_emergency_withdraw_transfers_tokens() {
        let t = setup();
        let c = client(&t);

        // Seed the contract with fee tokens.
        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);

        c.set_emergency(&true);
        let recipient = Address::generate(&t.env);
        let bal_before = TokenClient::new(&t.env, &t.fee_token).balance(&recipient);
        c.emergency_withdraw(&t.fee_token, &recipient, &1_000);
        let bal_after = TokenClient::new(&t.env, &t.fee_token).balance(&recipient);
        assert_eq!(bal_after - bal_before, 1_000);
    }

    #[test]
    fn test_emergency_can_be_deactivated() {
        let t = setup();
        let c = client(&t);
        c.set_emergency(&true);
        c.set_emergency(&false);
        assert!(!c.is_emergency());
    }

    // ── Auto-distribution interval ────────────────────────────────────────────

    #[test]
    fn test_auto_distribution_triggers_on_collect() {
        let t = setup();
        let c = client(&t);

        // Set interval to 100 seconds.
        c.set_distribution_interval(&100);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);

        // Advance time so the interval has elapsed.
        advance_time(&t.env, 200);

        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);

        // Auto-distribution should have fired; pending should be zero.
        let pool = c.get_fee_pool(&t.fee_token).unwrap();
        assert_eq!(pool.pending, 0);
        assert_eq!(c.get_distribution_count(), 1);
    }

    #[test]
    fn test_auto_distribution_does_not_trigger_before_interval() {
        let t = setup();
        let c = client(&t);
        c.set_distribution_interval(&10_000);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);

        // Only 50 seconds elapsed — interval not reached.
        advance_time(&t.env, 50);

        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);

        let pool = c.get_fee_pool(&t.fee_token).unwrap();
        assert_eq!(pool.pending, 1_000); // not distributed yet
    }

    // ── Treasury management ───────────────────────────────────────────────────

    #[test]
    fn test_update_treasury() {
        let t = setup();
        let new_treasury = Address::generate(&t.env);
        client(&t).update_treasury(&new_treasury);
        assert_eq!(client(&t).get_treasury(), new_treasury);
    }

    #[test]
    fn test_new_treasury_receives_distributions() {
        let t = setup();
        let c = client(&t);
        let new_treasury = Address::generate(&t.env);
        c.update_treasury(&new_treasury);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);
        mint_fee(&t, &t.admin, 10_000);
        c.collect_fees(&t.admin, &t.fee_token, &10_000);

        let bal_before = TokenClient::new(&t.env, &t.fee_token).balance(&new_treasury);
        c.distribute_fees(&Vec::new(&t.env));
        let bal_after = TokenClient::new(&t.env, &t.fee_token).balance(&new_treasury);

        assert_eq!(bal_after - bal_before, 2_000); // 20 % of 10 000
    }

    // ── Multi-round accumulation ───────────────────────────────────────────────

    #[test]
    fn test_rewards_accumulate_across_multiple_distributions() {
        let t = setup();
        let c = client(&t);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);

        // Two rounds of 1 000 each.
        for _ in 0..2 {
            mint_fee(&t, &t.admin, 1_000);
            c.collect_fees(&t.admin, &t.fee_token, &1_000);
            c.distribute_fees(&Vec::new(&t.env));
        }

        // 2 × 500 = 1 000
        assert_eq!(c.get_pending_rewards(&staker, &t.fee_token), 1_000);

        let bal_before = TokenClient::new(&t.env, &t.fee_token).balance(&staker);
        c.claim_fees(&staker, &t.fee_token);
        let bal_after = TokenClient::new(&t.env, &t.fee_token).balance(&staker);
        assert_eq!(bal_after - bal_before, 1_000);
    }

    // ── Multiple fee tokens ───────────────────────────────────────────────────

    #[test]
    fn test_multiple_fee_tokens_independent_pools() {
        let t = setup();
        let c = client(&t);

        let admin2 = Address::generate(&t.env);
        let fee_token2 = t.env.register_stellar_asset_contract_v2(admin2.clone()).address();
        c.add_fee_token(&fee_token2);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);

        // Collect 1 000 of fee_token1 and 2 000 of fee_token2.
        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);
        StellarAssetClient::new(&t.env, &fee_token2).mint(&t.admin, &2_000);
        c.collect_fees(&t.admin, &fee_token2, &2_000);

        c.distribute_fees(&Vec::new(&t.env));

        assert_eq!(c.get_pending_rewards(&staker, &t.fee_token), 500);
        assert_eq!(c.get_pending_rewards(&staker, &fee_token2), 1_000);
    }

    // ── get_pending_rewards view ──────────────────────────────────────────────

    #[test]
    fn test_get_pending_rewards_reflects_undistributed_fees() {
        let t = setup();
        let c = client(&t);

        let staker = Address::generate(&t.env);
        mint_stake(&t, &staker, 1_000);
        c.stake_for_fees(&staker, &1_000, &false);

        mint_fee(&t, &t.admin, 1_000);
        c.collect_fees(&t.admin, &t.fee_token, &1_000);
        c.distribute_fees(&Vec::new(&t.env));

        // Before explicit claim, pending should show the reward.
        assert_eq!(c.get_pending_rewards(&staker, &t.fee_token), 500);
    }

    #[test]
    fn test_get_pending_rewards_zero_for_unknown_staker() {
        let t = setup();
        let nobody = Address::generate(&t.env);
        assert_eq!(client(&t).get_pending_rewards(&nobody, &t.fee_token), 0);
    }
}
