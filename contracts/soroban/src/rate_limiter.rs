//! # Rate Limiter Contract with Dynamic Threshold Adjustment
//!
//! Prevents abuse and mitigates attack vectors by enforcing transfer limits,
//! request throttling, and dynamic threshold adjustments based on risk metrics.
//!
//! ## Features
//! - Per-user transfer limits (daily, weekly, monthly)
//! - Global protocol limits for system protection
//! - Dynamic threshold adjustment based on risk scores
//! - Whitelist for trusted users with higher limits
//! - Cooldown periods after limit breaches
//! - Circuit breaker integration for anomaly detection
//! - Historical usage tracking
//! - Gradual limit increase for established users
//! - Emergency limit reduction capability
//! - Support for different limit types (count-based, value-based)
//! - Cross-contract limit enforcement

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

use crate::asset_registry::AssetRegistryContractClient;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Seconds in one day (24 h).
pub const DAY_SECS: u64 = 86_400;
/// Seconds in one week (7 d).
pub const WEEK_SECS: u64 = 604_800;
/// Seconds in one month (30 d).
pub const MONTH_SECS: u64 = 2_592_000;

/// Basis-point denominator (100 % = 10 000 bps).
pub const BPS_DENOM: u64 = 10_000;

/// Default cooldown period after a limit breach (1 hour).
pub const DEFAULT_COOLDOWN_SECS: u64 = 3_600;

/// Decimal basis every value limit is expressed in (issue #1248). Amounts of
/// assets with more or fewer decimals are normalized to this basis before
/// they are compared against a limit, so `DEFAULT_DAILY_LIMIT` means 1 000
/// tokens for a 6-decimal stablecoin, a 7-decimal Stellar asset and an
/// 18-decimal bridged ERC-20 alike.
pub const BASE_DECIMALS: u32 = 6;
/// Largest decimal count an asset may declare; 10^38 is the last power of ten
/// that fits in an i128, and no live asset uses more than 24.
pub const MAX_ASSET_DECIMALS: u32 = 38;

/// Default daily transfer limit (value-based, in `BASE_DECIMALS` units).
pub const DEFAULT_DAILY_LIMIT: i128 = 1_000_000_000; // 1 000 tokens (with 6 decimals)
/// Default weekly transfer limit.
pub const DEFAULT_WEEKLY_LIMIT: i128 = 5_000_000_000;
/// Default monthly transfer limit.
pub const DEFAULT_MONTHLY_LIMIT: i128 = 15_000_000_000;

/// Default daily transaction count limit.
pub const DEFAULT_DAILY_COUNT: u32 = 100;
/// Default weekly transaction count limit.
pub const DEFAULT_WEEKLY_COUNT: u32 = 500;
/// Default monthly transaction count limit.
pub const DEFAULT_MONTHLY_COUNT: u32 = 1_500;

/// Whitelist multiplier for trusted users (2× the normal limits).
pub const WHITELIST_MULTIPLIER: i128 = 2;

/// Circuit-breaker: maximum anomaly score before halting (bps).
pub const CIRCUIT_BREAKER_THRESHOLD: u32 = 8_000; // 80 %

/// Maximum number of historical usage records stored per user.
pub const MAX_USAGE_HISTORY: u32 = 90;

/// Risk score that triggers limit reduction (bps, 0–10 000).
pub const HIGH_RISK_THRESHOLD: u32 = 7_000;
/// Risk score below which limits are gradually increased (bps).
pub const LOW_RISK_THRESHOLD: u32 = 2_000;

/// Minimum tenure (in seconds) before a user qualifies for graduated limits.
pub const GRADUATED_TENURE_SECS: u64 = 30 * DAY_SECS;
/// Graduated limit bonus per tenure interval (bps added to base limit).
pub const GRADUATED_BONUS_BPS: u64 = 500; // 5 % per interval
/// Maximum graduated bonus (bps, 50 %).
pub const MAX_GRADUATED_BONUS_BPS: u64 = 5_000;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RateLimitError {
    NotAuthorized = 1,
    AlreadyInitialized = 2,
    DailyValueLimitExceeded = 3,
    WeeklyValueLimitExceeded = 4,
    MonthlyValueLimitExceeded = 5,
    DailyCountLimitExceeded = 6,
    WeeklyCountLimitExceeded = 7,
    MonthlyCountLimitExceeded = 8,
    GlobalDailyLimitExceeded = 9,
    GlobalWeeklyLimitExceeded = 10,
    CooldownActive = 11,
    CircuitBreakerTripped = 12,
    InvalidLimit = 13,
    InvalidRiskScore = 14,
    UserNotFound = 15,
    EmergencyModeActive = 16,
    /// Asset declares more than `MAX_ASSET_DECIMALS` decimals.
    InvalidDecimals = 17,
    /// Normalizing the amount to `BASE_DECIMALS` overflowed i128.
    AmountOverflow = 18,
    /// The asset registry has no entry for the asset code.
    AssetNotRegistered = 19,
    /// No asset registry address has been configured.
    AssetRegistryNotSet = 20,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Time window for limit enforcement.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TimeWindow {
    Daily,
    Weekly,
    Monthly,
}

/// Limit type distinguishes count-based vs. value-based enforcement.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LimitType {
    /// Limits the total transferred value.
    Value,
    /// Limits the number of transactions.
    Count,
}

/// Per-user transfer limits for all three time windows.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserLimits {
    /// Maximum transfer value per day.
    pub daily_value: i128,
    /// Maximum transfer value per week.
    pub weekly_value: i128,
    /// Maximum transfer value per month.
    pub monthly_value: i128,
    /// Maximum transaction count per day.
    pub daily_count: u32,
    /// Maximum transaction count per week.
    pub weekly_count: u32,
    /// Maximum transaction count per month.
    pub monthly_count: u32,
}

/// Rolling usage tracked per user per time window.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UsageWindow {
    /// Accumulated value consumed in the current window.
    pub value_used: i128,
    /// Transaction count in the current window.
    pub count_used: u32,
    /// Start timestamp of the current rolling window.
    pub window_start: u64,
}

/// Full per-user usage state across all three windows.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserUsage {
    pub daily: UsageWindow,
    pub weekly: UsageWindow,
    pub monthly: UsageWindow,
    /// Timestamp when cooldown ends (0 = no cooldown).
    pub cooldown_until: u64,
    /// Total lifetime value transferred by this user.
    pub lifetime_value: i128,
    /// Total lifetime transaction count.
    pub lifetime_count: u32,
    /// Timestamp of the user's first tracked activity.
    pub first_activity: u64,
}

/// Global protocol-level limits.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GlobalLimits {
    /// Total value allowed across all users per day.
    pub daily_value: i128,
    /// Total value allowed across all users per week.
    pub weekly_value: i128,
}

/// Global protocol-level usage.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GlobalUsage {
    pub daily: UsageWindow,
    pub weekly: UsageWindow,
}

/// Tracks a user's risk assessment for dynamic threshold adjustment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserRiskProfile {
    /// Current risk score in basis points (0 = safe, 10 000 = maximum risk).
    pub risk_score: u32,
    /// Number of limit breaches in the current period.
    pub breach_count: u32,
    /// Timestamp of the last risk score update.
    pub last_updated: u64,
    /// Dynamically computed limit adjustment factor (bps).
    /// >10 000 means increased limits, <10 000 means reduced limits.
    pub adjustment_factor_bps: u32,
}

/// Circuit breaker state for anomaly detection.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircuitBreakerState {
    /// `true` when the circuit breaker has tripped.
    pub tripped: bool,
    /// Anomaly score in bps (0–10 000).
    pub anomaly_score: u32,
    /// Timestamp when the circuit breaker was last tripped.
    pub tripped_at: u64,
    /// Number of times the circuit breaker has tripped.
    pub trip_count: u32,
}

/// A single historical usage entry for trend analysis.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UsageRecord {
    /// Day timestamp (start of day).
    pub day_timestamp: u64,
    /// Total value transferred on that day.
    pub daily_value: i128,
    /// Transaction count on that day.
    pub daily_count: u32,
}

/// Result of a limit check — returned to callers.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LimitCheckResult {
    pub allowed: bool,
    /// Remaining value budget for the day.
    pub daily_remaining_value: i128,
    /// Remaining count budget for the day.
    pub daily_remaining_count: u32,
    /// Remaining value budget for the week.
    pub weekly_remaining_value: i128,
    /// Remaining value budget for the month.
    pub monthly_remaining_value: i128,
    /// Effective daily limit (after dynamic adjustments).
    pub effective_daily_limit: i128,
    /// `true` if user is whitelisted.
    pub is_whitelisted: bool,
}

/// Result of a consume operation.
///
/// Because Soroban rolls back all state changes when a contract function
/// returns `Err(...)`, breach side-effects (cooldowns, risk profile updates)
/// would be lost. To ensure breach state persists, `consume_limit` always
/// returns `Ok(ConsumeResult)` and embeds any violation in the result.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConsumeResult {
    /// Transfer was within limits and recorded.
    Allowed,
    /// Transfer was rejected because the specified limit was exceeded.
    /// Breach state (cooldown, risk profile) has been persisted.
    Rejected(u32), // carries the RateLimitError discriminant
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    /// Contract admin address.
    Admin,
    /// Per-user custom limits.
    UserLimits(Address),
    /// Per-user rolling usage.
    UserUsage(Address),
    /// Per-user risk profile.
    UserRisk(Address),
    /// Per-user usage history (Vec<UsageRecord>).
    UserHistory(Address),
    /// Global protocol limits.
    GlobalLimits,
    /// Global protocol usage.
    GlobalUsage,
    /// Whitelist flag for an address.
    Whitelist(Address),
    /// Circuit breaker state.
    CircuitBreaker,
    /// Emergency mode flag.
    EmergencyMode,
    /// Default cooldown duration in seconds.
    CooldownDuration,
    /// Default user limits applied when no custom limits are set.
    DefaultLimits,
    /// Address of the AssetRegistry consulted for asset decimals.
    AssetRegistry,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct RateLimiterContract;

