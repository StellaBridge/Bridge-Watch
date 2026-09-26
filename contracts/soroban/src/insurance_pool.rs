use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

const BPS_DENOM: i128 = 10_000;
const REWARD_SCALE: i128 = 1_000_000_000;
const DEFAULT_WITHDRAW_DELAY_SECS: u64 = 86_400;

/// Maximum fraction of available pool liquidity a single claim may draw in one payout (30%).
pub const MAX_CLAIM_FRACTION_BPS: u32 = 3_000;
/// Maximum fraction of pool liquidity that may be paid out within one payout epoch (50%).
pub const EPOCH_DRAIN_CAP_BPS: u32 = 5_000;
/// Length of a payout epoch in seconds (24 hours).
pub const PAYOUT_EPOCH_SECS: u64 = 86_400;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CoverageTier {
    Conservative,
    Balanced,
    Aggressive,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimStatus {
    Submitted,
    Verified,
    Approved,
    Rejected,
    /// Part of the approved amount has been paid; the remainder is queued for later epochs.
    PartiallyPaid,
    Paid,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceConfig {
    pub approvers: Vec<Address>,
    pub approval_threshold: u32,
    pub withdrawal_delay_secs: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolInfo {
    pub pool_id: String,
    pub asset_code: String,
    pub total_liquidity: i128,
    pub staked_liquidity: i128,
    pub queued_withdrawals: i128,
    pub active_coverage: i128,
    pub premium_rate_bps: u32,
    pub risk_score_bps: u32,
    pub acc_premium_per_share: i128,
    pub premium_collected_total: i128,
    pub payout_total: i128,
    pub paid_claims: u32,
    pub rejected_claims: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakerPosition {
    pub staker: Address,
    pub pool_id: String,
    pub staked_amount: i128,
    pub pending_withdrawal: i128,
    pub reward_debt: i128,
    pub accrued_premium: i128,
    pub claimed_premium: i128,
    pub slashed_total: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalRequest {
    pub request_id: u64,
    pub staker: Address,
    pub pool_id: String,
    pub amount: i128,
    pub unlock_time: u64,
    pub claimed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimInfo {
    pub claim_id: u64,
    pub claimant: Address,
    pub pool_id: String,
    pub amount: i128,
    pub evidence_hash: String,
    pub status: ClaimStatus,
    pub approvals: Vec<Address>,
    pub slash_bps: u32,
    pub slashed_amount: i128,
    /// Cumulative amount already disbursed for this claim.
    pub paid_amount: i128,
}

/// Per-pool payout cap configuration.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayoutCapConfig {
    /// Max share of available liquidity a single claim payout may consume (bps).
    pub max_claim_fraction_bps: u32,
    /// Max share of epoch-opening liquidity that may be drained within one epoch (bps).
    pub epoch_drain_cap_bps: u32,
    /// Epoch length in seconds.
    pub epoch_secs: u64,
}

/// Rolling payout epoch accounting for a pool.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayoutEpoch {
    pub pool_id: String,
    pub epoch_start: u64,
    /// Pool liquidity snapshot taken when the epoch opened; the drain cap is relative to it.
    pub opening_liquidity: i128,
    pub paid_in_epoch: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Governance,
    CoveragePool(String),
    StakerPosition(Address, String),
    InsuranceClaim(u64),
    WithdrawalRequest(u64),
    ClaimCount,
    WithdrawalCount,
    PayoutCapConfig,
    PayoutEpoch(String),
    PayoutQueue(String),
}

#[contract]
pub struct InsurancePoolContract;

#[contractimpl]
impl InsurancePoolContract {
    /// Initializes insurance pool governance with an admin.
    ///
    /// Security assumptions:
    /// - Admin key controls governance configuration and risk score updates.
    /// - Approval threshold defaults to 1 and should be raised via configure_governance.
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }

        let mut approvers = Vec::new(&env);
        approvers.push_back(admin.clone());
        let governance = GovernanceConfig {
            approvers,
            approval_threshold: 1,
            withdrawal_delay_secs: DEFAULT_WITHDRAW_DELAY_SECS,
        };

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Governance, &governance);
        env.storage().instance().set(&DataKey::ClaimCount, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::WithdrawalCount, &0u64);
    }

    /// Sets multi-sig approvers and payout threshold for claim approval.
    pub fn configure_governance(
        env: Env,
        admin: Address,
        approvers: Vec<Address>,
        approval_threshold: u32,
        withdrawal_delay_secs: u64,
    ) {
        require_admin(&env, &admin);

        if approvers.is_empty() {
            panic!("approvers required");
        }
        if approval_threshold == 0 || approval_threshold > approvers.len() {
            panic!("invalid threshold");
        }

        let governance = GovernanceConfig {
            approvers,
            approval_threshold,
            withdrawal_delay_secs,
        };
        env.storage()
            .instance()
            .set(&DataKey::Governance, &governance);
    }

    /// Updates the claim payout caps that protect pool solvency.
    ///
    /// - `max_claim_fraction_bps`: largest slice of available liquidity one payout may take.
    /// - `epoch_drain_cap_bps`: largest slice of epoch-opening liquidity paid out per epoch.
    /// - `epoch_secs`: epoch window length.
    pub fn configure_payout_caps(
        env: Env,
        admin: Address,
        max_claim_fraction_bps: u32,
        epoch_drain_cap_bps: u32,
        epoch_secs: u64,
    ) {
        require_admin(&env, &admin);
        if max_claim_fraction_bps == 0 || max_claim_fraction_bps > 10_000 {
            panic!("invalid claim fraction");
        }
        if epoch_drain_cap_bps == 0 || epoch_drain_cap_bps > 10_000 {
            panic!("invalid epoch drain cap");
        }
        if max_claim_fraction_bps > epoch_drain_cap_bps {
            panic!("claim fraction exceeds epoch cap");
        }
        if epoch_secs == 0 {
            panic!("invalid epoch length");
        }

        let config = PayoutCapConfig {
            max_claim_fraction_bps,
            epoch_drain_cap_bps,
            epoch_secs,
        };
        env.storage()
            .instance()
            .set(&DataKey::PayoutCapConfig, &config);
    }

    /// Returns the active payout cap configuration (defaults when unset).
    pub fn get_payout_caps(env: Env) -> PayoutCapConfig {
        load_payout_caps(&env)
    }

    /// Returns the current payout epoch accounting for a pool, if any payout happened.
    pub fn get_payout_epoch(env: Env, pool_id: String) -> Option<PayoutEpoch> {
        env.storage()
            .instance()
            .get(&DataKey::PayoutEpoch(pool_id))
    }

    /// Returns claim ids with outstanding balances queued for future epochs.
    pub fn get_payout_queue(env: Env, pool_id: String) -> Vec<u64> {
        load_payout_queue(&env, &pool_id)
    }

    /// Creates or updates a coverage pool for an asset.
    pub fn create_pool(
        env: Env,
        admin: Address,
        pool_id: String,
        asset_code: String,
        premium_rate_bps: u32,
        risk_score_bps: u32,
    ) {
        require_admin(&env, &admin);
        if premium_rate_bps == 0 || premium_rate_bps > 5_000 {
            panic!("invalid premium rate");
        }
        if risk_score_bps > 10_000 {
            panic!("invalid risk score");
        }

        let existing: Option<PoolInfo> = env
            .storage()
            .instance()
            .get(&DataKey::CoveragePool(pool_id.clone()));

        let pool = if let Some(mut p) = existing {
            p.asset_code = asset_code;
            p.premium_rate_bps = premium_rate_bps;
            p.risk_score_bps = risk_score_bps;
            p
        } else {
            PoolInfo {
                pool_id: pool_id.clone(),
                asset_code,
                total_liquidity: 0,
                staked_liquidity: 0,
                queued_withdrawals: 0,
                active_coverage: 0,
                premium_rate_bps,
                risk_score_bps,
                acc_premium_per_share: 0,
                premium_collected_total: 0,
                payout_total: 0,
                paid_claims: 0,
                rejected_claims: 0,
            }
        };

        env.storage()
            .instance()
            .set(&DataKey::CoveragePool(pool_id), &pool);
    }

    /// Updates risk score sourced from bridge health metrics (0..10000 bps).
    pub fn set_risk_score(env: Env, admin: Address, pool_id: String, risk_score_bps: u32) {
        require_admin(&env, &admin);
        if risk_score_bps > 10_000 {
            panic!("invalid risk score");
        }

        let mut pool = load_pool(&env, &pool_id);
        pool.risk_score_bps = risk_score_bps;
        env.storage()
            .instance()
            .set(&DataKey::CoveragePool(pool_id), &pool);
    }

    /// Stakes liquidity into a coverage pool.
    pub fn stake_liquidity(env: Env, staker: Address, pool_id: String, amount: i128) {
        staker.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let mut pool = load_pool(&env, &pool_id);
        let mut position = load_position(&env, &staker, &pool_id);

        sync_rewards(&pool, &mut position);

        position.staked_amount = checked_add(position.staked_amount, amount, "overflow");
        pool.total_liquidity = checked_add(pool.total_liquidity, amount, "overflow");
        pool.staked_liquidity = checked_add(pool.staked_liquidity, amount, "overflow");

        position.reward_debt = calc_reward_debt(position.staked_amount, pool.acc_premium_per_share);
        save_position(&env, &position);
        save_pool(&env, &pool);
    }

    /// Requests liquidity withdrawal and places it into a time-locked queue.
    pub fn request_withdrawal(env: Env, staker: Address, pool_id: String, amount: i128) -> u64 {
        staker.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let governance = load_governance(&env);
        let mut pool = load_pool(&env, &pool_id);
        let mut position = load_position(&env, &staker, &pool_id);
        sync_rewards(&pool, &mut position);

        if position.staked_amount < amount {
            panic!("insufficient staked balance");
        }

        position.staked_amount = checked_sub(position.staked_amount, amount, "underflow");
        position.pending_withdrawal = checked_add(position.pending_withdrawal, amount, "overflow");
        pool.staked_liquidity = checked_sub(pool.staked_liquidity, amount, "underflow");
        pool.queued_withdrawals = checked_add(pool.queued_withdrawals, amount, "overflow");

        let request_id = next_withdrawal_id(&env);
        let unlock_time = env
            .ledger()
            .timestamp()
            .checked_add(governance.withdrawal_delay_secs)
            .unwrap_or_else(|| panic!("time overflow"));

        let request = WithdrawalRequest {
            request_id,
            staker: staker.clone(),
            pool_id: pool_id.clone(),
            amount,
            unlock_time,
            claimed: false,
        };

        position.reward_debt = calc_reward_debt(position.staked_amount, pool.acc_premium_per_share);
        save_position(&env, &position);
        save_pool(&env, &pool);
        env.storage()
            .instance()
            .set(&DataKey::WithdrawalRequest(request_id), &request);

        request_id
    }

    /// Executes a matured withdrawal request and removes liquidity from the pool.
    pub fn execute_withdrawal(env: Env, staker: Address, pool_id: String, request_id: u64) -> i128 {
        staker.require_auth();

        let mut request: WithdrawalRequest = env
            .storage()
            .instance()
            .get(&DataKey::WithdrawalRequest(request_id))
            .unwrap_or_else(|| panic!("request not found"));

        if request.staker != staker || request.pool_id != pool_id {
            panic!("request owner mismatch");
        }
        if request.claimed {
            panic!("request already claimed");
        }
        if env.ledger().timestamp() < request.unlock_time {
            panic!("withdrawal still locked");
        }

        let mut pool = load_pool(&env, &pool_id);
        let mut position = load_position(&env, &staker, &pool_id);
        sync_rewards(&pool, &mut position);

        if position.pending_withdrawal < request.amount {
            panic!("pending withdrawal mismatch");
        }
        if pool.total_liquidity < request.amount || pool.queued_withdrawals < request.amount {
            panic!("pool accounting mismatch");
        }

        position.pending_withdrawal =
            checked_sub(position.pending_withdrawal, request.amount, "underflow");
        pool.total_liquidity = checked_sub(pool.total_liquidity, request.amount, "underflow");
        pool.queued_withdrawals = checked_sub(pool.queued_withdrawals, request.amount, "underflow");

        request.claimed = true;
        position.reward_debt = calc_reward_debt(position.staked_amount, pool.acc_premium_per_share);

        save_position(&env, &position);
        save_pool(&env, &pool);
        env.storage()
            .instance()
            .set(&DataKey::WithdrawalRequest(request_id), &request);

        request.amount
    }

    /// Quotes premium using pool base rate, coverage tier and risk score.
    pub fn quote_premium(
        env: Env,
        pool_id: String,
        coverage_amount: i128,
        tier: CoverageTier,
    ) -> i128 {
        if coverage_amount <= 0 {
            panic!("coverage amount must be positive");
        }
        let pool = load_pool(&env, &pool_id);
        calculate_premium(&pool, coverage_amount, &tier)
    }

    /// Purchases coverage and distributes premium to stakers pro-rata.
    pub fn purchase_coverage(
        env: Env,
        buyer: Address,
        pool_id: String,
        coverage_amount: i128,
        tier: CoverageTier,
        premium_paid: i128,
    ) -> i128 {
        buyer.require_auth();
        if coverage_amount <= 0 {
            panic!("coverage amount must be positive");
        }

        let mut pool = load_pool(&env, &pool_id);
        let required_premium = calculate_premium(&pool, coverage_amount, &tier);
        if premium_paid < required_premium {
            panic!("insufficient premium");
        }

        let coverage_cap_bps = tier_coverage_cap_bps(&tier) as i128;
        let max_coverage = pool
            .staked_liquidity
            .checked_mul(coverage_cap_bps)
            .and_then(|v| v.checked_div(BPS_DENOM))
            .unwrap_or_else(|| panic!("coverage cap overflow"));

        let new_active = checked_add(pool.active_coverage, coverage_amount, "overflow");
        if new_active > max_coverage {
            panic!("insufficient available liquidity");
        }

        pool.active_coverage = new_active;
        pool.premium_collected_total =
            checked_add(pool.premium_collected_total, required_premium, "overflow");

        if pool.staked_liquidity > 0 {
            let delta = required_premium
                .checked_mul(REWARD_SCALE)
                .and_then(|v| v.checked_div(pool.staked_liquidity))
                .unwrap_or_else(|| panic!("reward overflow"));
            pool.acc_premium_per_share = checked_add(pool.acc_premium_per_share, delta, "overflow");
        }

        save_pool(&env, &pool);
        required_premium
    }

    /// Submits a claim against active coverage in a pool.
    pub fn submit_claim(
        env: Env,
        claimant: Address,
        pool_id: String,
        amount: i128,
        evidence_hash: String,
    ) -> u64 {
        claimant.require_auth();
        if amount <= 0 {
            panic!("claim amount must be positive");
        }

        let pool = load_pool(&env, &pool_id);
        if pool.active_coverage < amount {
            panic!("claim exceeds active coverage");
        }

        let claim_id = next_claim_id(&env);
        let claim = ClaimInfo {
            claim_id,
            claimant,
            pool_id,
            amount,
            evidence_hash,
            status: ClaimStatus::Submitted,
            approvals: Vec::new(&env),
            slash_bps: 0,
            slashed_amount: 0,
            paid_amount: 0,
        };

        env.storage()
            .instance()
            .set(&DataKey::InsuranceClaim(claim_id), &claim);
        claim_id
    }

    /// Verifies a claim. Invalid claims can be slashed as anti-fraud protection.
    pub fn verify_claim(env: Env, admin: Address, claim_id: u64, is_valid: bool, slash_bps: u32) {
        require_admin(&env, &admin);

        let mut claim = load_claim(&env, claim_id);
        if claim.status != ClaimStatus::Submitted {
            panic!("invalid claim status");
        }

        if is_valid {
            claim.status = ClaimStatus::Verified;
            claim.slash_bps = 0;
            claim.slashed_amount = 0;
            save_claim(&env, &claim);
            return;
        }

        if slash_bps > 10_000 {
            panic!("invalid slash bps");
        }

        let mut pool = load_pool(&env, &claim.pool_id);
        let mut position = load_position(&env, &claim.claimant, &claim.pool_id);
        sync_rewards(&pool, &mut position);

        let slash_amount = claim
            .amount
            .checked_mul(slash_bps as i128)
            .and_then(|v| v.checked_div(BPS_DENOM))
            .unwrap_or_else(|| panic!("slash overflow"));
        let actual_slashed = if slash_amount > position.staked_amount {
            position.staked_amount
        } else {
            slash_amount
        };

        if actual_slashed > 0 {
            position.staked_amount =
                checked_sub(position.staked_amount, actual_slashed, "underflow");
            position.slashed_total =
                checked_add(position.slashed_total, actual_slashed, "overflow");
            pool.staked_liquidity = checked_sub(pool.staked_liquidity, actual_slashed, "underflow");
            pool.total_liquidity = checked_sub(pool.total_liquidity, actual_slashed, "underflow");
        }

        pool.rejected_claims = pool.rejected_claims.saturating_add(1);
        claim.status = ClaimStatus::Rejected;
        claim.slash_bps = slash_bps;
        claim.slashed_amount = actual_slashed;

        position.reward_debt = calc_reward_debt(position.staked_amount, pool.acc_premium_per_share);
        save_position(&env, &position);
        save_pool(&env, &pool);
        save_claim(&env, &claim);
    }

    /// Approves verified claims via multi-sig approver set.
    pub fn approve_claim(env: Env, approver: Address, claim_id: u64) {
        approver.require_auth();

        let governance = load_governance(&env);
        if !is_approver(&governance.approvers, &approver) {
            panic!("not authorized approver");
        }

        let mut claim = load_claim(&env, claim_id);
        if claim.status != ClaimStatus::Verified && claim.status != ClaimStatus::Approved {
            panic!("claim not verifiable for approval");
        }
        if is_approver(&claim.approvals, &approver) {
            panic!("already approved by approver");
        }

        claim.approvals.push_back(approver);
        if claim.approvals.len() >= governance.approval_threshold {
            claim.status = ClaimStatus::Approved;
        }
        save_claim(&env, &claim);
    }

    /// Executes payout for approved claims and updates historical totals.
    ///
    /// Payouts are bounded by two solvency caps:
    /// - a single payout may not exceed `max_claim_fraction_bps` of available liquidity;
    /// - total payouts in an epoch may not exceed `epoch_drain_cap_bps` of the
    ///   liquidity the pool held when the epoch opened.
    ///
    /// Any remainder is queued and paid in subsequent epochs via this function or
    /// `process_payout_queue`. Returns the amount disbursed by this call.
    pub fn execute_payout(env: Env, admin: Address, claim_id: u64) -> i128 {
        require_admin(&env, &admin);

        let mut claim = load_claim(&env, claim_id);
        if claim.status != ClaimStatus::Approved && claim.status != ClaimStatus::PartiallyPaid {
            panic!("claim not approved");
        }

        let paid = pay_claim_tranche(&env, &mut claim);
        save_claim(&env, &claim);
        paid
    }

    /// Pays queued claim remainders for a pool in FIFO order, within the current caps.
    /// Returns the total amount disbursed.
    pub fn process_payout_queue(env: Env, admin: Address, pool_id: String) -> i128 {
        require_admin(&env, &admin);

        let queue = load_payout_queue(&env, &pool_id);
        let mut total_paid: i128 = 0;
        for i in 0..queue.len() {
            let claim_id = queue.get(i).unwrap();
            let mut claim = load_claim(&env, claim_id);
            if claim.status != ClaimStatus::PartiallyPaid {
                continue;
            }
            let paid = pay_claim_tranche(&env, &mut claim);
            save_claim(&env, &claim);
            if paid == 0 {
                // Epoch cap exhausted; remaining claims wait for the next epoch.
                break;
            }
            total_paid = checked_add(total_paid, paid, "overflow");
        }
        total_paid
    }

    /// Claims accrued premium rewards for a staker.
    pub fn claim_premium(env: Env, staker: Address, pool_id: String) -> i128 {
        staker.require_auth();

        let pool = load_pool(&env, &pool_id);
        let mut position = load_position(&env, &staker, &pool_id);
        sync_rewards(&pool, &mut position);

        let amount = position.accrued_premium;
        position.accrued_premium = 0;
        position.claimed_premium = checked_add(position.claimed_premium, amount, "overflow");
        position.reward_debt = calc_reward_debt(position.staked_amount, pool.acc_premium_per_share);
        save_position(&env, &position);
        amount
    }

    pub fn get_pool(env: Env, pool_id: String) -> Option<PoolInfo> {
        env.storage()
            .instance()
            .get(&DataKey::CoveragePool(pool_id))
    }

    pub fn get_claim(env: Env, claim_id: u64) -> Option<ClaimInfo> {
        env.storage()
            .instance()
            .get(&DataKey::InsuranceClaim(claim_id))
    }

    pub fn get_staker_position(
        env: Env,
        staker: Address,
        pool_id: String,
    ) -> Option<StakerPosition> {
        env.storage()
            .instance()
            .get(&DataKey::StakerPosition(staker, pool_id))
    }
}

fn require_admin(env: &Env, caller: &Address) {
    caller.require_auth();
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("not initialized"));
    if &admin != caller {
        panic!("not admin");
    }
}

