//! Liquidity Pool Monitor Contract Module
//!
//! Tracks liquidity pool states across Stellar DEXs (SDEX, AMM pools),
//! calculates historical metrics, and provides on-chain analytics for
//! liquidity depth, impermanent loss, and pool performance.
//!
//! ## Features
//! - Ring-buffer based time-series storage for gas-efficient historical data
//! - Time-bucketed snapshots (hourly, daily) for efficient queries
//! - Impermanent loss calculation for LP positions
//! - Volume tracking and fee accumulation analytics
//! - Aggregated statistics: 24h volume, 7d average depth, 30d performance
//! - Event emissions for significant liquidity changes
//! - Cumulative price observations and TWAP with spot/TWAP deviation
//!   screening to filter flash-loan and sandwich spikes
//! - Public read access with permissioned write access
//!
//! ## Supported Asset Pairs (Phase 1)
//! - USDC/XLM, EURC/XLM, PYUSD/XLM, FOBXX/USDC

use soroban_sdk::{contracttype, Env, String, Vec};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of snapshots stored per pool in the ring buffer.
/// At one snapshot per hour, 720 entries ≈ 30 days of data.
pub const MAX_SNAPSHOTS: u32 = 720;

/// Maximum number of daily buckets stored per pool.
/// 90 entries = 90 days of aggregated daily data.
pub const MAX_DAILY_BUCKETS: u32 = 90;

/// Duration constants (in seconds)
pub const HOUR_SECS: u64 = 3_600;
pub const DAY_SECS: u64 = 86_400;
pub const WEEK_SECS: u64 = 604_800;
pub const MONTH_SECS: u64 = 2_592_000; // 30 days

/// Threshold for significant liquidity change events (10% = 1000 basis points)
pub const SIGNIFICANT_CHANGE_BPS: u32 = 1_000;

/// Precision multiplier for fixed-point math (7 decimals like Stellar)
pub const PRECISION: i128 = 10_000_000; // 1e7

/// Capacity of the cumulative price observation ring buffer per pool.
pub const MAX_PRICE_OBSERVATIONS: u32 = 64;

/// Minimum TWAP window: 30 minutes (~360 ledgers at 5s close time).
pub const TWAP_MIN_WINDOW_SECS: u64 = 1_800;

/// Max tolerated spot/TWAP deviation before a reading is treated as a
/// flash-loan or sandwich spike (5% = 500 basis points).
pub const MAX_SPOT_TWAP_DEVIATION_BPS: u32 = 500;

// ---------------------------------------------------------------------------
// Pool types
// ---------------------------------------------------------------------------

/// Represents the type of DEX pool being monitored.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PoolType {
    /// Stellar Decentralized Exchange (order book)
    Sdex,
    /// Automated Market Maker (constant-product)
    Amm,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// A point-in-time snapshot of a liquidity pool's state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolSnapshot {
    /// The identifier for the pool (e.g. "USDC_XLM")
    pub pool_id: String,
    /// Reserve amount of asset A (base asset), scaled by PRECISION
    pub reserve_a: i128,
    /// Reserve amount of asset B (quote asset), scaled by PRECISION
    pub reserve_b: i128,
    /// Total LP shares outstanding
    pub total_shares: i128,
    /// Current price of A in terms of B, scaled by PRECISION
    pub price: i128,
    /// Trading volume since last snapshot, scaled by PRECISION
    pub volume: i128,
    /// Fees collected since last snapshot, scaled by PRECISION
    pub fees_collected: i128,
    /// Pool type (SDEX or AMM)
    pub pool_type: PoolType,
    /// Ledger timestamp when this snapshot was recorded
    pub timestamp: u64,
}

/// Aggregated daily bucket for efficient historical queries.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DailyBucket {
    /// Start-of-day timestamp (UTC midnight)
    pub day_timestamp: u64,
    /// Opening price of the day, scaled by PRECISION
    pub open_price: i128,
    /// Highest price of the day, scaled by PRECISION
    pub high_price: i128,
    /// Lowest price of the day, scaled by PRECISION
    pub low_price: i128,
    /// Closing price of the day, scaled by PRECISION
    pub close_price: i128,
    /// Total trading volume for the day, scaled by PRECISION
    pub total_volume: i128,
    /// Total fees collected for the day, scaled by PRECISION
    pub total_fees: i128,
    /// Average reserve A across snapshots, scaled by PRECISION
    pub avg_reserve_a: i128,
    /// Average reserve B across snapshots, scaled by PRECISION
    pub avg_reserve_b: i128,
    /// Number of snapshots aggregated into this bucket
    pub snapshot_count: u32,
}

/// Computed metrics for a pool over a configurable time window.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolMetrics {
    /// Pool identifier
    pub pool_id: String,
    /// Total trading volume over the window, scaled by PRECISION
    pub total_volume: i128,
    /// Average liquidity depth (geometric mean of reserves), scaled by PRECISION
    pub avg_depth: i128,
    /// Price change (percentage × PRECISION; positive = appreciation)
    pub price_change: i128,
    /// Total fees collected over the window, scaled by PRECISION
    pub total_fees: i128,
    /// Fee APR estimate (annualized, × PRECISION)
    pub fee_apr: i128,
    /// Number of data points in the calculation
    pub data_points: u32,
    /// Window start timestamp
    pub window_start: u64,
    /// Window end timestamp
    pub window_end: u64,
}

