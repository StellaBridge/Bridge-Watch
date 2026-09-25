#![allow(clippy::too_many_arguments)]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

/// Reputation score ranges from 0 to 10000 (represents 0.00 to 100.00%)
pub const REPUTATION_SCALE: u32 = 10000;

/// Maximum number of historical records to keep per entity
pub const MAX_HISTORY_RECORDS: u32 = 100;

/// Time decay half-life in seconds (reputation halves every 90 days by default)
pub const TIME_DECAY_HALFLIFE: u64 = 90 * 24 * 60 * 60;

/// Minimum reputation threshold for good standing
pub const MIN_REPUTATION_THRESHOLD: u32 = 5000;

/// Maximum weight for any single factor in reputation calculation
pub const MAX_FACTOR_WEIGHT: u32 = 100;

/// Ledgers without a valid performance report before an operator's score
/// starts to decay for inactivity (issue #1251). About one day at 5 s ledgers.
pub const INACTIVITY_WINDOW_LEDGERS: u32 = 17_280;
/// Score reduction applied once per elapsed inactivity window, in basis points.
pub const DEFAULT_INACTIVITY_DECAY_BPS: u32 = 500;
/// Collateral an operator must stake to appeal a slash, in stake units.
pub const DEFAULT_MIN_APPEAL_COLLATERAL: i128 = 100;
/// Ledgers after a slash during which an appeal may be filed. About seven days.
pub const APPEAL_WINDOW_LEDGERS: u32 = 120_960;

/// Entity types that can have reputation
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EntityType {
    BridgeOperator,
    OracleNode,
    RelayOperator,
}

/// Reputation factors that contribute to the overall score
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationFactors {
    pub accuracy_score: u32,
    pub uptime_score: u32,
    pub response_time_score: u32,
    pub dispute_history_score: u32,
}

/// Performance record for historical tracking
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PerformanceRecord {
    pub timestamp: u64,
    pub entity_type: EntityType,
    pub accuracy: u32,
    pub uptime: u32,
    pub response_time: u32,
    pub disputes_won: u32,
    pub disputes_lost: u32,
    pub total_operations: u32,
    pub successful_operations: u32,
    pub penalty_amount: i128,
    pub reward_amount: i128,
}

/// Complete reputation data for an entity
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationData {
    pub entity_address: Address,
    pub entity_type: EntityType,
    pub overall_score: u32,
    pub factors: ReputationFactors,
    pub total_operations: u64,
    pub successful_operations: u64,
    pub current_stake: i128,
    pub total_penalties: i128,
    pub total_rewards: i128,
    pub last_update_time: u64,
    pub registration_time: u64,
    pub is_slashed: bool,
    pub badge_level: BadgeLevel,
}

/// Badge levels for top performers
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BadgeLevel {
    None,
    Bronze,
    Silver,
    Gold,
    Platinum,
    Diamond,
}

/// Reputation configuration weights
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationWeights {
    pub accuracy_weight: u32,
    pub uptime_weight: u32,
    pub response_time_weight: u32,
    pub dispute_history_weight: u32,
}

impl Default for ReputationWeights {
    fn default() -> Self {
        ReputationWeights {
            accuracy_weight: 30,
            uptime_weight: 25,
            response_time_weight: 20,
            dispute_history_weight: 25,
        }
    }
}

/// Data key enum for storage management
#[contracttype]
pub enum DataKey {
    Admin,
    Reputation(Address),
    PerformanceHistory(Address),
    ReputationLeaderboard(EntityType),
    Config,
    TotalEntities(EntityType),
    RegisteredEntities,
    /// Ledger of the entity's last valid performance report.
    LastActivityLedger(Address),
    /// Ledger at which inactivity decay was last applied to the entity.
    LastInactivityDecayLedger(Address),
    InactivityPolicy,
    AppealPolicy,
    /// Most recent slash against the entity, kept until it is appealed.
    LastSlash(Address),
    Appeal(Address),
}

/// How inactivity is penalised (issue #1251). Stored separately from
/// `Config` so existing on-chain configs keep decoding.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InactivityPolicy {
    pub window_ledgers: u32,
    pub decay_bps: u32,
}

/// How slashing appeals are gated (issue #1251).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AppealPolicy {
    pub min_collateral: i128,
    pub window_ledgers: u32,
}

/// What a slash took away, so an approved appeal can put it back exactly.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlashRecord {
    pub previous_score: u32,
    pub penalty_amount: i128,
    pub slashed_at_ledger: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AppealStatus {
    Pending,
    Approved,
    Rejected,
}

/// An operator's appeal against its most recent slash.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Appeal {
    pub entity_address: Address,
    pub collateral: i128,
    pub reason: String,
    pub submitted_ledger: u32,
    pub status: AppealStatus,
    pub previous_score: u32,
    pub penalty_amount: i128,
}

/// Contract configuration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub weights: ReputationWeights,
    pub min_stake_amount: i128,
    pub slashing_percentage: u32,
    pub reward_percentage: u32,
    pub decay_enabled: bool,
    pub recovery_enabled: bool,
    pub recovery_period: u64,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            weights: ReputationWeights::default(),
            min_stake_amount: 1000,
            slashing_percentage: 10,
            reward_percentage: 5,
            decay_enabled: true,
            recovery_enabled: true,
            recovery_period: 30 * 24 * 60 * 60, // 30 days
        }
    }
}

/// Leaderboard entry for public ranking
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LeaderboardEntry {
    pub entity_address: Address,
    pub score: u32,
    pub badge_level: BadgeLevel,
    pub total_operations: u64,
}

#[contract]
pub struct ReputationSystemContract;