fn load_governance(env: &Env) -> GovernanceConfig {
    env.storage()
        .instance()
        .get(&DataKey::Governance)
        .unwrap_or_else(|| panic!("governance not set"))
}

fn load_pool(env: &Env, pool_id: &String) -> PoolInfo {
    env.storage()
        .instance()
        .get(&DataKey::CoveragePool(pool_id.clone()))
        .unwrap_or_else(|| panic!("pool not found"))
}

fn save_pool(env: &Env, pool: &PoolInfo) {
    env.storage()
        .instance()
        .set(&DataKey::CoveragePool(pool.pool_id.clone()), pool);
}

fn load_position(env: &Env, staker: &Address, pool_id: &String) -> StakerPosition {
    env.storage()
        .instance()
        .get(&DataKey::StakerPosition(staker.clone(), pool_id.clone()))
        .unwrap_or(StakerPosition {
            staker: staker.clone(),
            pool_id: pool_id.clone(),
            staked_amount: 0,
            pending_withdrawal: 0,
            reward_debt: 0,
            accrued_premium: 0,
            claimed_premium: 0,
            slashed_total: 0,
        })
}

fn save_position(env: &Env, position: &StakerPosition) {
    env.storage().instance().set(
        &DataKey::StakerPosition(position.staker.clone(), position.pool_id.clone()),
        position,
    );
}

