use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

/// Default upper bound on the age of a consensus price a consumer may read,
/// in seconds (issue #1247). Older aggregates are reported as stale rather
/// than served, so an upstream oracle outage surfaces as an error instead of
/// a silently frozen price.
pub const DEFAULT_MAX_STALENESS_SECS: u64 = 3_600;

/// Delay between proposing a new staleness bound and being able to apply it.
/// The bound is a safety limit for every downstream consumer, so a single
/// key must not be able to widen it in the same transaction it uses it.
pub const STALENESS_TIMELOCK_SECS: u64 = 86_400;

/// Smallest staleness bound that may be configured, so a mis-typed proposal
/// cannot make every price unreadable.
pub const MIN_MAX_STALENESS_SECS: u64 = 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OracleHubError {
    /// The stored aggregate is older than the configured staleness bound.
    PriceStale = 1,
    /// No aggregate has reached quorum for the asset.
    NoAggregate = 2,
    /// The hub has no admin; call `initialize` first.
    NotInitialized = 3,
    AlreadyInitialized = 4,
    Unauthorized = 5,
    /// A staleness change is proposed but its timelock has not elapsed.
    TimelockPending = 6,
    NoPendingChange = 7,
    /// Proposed staleness bound is below `MIN_MAX_STALENESS_SECS`.
    InvalidStaleness = 8,
}