#[allow(clippy::too_many_arguments)]
#[contractimpl]
impl ReputationSystemContract {
    /// Initialize the reputation system contract
    pub fn initialize(env: Env, admin: Address, config: Config) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Config, &config);

        // Initialize empty leaderboards
        let bridge_leaderboard: Vec<LeaderboardEntry> = Vec::new(&env);
        let oracle_leaderboard: Vec<LeaderboardEntry> = Vec::new(&env);
        let relay_leaderboard: Vec<LeaderboardEntry> = Vec::new(&env);

        env.storage().instance().set(
            &DataKey::ReputationLeaderboard(EntityType::BridgeOperator),
            &bridge_leaderboard,
        );
        env.storage().instance().set(
            &DataKey::ReputationLeaderboard(EntityType::OracleNode),
            &oracle_leaderboard,
        );
        env.storage().instance().set(
            &DataKey::ReputationLeaderboard(EntityType::RelayOperator),
            &relay_leaderboard,
        );

        // Initialize entity counters
        env.storage()
            .instance()
            .set(&DataKey::TotalEntities(EntityType::BridgeOperator), &0u64);
        env.storage()
            .instance()
            .set(&DataKey::TotalEntities(EntityType::OracleNode), &0u64);
        env.storage()
            .instance()
            .set(&DataKey::TotalEntities(EntityType::RelayOperator), &0u64);
    }

    /// Register a new entity in the reputation system
    pub fn register_entity(
        env: Env,
        entity_address: Address,
        entity_type: EntityType,
        stake_amount: i128,
    ) {
        // Check if entity already exists
        if env
            .storage()
            .persistent()
            .has(&DataKey::Reputation(entity_address.clone()))
        {
            panic!("Entity already registered");
        }

        // Validate stake amount
        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        if stake_amount < config.min_stake_amount {
            panic!("Stake amount below minimum requirement");
        }

        // Create initial reputation data
        let reputation_data = ReputationData {
            entity_address: entity_address.clone(),
            entity_type: entity_type.clone(),
            overall_score: 7500, // Start with 75% reputation
            factors: ReputationFactors {
                accuracy_score: 7500,
                uptime_score: 7500,
                response_time_score: 7500,
                dispute_history_score: 7500,
            },
            total_operations: 0,
            successful_operations: 0,
            current_stake: stake_amount,
            total_penalties: 0,
            total_rewards: 0,
            last_update_time: env.ledger().timestamp(),
            registration_time: env.ledger().timestamp(),
            is_slashed: false,
            badge_level: BadgeLevel::None,
        };

        // Store reputation data
        env.storage().persistent().set(
            &DataKey::Reputation(entity_address.clone()),
            &reputation_data,
        );
        Self::stamp_activity(&env, &entity_address);

        // Initialize empty performance history
        let history: Vec<PerformanceRecord> = Vec::new(&env);
        env.storage().persistent().set(
            &DataKey::PerformanceHistory(entity_address.clone()),
            &history,
        );

        // Update entity counter
        let mut total_entities: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalEntities(entity_type.clone()))
            .unwrap();
        total_entities += 1;
        env.storage()
            .instance()
            .set(&DataKey::TotalEntities(entity_type), &total_entities);

        // Add to leaderboard
        Self::update_leaderboard_internal(
            &env,
            entity_address,
            reputation_data.overall_score,
            BadgeLevel::None,
        );
    }

    /// Record performance metrics for an entity
    pub fn record_performance(
        env: Env,
        entity_address: Address,
        accuracy: u32,
        uptime: u32,
        response_time: u32,
        disputes_won: u32,
        disputes_lost: u32,
        total_operations: u32,
        successful_operations: u32,
    ) {
        // Require authorization from entity
        entity_address.require_auth();

        // Get existing reputation data
        let reputation_data: ReputationData = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address.clone()))
            .unwrap_or_else(|| panic!("Entity not registered"));
        Self::stamp_activity(&env, &entity_address);

        // Create performance record
        let record = PerformanceRecord {
            timestamp: env.ledger().timestamp(),
            entity_type: reputation_data.entity_type.clone(),
            accuracy,
            uptime,
            response_time,
            disputes_won,
            disputes_lost,
            total_operations,
            successful_operations,
            penalty_amount: 0,
            reward_amount: 0,
        };

        // Store performance record
        let mut history: Vec<PerformanceRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::PerformanceHistory(entity_address.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        history.push_back(record);

        // Keep only recent history (apply time decay cleanup)
        if history.len() > MAX_HISTORY_RECORDS {
            let mut cleaned_history: Vec<PerformanceRecord> = Vec::new(&env);
            let cutoff_time = env.ledger().timestamp().saturating_sub(365 * 24 * 60 * 60); // Keep last year

            for i in 0..history.len() {
                let record = history.get(i).unwrap();
                if record.timestamp >= cutoff_time {
                    cleaned_history.push_back(record);
                }
            }
            history = cleaned_history;
        }

        env.storage().persistent().set(
            &DataKey::PerformanceHistory(entity_address.clone()),
            &history,
        );

        // Update reputation scores
        Self::update_reputation_internal(
            &env,
            entity_address.clone(),
            accuracy,
            uptime,
            response_time,
            disputes_won,
            disputes_lost,
        );

        // Update entity statistics
        let mut updated_data: ReputationData = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address.clone()))
            .unwrap();

        updated_data.total_operations += total_operations as u64;
        updated_data.successful_operations += successful_operations as u64;
        updated_data.last_update_time = env.ledger().timestamp();

        // Update badge level based on reputation
        updated_data.badge_level = Self::calculate_badge_level(updated_data.overall_score);

        env.storage()
            .persistent()
            .set(&DataKey::Reputation(entity_address), &updated_data);
    }

    /// Apply penalty to an entity (admin only)
    pub fn apply_penalty(env: Env, entity_address: Address, penalty_amount: i128, _reason: String) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        // Get existing reputation data
        let mut reputation_data: ReputationData = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address.clone()))
            .unwrap_or_else(|| panic!("Entity not registered"));

        // Calculate reputation impact
        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        let reputation_impact = (penalty_amount as u32) * config.slashing_percentage / 100;
        let new_score = reputation_data
            .overall_score
            .saturating_sub(reputation_impact);

        // Remember what was taken so an approved appeal can restore it exactly.
        env.storage().persistent().set(
            &DataKey::LastSlash(entity_address.clone()),
            &SlashRecord {
                previous_score: reputation_data.overall_score,
                penalty_amount,
                slashed_at_ledger: env.ledger().sequence(),
                timestamp: env.ledger().timestamp(),
            },
        );

        // Update reputation data
        reputation_data.overall_score = new_score;
        reputation_data.total_penalties += penalty_amount;
        reputation_data.current_stake =
            reputation_data.current_stake.saturating_sub(penalty_amount);
        reputation_data.is_slashed = true;
        reputation_data.badge_level = BadgeLevel::None; // Reset badge on penalty
        reputation_data.last_update_time = env.ledger().timestamp();

        // Update stored data
        env.storage().persistent().set(
            &DataKey::Reputation(entity_address.clone()),
            &reputation_data,
        );

        // Add penalty record to history
        let mut history: Vec<PerformanceRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::PerformanceHistory(entity_address.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        let penalty_record = PerformanceRecord {
            timestamp: env.ledger().timestamp(),
            entity_type: reputation_data.entity_type.clone(),
            accuracy: 0,
            uptime: 0,
            response_time: 0,
            disputes_won: 0,
            disputes_lost: 1,
            total_operations: 0,
            successful_operations: 0,
            penalty_amount,
            reward_amount: 0,
        };

        history.push_back(penalty_record);
        env.storage().persistent().set(
            &DataKey::PerformanceHistory(entity_address.clone()),
            &history,
        );

        // Update leaderboard
        Self::update_leaderboard_internal(&env, entity_address, new_score, BadgeLevel::None);
    }

    // =======================================================================
    // Inactivity decay (issue #1251)
    // =======================================================================

    /// Set how inactivity is penalised (admin only).
    pub fn set_inactivity_policy(env: Env, window_ledgers: u32, decay_bps: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        if window_ledgers == 0 {
            panic!("Inactivity window must be at least one ledger");
        }
        if decay_bps > REPUTATION_SCALE {
            panic!("Inactivity decay cannot exceed 100%");
        }
        env.storage().instance().set(
            &DataKey::InactivityPolicy,
            &InactivityPolicy {
                window_ledgers,
                decay_bps,
            },
        );
    }

    pub fn get_inactivity_policy(env: Env) -> InactivityPolicy {
        Self::inactivity_policy(&env)
    }

    /// Ledger of the entity's last valid report, if it has been recorded.
    pub fn get_last_activity_ledger(env: Env, entity_address: Address) -> Option<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::LastActivityLedger(entity_address))
    }

    /// Reduce the score of every operator that has gone a full inactivity
    /// window without a valid report (admin only). One decay step is applied
    /// per call once a window has elapsed since the later of the last report
    /// and the last decay, so repeated calls inside a window are no-ops and
    /// prolonged silence compounds one step per window. Returns the number
    /// of entities decayed.
    ///
    /// Entities registered before activity tracking existed have no stamp;
    /// the first pass stamps them at the current ledger instead of decaying
    /// them for silence that was never measured.
    pub fn apply_inactivity_decay(env: Env) -> u32 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let policy = Self::inactivity_policy(&env);
        let now = env.ledger().sequence();
        let mut decayed: u32 = 0;

        for entity_type in [
            EntityType::BridgeOperator,
            EntityType::OracleNode,
            EntityType::RelayOperator,
        ] {
            let leaderboard: Vec<LeaderboardEntry> = env
                .storage()
                .instance()
                .get(&DataKey::ReputationLeaderboard(entity_type))
                .unwrap_or_else(|| Vec::new(&env));

            for i in 0..leaderboard.len() {
                let entity = leaderboard.get(i).unwrap().entity_address;
                let activity_key = DataKey::LastActivityLedger(entity.clone());
                let last_activity: u32 = match env.storage().persistent().get(&activity_key) {
                    Some(ledger) => ledger,
                    None => {
                        env.storage().persistent().set(&activity_key, &now);
                        continue;
                    }
                };
                let last_decay: u32 = env
                    .storage()
                    .persistent()
                    .get(&DataKey::LastInactivityDecayLedger(entity.clone()))
                    .unwrap_or(0);
                let since = now.saturating_sub(if last_decay > last_activity {
                    last_decay
                } else {
                    last_activity
                });
                if since < policy.window_ledgers {
                    continue;
                }

                let mut reputation_data: ReputationData = env
                    .storage()
                    .persistent()
                    .get(&DataKey::Reputation(entity.clone()))
                    .unwrap();
                let reduction = ((reputation_data.overall_score as u64) * (policy.decay_bps as u64)
                    / REPUTATION_SCALE as u64) as u32;
                reputation_data.overall_score =
                    reputation_data.overall_score.saturating_sub(reduction);
                reputation_data.badge_level =
                    Self::calculate_badge_level(reputation_data.overall_score);
                reputation_data.last_update_time = env.ledger().timestamp();
                env.storage()
                    .persistent()
                    .set(&DataKey::Reputation(entity.clone()), &reputation_data);
                env.storage()
                    .persistent()
                    .set(&DataKey::LastInactivityDecayLedger(entity.clone()), &now);
                Self::update_leaderboard_internal(
                    &env,
                    entity.clone(),
                    reputation_data.overall_score,
                    reputation_data.badge_level,
                );
                env.events().publish(
                    (soroban_sdk::symbol_short!("rep_decay"), entity),
                    (reputation_data.overall_score, reduction),
                );
                decayed += 1;
            }
        }
        decayed
    }

    // =======================================================================
    // Slashing appeals (issue #1251)
    // =======================================================================

    /// Set the collateral and window an appeal requires (admin only).
    pub fn set_appeal_policy(env: Env, min_collateral: i128, window_ledgers: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        if min_collateral < 0 {
            panic!("Appeal collateral cannot be negative");
        }
        if window_ledgers == 0 {
            panic!("Appeal window must be at least one ledger");
        }
        env.storage().instance().set(
            &DataKey::AppealPolicy,
            &AppealPolicy {
                min_collateral,
                window_ledgers,
            },
        );
    }

    pub fn get_appeal_policy(env: Env) -> AppealPolicy {
        Self::appeal_policy(&env)
    }

    pub fn get_last_slash(env: Env, entity_address: Address) -> Option<SlashRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::LastSlash(entity_address))
    }

    pub fn get_appeal(env: Env, entity_address: Address) -> Option<Appeal> {
        env.storage()
            .persistent()
            .get(&DataKey::Appeal(entity_address))
    }

    /// Appeal the entity's most recent slash, staking `collateral` from its
    /// current stake. The collateral is returned if the appeal is approved
    /// and forfeited if it is rejected. One appeal per slash, filed within
    /// the appeal window.
    pub fn submit_appeal(env: Env, entity_address: Address, collateral: i128, reason: String) {
        entity_address.require_auth();

        let mut reputation_data: ReputationData = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address.clone()))
            .unwrap_or_else(|| panic!("Entity not registered"));
        if !reputation_data.is_slashed {
            panic!("Entity is not slashed");
        }
        let slash: SlashRecord = env
            .storage()
            .persistent()
            .get(&DataKey::LastSlash(entity_address.clone()))
            .unwrap_or_else(|| panic!("No slash on record to appeal"));
        if let Some(existing) = env
            .storage()
            .persistent()
            .get::<_, Appeal>(&DataKey::Appeal(entity_address.clone()))
        {
            if existing.status == AppealStatus::Pending {
                panic!("An appeal is already pending");
            }
        }

        let policy = Self::appeal_policy(&env);
        let now = env.ledger().sequence();
        if now.saturating_sub(slash.slashed_at_ledger) > policy.window_ledgers {
            panic!("Appeal window has closed");
        }
        if collateral < policy.min_collateral {
            panic!("Appeal collateral below minimum");
        }
        if collateral > reputation_data.current_stake {
            panic!("Appeal collateral exceeds current stake");
        }

        // Lock the collateral: it leaves the usable stake until the appeal resolves.
        reputation_data.current_stake -= collateral;
        env.storage().persistent().set(
            &DataKey::Reputation(entity_address.clone()),
            &reputation_data,
        );
        let appeal = Appeal {
            entity_address: entity_address.clone(),
            collateral,
            reason,
            submitted_ledger: now,
            status: AppealStatus::Pending,
            previous_score: slash.previous_score,
            penalty_amount: slash.penalty_amount,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Appeal(entity_address.clone()), &appeal);
        env.events().publish(
            (soroban_sdk::symbol_short!("rep_appl"), entity_address),
            (collateral, now),
        );
    }

    /// Resolve a pending appeal (admin only). Approval restores the score,
    /// the slashed stake and the collateral, and clears the slashed flag;
    /// rejection forfeits the collateral and leaves the slash in place.
    pub fn resolve_appeal(env: Env, entity_address: Address, approved: bool) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut appeal: Appeal = env
            .storage()
            .persistent()
            .get(&DataKey::Appeal(entity_address.clone()))
            .unwrap_or_else(|| panic!("No appeal on record"));
        if appeal.status != AppealStatus::Pending {
            panic!("Appeal already resolved");
        }
        let mut reputation_data: ReputationData = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address.clone()))
            .unwrap();

        if approved {
            reputation_data.overall_score = appeal.previous_score;
            reputation_data.badge_level = Self::calculate_badge_level(appeal.previous_score);
            reputation_data.is_slashed = false;
            reputation_data.current_stake += appeal.penalty_amount + appeal.collateral;
            reputation_data.total_penalties -= appeal.penalty_amount;
            env.storage()
                .persistent()
                .remove(&DataKey::LastSlash(entity_address.clone()));
            appeal.status = AppealStatus::Approved;
        } else {
            appeal.status = AppealStatus::Rejected;
        }
        reputation_data.last_update_time = env.ledger().timestamp();
        env.storage().persistent().set(
            &DataKey::Reputation(entity_address.clone()),
            &reputation_data,
        );
        env.storage()
            .persistent()
            .set(&DataKey::Appeal(entity_address.clone()), &appeal);
        Self::update_leaderboard_internal(
            &env,
            entity_address.clone(),
            reputation_data.overall_score,
            reputation_data.badge_level,
        );
        env.events().publish(
            (soroban_sdk::symbol_short!("rep_apres"), entity_address),
            approved,
        );
    }

    /// Grant reward to an entity (admin only)
    pub fn grant_reward(env: Env, entity_address: Address, reward_amount: i128, _reason: String) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        // Get existing reputation data
        let mut reputation_data: ReputationData = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address.clone()))
            .unwrap_or_else(|| panic!("Entity not registered"));

        // Calculate reputation boost
        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        let reputation_boost = (reward_amount as u32) * config.reward_percentage / 100;
        let new_score = (reputation_data.overall_score + reputation_boost).min(REPUTATION_SCALE);

        // Update reputation data
        reputation_data.overall_score = new_score;
        reputation_data.total_rewards += reward_amount;
        reputation_data.current_stake += reward_amount;
        reputation_data.last_update_time = env.ledger().timestamp();

        // Check if entity can recover from slashed status
        if reputation_data.is_slashed && new_score >= MIN_REPUTATION_THRESHOLD {
            reputation_data.is_slashed = false;
            reputation_data.badge_level = Self::calculate_badge_level(new_score);
        }

        // Update stored data
        env.storage().persistent().set(
            &DataKey::Reputation(entity_address.clone()),
            &reputation_data,
        );

        // Add reward record to history
        let mut history: Vec<PerformanceRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::PerformanceHistory(entity_address.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        let reward_record = PerformanceRecord {
            timestamp: env.ledger().timestamp(),
            entity_type: reputation_data.entity_type.clone(),
            accuracy: 0,
            uptime: 0,
            response_time: 0,
            disputes_won: 1,
            disputes_lost: 0,
            total_operations: 0,
            successful_operations: 0,
            penalty_amount: 0,
            reward_amount,
        };

        history.push_back(reward_record);
        env.storage()
            .persistent()
            .set(&DataKey::Reputation(entity_address.clone()), &history);

        // Update leaderboard
        Self::update_leaderboard_internal(
            &env,
            entity_address,
            new_score,
            reputation_data.badge_level,
        );
    }

    /// Calculate and apply time decay to all entities
    pub fn apply_time_decay(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        if !config.decay_enabled {
            return;
        }

        let current_time = env.ledger().timestamp();

        // Apply decay to all entity types
        for entity_type in [
            EntityType::BridgeOperator,
            EntityType::OracleNode,
            EntityType::RelayOperator,
        ] {
            let leaderboard: Vec<LeaderboardEntry> = env
                .storage()
                .instance()
                .get(&DataKey::ReputationLeaderboard(entity_type))
                .unwrap_or_else(|| Vec::new(&env));

            for i in 0..leaderboard.len() {
                let entry = leaderboard.get(i).unwrap();
                let mut reputation_data: ReputationData = env
                    .storage()
                    .persistent()
                    .get(&DataKey::Reputation(entry.entity_address.clone()))
                    .unwrap();

                // Calculate time-based decay
                let time_since_update = current_time - reputation_data.last_update_time;
                let decay_factor = Self::calculate_decay_factor(time_since_update);
                let decayed_score = ((reputation_data.overall_score as u64) * decay_factor as u64
                    / REPUTATION_SCALE as u64) as u32;

                // Only update if score changed
                if decayed_score != reputation_data.overall_score {
                    reputation_data.overall_score = decayed_score;
                    reputation_data.badge_level = Self::calculate_badge_level(decayed_score);
                    reputation_data.last_update_time = current_time;

                    env.storage().persistent().set(
                        &DataKey::Reputation(entry.entity_address.clone()),
                        &reputation_data,
                    );

                    // Update leaderboard entry
                    Self::update_leaderboard_internal(
                        &env,
                        entry.entity_address,
                        decayed_score,
                        reputation_data.badge_level,
                    );
                }
            }
        }
    }

    /// Get reputation data for an entity
    pub fn get_reputation(env: Env, entity_address: Address) -> Option<ReputationData> {
        env.storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address))
    }

    /// Get performance history for an entity
    pub fn get_performance_history(env: Env, entity_address: Address) -> Vec<PerformanceRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::PerformanceHistory(entity_address))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get leaderboard for a specific entity type
    pub fn get_leaderboard(env: Env, entity_type: EntityType, limit: u32) -> Vec<LeaderboardEntry> {
        let mut leaderboard: Vec<LeaderboardEntry> = env
            .storage()
            .instance()
            .get(&DataKey::ReputationLeaderboard(entity_type))
            .unwrap_or_else(|| Vec::new(&env));

        // Sort by score descending (simple bubble sort for small lists)
        let len = leaderboard.len();
        for i in 0..len {
            for j in 0..len - i - 1 {
                let score_j = leaderboard.get(j).unwrap().score;
                let score_j1 = leaderboard.get(j + 1).unwrap().score;
                if score_j < score_j1 {
                    // Swap entries
                    let entry_j = leaderboard.get(j).unwrap();
                    let entry_j1 = leaderboard.get(j + 1).unwrap();
                    leaderboard.set(j, entry_j1);
                    leaderboard.set(j + 1, entry_j);
                }
            }
        }

        // Return limited results
        let mut result: Vec<LeaderboardEntry> = Vec::new(&env);
        let max_entries = limit.min(len);
        for i in 0..max_entries {
            result.push_back(leaderboard.get(i).unwrap());
        }

        result
    }

    /// Check if entity meets minimum reputation threshold for access control
    pub fn check_access_control(
        env: Env,
        entity_address: Address,
        required_threshold: u32,
    ) -> bool {
        let reputation_data: Option<ReputationData> = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address));

        match reputation_data {
            Some(data) => !data.is_slashed && data.overall_score >= required_threshold,
            None => false,
        }
    }

    /// Update contract configuration (admin only)
    pub fn update_config(env: Env, new_config: Config) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        // Validate weights sum to 100
        let total_weight = new_config.weights.accuracy_weight
            + new_config.weights.uptime_weight
            + new_config.weights.response_time_weight
            + new_config.weights.dispute_history_weight;

        if total_weight != 100 {
            panic!("Weights must sum to 100");
        }

        env.storage().instance().set(&DataKey::Config, &new_config);
    }

    /// Get current contract configuration
    pub fn get_config(env: Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_default()
    }

    // -----------------------------------------------------------------------
    // Internal helper functions
    // -----------------------------------------------------------------------

    /// Update entity reputation based on performance metrics
    fn update_reputation_internal(
        env: &Env,
        entity_address: Address,
        accuracy: u32,
        uptime: u32,
        response_time: u32,
        disputes_won: u32,
        disputes_lost: u32,
    ) {
        let mut reputation_data: ReputationData = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address.clone()))
            .unwrap();

        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();

        // Calculate new factor scores
        let accuracy_score = accuracy.min(REPUTATION_SCALE);
        let uptime_score = uptime.min(REPUTATION_SCALE);
        let response_time_score = response_time.min(REPUTATION_SCALE);

        // Calculate dispute history score
        let total_disputes = disputes_won + disputes_lost;
        let dispute_history_score = if total_disputes == 0 {
            7500 // Neutral score if no disputes
        } else {
            disputes_won * REPUTATION_SCALE / total_disputes
        };

        // Update factor scores with exponential moving average
        let alpha = 20; // Smoothing factor
        reputation_data.factors.accuracy_score = Self::ema_update(
            reputation_data.factors.accuracy_score,
            accuracy_score,
            alpha,
        );
        reputation_data.factors.uptime_score =
            Self::ema_update(reputation_data.factors.uptime_score, uptime_score, alpha);
        reputation_data.factors.response_time_score = Self::ema_update(
            reputation_data.factors.response_time_score,
            response_time_score,
            alpha,
        );
        reputation_data.factors.dispute_history_score = Self::ema_update(
            reputation_data.factors.dispute_history_score,
            dispute_history_score,
            alpha,
        );

        // Calculate weighted overall score
        let weights = &config.weights;
        let overall_score = ((reputation_data.factors.accuracy_score as u64
            * weights.accuracy_weight as u64)
            + (reputation_data.factors.uptime_score as u64 * weights.uptime_weight as u64)
            + (reputation_data.factors.response_time_score as u64
                * weights.response_time_weight as u64)
            + (reputation_data.factors.dispute_history_score as u64
                * weights.dispute_history_weight as u64))
            / 100;

        reputation_data.overall_score = overall_score as u32;

        env.storage()
            .persistent()
            .set(&DataKey::Reputation(entity_address), &reputation_data);
    }

    /// Calculate exponential moving average
    fn ema_update(current: u32, new: u32, alpha: u32) -> u32 {
        let result: u64 =
            ((current as u64 * (100 - alpha) as u64) + (new as u64 * alpha as u64)) / 100;
        result as u32
    }

    /// Calculate time decay factor
    fn calculate_decay_factor(time_since_update: u64) -> u32 {
        if time_since_update == 0 {
            return REPUTATION_SCALE;
        }

        // no_std-friendly approximation: apply one halving per elapsed half-life.
        let elapsed_half_lives = time_since_update / TIME_DECAY_HALFLIFE;
        let mut factor = REPUTATION_SCALE;
        let mut i = 0u64;

        while i < elapsed_half_lives {
            factor /= 2;
            if factor == 0 {
                break;
            }
            i += 1;
        }

        factor
    }

    fn stamp_activity(env: &Env, entity_address: &Address) {
        env.storage().persistent().set(
            &DataKey::LastActivityLedger(entity_address.clone()),
            &env.ledger().sequence(),
        );
    }

    fn inactivity_policy(env: &Env) -> InactivityPolicy {
        env.storage()
            .instance()
            .get(&DataKey::InactivityPolicy)
            .unwrap_or(InactivityPolicy {
                window_ledgers: INACTIVITY_WINDOW_LEDGERS,
                decay_bps: DEFAULT_INACTIVITY_DECAY_BPS,
            })
    }

    fn appeal_policy(env: &Env) -> AppealPolicy {
        env.storage()
            .instance()
            .get(&DataKey::AppealPolicy)
            .unwrap_or(AppealPolicy {
                min_collateral: DEFAULT_MIN_APPEAL_COLLATERAL,
                window_ledgers: APPEAL_WINDOW_LEDGERS,
            })
    }

    /// Calculate badge level based on reputation score
    fn calculate_badge_level(score: u32) -> BadgeLevel {
        match score {
            0..=2499 => BadgeLevel::None,
            2500..=4999 => BadgeLevel::Bronze,
            5000..=7499 => BadgeLevel::Silver,
            7500..=8999 => BadgeLevel::Gold,
            9000..=9499 => BadgeLevel::Platinum,
            9500..=REPUTATION_SCALE => BadgeLevel::Diamond,
            _ => BadgeLevel::None, // Safety case for values > REPUTATION_SCALE
        }
    }

    /// Update leaderboard with new entry
    fn update_leaderboard_internal(
        env: &Env,
        entity_address: Address,
        score: u32,
        badge_level: BadgeLevel,
    ) {
        let reputation_data: ReputationData = env
            .storage()
            .persistent()
            .get(&DataKey::Reputation(entity_address.clone()))
            .unwrap();

        let entity_type = reputation_data.entity_type.clone();

        let mut leaderboard: Vec<LeaderboardEntry> = env
            .storage()
            .instance()
            .get(&DataKey::ReputationLeaderboard(entity_type.clone()))
            .unwrap_or_else(|| Vec::new(env));

        // Check if entity already exists in leaderboard
        let mut found = false;
        for i in 0..leaderboard.len() {
            if leaderboard.get(i).unwrap().entity_address == entity_address {
                // Update existing entry
                let entry = LeaderboardEntry {
                    entity_address: entity_address.clone(),
                    score,
                    badge_level: badge_level.clone(),
                    total_operations: reputation_data.total_operations,
                };
                leaderboard.set(i, entry);
                found = true;
                break;
            }
        }

        if !found {
            // Add new entry
            let entry = LeaderboardEntry {
                entity_address: entity_address.clone(),
                score,
                badge_level: badge_level.clone(),
                total_operations: reputation_data.total_operations,
            };
            leaderboard.push_back(entry);
        }

        env.storage()
            .instance()
            .set(&DataKey::ReputationLeaderboard(entity_type), &leaderboard);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    /// Helper: set up a fresh contract with an admin
    fn setup() -> (Env, ReputationSystemContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ReputationSystemContract);
        let client = ReputationSystemContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let config = Config::default();
        client.initialize(&admin, &config);
        (env, client, admin)
    }

    #[test]
    fn test_initialize() {
        let (_env, client, _admin) = setup();

        let config = client.get_config();
        assert_eq!(config.weights.accuracy_weight, 30);
        assert_eq!(config.weights.uptime_weight, 25);
        assert_eq!(config.weights.response_time_weight, 20);
        assert_eq!(config.weights.dispute_history_weight, 25);
    }

    #[test]
    fn test_register_entity() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        client.register_entity(&entity, &EntityType::BridgeOperator, &(10000));

        let reputation = client.get_reputation(&entity);
        assert!(reputation.is_some());
        let rep = reputation.unwrap();
        assert_eq!(rep.entity_type, EntityType::BridgeOperator);
        assert_eq!(rep.overall_score, 7500);
        assert_eq!(rep.current_stake, 10000);
        assert!(!rep.is_slashed);
    }

    #[test]
    fn test_record_performance() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        client.register_entity(&entity, &EntityType::OracleNode, &(5000));
        client.record_performance(&entity, &9500, &9800, &9200, &3, &1, &100, &95);

        let reputation = client.get_reputation(&entity);
        assert!(reputation.is_some());
        let rep = reputation.unwrap();
        assert_eq!(rep.total_operations, 100);
        assert_eq!(rep.successful_operations, 95);
        assert!(rep.overall_score > 7500); // Should improve from initial
    }

    #[test]
    fn test_apply_penalty() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        // Register entity
        client.register_entity(&entity, &EntityType::RelayOperator, &(10000));

        // Test that poor performance affects reputation
        let initial_score = client.get_reputation(&entity).unwrap().overall_score;
        client.record_performance(&entity, &5000, &6000, &5000, &1, &5, &100, &50);

        let reputation = client.get_reputation(&entity);
        assert!(reputation.is_some());
        let rep = reputation.unwrap();
        // Reputation should have decreased with poor performance
        assert!(rep.overall_score <= initial_score);
        // Success rate should be reflected
        assert!(rep.successful_operations < rep.total_operations);
    }

    #[test]
    fn test_grant_reward() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        // Register entity
        client.register_entity(&entity, &EntityType::BridgeOperator, &(5000));

        // Test that good performance improves reputation
        let initial_score = client.get_reputation(&entity).unwrap().overall_score;
        client.record_performance(&entity, &9500, &9800, &9500, &5, &0, &100, &100);

        let reputation = client.get_reputation(&entity);
        assert!(reputation.is_some());
        let rep = reputation.unwrap();
        assert!(rep.overall_score >= initial_score);
        // Total operations should have increased
        assert!(rep.total_operations >= 100);
    }

    #[test]
    fn test_recovery_mechanism() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        // Register entity
        client.register_entity(&entity, &EntityType::OracleNode, &(10000));

        // Test that performance can improve reputation
        client.record_performance(&entity, &9000, &9500, &9000, &5, &0, &50, &50);
        let initial_rep = client.get_reputation(&entity).unwrap();

        // Continue improving performance
        client.record_performance(&entity, &9500, &9800, &9500, &10, &0, &100, &100);
        let improved_rep = client.get_reputation(&entity).unwrap();

        // Reputation should have improved
        assert!(improved_rep.overall_score >= initial_rep.overall_score);
    }

    #[test]
    fn test_leaderboard() {
        let (env, client, _admin) = setup();
        let entity1 = Address::generate(&env);
        let entity2 = Address::generate(&env);
        let entity3 = Address::generate(&env);

        client.register_entity(&entity1, &EntityType::BridgeOperator, &(10000));
        client.register_entity(&entity2, &EntityType::BridgeOperator, &(10000));
        client.register_entity(&entity3, &EntityType::BridgeOperator, &(10000));

        // Record different performance levels
        client.record_performance(&entity1, &9500, &9800, &9200, &5, &0, &100, &100);
        client.record_performance(&entity2, &8000, &8500, &8000, &3, &2, &100, &90);
        client.record_performance(&entity3, &6000, &7000, &6500, &2, &3, &100, &80);

        let leaderboard = client.get_leaderboard(&EntityType::BridgeOperator, &10);
        assert_eq!(leaderboard.len(), 3);

        // Verify ordering (highest score first)
        for i in 0..leaderboard.len() - 1 {
            assert!(leaderboard.get(i).unwrap().score >= leaderboard.get(i + 1).unwrap().score);
        }
    }

    #[test]
    fn test_badge_levels() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        // Test initial badge (should be None)
        client.register_entity(&entity, &EntityType::BridgeOperator, &(1000));
        assert_eq!(
            client.get_reputation(&entity).unwrap().badge_level,
            BadgeLevel::None
        );

        // Test that after perfect performance, badge should be high
        client.record_performance(&entity, &10000, &10000, &10000, &10, &0, &100, &100);
        let reputation = client.get_reputation(&entity).unwrap();

        // With perfect scores, should have at least Gold badge
        assert!(matches!(
            reputation.badge_level,
            BadgeLevel::Gold | BadgeLevel::Platinum | BadgeLevel::Diamond
        ));
    }

    #[test]
    fn test_access_control() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        // Test unregistered entity
        assert!(!client.check_access_control(&entity, &5000));

        // Register with good reputation
        client.register_entity(&entity, &EntityType::BridgeOperator, &(10000));
        assert!(client.check_access_control(&entity, &5000));

        // Poor performance should reduce reputation but not slash (slash requires penalty function)
        client.record_performance(&entity, &1000, &1000, &1000, &0, &10, &100, &10);

        // With very poor performance, access control check should still work
        // but the threshold requirement might fail
        let rep = client.get_reputation(&entity).unwrap();
        if rep.overall_score < 5000 {
            assert!(!client.check_access_control(&entity, &5000));
        } else {
            assert!(client.check_access_control(&entity, &5000));
        }
    }

    #[test]
    fn test_performance_history() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        client.register_entity(&entity, &EntityType::OracleNode, &(5000));

        // Record multiple performance entries
        for i in 0..5 {
            client.record_performance(
                &entity,
                &(9000 + i * 100),
                &(9500),
                &(9000),
                &(3),
                &(1),
                &(100),
                &(95),
            );
        }

        let history = client.get_performance_history(&entity);
        assert_eq!(history.len(), 5);
    }

    #[test]
    fn test_config_update() {
        let (_env, client, _admin) = setup();

        let new_config = Config {
            weights: ReputationWeights {
                accuracy_weight: 40,
                uptime_weight: 30,
                response_time_weight: 15,
                dispute_history_weight: 15,
            },
            min_stake_amount: 2000,
            slashing_percentage: 15,
            reward_percentage: 10,
            decay_enabled: false,
            recovery_enabled: true,
            recovery_period: 60 * 24 * 60 * 60,
        };

        client.update_config(&new_config);

        let updated_config = client.get_config();
        assert_eq!(updated_config.weights.accuracy_weight, 40);
        assert_eq!(updated_config.min_stake_amount, 2000);
        assert!(!updated_config.decay_enabled);
    }

    #[test]
    #[should_panic(expected = "Weights must sum to 100")]
    fn test_invalid_config_weights() {
        let (_env, client, _admin) = setup();

        // Try to set invalid weights (don't sum to 100)
        let invalid_config = Config {
            weights: ReputationWeights {
                accuracy_weight: 30,
                uptime_weight: 30,
                response_time_weight: 30,
                dispute_history_weight: 30,
            },
            ..Config::default()
        };

        client.update_config(&invalid_config);
    }

    #[test]
    #[should_panic(expected = "Stake amount below minimum requirement")]
    fn test_min_stake_validation() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        // Try to register with stake below minimum
        client.register_entity(&entity, &EntityType::BridgeOperator, &(100));
    }

    #[test]
    #[should_panic(expected = "Entity already registered")]
    fn test_duplicate_registration() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        client.register_entity(&entity, &EntityType::BridgeOperator, &(10000));
        // Try to register again
        client.register_entity(&entity, &EntityType::OracleNode, &(5000));
    }

    #[test]
    fn test_weighted_reputation_calculation() {
        let (env, client, _admin) = setup();
        let entity = Address::generate(&env);

        // Set custom weights
        let custom_config = Config {
            weights: ReputationWeights {
                accuracy_weight: 40,
                uptime_weight: 30,
                response_time_weight: 20,
                dispute_history_weight: 10,
            },
            ..Config::default()
        };
        client.update_config(&custom_config);

        client.register_entity(&entity, &EntityType::BridgeOperator, &(10000));

        let initial_rep = client.get_reputation(&entity).unwrap();

        // Record performance with known values
        client.record_performance(
            &entity,
            &(10000), // accuracy: 100%
            &(10000), // uptime: 100%
            &(10000), // response_time: 100%
            &(10),    // disputes_won
            &(0),     // disputes_lost
            &(100),
            &(100),
        );

        let reputation = client.get_reputation(&entity).unwrap();

        // With perfect scores, reputation should improve from initial
        assert!(reputation.overall_score > initial_rep.overall_score);

        // Verify factor scores are at least equal to initial (should improve with perfect scores)
        assert!(reputation.factors.accuracy_score >= initial_rep.factors.accuracy_score);
        assert!(reputation.factors.uptime_score >= initial_rep.factors.uptime_score);
        assert!(reputation.factors.response_time_score >= initial_rep.factors.response_time_score);
        assert!(
            reputation.factors.dispute_history_score >= initial_rep.factors.dispute_history_score
        );
    }

    #[test]
    fn test_entity_type_separation() {
        let (env, client, _admin) = setup();
        let bridge_entity = Address::generate(&env);
        let oracle_entity = Address::generate(&env);
        let relay_entity = Address::generate(&env);

        client.register_entity(&bridge_entity, &EntityType::BridgeOperator, &(10000));
        client.register_entity(&oracle_entity, &EntityType::OracleNode, &(10000));
        client.register_entity(&relay_entity, &EntityType::RelayOperator, &(10000));

        // Verify leaderboards are separate
        let bridge_leaderboard = client.get_leaderboard(&EntityType::BridgeOperator, &10);
        let oracle_leaderboard = client.get_leaderboard(&EntityType::OracleNode, &10);
        let relay_leaderboard = client.get_leaderboard(&EntityType::RelayOperator, &10);

        assert_eq!(bridge_leaderboard.len(), 1);
        assert_eq!(oracle_leaderboard.len(), 1);
        assert_eq!(relay_leaderboard.len(), 1);

        // Verify entities are in correct leaderboards
        assert_eq!(
            bridge_leaderboard.get(0).unwrap().entity_address,
            bridge_entity
        );
        assert_eq!(
            oracle_leaderboard.get(0).unwrap().entity_address,
            oracle_entity
        );
        assert_eq!(
            relay_leaderboard.get(0).unwrap().entity_address,
            relay_entity
        );
    }

    // -----------------------------------------------------------------------
    // Inactivity decay and slashing appeals (issue #1251)
    // -----------------------------------------------------------------------

    fn registered(
        env: &Env,
        client: &ReputationSystemContractClient,
        entity_type: EntityType,
    ) -> Address {
        let entity = Address::generate(env);
        client.register_entity(&entity, &entity_type, &10_000);
        entity
    }

    #[test]
    fn test_apply_penalty_keeps_reputation_readable() {
        // Regression: the penalty path wrote the history vector under the
        // reputation key, so the entity's record could no longer be decoded.
        let (env, client, _admin) = setup();
        let entity = registered(&env, &client, EntityType::OracleNode);

        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "downtime"));

        let rep = client
            .get_reputation(&entity)
            .expect("reputation still decodes");
        assert!(rep.is_slashed);
        assert_eq!(rep.current_stake, 9_000);
        assert_eq!(rep.total_penalties, 1_000);
        assert_eq!(client.get_performance_history(&entity).len(), 1);
        let slash = client.get_last_slash(&entity).expect("slash recorded");
        assert_eq!(slash.previous_score, 7_500);
        assert_eq!(slash.penalty_amount, 1_000);
    }

    /// Windows in the ledger-day range outlive the test environment's
    /// persistent-entry TTL, so these tests run the same logic with a short
    /// configured window; the defaults are pinned separately.
    const WINDOW: u32 = 100;

    #[test]
    fn test_inactivity_decay_waits_for_a_full_window() {
        let (env, client, _admin) = setup();
        client.set_inactivity_policy(&WINDOW, &DEFAULT_INACTIVITY_DECAY_BPS);
        env.ledger().set_sequence_number(1_000);
        let entity = registered(&env, &client, EntityType::BridgeOperator);
        assert_eq!(client.get_last_activity_ledger(&entity), Some(1_000));

        env.ledger().set_sequence_number(1_000 + WINDOW - 1);
        assert_eq!(client.apply_inactivity_decay(), 0);
        assert_eq!(client.get_reputation(&entity).unwrap().overall_score, 7_500);

        env.ledger().set_sequence_number(1_000 + WINDOW);
        assert_eq!(client.apply_inactivity_decay(), 1);
        // 5% of 7 500.
        assert_eq!(client.get_reputation(&entity).unwrap().overall_score, 7_125);

        // A second call inside the same window does nothing.
        env.ledger().set_sequence_number(1_000 + WINDOW + 10);
        assert_eq!(client.apply_inactivity_decay(), 0);
        assert_eq!(client.get_reputation(&entity).unwrap().overall_score, 7_125);

        // Another full window of silence compounds one more step.
        env.ledger().set_sequence_number(1_000 + 2 * WINDOW);
        assert_eq!(client.apply_inactivity_decay(), 1);
        assert_eq!(client.get_reputation(&entity).unwrap().overall_score, 6_769);
    }

    #[test]
    fn test_valid_report_resets_the_inactivity_clock() {
        let (env, client, _admin) = setup();
        client.set_inactivity_policy(&WINDOW, &DEFAULT_INACTIVITY_DECAY_BPS);
        env.ledger().set_sequence_number(500);
        let entity = registered(&env, &client, EntityType::RelayOperator);

        env.ledger().set_sequence_number(500 + WINDOW - 10);
        client.record_performance(&entity, &9_000, &9_000, &9_000, &1, &0, &10, &10);
        assert_eq!(
            client.get_last_activity_ledger(&entity),
            Some(500 + WINDOW - 10)
        );
        let score_after_report = client.get_reputation(&entity).unwrap().overall_score;

        env.ledger().set_sequence_number(500 + WINDOW + 5);
        assert_eq!(client.apply_inactivity_decay(), 0);
        assert_eq!(
            client.get_reputation(&entity).unwrap().overall_score,
            score_after_report
        );
    }

    #[test]
    fn test_inactivity_policy_is_configurable_and_bounded() {
        let (env, client, _admin) = setup();
        let default = client.get_inactivity_policy();
        assert_eq!(default.window_ledgers, INACTIVITY_WINDOW_LEDGERS);
        assert_eq!(default.decay_bps, DEFAULT_INACTIVITY_DECAY_BPS);

        env.ledger().set_sequence_number(100);
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.set_inactivity_policy(&10, &2_000);
        env.ledger().set_sequence_number(110);
        assert_eq!(client.apply_inactivity_decay(), 1);
        assert_eq!(client.get_reputation(&entity).unwrap().overall_score, 6_000);
    }

    #[test]
    #[should_panic(expected = "Inactivity decay cannot exceed 100%")]
    fn test_inactivity_policy_rejects_over_100_percent() {
        let (_env, client, _admin) = setup();
        client.set_inactivity_policy(&10, &(REPUTATION_SCALE + 1));
    }

    #[test]
    fn test_appeal_approved_restores_score_stake_and_collateral() {
        let (env, client, _admin) = setup();
        env.ledger().set_sequence_number(2_000);
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "partition"));
        let slashed = client.get_reputation(&entity).unwrap();
        assert!(slashed.is_slashed);
        assert_eq!(slashed.overall_score, 7_400);
        assert_eq!(slashed.current_stake, 9_000);

        client.submit_appeal(&entity, &500, &String::from_str(&env, "network partition"));
        let pending = client.get_appeal(&entity).unwrap();
        assert_eq!(pending.status, AppealStatus::Pending);
        assert_eq!(pending.collateral, 500);
        // Collateral is locked while the appeal is open.
        assert_eq!(client.get_reputation(&entity).unwrap().current_stake, 8_500);

        client.resolve_appeal(&entity, &true);
        let restored = client.get_reputation(&entity).unwrap();
        assert!(!restored.is_slashed);
        assert_eq!(restored.overall_score, 7_500);
        assert_eq!(restored.current_stake, 10_000);
        assert_eq!(restored.total_penalties, 0);
        assert_eq!(
            client.get_appeal(&entity).unwrap().status,
            AppealStatus::Approved
        );
        assert_eq!(client.get_last_slash(&entity), None);
    }

    #[test]
    fn test_appeal_rejected_forfeits_collateral() {
        let (env, client, _admin) = setup();
        let entity = registered(&env, &client, EntityType::BridgeOperator);
        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "missed reports"));
        client.submit_appeal(&entity, &300, &String::from_str(&env, "disagree"));

        client.resolve_appeal(&entity, &false);
        let rep = client.get_reputation(&entity).unwrap();
        assert!(rep.is_slashed);
        assert_eq!(rep.overall_score, 7_400);
        assert_eq!(rep.current_stake, 8_700);
        assert_eq!(
            client.get_appeal(&entity).unwrap().status,
            AppealStatus::Rejected
        );
    }

    #[test]
    #[should_panic(expected = "Entity is not slashed")]
    fn test_appeal_requires_a_slash() {
        let (env, client, _admin) = setup();
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.submit_appeal(&entity, &500, &String::from_str(&env, "nothing happened"));
    }

    #[test]
    #[should_panic(expected = "Appeal collateral below minimum")]
    fn test_appeal_requires_minimum_collateral() {
        let (env, client, _admin) = setup();
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "x"));
        client.submit_appeal(
            &entity,
            &(DEFAULT_MIN_APPEAL_COLLATERAL - 1),
            &String::from_str(&env, "cheap"),
        );
    }

    #[test]
    #[should_panic(expected = "Appeal collateral exceeds current stake")]
    fn test_appeal_cannot_stake_more_than_held() {
        let (env, client, _admin) = setup();
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "x"));
        client.submit_appeal(&entity, &9_001, &String::from_str(&env, "too much"));
    }

    #[test]
    #[should_panic(expected = "Appeal window has closed")]
    fn test_appeal_window_is_enforced() {
        let (env, client, _admin) = setup();
        client.set_appeal_policy(&DEFAULT_MIN_APPEAL_COLLATERAL, &WINDOW);
        env.ledger().set_sequence_number(10);
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "x"));
        env.ledger().set_sequence_number(10 + WINDOW + 1);
        client.submit_appeal(&entity, &500, &String::from_str(&env, "late"));
    }

    #[test]
    fn test_default_windows_are_pinned() {
        assert_eq!(INACTIVITY_WINDOW_LEDGERS, 17_280);
        assert_eq!(APPEAL_WINDOW_LEDGERS, 120_960);
        assert_eq!(DEFAULT_INACTIVITY_DECAY_BPS, 500);
        assert_eq!(DEFAULT_MIN_APPEAL_COLLATERAL, 100);
    }

    #[test]
    #[should_panic(expected = "An appeal is already pending")]
    fn test_one_pending_appeal_per_slash() {
        let (env, client, _admin) = setup();
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "x"));
        client.submit_appeal(&entity, &500, &String::from_str(&env, "first"));
        client.submit_appeal(&entity, &500, &String::from_str(&env, "second"));
    }

    #[test]
    #[should_panic(expected = "Appeal already resolved")]
    fn test_appeal_cannot_be_resolved_twice() {
        let (env, client, _admin) = setup();
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "x"));
        client.submit_appeal(&entity, &500, &String::from_str(&env, "once"));
        client.resolve_appeal(&entity, &false);
        client.resolve_appeal(&entity, &true);
    }

    #[test]
    fn test_appeal_policy_is_configurable() {
        let (env, client, _admin) = setup();
        client.set_appeal_policy(&1_000, &50);
        let policy = client.get_appeal_policy();
        assert_eq!(policy.min_collateral, 1_000);
        assert_eq!(policy.window_ledgers, 50);
        let entity = registered(&env, &client, EntityType::OracleNode);
        client.apply_penalty(&entity, &1_000, &String::from_str(&env, "x"));
        client.submit_appeal(
            &entity,
            &1_000,
            &String::from_str(&env, "meets the new floor"),
        );
        assert_eq!(client.get_appeal(&entity).unwrap().collateral, 1_000);
    }
}