fn load_claim(env: &Env, claim_id: u64) -> ClaimInfo {
    env.storage()
        .instance()
        .get(&DataKey::InsuranceClaim(claim_id))
        .unwrap_or_else(|| panic!("claim not found"))
}

fn save_claim(env: &Env, claim: &ClaimInfo) {
    env.storage()
        .instance()
        .set(&DataKey::InsuranceClaim(claim.claim_id), claim);
}

/// Disburses as much of the claim's outstanding balance as the caps allow and
/// updates pool, epoch and queue state. The caller persists the claim.
fn pay_claim_tranche(env: &Env, claim: &mut ClaimInfo) -> i128 {
    let remaining = checked_sub(claim.amount, claim.paid_amount, "underflow");
    if remaining <= 0 {
        panic!("claim already settled");
    }

    let config = load_payout_caps(env);
    let mut pool = load_pool(env, &claim.pool_id);
    if pool.active_coverage < remaining {
        panic!("coverage accounting mismatch");
    }

    let mut epoch = current_payout_epoch(env, &pool, &config);
    let per_claim_cap = bps_of(pool.total_liquidity, config.max_claim_fraction_bps);
    let epoch_budget = bps_of(epoch.opening_liquidity, config.epoch_drain_cap_bps);
    let epoch_remaining = if epoch_budget > epoch.paid_in_epoch {
        epoch_budget - epoch.paid_in_epoch
    } else {
        0
    };

    let mut payable = remaining;
    if payable > per_claim_cap {
        payable = per_claim_cap;
    }
    if payable > epoch_remaining {
        payable = epoch_remaining;
    }
    if payable > pool.total_liquidity {
        payable = pool.total_liquidity;
    }

    let mut queue = load_payout_queue(env, &claim.pool_id);
    let queued_idx = queue.first_index_of(claim.claim_id);

    if payable <= 0 {
        if queued_idx.is_none() {
            queue.push_back(claim.claim_id);
            save_payout_queue(env, &claim.pool_id, &queue);
        }
        claim.status = ClaimStatus::PartiallyPaid;
        save_payout_epoch(env, &epoch);
        env.events().publish(
            (symbol_short!("ins_pool"), symbol_short!("pay_queue")),
            (claim.claim_id, remaining),
        );
        return 0;
    }

    pool.total_liquidity = checked_sub(pool.total_liquidity, payable, "underflow");
    pool.active_coverage = checked_sub(pool.active_coverage, payable, "underflow");
    pool.payout_total = checked_add(pool.payout_total, payable, "overflow");
    epoch.paid_in_epoch = checked_add(epoch.paid_in_epoch, payable, "overflow");
    claim.paid_amount = checked_add(claim.paid_amount, payable, "overflow");

    let outstanding = checked_sub(claim.amount, claim.paid_amount, "underflow");
    if outstanding == 0 {
        claim.status = ClaimStatus::Paid;
        pool.paid_claims = pool.paid_claims.saturating_add(1);
        if let Some(idx) = queued_idx {
            queue.remove(idx);
            save_payout_queue(env, &claim.pool_id, &queue);
        }
    } else {
        claim.status = ClaimStatus::PartiallyPaid;
        if queued_idx.is_none() {
            queue.push_back(claim.claim_id);
            save_payout_queue(env, &claim.pool_id, &queue);
        }
        env.events().publish(
            (symbol_short!("ins_pool"), symbol_short!("pay_queue")),
            (claim.claim_id, outstanding),
        );
    }

    save_pool(env, &pool);
    save_payout_epoch(env, &epoch);
    env.events().publish(
        (symbol_short!("ins_pool"), symbol_short!("payout")),
        (claim.claim_id, payable, outstanding),
    );
    payable
}