#[contractimpl]
impl RateLimiterContract {
    // =======================================================================
    // Initialization
    // =======================================================================

    /// Initialize the rate limiter contract with an admin and default limits.
    ///
    /// Sets sensible defaults for global and per-user limits, circuit breaker,
    /// cooldown duration, and emergency mode.
    pub fn initialize(env: Env, admin: Address) -> Result<(), RateLimitError> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(RateLimitError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);

        // Default per-user limits
        let default_limits = UserLimits {
            daily_value: DEFAULT_DAILY_LIMIT,
            weekly_value: DEFAULT_WEEKLY_LIMIT,
            monthly_value: DEFAULT_MONTHLY_LIMIT,
            daily_count: DEFAULT_DAILY_COUNT,
            weekly_count: DEFAULT_WEEKLY_COUNT,
            monthly_count: DEFAULT_MONTHLY_COUNT,
        };
        env.storage()
            .instance()
            .set(&DataKey::DefaultLimits, &default_limits);

        // Global limits (10× per-user defaults)
        let global_limits = GlobalLimits {
            daily_value: DEFAULT_DAILY_LIMIT * 10,
            weekly_value: DEFAULT_WEEKLY_LIMIT * 10,
        };
        env.storage()
            .instance()
            .set(&DataKey::GlobalLimits, &global_limits);

        // Global usage
        let now = env.ledger().timestamp();
        let global_usage = GlobalUsage {
            daily: UsageWindow {
                value_used: 0,
                count_used: 0,
                window_start: now,
            },
            weekly: UsageWindow {
                value_used: 0,
                count_used: 0,
                window_start: now,
            },
        };
        env.storage()
            .instance()
            .set(&DataKey::GlobalUsage, &global_usage);

        // Circuit breaker
        let cb = CircuitBreakerState {
            tripped: false,
            anomaly_score: 0,
            tripped_at: 0,
            trip_count: 0,
        };
        env.storage().instance().set(&DataKey::CircuitBreaker, &cb);

        // Defaults
        env.storage()
            .instance()
            .set(&DataKey::CooldownDuration, &DEFAULT_COOLDOWN_SECS);
        env.storage()
            .instance()
            .set(&DataKey::EmergencyMode, &false);