/// Result of an impermanent loss calculation for an LP position.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImpermanentLossResult {
    /// Pool identifier
    pub pool_id: String,
    /// IL as a percentage × PRECISION (always non-negative; 0 = no loss)
    pub il_percentage: i128,
    /// Value of LP position now, scaled by PRECISION
    pub current_value: i128,
    /// Value if tokens were simply held, scaled by PRECISION
    pub hodl_value: i128,
    /// Net loss in absolute terms (hodl_value − current_value), can be negative
    pub net_loss: i128,
    /// Entry price at which the position was opened, scaled by PRECISION
    pub entry_price: i128,
    /// Current price, scaled by PRECISION
    pub current_price: i128,
}

/// Liquidity depth information at the current moment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidityDepth {
    /// Pool identifier
    pub pool_id: String,
    /// Reserve A (base asset), scaled by PRECISION
    pub reserve_a: i128,
    /// Reserve B (quote asset), scaled by PRECISION
    pub reserve_b: i128,
    /// Total value locked denominated in asset B, scaled by PRECISION
    pub total_value_locked: i128,
    /// Depth score (0–100, higher = deeper liquidity)
    pub depth_score: u32,
    /// Timestamp of the latest snapshot used
    pub timestamp: u64,
}

/// Ring buffer metadata for a pool's snapshot history.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RingBufferMeta {
    /// Current write index (next slot to write)
    pub head: u32,
    /// Total number of entries written (may exceed capacity; actual count = min(count, capacity))
    pub count: u32,
    /// Maximum capacity of the ring buffer
    pub capacity: u32,
}

/// Ring buffer metadata for daily buckets.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DailyRingMeta {
    pub head: u32,
    pub count: u32,
    pub capacity: u32,
}

/// A cumulative price observation (Uniswap-v2 style accumulator).
///
/// `price_cumulative` is the running sum of `price × seconds_elapsed`, so the
/// TWAP between two observations is `Δcumulative / Δtimestamp`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceObservation {
    pub timestamp: u64,
    pub price_cumulative: i128,
}

/// Accumulator state and ring buffer metadata for price observations.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceAccumulator {
    pub head: u32,
    pub count: u32,
    pub capacity: u32,
    /// Price that has been in effect since `last_timestamp`.
    pub last_price: i128,
    pub last_timestamp: u64,
    /// Cumulative price as of `last_timestamp`.
    pub price_cumulative: i128,
}

/// Time-weighted average price and spot comparison for a pool.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TwapResult {
    pub pool_id: String,
    /// Time-weighted average price over the window, scaled by PRECISION.
    pub twap: i128,
    /// Latest recorded spot price, scaled by PRECISION.
    pub spot_price: i128,
    /// |spot − twap| / twap in basis points.
    pub deviation_bps: i128,
    /// Effective window actually covered, in seconds.
    pub window_secs: u64,
    /// True when the spot deviates from the TWAP beyond the tolerance,
    /// indicating a likely flash-loan / sandwich manipulation.
    pub manipulation_suspected: bool,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

/// Storage keys used by the liquidity pool monitor.
///
/// Keys are designed to minimise storage footprint while enabling efficient
/// lookups by pool ID and index.
#[contracttype]
pub enum LiquidityKey {
    /// Ring buffer metadata for a pool's snapshot history
    PoolRingMeta(String),
    /// Individual snapshot entry: (pool_id, ring_index)
    PoolSnapshot(String, u32),
    /// Daily bucket ring metadata
    DailyRingMeta(String),
    /// Individual daily bucket: (pool_id, ring_index)
    DailyBucket(String, u32),
    /// Set of all registered pool IDs
    RegisteredPools,
    /// Price accumulator + observation ring metadata for a pool
    PriceAccumulator(String),
    /// Individual price observation: (pool_id, ring_index)
    PriceObservation(String, u32),
}

// ---------------------------------------------------------------------------
// Core logic (pure functions operating on Env)
// ---------------------------------------------------------------------------

/// Record a new pool state snapshot.
///
/// Writes the snapshot into the pool's ring buffer, updates (or creates) the
/// relevant daily bucket, and emits events when significant liquidity changes
/// are detected.
///
/// # Panics
/// Caller must have already verified admin authorisation before invoking this.
#[allow(clippy::too_many_arguments)]
pub fn record_pool_state(
    env: &Env,
    pool_id: String,
    reserve_a: i128,
    reserve_b: i128,
    total_shares: i128,
    volume: i128,
    fees: i128,
    pool_type: PoolType,
) {
    let timestamp = env.ledger().timestamp();
    let price = if reserve_a > 0 {
        (reserve_b * PRECISION) / reserve_a
    } else {
        0
    };

    let snapshot = PoolSnapshot {
        pool_id: pool_id.clone(),
        reserve_a,
        reserve_b,
        total_shares,
        price,
        volume,
        fees_collected: fees,
        pool_type,
        timestamp,
    };

    // --- Write to snapshot ring buffer ---
    let mut meta: RingBufferMeta = env
        .storage()
        .persistent()
        .get(&LiquidityKey::PoolRingMeta(pool_id.clone()))
        .unwrap_or(RingBufferMeta {
            head: 0,
            count: 0,
            capacity: MAX_SNAPSHOTS,
        });

    let write_idx = meta.head;
    env.storage().persistent().set(
        &LiquidityKey::PoolSnapshot(pool_id.clone(), write_idx),
        &snapshot,
    );

    meta.head = (meta.head + 1) % meta.capacity;
    meta.count += 1;
    env.storage()
        .persistent()
        .set(&LiquidityKey::PoolRingMeta(pool_id.clone()), &meta);

    // --- Update daily bucket ---
    update_daily_bucket(env, &pool_id, &snapshot);

    // --- Update TWAP accumulator and screen the spot price against it ---
    record_price_observation(env, &pool_id, price, timestamp);
    let spot_suspect = match calculate_twap(env, pool_id.clone(), TWAP_MIN_WINDOW_SECS) {
        Some(twap) => {
            let dev = deviation_bps(price, twap.twap);
            if dev > MAX_SPOT_TWAP_DEVIATION_BPS as i128 {
                env.events().publish(
                    (pool_id.clone(), soroban_sdk::symbol_short!("flash_sus")),
                    (price, twap.twap, dev, timestamp),
                );
                true
            } else {
                false
            }
        }
        None => false,
    };

    // --- Detect significant liquidity changes ---
    // Skipped when the spot price is a suspected flash-loan / sandwich spike so
    // single-transaction distortions do not raise false anomaly alerts.
    if meta.count > 1 && !spot_suspect {
        let prev_idx = if write_idx == 0 {
            meta.capacity - 1
        } else {
            write_idx - 1
        };
        let prev: Option<PoolSnapshot> = env
            .storage()
            .persistent()
            .get(&LiquidityKey::PoolSnapshot(pool_id.clone(), prev_idx));

        if let Some(prev_snap) = prev {
            check_significant_change(env, &prev_snap, &snapshot);
        }
    }

    // --- Ensure pool is registered ---
    ensure_pool_registered(env, &pool_id);

    // Emit a standard snapshot event
    env.events()
        .publish((pool_id, soroban_sdk::symbol_short!("snapshot")), timestamp);
}