fn load_payout_caps(env: &Env) -> PayoutCapConfig {
    env.storage()
        .instance()
        .get(&DataKey::PayoutCapConfig)
        .unwrap_or(PayoutCapConfig {
            max_claim_fraction_bps: MAX_CLAIM_FRACTION_BPS,
            epoch_drain_cap_bps: EPOCH_DRAIN_CAP_BPS,
            epoch_secs: PAYOUT_EPOCH_SECS,
        })
}

/// Loads the pool's payout epoch, rolling it over when the window has elapsed.
fn current_payout_epoch(env: &Env, pool: &PoolInfo, config: &PayoutCapConfig) -> PayoutEpoch {
    let now = env.ledger().timestamp();
    let existing: Option<PayoutEpoch> = env
        .storage()
        .instance()
        .get(&DataKey::PayoutEpoch(pool.pool_id.clone()));

    match existing {
        Some(epoch) if now < epoch.epoch_start.saturating_add(config.epoch_secs) => epoch,
        _ => PayoutEpoch {
            pool_id: pool.pool_id.clone(),
            epoch_start: now,
            opening_liquidity: pool.total_liquidity,
            paid_in_epoch: 0,
        },
    }
}

fn save_payout_epoch(env: &Env, epoch: &PayoutEpoch) {
    env.storage()
        .instance()
        .set(&DataKey::PayoutEpoch(epoch.pool_id.clone()), epoch);
}