        Ok(())
    }

    // =======================================================================
    // Core rate-limit operations
    // =======================================================================

    /// Check whether a user can perform a transfer of `amount` without
    /// actually consuming the limit. Returns a [`LimitCheckResult`].
    pub fn check_limit(
        env: Env,
        user: Address,
        amount: i128,
    ) -> Result<LimitCheckResult, RateLimitError> {
        // Emergency mode blocks everything
        if Self::is_emergency_mode(&env) {
            return Err(RateLimitError::EmergencyModeActive);
        }

        // Circuit breaker
        let cb: CircuitBreakerState = env
            .storage()
            .instance()
            .get(&DataKey::CircuitBreaker)
            .unwrap();
        if cb.tripped {
            return Err(RateLimitError::CircuitBreakerTripped);
        }

        let now = env.ledger().timestamp();
        let is_whitelisted = Self::is_whitelisted_internal(&env, &user);
        let effective_limits = Self::compute_effective_limits(&env, &user, is_whitelisted);
        let usage = Self::get_or_init_usage(&env, &user, now);

        // Check cooldown
        if usage.cooldown_until > now {
            return Err(RateLimitError::CooldownActive);
        }

        // Compute remaining capacity (rolling windows already decayed)
        let daily_usage = Self::decayed_usage(&usage.daily, now, DAY_SECS);
        let weekly_usage = Self::decayed_usage(&usage.weekly, now, WEEK_SECS);
        let monthly_usage = Self::decayed_usage(&usage.monthly, now, MONTH_SECS);

        let daily_remaining_value = effective_limits.daily_value - daily_usage.value_used;
        let weekly_remaining_value = effective_limits.weekly_value - weekly_usage.value_used;
        let monthly_remaining_value = effective_limits.monthly_value - monthly_usage.value_used;
        let daily_remaining_count = effective_limits
            .daily_count
            .saturating_sub(daily_usage.count_used);

        let allowed = amount <= daily_remaining_value
            && amount <= weekly_remaining_value
            && amount <= monthly_remaining_value
            && daily_remaining_count > 0;

        Ok(LimitCheckResult {
            allowed,
            daily_remaining_value,
            daily_remaining_count,
            weekly_remaining_value,
            monthly_remaining_value,
            effective_daily_limit: effective_limits.daily_value,
            is_whitelisted,
        })
    }

    /// Consume rate limit for a transfer of `amount`. Must be called when
    /// the transfer is actually executed.
    ///
    /// Returns `Ok(ConsumeResult::Allowed)` on success.
    /// Returns `Ok(ConsumeResult::Rejected(code))` when a limit is breached;
    /// breach side-effects (cooldown, risk profile) are persisted.
    /// Returns `Err(...)` only for hard errors (emergency mode, circuit
    /// breaker, invalid input, or active cooldown) that do **not** require
    /// persistent side-effects.
    pub fn consume_limit(
        env: Env,
        user: Address,
        amount: i128,
    ) -> Result<ConsumeResult, RateLimitError> {
        user.require_auth();

        if Self::is_emergency_mode(&env) {
            return Err(RateLimitError::EmergencyModeActive);
        }

        let cb: CircuitBreakerState = env
            .storage()
            .instance()
            .get(&DataKey::CircuitBreaker)
            .unwrap();
        if cb.tripped {
            return Err(RateLimitError::CircuitBreakerTripped);
        }

        if amount <= 0 {
            return Err(RateLimitError::InvalidLimit);
        }

        let now = env.ledger().timestamp();
        let is_whitelisted = Self::is_whitelisted_internal(&env, &user);
        let effective_limits = Self::compute_effective_limits(&env, &user, is_whitelisted);
        let mut usage = Self::get_or_init_usage(&env, &user, now);

        // Check cooldown
        if usage.cooldown_until > now {
            return Err(RateLimitError::CooldownActive);
        }

        // Decay windows
        usage.daily = Self::decayed_usage(&usage.daily, now, DAY_SECS);
        usage.weekly = Self::decayed_usage(&usage.weekly, now, WEEK_SECS);
        usage.monthly = Self::decayed_usage(&usage.monthly, now, MONTH_SECS);

        // --- Check per-user value limits ---
        if usage.daily.value_used + amount > effective_limits.daily_value {
            Self::handle_breach(&env, &user, &mut usage, now);
            return Ok(ConsumeResult::Rejected(
                RateLimitError::DailyValueLimitExceeded as u32,
            ));
        }
        if usage.weekly.value_used + amount > effective_limits.weekly_value {
            Self::handle_breach(&env, &user, &mut usage, now);
            return Ok(ConsumeResult::Rejected(
                RateLimitError::WeeklyValueLimitExceeded as u32,
            ));
        }
        if usage.monthly.value_used + amount > effective_limits.monthly_value {
            Self::handle_breach(&env, &user, &mut usage, now);
            return Ok(ConsumeResult::Rejected(
                RateLimitError::MonthlyValueLimitExceeded as u32,
            ));
        }

        // --- Check per-user count limits ---
        if usage.daily.count_used + 1 > effective_limits.daily_count {
            Self::handle_breach(&env, &user, &mut usage, now);
            return Ok(ConsumeResult::Rejected(
                RateLimitError::DailyCountLimitExceeded as u32,
            ));
        }
        if usage.weekly.count_used + 1 > effective_limits.weekly_count {
            Self::handle_breach(&env, &user, &mut usage, now);
            return Ok(ConsumeResult::Rejected(
                RateLimitError::WeeklyCountLimitExceeded as u32,
            ));
        }
        if usage.monthly.count_used + 1 > effective_limits.monthly_count {
            Self::handle_breach(&env, &user, &mut usage, now);
            return Ok(ConsumeResult::Rejected(
                RateLimitError::MonthlyCountLimitExceeded as u32,
            ));
        }

        // --- Check global limits ---
        let mut global_usage: GlobalUsage =
            env.storage().instance().get(&DataKey::GlobalUsage).unwrap();
        let global_limits: GlobalLimits = env
            .storage()
            .instance()
            .get(&DataKey::GlobalLimits)
            .unwrap();

        global_usage.daily = Self::decayed_usage(&global_usage.daily, now, DAY_SECS);
        global_usage.weekly = Self::decayed_usage(&global_usage.weekly, now, WEEK_SECS);

        if global_usage.daily.value_used + amount > global_limits.daily_value {
            return Ok(ConsumeResult::Rejected(
                RateLimitError::GlobalDailyLimitExceeded as u32,
            ));
        }
        if global_usage.weekly.value_used + amount > global_limits.weekly_value {
            return Ok(ConsumeResult::Rejected(
                RateLimitError::GlobalWeeklyLimitExceeded as u32,
            ));
        }

        // --- All checks passed — record consumption ---
        usage.daily.value_used += amount;
        usage.daily.count_used += 1;
        usage.weekly.value_used += amount;
        usage.weekly.count_used += 1;
        usage.monthly.value_used += amount;
        usage.monthly.count_used += 1;
        usage.lifetime_value += amount;
        usage.lifetime_count += 1;

        env.storage()
            .persistent()
            .set(&DataKey::UserUsage(user.clone()), &usage);

        global_usage.daily.value_used += amount;
        global_usage.daily.count_used += 1;
        global_usage.weekly.value_used += amount;
        global_usage.weekly.count_used += 1;
        env.storage()
            .instance()
            .set(&DataKey::GlobalUsage, &global_usage);

        // Record daily history
        Self::record_history(&env, &user, now, amount);

        // Emit event
        env.events()
            .publish((symbol_short!("rl_used"), user), amount);

        Ok(ConsumeResult::Allowed)
    }

    // =======================================================================
    // Admin: user limit management
    // =======================================================================

    /// Set custom transfer limits for a specific user (admin only).
    pub fn update_user_limit(
        env: Env,
        admin: Address,
        user: Address,
        limits: UserLimits,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;

        if limits.daily_value <= 0 || limits.weekly_value <= 0 || limits.monthly_value <= 0 {
            return Err(RateLimitError::InvalidLimit);
        }
        if limits.daily_value > limits.weekly_value || limits.weekly_value > limits.monthly_value {
            return Err(RateLimitError::InvalidLimit);
        }

        env.storage()
            .persistent()
            .set(&DataKey::UserLimits(user), &limits);
        Ok(())
    }

    /// Update global protocol limits (admin only).
    pub fn update_global_limit(
        env: Env,
        admin: Address,
        global_limits: GlobalLimits,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;

        if global_limits.daily_value <= 0 || global_limits.weekly_value <= 0 {
            return Err(RateLimitError::InvalidLimit);
        }

        env.storage()
            .instance()
            .set(&DataKey::GlobalLimits, &global_limits);
        Ok(())
    }

    /// Update the default per-user limits (admin only).
    pub fn update_default_limits(
        env: Env,
        admin: Address,
        limits: UserLimits,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;

        if limits.daily_value <= 0 || limits.weekly_value <= 0 || limits.monthly_value <= 0 {
            return Err(RateLimitError::InvalidLimit);
        }

        env.storage()
            .instance()
            .set(&DataKey::DefaultLimits, &limits);
        Ok(())
    }

    // =======================================================================
    // Whitelist management
    // =======================================================================

    /// Add a user to the trusted whitelist (admin only).
    ///
    /// Whitelisted users receive limits multiplied by [`WHITELIST_MULTIPLIER`].
    pub fn add_to_whitelist(env: Env, admin: Address, user: Address) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .persistent()
            .set(&DataKey::Whitelist(user.clone()), &true);

        env.events().publish((symbol_short!("rl_wl"), user), true);
        Ok(())
    }

    /// Remove a user from the whitelist (admin only).
    pub fn remove_from_whitelist(
        env: Env,
        admin: Address,
        user: Address,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .persistent()
            .set(&DataKey::Whitelist(user.clone()), &false);

        env.events().publish((symbol_short!("rl_wl"), user), false);
        Ok(())
    }

    /// Check if a user is whitelisted. Public read.
    pub fn is_whitelisted(env: Env, user: Address) -> bool {
        Self::is_whitelisted_internal(&env, &user)
    }

    // =======================================================================
    // Risk management & dynamic thresholds
    // =======================================================================

    /// Update a user's risk score (admin only).
    ///
    /// The risk score (0–10 000 bps) influences the dynamic adjustment
    /// factor which scales the user's effective limits up or down.
    ///
    /// - Score ≥ [`HIGH_RISK_THRESHOLD`] → limits reduced.
    /// - Score ≤ [`LOW_RISK_THRESHOLD`] → limits can be increased.
    pub fn update_risk_score(
        env: Env,
        admin: Address,
        user: Address,
        risk_score: u32,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;
        if risk_score > BPS_DENOM as u32 {
            return Err(RateLimitError::InvalidRiskScore);
        }

        let now = env.ledger().timestamp();
        let adjustment_factor_bps = Self::calculate_adjustment_factor(risk_score);

        let profile = UserRiskProfile {
            risk_score,
            breach_count: Self::get_risk_profile(&env, &user).breach_count,
            last_updated: now,
            adjustment_factor_bps,
        };

        env.storage()
            .persistent()
            .set(&DataKey::UserRisk(user.clone()), &profile);

        env.events()
            .publish((symbol_short!("rl_risk"), user), risk_score);
        Ok(())
    }

    /// Get a user's current risk profile. Public read.
    pub fn get_user_risk(env: Env, user: Address) -> UserRiskProfile {
        Self::get_risk_profile(&env, &user)
    }

    // =======================================================================
    // Circuit breaker
    // =======================================================================

    /// Update the anomaly score (admin only).
    ///
    /// When the score exceeds [`CIRCUIT_BREAKER_THRESHOLD`] the circuit
    /// breaker trips and all transfers are halted until manually reset.
    pub fn update_anomaly_score(
        env: Env,
        admin: Address,
        anomaly_score: u32,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;
        if anomaly_score > BPS_DENOM as u32 {
            return Err(RateLimitError::InvalidRiskScore);
        }

        let now = env.ledger().timestamp();
        let mut cb: CircuitBreakerState = env
            .storage()
            .instance()
            .get(&DataKey::CircuitBreaker)
            .unwrap();

        cb.anomaly_score = anomaly_score;

        if anomaly_score >= CIRCUIT_BREAKER_THRESHOLD {
            cb.tripped = true;
            cb.tripped_at = now;
            cb.trip_count += 1;

            env.events()
                .publish((symbol_short!("rl_cb"),), anomaly_score);
        }

        env.storage().instance().set(&DataKey::CircuitBreaker, &cb);
        Ok(())
    }

    /// Reset the circuit breaker (admin only).
    pub fn reset_circuit_breaker(env: Env, admin: Address) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;

        let mut cb: CircuitBreakerState = env
            .storage()
            .instance()
            .get(&DataKey::CircuitBreaker)
            .unwrap();

        cb.tripped = false;
        cb.anomaly_score = 0;

        env.storage().instance().set(&DataKey::CircuitBreaker, &cb);
        Ok(())
    }

    /// Get the current circuit breaker state. Public read.
    pub fn get_circuit_breaker(env: Env) -> CircuitBreakerState {
        env.storage()
            .instance()
            .get(&DataKey::CircuitBreaker)
            .unwrap()
    }

    // =======================================================================
    // Emergency mode
    // =======================================================================

    /// Enable emergency mode, halting all transfers (admin only).
    pub fn set_emergency_mode(
        env: Env,
        admin: Address,
        enabled: bool,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::EmergencyMode, &enabled);

        env.events().publish((symbol_short!("rl_emrg"),), enabled);
        Ok(())
    }

    /// Reduce all default limits by a percentage (admin only, emergency use).
    ///
    /// `reduction_bps` is expressed in basis points (e.g. 5 000 = 50 % reduction).
    pub fn emergency_reduce_limits(
        env: Env,
        admin: Address,
        reduction_bps: u32,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;
        if reduction_bps == 0 || reduction_bps > BPS_DENOM as u32 {
            return Err(RateLimitError::InvalidLimit);
        }

        let mut limits: UserLimits = env
            .storage()
            .instance()
            .get(&DataKey::DefaultLimits)
            .unwrap();

        let factor = (BPS_DENOM as i128) - (reduction_bps as i128);
        limits.daily_value = limits.daily_value * factor / (BPS_DENOM as i128);
        limits.weekly_value = limits.weekly_value * factor / (BPS_DENOM as i128);
        limits.monthly_value = limits.monthly_value * factor / (BPS_DENOM as i128);

        // Ensure minimums
        if limits.daily_value < 1 {
            limits.daily_value = 1;
        }
        if limits.weekly_value < 1 {
            limits.weekly_value = 1;
        }
        if limits.monthly_value < 1 {
            limits.monthly_value = 1;
        }

        env.storage()
            .instance()
            .set(&DataKey::DefaultLimits, &limits);

        env.events()
            .publish((symbol_short!("rl_reduc"),), reduction_bps);
        Ok(())
    }

    // =======================================================================
    // Cooldown management
    // =======================================================================

    /// Set the cooldown duration (admin only).
    pub fn set_cooldown_duration(
        env: Env,
        admin: Address,
        duration_secs: u64,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::CooldownDuration, &duration_secs);
        Ok(())
    }

    /// Clear a user's cooldown early (admin only, e.g. after investigation).
    pub fn clear_cooldown(env: Env, admin: Address, user: Address) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;

        let now = env.ledger().timestamp();
        let mut usage = Self::get_or_init_usage(&env, &user, now);
        usage.cooldown_until = 0;
        env.storage()
            .persistent()
            .set(&DataKey::UserUsage(user), &usage);
        Ok(())
    }

    // =======================================================================
    // Read-only queries
    // =======================================================================

    /// Get the current usage state for a user. Public read.
    pub fn get_user_usage(env: Env, user: Address) -> UserUsage {
        let now = env.ledger().timestamp();
        let mut usage = Self::get_or_init_usage(&env, &user, now);
        // Return decayed values for accuracy
        usage.daily = Self::decayed_usage(&usage.daily, now, DAY_SECS);
        usage.weekly = Self::decayed_usage(&usage.weekly, now, WEEK_SECS);
        usage.monthly = Self::decayed_usage(&usage.monthly, now, MONTH_SECS);
        usage
    }

    /// Get the effective limits for a user after dynamic adjustments. Public read.
    pub fn get_effective_limits(env: Env, user: Address) -> UserLimits {
        let is_wl = Self::is_whitelisted_internal(&env, &user);
        Self::compute_effective_limits(&env, &user, is_wl)
    }

    /// Get a user's usage history (daily records). Public read.
    pub fn get_usage_history(env: Env, user: Address) -> Vec<UsageRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::UserHistory(user))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get the global protocol usage. Public read.
    pub fn get_global_usage(env: Env) -> GlobalUsage {
        let now = env.ledger().timestamp();
        let mut gu: GlobalUsage = env.storage().instance().get(&DataKey::GlobalUsage).unwrap();
        gu.daily = Self::decayed_usage(&gu.daily, now, DAY_SECS);
        gu.weekly = Self::decayed_usage(&gu.weekly, now, WEEK_SECS);
        gu
    }

    /// Get the global limits. Public read.
    pub fn get_global_limits(env: Env) -> GlobalLimits {
        env.storage()
            .instance()
            .get(&DataKey::GlobalLimits)
            .unwrap()
    }

    // =======================================================================
    // Cross-contract enforcement
    // =======================================================================

    /// Cross-contract limit check. Another contract can call this to verify
    /// a user is within limits before executing a transfer.
    ///
    // =======================================================================
    // Asset-aware limits (issue #1248)
    // =======================================================================

    /// Point the limiter at the AssetRegistry whose `decimals` are used to
    /// normalize per-asset amounts (admin only).
    pub fn set_asset_registry(
        env: Env,
        admin: Address,
        registry: Address,
    ) -> Result<(), RateLimitError> {
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::AssetRegistry, &registry);
        env.events().publish((symbol_short!("rl_reg"),), registry);
        Ok(())
    }

    /// The configured AssetRegistry address, if any.
    pub fn get_asset_registry(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::AssetRegistry)
    }

    /// Scale `amount` from an asset with `decimals` decimals to the
    /// `BASE_DECIMALS` basis the limits are expressed in.
    ///
    /// Scaling down rounds up, so the smallest positive amount of an
    /// 18-decimal asset still counts as one base unit; without that, transfers
    /// below 10^12 wei would consume nothing and slip past every limit.
    /// Scaling up is checked and fails with `AmountOverflow` instead of
    /// wrapping.
    pub fn normalize_amount(amount: i128, decimals: u32) -> Result<i128, RateLimitError> {
        if decimals > MAX_ASSET_DECIMALS {
            return Err(RateLimitError::InvalidDecimals);
        }
        if amount <= 0 {
            return Err(RateLimitError::InvalidLimit);
        }
        if decimals == BASE_DECIMALS {
            return Ok(amount);
        }
        if decimals > BASE_DECIMALS {
            let divisor = 10i128.pow(decimals - BASE_DECIMALS);
            // Ceiling division; `amount` is positive here.
            return Ok((amount - 1) / divisor + 1);
        }
        let multiplier = 10i128.pow(BASE_DECIMALS - decimals);
        amount
            .checked_mul(multiplier)
            .ok_or(RateLimitError::AmountOverflow)
    }

    /// Look up `asset_code` in the configured registry and normalize `amount`
    /// to the base basis.
    pub fn normalize_for_asset(
        env: Env,
        asset_code: String,
        amount: i128,
    ) -> Result<i128, RateLimitError> {
        let decimals = Self::asset_decimals(&env, &asset_code)?;
        Self::normalize_amount(amount, decimals)
    }

    /// `check_limit` for an amount denominated in `asset_code`'s own decimals.
    pub fn check_limit_for_asset(
        env: Env,
        user: Address,
        asset_code: String,
        amount: i128,
    ) -> Result<LimitCheckResult, RateLimitError> {
        let normalized = Self::normalize_for_asset(env.clone(), asset_code, amount)?;
        Self::check_limit(env, user, normalized)
    }

    /// `consume_limit` for an amount denominated in `asset_code`'s own decimals.
    pub fn consume_limit_for_asset(
        env: Env,
        user: Address,
        asset_code: String,
        amount: i128,
    ) -> Result<ConsumeResult, RateLimitError> {
        let normalized = Self::normalize_for_asset(env.clone(), asset_code, amount)?;
        Self::consume_limit(env, user, normalized)
    }

    /// This is a read-only check; callers must also call `consume_limit`
    /// after successful execution.
    pub fn cross_contract_check(
        env: Env,
        user: Address,
        amount: i128,
        _contract_id: Address,
    ) -> Result<LimitCheckResult, RateLimitError> {
        Self::check_limit(env, user, amount)
    }

    // =======================================================================
    // Private helpers
    // =======================================================================

    /// Verify `caller` is the contract admin.
    fn require_admin(env: &Env, caller: &Address) -> Result<(), RateLimitError> {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(RateLimitError::NotAuthorized)?;
        if *caller != admin {
            return Err(RateLimitError::NotAuthorized);
        }
        Ok(())
    }

    /// Decimals registered for `asset_code` in the configured AssetRegistry.
    fn asset_decimals(env: &Env, asset_code: &String) -> Result<u32, RateLimitError> {
        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::AssetRegistry)
            .ok_or(RateLimitError::AssetRegistryNotSet)?;
        let client = AssetRegistryContractClient::new(env, &registry);
        let metadata = client
            .get_asset(asset_code)
            .ok_or(RateLimitError::AssetNotRegistered)?;
        Ok(metadata.decimals)
    }

    /// Check emergency mode flag.
    fn is_emergency_mode(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::EmergencyMode)
            .unwrap_or(false)
    }

    /// Check if `user` is on the whitelist.
    fn is_whitelisted_internal(env: &Env, user: &Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Whitelist(user.clone()))
            .unwrap_or(false)
    }

    /// Get or initialize a user's usage state.
    fn get_or_init_usage(env: &Env, user: &Address, now: u64) -> UserUsage {
        env.storage()
            .persistent()
            .get(&DataKey::UserUsage(user.clone()))
            .unwrap_or(UserUsage {
                daily: UsageWindow {
                    value_used: 0,
                    count_used: 0,
                    window_start: now,
                },
                weekly: UsageWindow {
                    value_used: 0,
                    count_used: 0,
                    window_start: now,
                },
                monthly: UsageWindow {
                    value_used: 0,
                    count_used: 0,
                    window_start: now,
                },
                cooldown_until: 0,
                lifetime_value: 0,
                lifetime_count: 0,
                first_activity: now,
            })
    }

    /// Reset a window's usage if the window has elapsed, otherwise return as-is.
    fn decayed_usage(window: &UsageWindow, now: u64, window_secs: u64) -> UsageWindow {
        if now >= window.window_start + window_secs {
            UsageWindow {
                value_used: 0,
                count_used: 0,
                window_start: now,
            }
        } else {
            window.clone()
        }
    }

    /// Get a user's risk profile (or a safe default).
    fn get_risk_profile(env: &Env, user: &Address) -> UserRiskProfile {
        env.storage()
            .persistent()
            .get(&DataKey::UserRisk(user.clone()))
            .unwrap_or(UserRiskProfile {
                risk_score: 0,
                breach_count: 0,
                last_updated: 0,
                adjustment_factor_bps: BPS_DENOM as u32, // 100 % = no adjustment
            })
    }

    /// Calculate the limit adjustment factor from a risk score.
    ///
    /// - risk ≤ LOW_RISK_THRESHOLD → 120 % (limits boosted)
    /// - risk ≥ HIGH_RISK_THRESHOLD → 50 % (limits halved)
    /// - in between → linearly interpolated between 50 % and 120 %
    fn calculate_adjustment_factor(risk_score: u32) -> u32 {
        if risk_score <= LOW_RISK_THRESHOLD {
            12_000 // 120 %
        } else if risk_score >= HIGH_RISK_THRESHOLD {
            5_000 // 50 %
        } else {
            // Linear interpolation: 12 000 → 5 000 over range 2 000 → 7 000
            let range = HIGH_RISK_THRESHOLD - LOW_RISK_THRESHOLD; // 5 000
            let progress = risk_score - LOW_RISK_THRESHOLD;
            let decrease = (progress as u64 * 7_000 / range as u64) as u32;
            12_000u32.saturating_sub(decrease)
        }
    }

    /// Compute effective limits for a user, accounting for:
    /// 1. Custom limits (if set) or defaults.
    /// 2. Whitelist multiplier.
    /// 3. Dynamic risk-based adjustment.
    /// 4. Graduated tenure bonus.
    fn compute_effective_limits(env: &Env, user: &Address, is_whitelisted: bool) -> UserLimits {
        // Base limits
        let mut limits: UserLimits = env
            .storage()
            .persistent()
            .get(&DataKey::UserLimits(user.clone()))
            .unwrap_or_else(|| {
                env.storage()
                    .instance()
                    .get(&DataKey::DefaultLimits)
                    .unwrap()
            });

        // Whitelist multiplier
        if is_whitelisted {
            limits.daily_value *= WHITELIST_MULTIPLIER;
            limits.weekly_value *= WHITELIST_MULTIPLIER;
            limits.monthly_value *= WHITELIST_MULTIPLIER;
            limits.daily_count *= WHITELIST_MULTIPLIER as u32;
            limits.weekly_count *= WHITELIST_MULTIPLIER as u32;
            limits.monthly_count *= WHITELIST_MULTIPLIER as u32;
        }

        // Risk-based adjustment
        let risk = Self::get_risk_profile(env, user);
        let factor = risk.adjustment_factor_bps as i128;
        let denom = BPS_DENOM as i128;
        limits.daily_value = limits.daily_value * factor / denom;
        limits.weekly_value = limits.weekly_value * factor / denom;
        limits.monthly_value = limits.monthly_value * factor / denom;

        // Graduated tenure bonus
        let now = env.ledger().timestamp();
        let usage: Option<UserUsage> = env
            .storage()
            .persistent()
            .get(&DataKey::UserUsage(user.clone()));
        if let Some(u) = usage {
            let tenure = now.saturating_sub(u.first_activity);
            if tenure >= GRADUATED_TENURE_SECS {
                let intervals = tenure / GRADUATED_TENURE_SECS;
                let bonus_bps = (intervals * GRADUATED_BONUS_BPS).min(MAX_GRADUATED_BONUS_BPS);
                let bonus_factor = denom + bonus_bps as i128;
                limits.daily_value = limits.daily_value * bonus_factor / denom;
                limits.weekly_value = limits.weekly_value * bonus_factor / denom;
                limits.monthly_value = limits.monthly_value * bonus_factor / denom;
            }
        }

        // Ensure minimums
        if limits.daily_value < 1 {
            limits.daily_value = 1;
        }
        if limits.weekly_value < 1 {
            limits.weekly_value = 1;
        }
        if limits.monthly_value < 1 {
            limits.monthly_value = 1;
        }

        limits
    }

    /// Handle a limit breach: set cooldown and increment breach count.
    fn handle_breach(env: &Env, user: &Address, usage: &mut UserUsage, now: u64) {
        let cooldown: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CooldownDuration)
            .unwrap_or(DEFAULT_COOLDOWN_SECS);
        usage.cooldown_until = now + cooldown;

        // Persist updated usage with cooldown
        env.storage()
            .persistent()
            .set(&DataKey::UserUsage(user.clone()), usage);

        // Update risk profile breach count
        let mut profile = Self::get_risk_profile(env, user);
        profile.breach_count += 1;
        profile.last_updated = now;
        env.storage()
            .persistent()
            .set(&DataKey::UserRisk(user.clone()), &profile);

        env.events().publish(
            (symbol_short!("rl_brch"), user.clone()),
            profile.breach_count,
        );
    }

    /// Append a daily usage record to the user's history.
    fn record_history(env: &Env, user: &Address, now: u64, amount: i128) {
        let day_ts = (now / DAY_SECS) * DAY_SECS;

        let mut history: Vec<UsageRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::UserHistory(user.clone()))
            .unwrap_or_else(|| Vec::new(env));

        // Update today's entry or create a new one
        let len = history.len();
        if len > 0 {
            let last = history.get(len - 1).unwrap();
            if last.day_timestamp == day_ts {
                let updated = UsageRecord {
                    day_timestamp: day_ts,
                    daily_value: last.daily_value + amount,
                    daily_count: last.daily_count + 1,
                };
                history.set(len - 1, updated);
            } else {
                if len >= MAX_USAGE_HISTORY {
                    // Remove oldest entry
                    let mut trimmed: Vec<UsageRecord> = Vec::new(env);
                    for i in 1..len {
                        trimmed.push_back(history.get(i).unwrap());
                    }
                    history = trimmed;
                }
                history.push_back(UsageRecord {
                    day_timestamp: day_ts,
                    daily_value: amount,
                    daily_count: 1,
                });
            }
        } else {
            history.push_back(UsageRecord {
                day_timestamp: day_ts,
                daily_value: amount,
                daily_count: 1,
            });
        }

        env.storage()
            .persistent()
            .set(&DataKey::UserHistory(user.clone()), &history);
    }
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger;
    use soroban_sdk::Env;

    /// Helper: set up a fresh rate limiter contract.
    fn setup() -> (Env, RateLimiterContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, RateLimiterContract);
        let client = RateLimiterContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.ledger().set_timestamp(1_000_000);
        client.initialize(&admin);
        (env, client, admin)
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialize_success() {
        let (_env, client, _admin) = setup();
        let gl = client.get_global_limits();
        assert_eq!(gl.daily_value, DEFAULT_DAILY_LIMIT * 10);
        assert_eq!(gl.weekly_value, DEFAULT_WEEKLY_LIMIT * 10);

        let cb = client.get_circuit_breaker();
        assert!(!cb.tripped);
        assert_eq!(cb.anomaly_score, 0);
    }

    #[test]
    fn test_initialize_twice_fails() {
        let (_env, client, admin) = setup();
        let result = client.try_initialize(&admin);
        assert_eq!(result, Err(Ok(RateLimitError::AlreadyInitialized)));
    }

    // -----------------------------------------------------------------------
    // Basic limit consumption
    // -----------------------------------------------------------------------

    #[test]
    fn test_consume_limit_within_daily() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let amount = 100_000_000i128; // 100 tokens (6 dec)

        let result = client.try_consume_limit(&user, &amount);
        assert!(result.is_ok());

        let usage = client.get_user_usage(&user);
        assert_eq!(usage.daily.value_used, amount);
        assert_eq!(usage.daily.count_used, 1);
        assert_eq!(usage.lifetime_value, amount);
        assert_eq!(usage.lifetime_count, 1);
    }

    #[test]
    fn test_consume_limit_multiple_transactions() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let amount = 100_000_000i128;

        for _ in 0..5 {
            let result = client.try_consume_limit(&user, &amount);
            assert!(result.is_ok());
        }

        let usage = client.get_user_usage(&user);
        assert_eq!(usage.daily.value_used, amount * 5);
        assert_eq!(usage.daily.count_used, 5);
        assert_eq!(usage.lifetime_count, 5);
    }

    #[test]
    fn test_consume_daily_value_limit_exceeded() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        // Try to exceed the default daily limit in one go
        let result = client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT + 1));
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );
    }

    #[test]
    fn test_consume_daily_value_limit_exceeded_cumulative() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        // Consume most of the daily limit
        client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT - 100));

        // The next transfer should fail
        let result = client.consume_limit(&user, &200);
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );
    }

    #[test]
    fn test_consume_invalid_amount() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        let result = client.try_consume_limit(&user, &0);
        assert_eq!(result, Err(Ok(RateLimitError::InvalidLimit)));

        let result = client.try_consume_limit(&user, &(-100));
        assert_eq!(result, Err(Ok(RateLimitError::InvalidLimit)));
    }

    // -----------------------------------------------------------------------
    // Rolling window decay
    // -----------------------------------------------------------------------

    #[test]
    fn test_daily_window_resets_after_24h() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        // Fill up most of the daily limit
        client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT - 100));

        // Advance past 24h
        env.ledger().set_timestamp(1_000_000 + DAY_SECS + 1);

        // Should be able to transfer again
        let result = client.try_consume_limit(&user, &(DEFAULT_DAILY_LIMIT - 100));
        assert!(result.is_ok());
    }

    #[test]
    fn test_weekly_window_resets_after_7d() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        // Set custom limits with tight weekly limit
        let limits = UserLimits {
            daily_value: 1_000_000_000,
            weekly_value: 2_000_000_000,
            monthly_value: 10_000_000_000,
            daily_count: 1000,
            weekly_count: 5000,
            monthly_count: 15000,
        };
        client.update_user_limit(&admin, &user, &limits);

        // Use up the weekly limit across multiple days
        client.consume_limit(&user, &1_000_000_000);
        env.ledger().set_timestamp(1_000_000 + DAY_SECS + 1);
        client.consume_limit(&user, &1_000_000_000);

        // Should be blocked (weekly limit = 2B, used 2B)
        env.ledger().set_timestamp(1_000_000 + 2 * DAY_SECS + 1);
        // Clear cooldown from breaches that persisted via ConsumeResult
        client.clear_cooldown(&admin, &user);
        let result = client.consume_limit(&user, &500_000_000);
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::WeeklyValueLimitExceeded as u32)
        );

        // After a full week, the weekly window resets
        client.clear_cooldown(&admin, &user);
        env.ledger().set_timestamp(1_000_000 + WEEK_SECS + 1);
        let result = client.consume_limit(&user, &500_000_000);
        assert_eq!(result, ConsumeResult::Allowed);
    }

    // -----------------------------------------------------------------------
    // Check limit (read-only)
    // -----------------------------------------------------------------------

    #[test]
    fn test_check_limit_returns_remaining() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        let check = client.check_limit(&user, &100_000_000);
        assert!(check.allowed);
        assert_eq!(check.daily_remaining_value, DEFAULT_DAILY_LIMIT);
        assert_eq!(check.effective_daily_limit, DEFAULT_DAILY_LIMIT);
        assert!(!check.is_whitelisted);
    }

    #[test]
    fn test_check_limit_after_consumption() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let amount = 100_000_000i128;

        client.consume_limit(&user, &amount);

        let check = client.check_limit(&user, &amount);
        assert!(check.allowed);
        assert_eq!(check.daily_remaining_value, DEFAULT_DAILY_LIMIT - amount);
    }

    #[test]
    fn test_check_limit_exceeding_returns_false() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        let check = client.check_limit(&user, &(DEFAULT_DAILY_LIMIT + 1));
        assert!(!check.allowed);
    }

    // -----------------------------------------------------------------------
    // User limit management
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_user_limit() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        let limits = UserLimits {
            daily_value: 500_000_000,
            weekly_value: 2_500_000_000,
            monthly_value: 7_500_000_000,
            daily_count: 50,
            weekly_count: 250,
            monthly_count: 750,
        };
        client.update_user_limit(&admin, &user, &limits);

        let effective = client.get_effective_limits(&user);
        assert_eq!(effective.daily_value, 500_000_000);
    }

    #[test]
    fn test_update_user_limit_invalid() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        // daily > weekly should fail
        let limits = UserLimits {
            daily_value: 5_000_000_000,
            weekly_value: 2_500_000_000,
            monthly_value: 7_500_000_000,
            daily_count: 50,
            weekly_count: 250,
            monthly_count: 750,
        };
        let result = client.try_update_user_limit(&admin, &user, &limits);
        assert_eq!(result, Err(Ok(RateLimitError::InvalidLimit)));
    }

    // -----------------------------------------------------------------------
    // Global limits
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_global_limits() {
        let (_env, client, admin) = setup();

        let gl = GlobalLimits {
            daily_value: 50_000_000_000,
            weekly_value: 200_000_000_000,
        };
        client.update_global_limit(&admin, &gl);

        let stored = client.get_global_limits();
        assert_eq!(stored.daily_value, 50_000_000_000);
    }

    #[test]
    fn test_global_daily_limit_exceeded() {
        let (env, client, admin) = setup();

        // Set very tight global limits
        let gl = GlobalLimits {
            daily_value: 200_000_000,
            weekly_value: 1_000_000_000,
        };
        client.update_global_limit(&admin, &gl);

        let user = Address::generate(&env);
        let result = client.consume_limit(&user, &(200_000_000 + 1));
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::GlobalDailyLimitExceeded as u32)
        );
    }

    // -----------------------------------------------------------------------
    // Whitelist
    // -----------------------------------------------------------------------

    #[test]
    fn test_add_to_whitelist() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        assert!(!client.is_whitelisted(&user));

        client.add_to_whitelist(&admin, &user);
        assert!(client.is_whitelisted(&user));
    }

    #[test]
    fn test_remove_from_whitelist() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.add_to_whitelist(&admin, &user);
        assert!(client.is_whitelisted(&user));

        client.remove_from_whitelist(&admin, &user);
        assert!(!client.is_whitelisted(&user));
    }

    #[test]
    fn test_whitelist_doubles_limits() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.add_to_whitelist(&admin, &user);

        let effective = client.get_effective_limits(&user);
        assert_eq!(
            effective.daily_value,
            DEFAULT_DAILY_LIMIT * WHITELIST_MULTIPLIER
        );
    }

    #[test]
    fn test_whitelisted_user_can_exceed_normal_limits() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);
        client.add_to_whitelist(&admin, &user);

        // Normal user would be blocked at DEFAULT_DAILY_LIMIT
        let result = client.try_consume_limit(&user, &DEFAULT_DAILY_LIMIT);
        assert!(result.is_ok());

        // Can still transfer more (within 2× limit)
        let result = client.try_consume_limit(&user, &(DEFAULT_DAILY_LIMIT / 2));
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // Risk management & dynamic thresholds
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_risk_score_low_risk() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.update_risk_score(&admin, &user, &1_000); // low risk

        let risk = client.get_user_risk(&user);
        assert_eq!(risk.risk_score, 1_000);
        assert_eq!(risk.adjustment_factor_bps, 12_000); // 120 %
    }

    #[test]
    fn test_update_risk_score_high_risk() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.update_risk_score(&admin, &user, &8_000); // high risk

        let risk = client.get_user_risk(&user);
        assert_eq!(risk.risk_score, 8_000);
        assert_eq!(risk.adjustment_factor_bps, 5_000); // 50 %
    }

    #[test]
    fn test_risk_score_reduces_effective_limits() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.update_risk_score(&admin, &user, &9_000);

        let effective = client.get_effective_limits(&user);
        // 50 % of default
        assert_eq!(effective.daily_value, DEFAULT_DAILY_LIMIT * 5_000 / 10_000);
    }

    #[test]
    fn test_risk_score_invalid() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        let result = client.try_update_risk_score(&admin, &user, &11_000);
        assert_eq!(result, Err(Ok(RateLimitError::InvalidRiskScore)));
    }

    #[test]
    fn test_risk_score_mid_range() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        // Mid-range risk score
        client.update_risk_score(&admin, &user, &4_500);
        let risk = client.get_user_risk(&user);
        // Should be between 5 000 and 12 000
        assert!(risk.adjustment_factor_bps > 5_000);
        assert!(risk.adjustment_factor_bps < 12_000);
    }

    // -----------------------------------------------------------------------
    // Cooldown
    // -----------------------------------------------------------------------

    #[test]
    fn test_cooldown_after_breach() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        // Breach the daily limit — returns Ok(Rejected) so state persists
        let result = client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT + 1));
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );

        // Should be in cooldown (breach state was persisted)
        let result = client.try_consume_limit(&user, &100);
        assert_eq!(result, Err(Ok(RateLimitError::CooldownActive)));
    }

    #[test]
    fn test_cooldown_expires() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        let result = client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT + 1));
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );

        // Advance past cooldown + past daily window
        env.ledger()
            .set_timestamp(1_000_000 + DEFAULT_COOLDOWN_SECS + DAY_SECS + 1);

        let result = client.consume_limit(&user, &100);
        assert_eq!(result, ConsumeResult::Allowed);
    }

    #[test]
    fn test_clear_cooldown() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        // Breach — state persists via Ok(Rejected)
        let result = client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT + 1));
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );

        // Advance 30 min — still within the 1-hour cooldown
        env.ledger().set_timestamp(1_000_000 + 1_800);

        // Should still be in cooldown
        let result = client.try_consume_limit(&user, &100);
        assert_eq!(result, Err(Ok(RateLimitError::CooldownActive)));

        // Admin clears cooldown
        client.clear_cooldown(&admin, &user);

        // Advance past daily window so usage resets, then consume
        env.ledger().set_timestamp(1_000_000 + DAY_SECS + 1);
        let result = client.consume_limit(&user, &100);
        assert_eq!(result, ConsumeResult::Allowed);
    }

    #[test]
    fn test_set_cooldown_duration() {
        let (env, client, admin) = setup();

        client.set_cooldown_duration(&admin, &7_200); // 2 hours

        // Breach to trigger cooldown — state persists via Ok(Rejected)
        let user = Address::generate(&env);
        let result = client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT + 1));
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );

        // After 1 hour, should still be in cooldown (2h duration)
        env.ledger().set_timestamp(1_000_000 + 3_601);
        let result = client.try_consume_limit(&user, &100);
        assert_eq!(result, Err(Ok(RateLimitError::CooldownActive)));

        // After 2 hours + past daily window, should be free
        env.ledger().set_timestamp(1_000_000 + DAY_SECS + 7_201);
        let result = client.consume_limit(&user, &100);
        assert_eq!(result, ConsumeResult::Allowed);
    }

    // -----------------------------------------------------------------------
    // Circuit breaker
    // -----------------------------------------------------------------------

    #[test]
    fn test_circuit_breaker_not_tripped() {
        let (_env, client, admin) = setup();
        client.update_anomaly_score(&admin, &5_000); // 50 %

        let cb = client.get_circuit_breaker();
        assert!(!cb.tripped);
        assert_eq!(cb.anomaly_score, 5_000);
    }

    #[test]
    fn test_circuit_breaker_trips_at_threshold() {
        let (_env, client, admin) = setup();
        client.update_anomaly_score(&admin, &8_000); // 80 % = threshold

        let cb = client.get_circuit_breaker();
        assert!(cb.tripped);
        assert_eq!(cb.trip_count, 1);
    }

    #[test]
    fn test_circuit_breaker_blocks_transfers() {
        let (env, client, admin) = setup();
        client.update_anomaly_score(&admin, &9_000);

        let user = Address::generate(&env);
        let result = client.try_consume_limit(&user, &100);
        assert_eq!(result, Err(Ok(RateLimitError::CircuitBreakerTripped)));
    }

    #[test]
    fn test_circuit_breaker_blocks_checks() {
        let (env, client, admin) = setup();
        client.update_anomaly_score(&admin, &9_000);

        let user = Address::generate(&env);
        let result = client.try_check_limit(&user, &100);
        assert_eq!(result, Err(Ok(RateLimitError::CircuitBreakerTripped)));
    }

    #[test]
    fn test_reset_circuit_breaker() {
        let (env, client, admin) = setup();
        client.update_anomaly_score(&admin, &9_000);

        let cb = client.get_circuit_breaker();
        assert!(cb.tripped);

        client.reset_circuit_breaker(&admin);

        let cb = client.get_circuit_breaker();
        assert!(!cb.tripped);
        assert_eq!(cb.anomaly_score, 0);
        assert_eq!(cb.trip_count, 1); // count preserved

        // Transfers work again
        let user = Address::generate(&env);
        let result = client.try_consume_limit(&user, &100);
        assert!(result.is_ok());
    }

    // -----------------------------------------------------------------------
    // Emergency mode
    // -----------------------------------------------------------------------

    #[test]
    fn test_emergency_mode_blocks_consume() {
        let (env, client, admin) = setup();
        client.set_emergency_mode(&admin, &true);

        let user = Address::generate(&env);
        let result = client.try_consume_limit(&user, &100);
        assert_eq!(result, Err(Ok(RateLimitError::EmergencyModeActive)));
    }

    #[test]
    fn test_emergency_mode_blocks_check() {
        let (env, client, admin) = setup();
        client.set_emergency_mode(&admin, &true);

        let user = Address::generate(&env);
        let result = client.try_check_limit(&user, &100);
        assert_eq!(result, Err(Ok(RateLimitError::EmergencyModeActive)));
    }

    #[test]
    fn test_emergency_mode_disable() {
        let (env, client, admin) = setup();
        client.set_emergency_mode(&admin, &true);
        client.set_emergency_mode(&admin, &false);

        let user = Address::generate(&env);
        let result = client.try_consume_limit(&user, &100);
        assert!(result.is_ok());
    }

    #[test]
    fn test_emergency_reduce_limits() {
        let (env, client, admin) = setup();

        // Reduce by 50 %
        client.emergency_reduce_limits(&admin, &5_000);

        let user = Address::generate(&env);
        let effective = client.get_effective_limits(&user);
        assert_eq!(effective.daily_value, DEFAULT_DAILY_LIMIT / 2);
    }

    #[test]
    fn test_emergency_reduce_limits_invalid() {
        let (_env, client, admin) = setup();

        let result = client.try_emergency_reduce_limits(&admin, &0);
        assert_eq!(result, Err(Ok(RateLimitError::InvalidLimit)));

        let result = client.try_emergency_reduce_limits(&admin, &10_001);
        assert_eq!(result, Err(Ok(RateLimitError::InvalidLimit)));
    }

    // -----------------------------------------------------------------------
    // Usage history
    // -----------------------------------------------------------------------

    #[test]
    fn test_usage_history_recording() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        client.consume_limit(&user, &100_000);
        client.consume_limit(&user, &200_000);

        let history = client.get_usage_history(&user);
        assert_eq!(history.len(), 1); // same day
        let record = history.get(0).unwrap();
        assert_eq!(record.daily_value, 300_000);
        assert_eq!(record.daily_count, 2);
    }

    #[test]
    fn test_usage_history_multiple_days() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        client.consume_limit(&user, &100_000);

        env.ledger().set_timestamp(1_000_000 + DAY_SECS + 1);
        client.consume_limit(&user, &200_000);

        let history = client.get_usage_history(&user);
        assert_eq!(history.len(), 2);
    }

    // -----------------------------------------------------------------------
    // Global usage tracking
    // -----------------------------------------------------------------------

    #[test]
    fn test_global_usage_accumulates() {
        let (env, client, _admin) = setup();

        let user1 = Address::generate(&env);
        let user2 = Address::generate(&env);

        client.consume_limit(&user1, &100_000);
        client.consume_limit(&user2, &200_000);

        let gu = client.get_global_usage();
        assert_eq!(gu.daily.value_used, 300_000);
        assert_eq!(gu.daily.count_used, 2);
    }

    // -----------------------------------------------------------------------
    // Cross-contract check
    // -----------------------------------------------------------------------

    #[test]
    fn test_cross_contract_check() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        let contract = Address::generate(&env);

        let result = client.cross_contract_check(&user, &100_000, &contract);
        assert!(result.allowed);
    }

    // -----------------------------------------------------------------------
    // Default limits update
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_default_limits() {
        let (env, client, admin) = setup();

        let new_defaults = UserLimits {
            daily_value: 500_000_000,
            weekly_value: 2_000_000_000,
            monthly_value: 8_000_000_000,
            daily_count: 50,
            weekly_count: 200,
            monthly_count: 800,
        };
        client.update_default_limits(&admin, &new_defaults);

        let user = Address::generate(&env);
        let effective = client.get_effective_limits(&user);
        assert_eq!(effective.daily_value, 500_000_000);
    }

    // -----------------------------------------------------------------------
    // Graduated limits (tenure bonus)
    // -----------------------------------------------------------------------

    #[test]
    fn test_graduated_limits_increase_with_tenure() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        // First activity now
        client.consume_limit(&user, &100);

        // Advance 60 days (2 tenure intervals)
        env.ledger().set_timestamp(1_000_000 + 60 * DAY_SECS);

        let effective = client.get_effective_limits(&user);
        // 2 intervals × 5% = 10% bonus → 110% of default
        let expected = DEFAULT_DAILY_LIMIT * 11_000 / 10_000;
        assert_eq!(effective.daily_value, expected);
    }

    // -----------------------------------------------------------------------
    // Breach count in risk profile
    // -----------------------------------------------------------------------

    #[test]
    fn test_breach_increments_risk_breach_count() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        // Trigger a breach — state persists via Ok(Rejected)
        let result = client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT + 1));
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );

        let risk = client.get_user_risk(&user);
        assert_eq!(risk.breach_count, 1);
    }

    // -----------------------------------------------------------------------
    // Count-based limits
    // -----------------------------------------------------------------------

    #[test]
    fn test_daily_count_limit_exceeded() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        // Set very tight count limits
        let limits = UserLimits {
            daily_value: 1_000_000_000_000, // very high value limit
            weekly_value: 5_000_000_000_000,
            monthly_value: 15_000_000_000_000,
            daily_count: 3,
            weekly_count: 100,
            monthly_count: 300,
        };
        client.update_user_limit(&admin, &user, &limits);

        client.consume_limit(&user, &1);
        client.consume_limit(&user, &1);
        client.consume_limit(&user, &1);

        let result = client.consume_limit(&user, &1);
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyCountLimitExceeded as u32)
        );
    }

    // -----------------------------------------------------------------------
    // Non-admin operations should fail
    // -----------------------------------------------------------------------

    #[test]
    fn test_non_admin_cannot_update_global_limits() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);

        let gl = GlobalLimits {
            daily_value: 1,
            weekly_value: 1,
        };
        let result = client.try_update_global_limit(&stranger, &gl);
        assert_eq!(result, Err(Ok(RateLimitError::NotAuthorized)));
    }

    #[test]
    fn test_non_admin_cannot_whitelist() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);
        let user = Address::generate(&env);

        let result = client.try_add_to_whitelist(&stranger, &user);
        assert_eq!(result, Err(Ok(RateLimitError::NotAuthorized)));
    }

    // -----------------------------------------------------------------------
    // Monthly limit
    // -----------------------------------------------------------------------

    #[test]
    fn test_monthly_limit_exceeded() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        // Set limits where weekly is generous but monthly is tight.
        // We spread consumption across 2 weeks so the weekly window
        // resets in between, allowing us to hit the monthly cap.
        let limits = UserLimits {
            daily_value: 500_000_000,
            weekly_value: 2_500_000_000, // same as monthly — weekly resets mid-month
            monthly_value: 2_500_000_000, // tight monthly
            daily_count: 10000,
            weekly_count: 50000,
            monthly_count: 150000,
        };
        client.update_user_limit(&admin, &user, &limits);

        // Week 1: consume 5 × 400M = 2B (within weekly 3B)
        client.consume_limit(&user, &400_000_000);
        env.ledger().set_timestamp(1_000_000 + DAY_SECS + 1);
        client.consume_limit(&user, &400_000_000);
        env.ledger().set_timestamp(1_000_000 + 2 * DAY_SECS + 1);
        client.consume_limit(&user, &400_000_000);
        env.ledger().set_timestamp(1_000_000 + 3 * DAY_SECS + 1);
        client.consume_limit(&user, &400_000_000);
        env.ledger().set_timestamp(1_000_000 + 4 * DAY_SECS + 1);
        client.consume_limit(&user, &400_000_000);

        // Week 2: weekly window resets, but monthly still accumulates
        env.ledger().set_timestamp(1_000_000 + WEEK_SECS + 1);
        client.consume_limit(&user, &400_000_000);

        // Monthly total: 2.4B. Next transfer of 200M would exceed 2.5B
        env.ledger()
            .set_timestamp(1_000_000 + WEEK_SECS + DAY_SECS + 1);
        client.clear_cooldown(&admin, &user);
        let result = client.consume_limit(&user, &200_000_000);
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::MonthlyValueLimitExceeded as u32)
        );
    }

    // -----------------------------------------------------------------------
    // Per-user isolation
    // -----------------------------------------------------------------------

    #[test]
    fn test_per_user_isolation() {
        let (env, client, _admin) = setup();
        let user_a = Address::generate(&env);
        let user_b = Address::generate(&env);

        // User A consumes near the daily limit
        let near_limit = DEFAULT_DAILY_LIMIT - 1;
        let result_a = client.try_consume_limit(&user_a, &near_limit);
        assert!(result_a.is_ok());

        // User B is unaffected — still has full capacity
        let check_b = client.check_limit(&user_b, &DEFAULT_DAILY_LIMIT);
        assert!(check_b.allowed);
        assert_eq!(check_b.daily_remaining_value, DEFAULT_DAILY_LIMIT);

        let result_b = client.try_consume_limit(&user_b, &100_000_000);
        assert!(result_b.is_ok());
    }

    // -----------------------------------------------------------------------
    // Rejected consume must not record usage
    // -----------------------------------------------------------------------

    #[test]
    fn test_rejected_consume_does_not_record_usage() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        // Attempt to consume more than the daily limit in one call — must be rejected
        let result = client.consume_limit(&user, &(DEFAULT_DAILY_LIMIT + 1));
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );

        // Daily remaining must be unchanged — rejected transfers must not be recorded
        let check = client.check_limit(&user, &1);
        assert!(check.allowed);
        assert_eq!(check.daily_remaining_value, DEFAULT_DAILY_LIMIT);
    }

    // -----------------------------------------------------------------------
    // Weekly count limit enforcement
    // -----------------------------------------------------------------------

    #[test]
    fn test_weekly_count_limit_exceeded() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        // Set tight weekly count limit (3 transactions per week)
        let limits = UserLimits {
            daily_value: 1_000_000_000_000,
            weekly_value: 5_000_000_000_000,
            monthly_value: 15_000_000_000_000,
            daily_count: 1000,
            weekly_count: 3,
            monthly_count: 300,
        };
        client.update_user_limit(&admin, &user, &limits);

        // Consume across two different days to avoid daily count limit
        client.consume_limit(&user, &1);
        env.ledger().set_timestamp(1_000_000 + DAY_SECS + 1);
        client.consume_limit(&user, &1);
        env.ledger().set_timestamp(1_000_000 + 2 * DAY_SECS + 1);
        client.consume_limit(&user, &1);

        // Fourth transaction this week must be rejected on count
        env.ledger().set_timestamp(1_000_000 + 3 * DAY_SECS + 1);
        let result = client.consume_limit(&user, &1);
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::WeeklyCountLimitExceeded as u32)
        );
    }

    // -----------------------------------------------------------------------
    // check_limit reflects reset after window advance
    // -----------------------------------------------------------------------

    #[test]
    fn test_check_limit_reflects_window_reset() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);

        // Consume some of the daily limit
        let consumed = 500_000_000i128;
        client.consume_limit(&user, &consumed);

        // Before reset: remaining is reduced
        let check_before = client.check_limit(&user, &1);
        assert_eq!(
            check_before.daily_remaining_value,
            DEFAULT_DAILY_LIMIT - consumed
        );

        // Advance past one full day
        env.ledger().set_timestamp(1_000_000 + DAY_SECS + 1);

        // After reset: full limit is available again
        let check_after = client.check_limit(&user, &1);
        assert!(check_after.allowed);
        assert_eq!(check_after.daily_remaining_value, DEFAULT_DAILY_LIMIT);
    }

    // -----------------------------------------------------------------------
    // Global limit accumulates across distinct users
    // -----------------------------------------------------------------------

    #[test]
    fn test_global_limit_accumulates_across_users() {
        let (env, client, admin) = setup();

        // Set global daily limit equal to exactly 2× a single large transfer
        let single_transfer = 500_000_000i128;
        let gl = GlobalLimits {
            daily_value: single_transfer * 2,
            weekly_value: single_transfer * 10,
        };
        client.update_global_limit(&admin, &gl);

        let user_a = Address::generate(&env);
        let user_b = Address::generate(&env);
        let user_c = Address::generate(&env);

        // Two users fill the global daily pool
        let r1 = client.try_consume_limit(&user_a, &single_transfer);
        assert!(r1.is_ok());
        let r2 = client.try_consume_limit(&user_b, &single_transfer);
        assert!(r2.is_ok());

        // Third user is blocked — global pool exhausted
        let result = client.consume_limit(&user_c, &1);
        assert_eq!(
            result,
            ConsumeResult::Rejected(RateLimitError::GlobalDailyLimitExceeded as u32)
        );
    }

    // -----------------------------------------------------------------------
    // Asset-decimal normalization (issue #1248)
    // -----------------------------------------------------------------------

    use crate::asset_registry::{
        AssetCategory, AssetRegistryContract, AssetRegistryContractClient,
    };

    const ONE_BASE_TOKEN: i128 = 1_000_000;

    /// Limiter wired to a real AssetRegistry holding 6-, 7-, 18- and 2-decimal assets.
    fn setup_with_registry() -> (
        Env,
        RateLimiterContractClient<'static>,
        AssetRegistryContractClient<'static>,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let limiter_id = env.register_contract(None, RateLimiterContract);
        let limiter = RateLimiterContractClient::new(&env, &limiter_id);
        let registry_id = env.register_contract(None, AssetRegistryContract);
        let registry = AssetRegistryContractClient::new(&env, &registry_id);
        let admin = Address::generate(&env);
        limiter.initialize(&admin);
        registry.initialize(&admin);
        limiter.set_asset_registry(&admin, &registry_id);
        for (code, decimals) in [("USDC", 6u32), ("XLM", 7), ("WETH", 18), ("CENT", 2)] {
            registry.register_asset(
                &admin,
                &String::from_str(&env, code),
                &String::from_str(&env, code),
                &String::from_str(&env, code),
                &String::from_str(&env, "issuer"),
                &decimals,
                &AssetCategory::Stablecoin,
                &String::from_str(&env, "test asset"),
                &String::from_str(&env, "https://example.com"),
            );
        }
        let user = Address::generate(&env);
        (env, limiter, registry, admin, user)
    }

    fn code(env: &Env, text: &str) -> String {
        String::from_str(env, text)
    }

    #[test]
    fn normalize_amount_scales_to_the_base_basis() {
        assert_eq!(
            RateLimiterContract::normalize_amount(ONE_BASE_TOKEN, 6),
            Ok(ONE_BASE_TOKEN)
        );
        assert_eq!(
            RateLimiterContract::normalize_amount(10_000_000, 7),
            Ok(ONE_BASE_TOKEN)
        );
        assert_eq!(
            RateLimiterContract::normalize_amount(1_000_000_000_000_000_000, 18),
            Ok(ONE_BASE_TOKEN)
        );
        assert_eq!(
            RateLimiterContract::normalize_amount(100, 2),
            Ok(ONE_BASE_TOKEN)
        );
        assert_eq!(
            RateLimiterContract::normalize_amount(1, 0),
            Ok(ONE_BASE_TOKEN)
        );
        assert_eq!(BASE_DECIMALS, 6);
    }

    #[test]
    fn normalize_amount_rounds_dust_up_so_it_cannot_bypass_limits() {
        assert_eq!(RateLimiterContract::normalize_amount(1, 18), Ok(1));
        assert_eq!(
            RateLimiterContract::normalize_amount(1_000_000_000_001, 18),
            Ok(2)
        );
        assert_eq!(RateLimiterContract::normalize_amount(9, 7), Ok(1));
    }

    #[test]
    fn normalize_amount_rejects_bad_inputs() {
        assert_eq!(
            RateLimiterContract::normalize_amount(1, MAX_ASSET_DECIMALS + 1),
            Err(RateLimitError::InvalidDecimals)
        );
        assert_eq!(
            RateLimiterContract::normalize_amount(0, 6),
            Err(RateLimitError::InvalidLimit)
        );
        assert_eq!(
            RateLimiterContract::normalize_amount(-5, 18),
            Err(RateLimitError::InvalidLimit)
        );
        assert_eq!(
            RateLimiterContract::normalize_amount(i128::MAX, 0),
            Err(RateLimitError::AmountOverflow)
        );
    }

    #[test]
    fn one_token_of_any_asset_consumes_one_base_token() {
        let (env, limiter, _registry, _admin, user) = setup_with_registry();
        assert_eq!(
            limiter.consume_limit_for_asset(&user, &code(&env, "USDC"), &ONE_BASE_TOKEN),
            ConsumeResult::Allowed
        );
        assert_eq!(
            limiter.consume_limit_for_asset(&user, &code(&env, "XLM"), &10_000_000),
            ConsumeResult::Allowed
        );
        assert_eq!(
            limiter.consume_limit_for_asset(&user, &code(&env, "WETH"), &1_000_000_000_000_000_000),
            ConsumeResult::Allowed
        );
        assert_eq!(
            limiter.consume_limit_for_asset(&user, &code(&env, "CENT"), &100),
            ConsumeResult::Allowed
        );
        let usage = limiter.get_user_usage(&user);
        assert_eq!(usage.daily.value_used, 4 * ONE_BASE_TOKEN);
        assert_eq!(usage.daily.count_used, 4);
    }

    #[test]
    fn eighteen_decimal_asset_is_limited_by_tokens_not_raw_units() {
        let (env, limiter, _registry, _admin, user) = setup_with_registry();
        let weth = code(&env, "WETH");
        let one_weth: i128 = 1_000_000_000_000_000_000;
        // A single WETH (10^18 raw) used to exceed the 10^9 daily limit outright.
        let allowance = one_weth * (DEFAULT_DAILY_LIMIT / ONE_BASE_TOKEN);
        assert!(
            limiter
                .check_limit_for_asset(&user, &weth, &allowance)
                .allowed
        );
        assert_eq!(
            limiter.consume_limit_for_asset(&user, &weth, &allowance),
            ConsumeResult::Allowed
        );
        assert_eq!(
            limiter.get_user_usage(&user).daily.value_used,
            DEFAULT_DAILY_LIMIT
        );
        // One more wei rounds up to one base unit and trips the limit.
        assert_eq!(
            limiter.consume_limit_for_asset(&user, &weth, &1),
            ConsumeResult::Rejected(RateLimitError::DailyValueLimitExceeded as u32)
        );
    }

    #[test]
    fn seven_decimal_asset_matches_the_six_decimal_limit() {
        let (env, limiter, _registry, _admin, user) = setup_with_registry();
        let xlm = code(&env, "XLM");
        let thousand_xlm: i128 = 1_000 * 10_000_000;
        assert!(
            limiter
                .check_limit_for_asset(&user, &xlm, &thousand_xlm)
                .allowed
        );
        assert!(
            !limiter
                .check_limit_for_asset(&user, &xlm, &(thousand_xlm + 10))
                .allowed
        );
    }

    #[test]
    fn unknown_asset_and_missing_registry_are_reported() {
        let (env, limiter, _registry, _admin, user) = setup_with_registry();
        assert_eq!(
            limiter.try_consume_limit_for_asset(&user, &code(&env, "NOPE"), &1),
            Err(Ok(RateLimitError::AssetNotRegistered))
        );
        let (bare_env, bare, _admin) = setup();
        assert_eq!(bare.get_asset_registry(), None);
        assert_eq!(
            bare.try_check_limit_for_asset(
                &Address::generate(&bare_env),
                &code(&bare_env, "USDC"),
                &1
            ),
            Err(Ok(RateLimitError::AssetRegistryNotSet))
        );
    }

    #[test]
    fn only_admin_may_set_the_registry() {
        let (_env, limiter, registry, _admin, user) = setup_with_registry();
        assert_eq!(
            limiter.try_set_asset_registry(&user, &registry.address),
            Err(Ok(RateLimitError::NotAuthorized))
        );
        assert_eq!(limiter.get_asset_registry(), Some(registry.address.clone()));
    }
}