/// Calculate aggregated pool metrics over a specified time window.
///
/// Scans the ring buffer for snapshots within `[now − window_secs, now]` and
/// computes volume, average depth, price change, fees, and an annualised fee APR.
pub fn calculate_pool_metrics(env: &Env, pool_id: String, window_secs: u64) -> PoolMetrics {
    let now = env.ledger().timestamp();
    let window_start = now.saturating_sub(window_secs);

    let snapshots = get_snapshots_in_window(env, &pool_id, window_start, now);

    let data_points = snapshots.len();
    if data_points == 0 {
        return PoolMetrics {
            pool_id,
            total_volume: 0,
            avg_depth: 0,
            price_change: 0,
            total_fees: 0,
            fee_apr: 0,
            data_points: 0,
            window_start,
            window_end: now,
        };
    }

    let mut total_volume: i128 = 0;
    let mut total_fees: i128 = 0;
    let mut depth_sum: i128 = 0;

    for i in 0..data_points {
        let snap = snapshots.get(i).unwrap();
        total_volume += snap.volume;
        total_fees += snap.fees_collected;
        // depth ≈ sqrt(reserve_a * reserve_b) approximated as (a + b) / 2
        depth_sum += (snap.reserve_a + snap.reserve_b) / 2;
    }

    let avg_depth = depth_sum / data_points as i128;

    let first = snapshots.get(0).unwrap();
    let last = snapshots.get(data_points - 1).unwrap();

    let price_change = if first.price > 0 {
        ((last.price - first.price) * PRECISION) / first.price
    } else {
        0
    };

    // Annualised fee APR: (total_fees / avg_depth) * (365 days / window days)
    let fee_apr = if avg_depth > 0 && window_secs > 0 {
        let year_secs: i128 = 365 * DAY_SECS as i128;
        (total_fees * PRECISION * year_secs) / (avg_depth * window_secs as i128)
    } else {
        0
    };

    PoolMetrics {
        pool_id,
        total_volume,
        avg_depth,
        price_change,
        total_fees,
        fee_apr,
        data_points,
        window_start,
        window_end: now,
    }
}

/// Retrieve historical pool snapshots within a time range.
///
/// Returns a `Vec<PoolSnapshot>` ordered oldest-first.
pub fn get_pool_history(
    env: &Env,
    pool_id: String,
    from_timestamp: u64,
    to_timestamp: u64,
) -> Vec<PoolSnapshot> {
    get_snapshots_in_window(env, &pool_id, from_timestamp, to_timestamp)
}

/// Calculate impermanent loss for a position entered at `entry_price`.
///
/// Uses the standard IL formula:
/// ```text
/// IL = 2 * sqrt(price_ratio) / (1 + price_ratio) − 1
/// ```
/// We approximate `sqrt` via the integer Newton's method (Babylonian).
pub fn calculate_impermanent_loss(
    env: &Env,
    pool_id: String,
    entry_price: i128,
    initial_value: i128,
) -> ImpermanentLossResult {
    let latest = get_latest_snapshot(env, &pool_id);
    let current_price = match latest {
        Some(ref s) => s.price,
        None => 0,
    };

    if entry_price <= 0 || current_price <= 0 {
        return ImpermanentLossResult {
            pool_id,
            il_percentage: 0,
            current_value: initial_value,
            hodl_value: initial_value,
            net_loss: 0,
            entry_price,
            current_price,
        };
    }

    // price_ratio = current_price / entry_price  (scaled by PRECISION)
    let price_ratio = (current_price * PRECISION) / entry_price;

    // sqrt(price_ratio) scaled by PRECISION
    let sqrt_ratio = isqrt(price_ratio * PRECISION); // sqrt(x * P) when x is already scaled by P

    // IL = 2 * sqrt(r) / (1 + r) − 1  (all in PRECISION units)
    let numerator = 2 * sqrt_ratio;
    let denominator = PRECISION + price_ratio;

    let il_factor = if denominator > 0 {
        PRECISION - (numerator * PRECISION) / denominator
    } else {
        0
    };

    // Ensure non-negative
    let il_percentage = if il_factor > 0 { il_factor } else { 0 };

    // hodl_value: half stayed asset A (appreciated by price_ratio), half stayed asset B
    let hodl_value = (initial_value * (PRECISION + price_ratio)) / (2 * PRECISION);

    // LP value: initial_value adjusted by IL
    let current_value = (hodl_value * (PRECISION - il_percentage)) / PRECISION;

    let net_loss = hodl_value - current_value;

    ImpermanentLossResult {
        pool_id,
        il_percentage,
        current_value,
        hodl_value,
        net_loss,
        entry_price,
        current_price,
    }
}