fn load_payout_queue(env: &Env, pool_id: &String) -> Vec<u64> {
    env.storage()
        .instance()
        .get(&DataKey::PayoutQueue(pool_id.clone()))
        .unwrap_or(Vec::new(env))
}

fn save_payout_queue(env: &Env, pool_id: &String, queue: &Vec<u64>) {
    env.storage()
        .instance()
        .set(&DataKey::PayoutQueue(pool_id.clone()), queue);
}

fn bps_of(amount: i128, bps: u32) -> i128 {
    amount
        .checked_mul(bps as i128)
        .and_then(|v| v.checked_div(BPS_DENOM))
        .unwrap_or_else(|| panic!("bps overflow"))
}

fn next_claim_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::ClaimCount)
        .unwrap_or(0);
    let next = id.checked_add(1).unwrap_or_else(|| panic!("id overflow"));
    env.storage().instance().set(&DataKey::ClaimCount, &next);
    id
}

fn next_withdrawal_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::WithdrawalCount)
        .unwrap_or(0);
    let next = id.checked_add(1).unwrap_or_else(|| panic!("id overflow"));
    env.storage()
        .instance()
        .set(&DataKey::WithdrawalCount, &next);
    id
}

fn sync_rewards(pool: &PoolInfo, position: &mut StakerPosition) {
    let expected = calc_reward_debt(position.staked_amount, pool.acc_premium_per_share);
    let pending = expected - position.reward_debt;
    if pending > 0 {
        position.accrued_premium = checked_add(position.accrued_premium, pending, "overflow");
    }
    position.reward_debt = expected;
}