/// A proposed staleness bound waiting out its timelock.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingStalenessChange {
    pub max_staleness_secs: u64,
    pub proposed_at: u64,
    pub effective_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BftOracleNode {
    pub node_address: Address,
    pub stake_weight: u32,
    pub registered_at: u64,
    pub is_active: bool,
    pub is_slashed: bool,
    pub slash_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BftAggregateState {
    pub asset_code: String,
    pub consensus_price: i128,
    pub mean_price: i128,
    pub std_dev: u64,
    pub reporting_count: u32,
    pub valid_count: u32,
    pub required_quorum: u32,
    pub is_valid_quorum: bool,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlashingRecord {
    pub node_address: Address,
    pub asset_code: String,
    pub deviation_sigma_bps: u32,
    pub reason_code: u32,
    pub slashed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleHubKey {
    Node(Address),
    AllNodes,
    AggregateState(String),
    SlashRecord(Address),
    Admin,
    MaxStaleness,
    PendingStaleness,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BftAggregateSubmittedEvent {
    pub asset_code: String,
    pub consensus_price: i128,
    pub valid_count: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NodeSlashedEvent {
    pub node_address: Address,
    pub reason_code: u32,
    pub timestamp: u64,
}

pub fn register_oracle_node(
    env: &Env,
    caller: &Address,
    node_address: &Address,
    stake_weight: u32,
) {
    caller.require_auth();

    let now = env.ledger().timestamp();
    let key = OracleHubKey::Node(node_address.clone());

    let existing: Option<BftOracleNode> = env.storage().persistent().get(&key);
    let node = match existing {
        Some(mut existing_node) => {
            existing_node.is_active = true;
            existing_node.is_slashed = false;
            existing_node.stake_weight = stake_weight;
            existing_node
        }
        None => BftOracleNode {
            node_address: node_address.clone(),
            stake_weight,
            registered_at: now,
            is_active: true,
            is_slashed: false,
            slash_count: 0,
        },
    };

    env.storage().persistent().set(&key, &node);

    let all_key = OracleHubKey::AllNodes;
    let mut all_nodes: Vec<Address> = env
        .storage()
        .persistent()
        .get(&all_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut found = false;
    for addr in all_nodes.iter() {
        if &addr == node_address {
            found = true;
            break;
        }
    }

    if !found {
        all_nodes.push_back(node_address.clone());
        env.storage().persistent().set(&all_key, &all_nodes);
    }
}

pub fn slash_oracle_node(
    env: &Env,
    caller: &Address,
    node_address: &Address,
    asset_code: String,
    deviation_sigma_bps: u32,
    reason_code: u32,
) {
    caller.require_auth();

    let key = OracleHubKey::Node(node_address.clone());
    let mut node: BftOracleNode = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic!("oracle node not registered"));

    let now = env.ledger().timestamp();

    node.is_slashed = true;
    node.is_active = false;
    node.slash_count += 1;

    env.storage().persistent().set(&key, &node);

    let slash_key = OracleHubKey::SlashRecord(node_address.clone());
    let record = SlashingRecord {
        node_address: node_address.clone(),
        asset_code,
        deviation_sigma_bps,
        reason_code,
        slashed_at: now,
    };
    env.storage().persistent().set(&slash_key, &record);

    env.events().publish(
        (symbol_short!("node_slsh"),),
        NodeSlashedEvent {
            node_address: node_address.clone(),
            reason_code,
            timestamp: now,
        },
    );
}

pub fn calculate_required_quorum(total_active_nodes: u32) -> u32 {
    if total_active_nodes == 0 {
        return 0;
    }
    let f = (total_active_nodes.saturating_sub(1)) / 3;
    2 * f + 1
}

pub fn submit_bft_aggregate(
    env: &Env,
    caller: &Address,
    asset_code: String,
    consensus_price: i128,
    mean_price: i128,
    std_dev: u64,
    reporting_nodes: Vec<Address>,
) -> BftAggregateState {
    caller.require_auth();

    let all_key = OracleHubKey::AllNodes;
    let all_nodes: Vec<Address> = env
        .storage()
        .persistent()
        .get(&all_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut total_active: u32 = 0;
    for addr in all_nodes.iter() {
        let node_key = OracleHubKey::Node(addr);
        if let Some(node) = env
            .storage()
            .persistent()
            .get::<_, BftOracleNode>(&node_key)
        {
            if node.is_active && !node.is_slashed {
                total_active += 1;
            }
        }
    }

    let required_quorum = calculate_required_quorum(total_active);

    let mut valid_count: u32 = 0;
    let mut seen_nodes: Vec<Address> = Vec::new(env);

    for addr in reporting_nodes.iter() {
        let mut is_duplicate = false;
        for seen in seen_nodes.iter() {
            if &seen == &addr {
                is_duplicate = true;
                break;
            }
        }
        if is_duplicate {
            continue;
        }
        seen_nodes.push_back(addr.clone());

        let node_key = OracleHubKey::Node(addr);
        if let Some(node) = env
            .storage()
            .persistent()
            .get::<_, BftOracleNode>(&node_key)
        {
            if node.is_active && !node.is_slashed {
                valid_count += 1;
            }
        }
    }

    let is_valid_quorum = valid_count >= required_quorum && required_quorum > 0;
    let now = env.ledger().timestamp();

    let state = BftAggregateState {
        asset_code: asset_code.clone(),
        consensus_price,
        mean_price,
        std_dev,
        reporting_count: reporting_nodes.len(),
        valid_count,
        required_quorum,
        is_valid_quorum,
        timestamp: now,
    };

    if is_valid_quorum {
        let state_key = OracleHubKey::AggregateState(asset_code.clone());
        env.storage().persistent().set(&state_key, &state);

        env.events().publish(
            (symbol_short!("bft_aggr"),),
            BftAggregateSubmittedEvent {
                asset_code,
                consensus_price,
                valid_count,
                timestamp: now,
            },
        );
    }

    state
}

pub fn get_bft_aggregate(env: &Env, asset_code: String) -> Option<BftAggregateState> {
    let key = OracleHubKey::AggregateState(asset_code);
    env.storage().persistent().get(&key)
}

pub fn get_oracle_node(env: &Env, node_address: Address) -> Option<BftOracleNode> {
    let key = OracleHubKey::Node(node_address);
    env.storage().persistent().get(&key)
}

/// Record the admin that may propose staleness changes. One-shot.
pub fn initialize(env: &Env, admin: &Address) -> Result<(), OracleHubError> {
    admin.require_auth();
    if env.storage().instance().has(&OracleHubKey::Admin) {
        return Err(OracleHubError::AlreadyInitialized);
    }
    env.storage().instance().set(&OracleHubKey::Admin, admin);
    Ok(())
}

fn require_admin(env: &Env, caller: &Address) -> Result<(), OracleHubError> {
    caller.require_auth();
    let admin: Address = env
        .storage()
        .instance()
        .get(&OracleHubKey::Admin)
        .ok_or(OracleHubError::NotInitialized)?;
    if *caller != admin {
        return Err(OracleHubError::Unauthorized);
    }
    Ok(())
}

/// The staleness bound consumers are held to: the applied value, or the
/// default when none has been configured.
pub fn get_max_staleness(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&OracleHubKey::MaxStaleness)
        .unwrap_or(DEFAULT_MAX_STALENESS_SECS)
}

/// Propose a new staleness bound. It takes effect only once
/// `apply_max_staleness` is called after `STALENESS_TIMELOCK_SECS`.
pub fn propose_max_staleness(
    env: &Env,
    caller: &Address,
    max_staleness_secs: u64,
) -> Result<PendingStalenessChange, OracleHubError> {
    require_admin(env, caller)?;
    if max_staleness_secs < MIN_MAX_STALENESS_SECS {
        return Err(OracleHubError::InvalidStaleness);
    }
    let now = env.ledger().timestamp();
    let pending = PendingStalenessChange {
        max_staleness_secs,
        proposed_at: now,
        effective_at: now + STALENESS_TIMELOCK_SECS,
    };
    env.storage()
        .instance()
        .set(&OracleHubKey::PendingStaleness, &pending);
    env.events().publish(
        (symbol_short!("stal_prop"),),
        (max_staleness_secs, pending.effective_at),
    );
    Ok(pending)
}

/// Apply the proposed staleness bound once its timelock has elapsed. Any
/// caller may apply it; the delay, not the caller, is the control.
pub fn apply_max_staleness(env: &Env) -> Result<u64, OracleHubError> {
    let pending: PendingStalenessChange = env
        .storage()
        .instance()
        .get(&OracleHubKey::PendingStaleness)
        .ok_or(OracleHubError::NoPendingChange)?;
    if env.ledger().timestamp() < pending.effective_at {
        return Err(OracleHubError::TimelockPending);
    }
    env.storage()
        .instance()
        .set(&OracleHubKey::MaxStaleness, &pending.max_staleness_secs);
    env.storage()
        .instance()
        .remove(&OracleHubKey::PendingStaleness);
    env.events()
        .publish((symbol_short!("stal_set"),), pending.max_staleness_secs);
    Ok(pending.max_staleness_secs)
}

pub fn get_pending_staleness(env: &Env) -> Option<PendingStalenessChange> {
    env.storage()
        .instance()
        .get(&OracleHubKey::PendingStaleness)
}

/// Age of an aggregate in seconds. A timestamp in the future (clock skew
/// between ledgers) counts as age zero rather than underflowing.
pub fn aggregate_age_secs(now: u64, state: &BftAggregateState) -> u64 {
    now.saturating_sub(state.timestamp)
}

/// The consumer-facing read: the quorum aggregate for `asset_code`, or
/// `PriceStale` once it is older than the configured bound. `get_bft_aggregate`
/// stays available for callers that want the raw record regardless of age.
pub fn get_aggregate_state(
    env: &Env,
    asset_code: String,
) -> Result<BftAggregateState, OracleHubError> {
    let state = get_bft_aggregate(env, asset_code).ok_or(OracleHubError::NoAggregate)?;
    if aggregate_age_secs(env.ledger().timestamp(), &state) > get_max_staleness(env) {
        return Err(OracleHubError::PriceStale);
    }
    Ok(state)
}

#[contract]
pub struct OracleHubContract;

#[contractimpl]
impl OracleHubContract {
    pub fn register_oracle_node(
        env: Env,
        caller: Address,
        node_address: Address,
        stake_weight: u32,
    ) {
        register_oracle_node(&env, &caller, &node_address, stake_weight);
    }

    pub fn slash_oracle_node(
        env: Env,
        caller: Address,
        node_address: Address,
        asset_code: String,
        deviation_sigma_bps: u32,
        reason_code: u32,
    ) {
        slash_oracle_node(
            &env,
            &caller,
            &node_address,
            asset_code,
            deviation_sigma_bps,
            reason_code,
        );
    }

    pub fn calculate_required_quorum(total_active_nodes: u32) -> u32 {
        calculate_required_quorum(total_active_nodes)
    }

    pub fn submit_bft_aggregate(
        env: Env,
        caller: Address,
        asset_code: String,
        consensus_price: i128,
        mean_price: i128,
        std_dev: u64,
        reporting_nodes: Vec<Address>,
    ) -> BftAggregateState {
        submit_bft_aggregate(
            &env,
            &caller,
            asset_code,
            consensus_price,
            mean_price,
            std_dev,
            reporting_nodes,
        )
    }

    pub fn get_bft_aggregate(env: Env, asset_code: String) -> Option<BftAggregateState> {
        get_bft_aggregate(&env, asset_code)
    }

    pub fn get_oracle_node(env: Env, node_address: Address) -> Option<BftOracleNode> {
        get_oracle_node(&env, node_address)
    }

    pub fn initialize(env: Env, admin: Address) -> Result<(), OracleHubError> {
        initialize(&env, &admin)
    }

    pub fn get_max_staleness(env: Env) -> u64 {
        get_max_staleness(&env)
    }

    pub fn propose_max_staleness(
        env: Env,
        caller: Address,
        max_staleness_secs: u64,
    ) -> Result<PendingStalenessChange, OracleHubError> {
        propose_max_staleness(&env, &caller, max_staleness_secs)
    }

    pub fn apply_max_staleness(env: Env) -> Result<u64, OracleHubError> {
        apply_max_staleness(&env)
    }

    pub fn get_pending_staleness(env: Env) -> Option<PendingStalenessChange> {
        get_pending_staleness(&env)
    }

    pub fn get_aggregate_state(
        env: Env,
        asset_code: String,
    ) -> Result<BftAggregateState, OracleHubError> {
        get_aggregate_state(&env, asset_code)
    }
}