/// Get current liquidity depth information for a pool.
///
/// Computes a depth score (0–100) based on reserve sizes relative to a
/// baseline of 1 000 000 units (scaled by PRECISION).
pub fn get_liquidity_depth(env: &Env, pool_id: String) -> LiquidityDepth {
    let latest = get_latest_snapshot(env, &pool_id);

    match latest {
        Some(snap) => {
            let total_value_locked = snap.reserve_a * snap.price / PRECISION + snap.reserve_b;

            // depth_score: logarithmic scale capped at 100
            let baseline: i128 = 1_000_000 * PRECISION;
            let score = if total_value_locked >= baseline {
                100u32
            } else if total_value_locked <= 0 {
                0u32
            } else {
                ((total_value_locked * 100) / baseline) as u32
            };

            LiquidityDepth {
                pool_id,
                reserve_a: snap.reserve_a,
                reserve_b: snap.reserve_b,
                total_value_locked,
                depth_score: score,
                timestamp: snap.timestamp,
            }
        }
        None => LiquidityDepth {
            pool_id,
            reserve_a: 0,
            reserve_b: 0,
            total_value_locked: 0,
            depth_score: 0,
            timestamp: 0,
        },
    }
}

/// Get daily aggregated buckets for a pool within a time range.
pub fn get_daily_history(
    env: &Env,
    pool_id: String,
    from_timestamp: u64,
    to_timestamp: u64,
) -> Vec<DailyBucket> {
    let meta: DailyRingMeta = env
        .storage()
        .persistent()
        .get(&LiquidityKey::DailyRingMeta(pool_id.clone()))
        .unwrap_or(DailyRingMeta {
            head: 0,
            count: 0,
            capacity: MAX_DAILY_BUCKETS,
        });

    let actual_count = if meta.count > meta.capacity {
        meta.capacity
    } else {
        meta.count
    };

    let mut result: Vec<DailyBucket> = Vec::new(env);

    if actual_count == 0 {
        return result;
    }

    // Walk the ring buffer from oldest to newest
    let start_idx = if meta.count > meta.capacity {
        meta.head // oldest entry is at head when buffer has wrapped
    } else {
        0
    };

    for i in 0..actual_count {
        let idx = (start_idx + i) % meta.capacity;
        let bucket: Option<DailyBucket> = env
            .storage()
            .persistent()
            .get(&LiquidityKey::DailyBucket(pool_id.clone(), idx));

        if let Some(b) = bucket {
            if b.day_timestamp >= from_timestamp && b.day_timestamp <= to_timestamp {
                result.push_back(b);
            }
        }
    }

    result
}

/// Calculate the time-weighted average price over `window_secs`.
///
/// The window is clamped up to `TWAP_MIN_WINDOW_SECS`. Returns `None` until
/// the pool has an observation at least one full window old, so thin history
/// cannot be used to derive a manipulable average.
pub fn calculate_twap(env: &Env, pool_id: String, window_secs: u64) -> Option<TwapResult> {
    let acc: PriceAccumulator = env
        .storage()
        .persistent()
        .get(&LiquidityKey::PriceAccumulator(pool_id.clone()))?;
    if acc.count == 0 {
        return None;
    }

    let window = if window_secs < TWAP_MIN_WINDOW_SECS {
        TWAP_MIN_WINDOW_SECS
    } else {
        window_secs
    };
    let now = env.ledger().timestamp();
    let target = now.checked_sub(window)?;

    // Newest observation at or before the window start.
    let actual_count = if acc.count > acc.capacity {
        acc.capacity
    } else {
        acc.count
    };
    let mut anchor: Option<PriceObservation> = None;
    for i in 0..actual_count {
        let idx = (acc.head + acc.capacity - 1 - i) % acc.capacity;
        let obs: Option<PriceObservation> = env
            .storage()
            .persistent()
            .get(&LiquidityKey::PriceObservation(pool_id.clone(), idx));
        if let Some(o) = obs {
            if o.timestamp <= target {
                anchor = Some(o);
                break;
            }
        }
    }
    let anchor = anchor?;

    let cumulative_now = current_cumulative(&acc, now);
    let elapsed = now - anchor.timestamp;
    if elapsed == 0 {
        return None;
    }
    let twap = (cumulative_now - anchor.price_cumulative) / elapsed as i128;
    let deviation_bps = deviation_bps(acc.last_price, twap);

    Some(TwapResult {
        pool_id,
        twap,
        spot_price: acc.last_price,
        deviation_bps,
        window_secs: elapsed,
        manipulation_suspected: deviation_bps > MAX_SPOT_TWAP_DEVIATION_BPS as i128,
    })
}

/// Returns true if the latest spot price deviates from the minimum-window TWAP
/// by more than `MAX_SPOT_TWAP_DEVIATION_BPS`. Pools without enough history
/// are not flagged.
pub fn is_price_manipulated(env: &Env, pool_id: String) -> bool {
    match calculate_twap(env, pool_id, TWAP_MIN_WINDOW_SECS) {
        Some(r) => r.manipulation_suspected,
        None => false,
    }
}