fn calc_reward_debt(staked_amount: i128, acc_premium_per_share: i128) -> i128 {
    staked_amount
        .checked_mul(acc_premium_per_share)
        .and_then(|v| v.checked_div(REWARD_SCALE))
        .unwrap_or_else(|| panic!("reward debt overflow"))
}

fn is_approver(set: &Vec<Address>, target: &Address) -> bool {
    for i in 0..set.len() {
        let item = set.get(i).unwrap();
        if &item == target {
            return true;
        }
    }
    false
}

fn tier_premium_multiplier_bps(tier: &CoverageTier) -> i128 {
    match tier {
        CoverageTier::Conservative => 800,
        CoverageTier::Balanced => 1_000,
        CoverageTier::Aggressive => 1_400,
    }
}

fn tier_coverage_cap_bps(tier: &CoverageTier) -> u32 {
    match tier {
        CoverageTier::Conservative => 5_000,
        CoverageTier::Balanced => 7_000,
        CoverageTier::Aggressive => 8_500,
    }
}

fn calculate_premium(pool: &PoolInfo, coverage_amount: i128, tier: &CoverageTier) -> i128 {
    let base = coverage_amount
        .checked_mul(pool.premium_rate_bps as i128)
        .and_then(|v| v.checked_div(BPS_DENOM))
        .unwrap_or_else(|| panic!("premium overflow"));

    let risk_multiplier = BPS_DENOM + pool.risk_score_bps as i128;
    let tier_multiplier = tier_premium_multiplier_bps(tier);

    base.checked_mul(risk_multiplier)
        .and_then(|v| v.checked_mul(tier_multiplier))
        .and_then(|v| v.checked_div(BPS_DENOM))
        .and_then(|v| v.checked_div(BPS_DENOM))
        .unwrap_or_else(|| panic!("premium overflow"))
}