/// Get all registered pool IDs.
pub fn get_registered_pools(env: &Env) -> Vec<String> {
    env.storage()
        .persistent()
        .get(&LiquidityKey::RegisteredPools)
        .unwrap_or(Vec::new(env))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Retrieve the most recent snapshot for a pool (if any).
fn get_latest_snapshot(env: &Env, pool_id: &String) -> Option<PoolSnapshot> {
    let meta: Option<RingBufferMeta> = env
        .storage()
        .persistent()
        .get(&LiquidityKey::PoolRingMeta(pool_id.clone()));

    match meta {
        Some(m) if m.count > 0 => {
            let latest_idx = if m.head == 0 {
                m.capacity - 1
            } else {
                m.head - 1
            };
            env.storage()
                .persistent()
                .get(&LiquidityKey::PoolSnapshot(pool_id.clone(), latest_idx))
        }
        _ => None,
    }
}

/// Collect all snapshots in a time window, ordered oldest-first.
fn get_snapshots_in_window(env: &Env, pool_id: &String, from: u64, to: u64) -> Vec<PoolSnapshot> {
    let meta: RingBufferMeta = env
        .storage()
        .persistent()
        .get(&LiquidityKey::PoolRingMeta(pool_id.clone()))
        .unwrap_or(RingBufferMeta {
            head: 0,
            count: 0,
            capacity: MAX_SNAPSHOTS,
        });

    let actual_count = if meta.count > meta.capacity {
        meta.capacity
    } else {
        meta.count
    };

    let mut result: Vec<PoolSnapshot> = Vec::new(env);

    if actual_count == 0 {
        return result;
    }

    // Walk from oldest to newest
    let start_idx = if meta.count > meta.capacity {
        meta.head
    } else {
        0
    };

    for i in 0..actual_count {
        let idx = (start_idx + i) % meta.capacity;
        let snap: Option<PoolSnapshot> = env
            .storage()
            .persistent()
            .get(&LiquidityKey::PoolSnapshot(pool_id.clone(), idx));

        if let Some(s) = snap {
            if s.timestamp >= from && s.timestamp <= to {
                result.push_back(s);
            }
        }
    }

    result
}

/// Cumulative price extrapolated to `now` using the price in effect since the
/// last observation.
fn current_cumulative(acc: &PriceAccumulator, now: u64) -> i128 {
    let dt = now.saturating_sub(acc.last_timestamp) as i128;
    acc.price_cumulative + acc.last_price * dt
}

fn deviation_bps(spot: i128, reference: i128) -> i128 {
    if reference <= 0 {
        return 0;
    }
    ((spot - reference).abs() * 10_000) / reference
}

/// Advance the cumulative price accumulator and append an observation.
///
/// Only the first price recorded in a given ledger timestamp is accepted into
/// the accumulator: later same-timestamp updates carry zero time weight, so a
/// sandwich executed within a single ledger cannot move the TWAP.
fn record_price_observation(env: &Env, pool_id: &String, price: i128, timestamp: u64) {
    let key = LiquidityKey::PriceAccumulator(pool_id.clone());
    let existing: Option<PriceAccumulator> = env.storage().persistent().get(&key);

    let mut acc = match existing {
        Some(a) => {
            if timestamp <= a.last_timestamp {
                return;
            }
            a
        }
        None => PriceAccumulator {
            head: 0,
            count: 0,
            capacity: MAX_PRICE_OBSERVATIONS,
            last_price: price,
            last_timestamp: timestamp,
            price_cumulative: 0,
        },
    };

    acc.price_cumulative = current_cumulative(&acc, timestamp);
    acc.last_price = price;
    acc.last_timestamp = timestamp;

    let observation = PriceObservation {
        timestamp,
        price_cumulative: acc.price_cumulative,
    };
    env.storage().persistent().set(
        &LiquidityKey::PriceObservation(pool_id.clone(), acc.head),
        &observation,
    );
    acc.head = (acc.head + 1) % acc.capacity;
    acc.count += 1;
    env.storage().persistent().set(&key, &acc);
}

/// Update (or create) the daily bucket for the day containing this snapshot.
fn update_daily_bucket(env: &Env, pool_id: &String, snapshot: &PoolSnapshot) {
    let day_ts = (snapshot.timestamp / DAY_SECS) * DAY_SECS;

    let mut meta: DailyRingMeta = env
        .storage()
        .persistent()
        .get(&LiquidityKey::DailyRingMeta(pool_id.clone()))
        .unwrap_or(DailyRingMeta {
            head: 0,
            count: 0,
            capacity: MAX_DAILY_BUCKETS,
        });

    // Check if the most recent bucket covers the same day
    let existing_idx = if meta.count > 0 {
        let last_idx = if meta.head == 0 {
            meta.capacity - 1
        } else {
            meta.head - 1
        };
        let existing: Option<DailyBucket> = env
            .storage()
            .persistent()
            .get(&LiquidityKey::DailyBucket(pool_id.clone(), last_idx));

        match existing {
            Some(ref b) if b.day_timestamp == day_ts => Some((last_idx, b.clone())),
            _ => None,
        }
    } else {
        None
    };

    match existing_idx {
        Some((idx, mut bucket)) => {
            // Update existing bucket for today
            if snapshot.price > bucket.high_price {
                bucket.high_price = snapshot.price;
            }
            if snapshot.price < bucket.low_price {
                bucket.low_price = snapshot.price;
            }
            bucket.close_price = snapshot.price;
            bucket.total_volume += snapshot.volume;
            bucket.total_fees += snapshot.fees_collected;
            // Running average of reserves
            let n = bucket.snapshot_count as i128;
            bucket.avg_reserve_a = (bucket.avg_reserve_a * n + snapshot.reserve_a) / (n + 1);
            bucket.avg_reserve_b = (bucket.avg_reserve_b * n + snapshot.reserve_b) / (n + 1);
            bucket.snapshot_count += 1;

            env.storage()
                .persistent()
                .set(&LiquidityKey::DailyBucket(pool_id.clone(), idx), &bucket);
        }
        None => {
            // Create new daily bucket
            let new_bucket = DailyBucket {
                day_timestamp: day_ts,
                open_price: snapshot.price,
                high_price: snapshot.price,
                low_price: snapshot.price,
                close_price: snapshot.price,
                total_volume: snapshot.volume,
                total_fees: snapshot.fees_collected,
                avg_reserve_a: snapshot.reserve_a,
                avg_reserve_b: snapshot.reserve_b,
                snapshot_count: 1,
            };

            let write_idx = meta.head;
            env.storage().persistent().set(
                &LiquidityKey::DailyBucket(pool_id.clone(), write_idx),
                &new_bucket,
            );
            meta.head = (meta.head + 1) % meta.capacity;
            meta.count += 1;
            env.storage()
                .persistent()
                .set(&LiquidityKey::DailyRingMeta(pool_id.clone()), &meta);
        }
    }
}

/// Emit an event if the liquidity change exceeds `SIGNIFICANT_CHANGE_BPS`.
fn check_significant_change(env: &Env, prev: &PoolSnapshot, curr: &PoolSnapshot) {
    let prev_depth = prev.reserve_a + prev.reserve_b;
    if prev_depth == 0 {
        return;
    }
    let curr_depth = curr.reserve_a + curr.reserve_b;
    let change_bps = ((curr_depth - prev_depth).abs() * 10_000) / prev_depth;

    if change_bps >= SIGNIFICANT_CHANGE_BPS as i128 {
        env.events().publish(
            (curr.pool_id.clone(), soroban_sdk::symbol_short!("liq_chg")),
            (change_bps, curr.timestamp),
        );
    }
}

/// Ensure the pool ID is in the registered-pools list.
fn ensure_pool_registered(env: &Env, pool_id: &String) {
    let mut pools: Vec<String> = env
        .storage()
        .persistent()
        .get(&LiquidityKey::RegisteredPools)
        .unwrap_or(Vec::new(env));

    // Linear scan (acceptable for small pool count in Phase 1)
    let mut found = false;
    for i in 0..pools.len() {
        if pools.get(i).unwrap() == pool_id.clone() {
            found = true;
            break;
        }
    }

    if !found {
        pools.push_back(pool_id.clone());
        env.storage()
            .persistent()
            .set(&LiquidityKey::RegisteredPools, &pools);
    }
}

/// Integer square root via Newton's method (Babylonian).
///
/// Returns `floor(sqrt(n))` for `n >= 0`.
/// Used for impermanent loss calculation to avoid floating-point.
fn isqrt(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    if n == 1 {
        return 1;
    }

    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Ledger as _, Env, String};

    fn setup() -> Env {
        let env = Env::default();
        env.mock_all_auths();
        env
    }

    // ── Math utility tests ─────────────────────────────────────────────────

    #[test]
    fn test_isqrt_values() {
        assert_eq!(isqrt(0), 0);
        assert_eq!(isqrt(1), 1);
        assert_eq!(isqrt(4), 2);
        assert_eq!(isqrt(9), 3);
        assert_eq!(isqrt(10), 3);
        assert_eq!(isqrt(100), 10);
        assert_eq!(isqrt(100_000_000_000_000), 10_000_000); // sqrt(1e14) = 1e7
    }

    #[test]
    fn test_isqrt_precision_scale() {
        let val = PRECISION * PRECISION;
        assert_eq!(isqrt(val), PRECISION);
    }

    // ── Pool state recording tests ─────────────────────────────────────────

    #[test]
    fn test_record_pool_state_creates_snapshot() {
        let env = setup();
        env.ledger().set_timestamp(1000);

        let pool_id = String::from_str(&env, "USDC_XLM");
        let reserve_a = 1_000 * PRECISION;
        let reserve_b = 5_000 * PRECISION;
        let total_shares = 2_236 * PRECISION; // sqrt(1000 * 5000)
        let volume = 100 * PRECISION;
        let fees = 10 * PRECISION;

        record_pool_state(
            &env,
            pool_id.clone(),
            reserve_a,
            reserve_b,
            total_shares,
            volume,
            fees,
            PoolType::Amm,
        );

        let snapshots = get_pool_history(&env, pool_id, 0, 2000);
        assert_eq!(snapshots.len(), 1);

        let snap = snapshots.get(0).unwrap();
        assert_eq!(snap.reserve_a, reserve_a);
        assert_eq!(snap.reserve_b, reserve_b);
        assert_eq!(snap.total_shares, total_shares);
        assert_eq!(snap.volume, volume);
        assert_eq!(snap.fees_collected, fees);
        assert_eq!(snap.pool_type, PoolType::Amm);
    }

    #[test]
    fn test_record_pool_state_calculates_price() {
        let env = setup();
        let pool_id = String::from_str(&env, "EUR_XLM");
        let reserve_a = 100 * PRECISION;
        let reserve_b = 500 * PRECISION; // price = 5

        record_pool_state(
            &env,
            pool_id.clone(),
            reserve_a,
            reserve_b,
            100 * PRECISION,
            0,
            0,
            PoolType::Sdex,
        );

        let snapshots = get_pool_history(&env, pool_id, 0, u64::MAX);
        let snap = snapshots.get(0).unwrap();
        assert_eq!(snap.price, 5 * PRECISION);
    }

    #[test]
    fn test_record_multiple_snapshots() {
        let env = setup();
        let pool_id = String::from_str(&env, "TEST_POOL");

        for i in 0..5 {
            env.ledger().set_timestamp(1000 + i * 3600);
            record_pool_state(
                &env,
                pool_id.clone(),
                (1000 + i * 100) as i128 * PRECISION,
                (5000 + i * 500) as i128 * PRECISION,
                2000 * PRECISION,
                100 * PRECISION,
                10 * PRECISION,
                PoolType::Amm,
            );
        }

        let snapshots = get_pool_history(&env, pool_id.clone(), 0, u64::MAX);
        assert_eq!(snapshots.len(), 5);
    }

    #[test]
    fn test_record_pool_state_registers_pool() {
        let env = setup();
        let pool_id = String::from_str(&env, "NEW_POOL");

        record_pool_state(
            &env,
            pool_id.clone(),
            1000 * PRECISION,
            5000 * PRECISION,
            2000 * PRECISION,
            0,
            0,
            PoolType::Amm,
        );

        let pools = get_registered_pools(&env);
        assert!(pools.len() >= 1);
        let found = pools.iter().find(|p| p == &pool_id);
        assert!(found.is_some());
    }

    // ── Pool metrics calculation tests ─────────────────────────────────────

    #[test]
    fn test_calculate_pool_metrics_no_snapshots() {
        let env = setup();
        let pool_id = String::from_str(&env, "EMPTY_POOL");

        let metrics = calculate_pool_metrics(&env, pool_id, 3600);
        assert_eq!(metrics.total_volume, 0);
        assert_eq!(metrics.avg_depth, 0);
        assert_eq!(metrics.total_fees, 0);
        assert_eq!(metrics.data_points, 0);
    }

    #[test]
    fn test_calculate_pool_metrics_single_snapshot() {
        let env = setup();
        env.ledger().set_timestamp(5000);

        let pool_id = String::from_str(&env, "SINGLE_POOL");
        let reserve_a = 1000 * PRECISION;
        let reserve_b = 5000 * PRECISION;
        let volume = 100 * PRECISION;
        let fees = 10 * PRECISION;

        record_pool_state(
            &env,
            pool_id.clone(),
            reserve_a,
            reserve_b,
            2000 * PRECISION,
            volume,
            fees,
            PoolType::Amm,
        );

        let metrics = calculate_pool_metrics(&env, pool_id, 10000);
        assert_eq!(metrics.total_volume, volume);
        assert_eq!(metrics.total_fees, fees);
        assert_eq!(metrics.data_points, 1);
        assert!(metrics.avg_depth > 0);
    }

    #[test]
    fn test_calculate_pool_metrics_window_filtering() {
        let env = setup();
        let pool_id = String::from_str(&env, "WINDOW_POOL");

        // Record snapshot at t=1000
        env.ledger().set_timestamp(1000);
        record_pool_state(
            &env,
            pool_id.clone(),
            1000 * PRECISION,
            5000 * PRECISION,
            2000 * PRECISION,
            100 * PRECISION,
            10 * PRECISION,
            PoolType::Amm,
        );

        // Record snapshot at t=5000
        env.ledger().set_timestamp(5000);
        record_pool_state(
            &env,
            pool_id.clone(),
            1200 * PRECISION,
            6000 * PRECISION,
            2400 * PRECISION,
            150 * PRECISION,
            15 * PRECISION,
            PoolType::Amm,
        );

        // Query with narrow window (1000-2000) should return 1 snapshot
        let metrics_narrow = calculate_pool_metrics(&env, pool_id.clone(), 1000);
        assert_eq!(metrics_narrow.data_points, 1);

        // Query with wide window should return 2 snapshots
        let metrics_wide = calculate_pool_metrics(&env, pool_id, 10000);
        assert_eq!(metrics_wide.data_points, 2);
    }

    #[test]
    fn test_calculate_pool_metrics_accumulates_volume_and_fees() {
        let env = setup();
        env.ledger().set_timestamp(1000);

        let pool_id = String::from_str(&env, "ACCUM_POOL");

        record_pool_state(
            &env,
            pool_id.clone(),
            1000 * PRECISION,
            5000 * PRECISION,
            2000 * PRECISION,
            100 * PRECISION,
            10 * PRECISION,
            PoolType::Amm,
        );

        env.ledger().set_timestamp(2000);
        record_pool_state(
            &env,
            pool_id.clone(),
            1100 * PRECISION,
            5500 * PRECISION,
            2200 * PRECISION,
            50 * PRECISION,
            5 * PRECISION,
            PoolType::Amm,
        );

        let metrics = calculate_pool_metrics(&env, pool_id, 10000);
        assert_eq!(metrics.total_volume, 150 * PRECISION);
        assert_eq!(metrics.total_fees, 15 * PRECISION);
    }

    // ── Liquidity depth tests ──────────────────────────────────────────────

    #[test]
    fn test_get_liquidity_depth_no_snapshots() {
        let env = setup();
        let pool_id = String::from_str(&env, "EMPTY");
        let depth = get_liquidity_depth(&env, pool_id);
        assert_eq!(depth.depth_score, 0);
    }

    #[test]
    fn test_get_liquidity_depth_single_snapshot() {
        let env = setup();
        env.ledger().set_timestamp(1000);

        let pool_id = String::from_str(&env, "DEPTH_POOL");
        let reserve_a = 1000 * PRECISION;
        let reserve_b = 5000 * PRECISION;

        record_pool_state(
            &env,
            pool_id.clone(),
            reserve_a,
            reserve_b,
            2000 * PRECISION,
            0,
            0,
            PoolType::Amm,
        );

        let depth = get_liquidity_depth(&env, pool_id);
        let avg = ((reserve_a + reserve_b) / 2) as u32;
        assert_eq!(depth.depth_score, avg);

    }

    // ── Impermanent loss tests ─────────────────────────────────────────────

    #[test]
    fn test_calculate_impermanent_loss_no_price_change() {
        let env = setup();
        let pool_id = String::from_str(&env, "IL_POOL");
        let entry_price = 5 * PRECISION;
        let initial_value = 10_000 * PRECISION;

        env.ledger().set_timestamp(1000);
        record_pool_state(
            &env,
            pool_id.clone(),
            1000 * PRECISION,
            5000 * PRECISION,
            2000 * PRECISION,
            0,
            0,
            PoolType::Amm,
        );

        let result = calculate_impermanent_loss(&env, pool_id, entry_price, initial_value);
        assert_eq!(result.entry_price, entry_price);
        assert_eq!(result.current_value, initial_value);
        assert_eq!(result.net_loss, 0);
    }

    #[test]
    fn test_calculate_impermanent_loss_with_price_change() {
        let env = setup();
        let pool_id = String::from_str(&env, "IL_CHANGE_POOL");
        let entry_price = 5 * PRECISION;
        let initial_value = 10_000 * PRECISION;

        env.ledger().set_timestamp(1000);
        // Price at entry: reserve_b / reserve_a = 5000 / 1000 = 5
        record_pool_state(
            &env,
            pool_id.clone(),
            1000 * PRECISION,
            5000 * PRECISION,
            2000 * PRECISION,
            0,
            0,
            PoolType::Amm,
        );

        env.ledger().set_timestamp(2000);
        // Price changes to: 6000 / 1000 = 6
        record_pool_state(
            &env,
            pool_id.clone(),
            1000 * PRECISION,
            6000 * PRECISION,
            2400 * PRECISION,
            0,
            0,
            PoolType::Amm,
        );

        let result = calculate_impermanent_loss(&env, pool_id, entry_price, initial_value);
        assert!(result.il_percentage >= 0);
    }

    #[test]
    fn test_calculate_impermanent_loss_invalid_prices() {
        let env = setup();
        let pool_id = String::from_str(&env, "INVALID_POOL");
        let initial_value = 10_000 * PRECISION;

        let result = calculate_impermanent_loss(&env, pool_id, 0, initial_value);
        assert_eq!(result.il_percentage, 0);
        assert_eq!(result.current_value, initial_value);
    }

    // ── Daily bucket aggregation tests ─────────────────────────────────────

    #[test]
    fn test_get_daily_history() {
        let env = setup();
        let pool_id = String::from_str(&env, "DAILY_POOL");

        // Record snapshots in same day
        env.ledger().set_timestamp(86400); // 1 day in seconds
        record_pool_state(
            &env,
            pool_id.clone(),
            1000 * PRECISION,
            5000 * PRECISION,
            2000 * PRECISION,
            100 * PRECISION,
            10 * PRECISION,
            PoolType::Amm,
        );

        env.ledger().set_timestamp(86400 + 3600); // +1 hour
        record_pool_state(
            &env,
            pool_id.clone(),
            1100 * PRECISION,
            5500 * PRECISION,
            2200 * PRECISION,
            50 * PRECISION,
            5 * PRECISION,
            PoolType::Amm,
        );

        let daily = get_daily_history(&env, pool_id, 0, u64::MAX);
        assert!(daily.len() >= 1);

        let bucket = daily.get(0).unwrap();
        assert_eq!(bucket.total_volume, 150 * PRECISION);
        assert_eq!(bucket.total_fees, 15 * PRECISION);
    }

    // ── Edge cases and error handling ──────────────────────────────────────

    #[test]
    fn test_record_pool_with_zero_reserves() {
        let env = setup();
        let pool_id = String::from_str(&env, "ZERO_RESERVE");

        record_pool_state(
            &env,
            pool_id.clone(),
            0,
            5000 * PRECISION,
            0,
            0,
            0,
            PoolType::Amm,
        );

        let snapshots = get_pool_history(&env, pool_id, 0, u64::MAX);
        assert_eq!(snapshots.len(), 1);
        assert_eq!(snapshots.get(0).unwrap().price, 0); // price undefined when reserve_a = 0
    }

    #[test]
    fn test_record_pool_sdex_type() {
        let env = setup();
        let pool_id = String::from_str(&env, "SDEX_POOL");

        record_pool_state(
            &env,
            pool_id.clone(),
            1000 * PRECISION,
            5000 * PRECISION,
            2000 * PRECISION,
            100 * PRECISION,
            10 * PRECISION,
            PoolType::Sdex,
        );

        let snapshots = get_pool_history(&env, pool_id, 0, u64::MAX);
        assert_eq!(snapshots.get(0).unwrap().pool_type, PoolType::Sdex);
    }

    #[test]
    fn test_get_registered_pools_multiple() {
        let env = setup();

        for name in ["POOL_0", "POOL_1", "POOL_2"] {
            let pool_id = String::from_str(&env, name);
            record_pool_state(
                &env,
                pool_id,
                1000 * PRECISION,
                5000 * PRECISION,
                2000 * PRECISION,
                0,
                0,
                PoolType::Amm,
            );
        }

        let pools = get_registered_pools(&env);
        assert!(pools.len() >= 3);
    }
}