fn checked_add(a: i128, b: i128, msg: &str) -> i128 {
    a.checked_add(b).unwrap_or_else(|| panic!("{}", msg))
}

fn checked_sub(a: i128, b: i128, msg: &str) -> i128 {
    a.checked_sub(b).unwrap_or_else(|| panic!("{}", msg))
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger;
    use soroban_sdk::Env;

    fn setup() -> (
        Env,
        InsurancePoolContractClient<'static>,
        Address,
        Address,
        Address,
        Address,
        String,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);

        let contract_id = env.register_contract(None, InsurancePoolContract);
        let client = InsurancePoolContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let approver_1 = Address::generate(&env);
        let approver_2 = Address::generate(&env);
        let staker = Address::generate(&env);
        let pool_id = String::from_str(&env, "USDC_BRIDGE");

        client.initialize(&admin);

        let mut approvers = Vec::new(&env);
        approvers.push_back(admin.clone());
        approvers.push_back(approver_1.clone());
        approvers.push_back(approver_2.clone());

        client.configure_governance(&admin, &approvers, &2u32, &120u64);
        client.create_pool(
            &admin,
            &pool_id,
            &String::from_str(&env, "USDC"),
            &500u32,
            &1_500u32,
        );

        (env, client, admin, approver_1, approver_2, staker, pool_id)
    }

    #[test]
    fn test_end_to_end_with_multisig_and_withdraw_queue() {
        let (env, client, admin, approver_1, _approver_2, staker, pool_id) = setup();
        let buyer = Address::generate(&env);

        client.stake_liquidity(&staker, &pool_id, &20_000);

        let quoted = client.quote_premium(&pool_id, &6_000, &CoverageTier::Balanced);
        assert!(quoted > 0);

        let charged = client.purchase_coverage(
            &buyer,
            &pool_id,
            &6_000,
            &CoverageTier::Balanced,
            &(quoted + 5),
        );
        assert_eq!(charged, quoted);

        let claim_id = client.submit_claim(
            &buyer,
            &pool_id,
            &3_000,
            &String::from_str(&env, "QmEvidenceHash"),
        );
        client.verify_claim(&admin, &claim_id, &true, &0u32);

        // Threshold is 2: first approval does not finalize.
        client.approve_claim(&admin, &claim_id);
        let c1 = client.get_claim(&claim_id).unwrap();
        assert_eq!(c1.status, ClaimStatus::Verified);

        client.approve_claim(&approver_1, &claim_id);
        let c2 = client.get_claim(&claim_id).unwrap();
        assert_eq!(c2.status, ClaimStatus::Approved);

        client.execute_payout(&admin, &claim_id);
        let pool = client.get_pool(&pool_id).unwrap();
        assert_eq!(pool.paid_claims, 1);
        assert_eq!(pool.payout_total, 3_000);

        let premium = client.claim_premium(&staker, &pool_id);
        assert!(premium > 0);

        let req = client.request_withdrawal(&staker, &pool_id, &4_000);
        env.ledger().set_timestamp(1_000_130);
        let withdrawn = client.execute_withdrawal(&staker, &pool_id, &req);
        assert_eq!(withdrawn, 4_000);
    }

    #[test]
    #[should_panic]
    fn test_withdrawal_locked_until_delay() {
        let (env, client, _admin, _approver_1, _approver_2, staker, pool_id) = setup();
        client.stake_liquidity(&staker, &pool_id, &5_000);
        let req = client.request_withdrawal(&staker, &pool_id, &1_000);

        // Governance delay is 120s; this call must fail.
        env.ledger().set_timestamp(1_000_110);
        client.execute_withdrawal(&staker, &pool_id, &req);
    }

    #[test]
    fn test_risk_score_increases_premium() {
        let (env, client, admin, _a1, _a2, staker, pool_id) = setup();
        let buyer = Address::generate(&env);

        client.stake_liquidity(&staker, &pool_id, &10_000);
        let low_risk = client.quote_premium(&pool_id, &2_000, &CoverageTier::Balanced);

        client.set_risk_score(&admin, &pool_id, &7_000u32);
        let high_risk = client.quote_premium(&pool_id, &2_000, &CoverageTier::Balanced);

        assert!(high_risk > low_risk);
        let charged = client.purchase_coverage(
            &buyer,
            &pool_id,
            &2_000,
            &CoverageTier::Balanced,
            &high_risk,
        );
        assert_eq!(charged, high_risk);
    }

    #[test]
    #[should_panic]
    fn test_non_approver_cannot_approve_claim() {
        let (env, client, admin, _a1, _a2, staker, pool_id) = setup();
        let buyer = Address::generate(&env);
        let rogue = Address::generate(&env);

        client.stake_liquidity(&staker, &pool_id, &10_000);
        let quoted = client.quote_premium(&pool_id, &1_000, &CoverageTier::Balanced);
        client.purchase_coverage(&buyer, &pool_id, &1_000, &CoverageTier::Balanced, &quoted);

        let claim_id = client.submit_claim(
            &buyer,
            &pool_id,
            &500,
            &String::from_str(&env, "QmBadActor"),
        );
        client.verify_claim(&admin, &claim_id, &true, &0u32);
        client.approve_claim(&rogue, &claim_id);
    }

    #[test]
    #[should_panic]
    fn test_duplicate_approval_rejected() {
        let (env, client, admin, _a1, _a2, staker, pool_id) = setup();
        let buyer = Address::generate(&env);

        client.stake_liquidity(&staker, &pool_id, &10_000);
        let quoted = client.quote_premium(&pool_id, &1_500, &CoverageTier::Balanced);
        client.purchase_coverage(&buyer, &pool_id, &1_500, &CoverageTier::Balanced, &quoted);

        let claim_id = client.submit_claim(
            &buyer,
            &pool_id,
            &500,
            &String::from_str(&env, "QmDuplicateApproval"),
        );
        client.verify_claim(&admin, &claim_id, &true, &0u32);
        client.approve_claim(&admin, &claim_id);
        client.approve_claim(&admin, &claim_id);
    }

    #[test]
    #[should_panic]
    fn test_coverage_cap_enforced() {
        let (env, client, _admin, _a1, _a2, staker, pool_id) = setup();
        let buyer = Address::generate(&env);

        client.stake_liquidity(&staker, &pool_id, &10_000);
        let quoted = client.quote_premium(&pool_id, &9_000, &CoverageTier::Conservative);
        client.purchase_coverage(
            &buyer,
            &pool_id,
            &9_000,
            &CoverageTier::Conservative,
            &quoted,
        );
    }

    #[test]
    fn test_fraudulent_claim_slashing() {
        let (env, client, admin, _a1, _a2, staker, pool_id) = setup();
        let buyer = staker.clone();

        client.stake_liquidity(&staker, &pool_id, &8_000);
        let quoted = client.quote_premium(&pool_id, &3_000, &CoverageTier::Balanced);
        client.purchase_coverage(&buyer, &pool_id, &3_000, &CoverageTier::Balanced, &quoted);

        let claim_id = client.submit_claim(
            &buyer,
            &pool_id,
            &2_000,
            &String::from_str(&env, "QmFraudulent"),
        );

        client.verify_claim(&admin, &claim_id, &false, &2_500u32);

        let claim = client.get_claim(&claim_id).unwrap();
        assert_eq!(claim.status, ClaimStatus::Rejected);
        assert_eq!(claim.slashed_amount, 500);

        let pos = client.get_staker_position(&staker, &pool_id).unwrap();
        assert_eq!(pos.slashed_total, 500);

        let pool = client.get_pool(&pool_id).unwrap();
        assert_eq!(pool.rejected_claims, 1);
    }
}
