#![no_std]

pub mod liquidity_pool;
pub mod insurance_pool;

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

use liquidity_pool::{
    DailyBucket, ImpermanentLossResult, LiquidityDepth, PoolMetrics, PoolSnapshot, PoolType,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetHealth {
    pub asset_code: String,
    pub health_score: u32,
    pub liquidity_score: u32,
    pub price_stability_score: u32,
    pub bridge_uptime_score: u32,
    pub timestamp: u64,
}

/// Represents a single entry in a batch health score submission.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HealthScoreBatch {
    pub asset_code: String,
    pub health_score: u32,
    pub liquidity_score: u32,
    pub price_stability_score: u32,
    pub bridge_uptime_score: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceRecord {
    pub asset_code: String,
    pub price: i128,
    pub source: String,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    AssetHealth(String),
    PriceRecord(String),
    MonitoredAssets,
}

#[contract]
pub struct BridgeWatchContract;

#[contractimpl]
impl BridgeWatchContract {
    /// Initialize the contract with an admin address
    pub fn initialize(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        let assets: Vec<String> = Vec::new(&env);
        env.storage().instance().set(&DataKey::MonitoredAssets, &assets);
    }

    /// Submit a health score for a monitored asset (admin only)
    pub fn submit_health(
        env: Env,
        asset_code: String,
        health_score: u32,
        liquidity_score: u32,
        price_stability_score: u32,
        bridge_uptime_score: u32,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let record = AssetHealth {
            asset_code: asset_code.clone(),
            health_score,
            liquidity_score,
            price_stability_score,
            bridge_uptime_score,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::AssetHealth(asset_code), &record);
    }

    /// Submit health scores for multiple assets in a single transaction (admin only).
    ///
    /// Accepts a vector of [`HealthScoreBatch`] records and stores each as an
    /// [`AssetHealth`] entry with a consistent ledger timestamp. A `health_up`
    /// event is emitted for every updated asset. Maximum batch size is 20 records.
    pub fn submit_health_batch(env: Env, records: Vec<HealthScoreBatch>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if records.len() > 20 {
            panic!("batch size exceeds the maximum of 20 records");
        }

        let timestamp = env.ledger().timestamp();

        for item in records.iter() {
            let record = AssetHealth {
                asset_code: item.asset_code.clone(),
                health_score: item.health_score,
                liquidity_score: item.liquidity_score,
                price_stability_score: item.price_stability_score,
                bridge_uptime_score: item.bridge_uptime_score,
                timestamp,
            };

            env.storage()
                .persistent()
                .set(&DataKey::AssetHealth(item.asset_code.clone()), &record);

            env.events().publish(
                (symbol_short!("health_up"), item.asset_code.clone()),
                item.health_score,
            );
        }
    }

    /// Submit a price record for an asset (admin only)
    pub fn submit_price(env: Env, asset_code: String, price: i128, source: String) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let record = PriceRecord {
            asset_code: asset_code.clone(),
            price,
            source,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::PriceRecord(asset_code), &record);
    }

    /// Get the latest health record for an asset
    pub fn get_health(env: Env, asset_code: String) -> Option<AssetHealth> {
        env.storage()
            .persistent()
            .get(&DataKey::AssetHealth(asset_code))
    }

    /// Get the latest price record for an asset
    pub fn get_price(env: Env, asset_code: String) -> Option<PriceRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::PriceRecord(asset_code))
    }

    /// Register a new asset for monitoring (admin only)
    pub fn register_asset(env: Env, asset_code: String) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut assets: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::MonitoredAssets)
            .unwrap();

        assets.push_back(asset_code);
        env.storage()
            .instance()
            .set(&DataKey::MonitoredAssets, &assets);
    }

    /// Get all monitored assets
    pub fn get_monitored_assets(env: Env) -> Vec<String> {
        env.storage()
            .instance()
            .get(&DataKey::MonitoredAssets)
            .unwrap()
    }

    // -----------------------------------------------------------------------
    // Liquidity Pool Monitor
    // -----------------------------------------------------------------------

    /// Record a new liquidity pool state snapshot (admin only).
    ///
    /// Writes the snapshot into a gas-optimised ring buffer, updates the
    /// corresponding daily aggregation bucket, and emits events when
    /// significant liquidity changes are detected.
    pub fn record_pool_state(
        env: Env,
        pool_id: String,
        reserve_a: i128,
        reserve_b: i128,
        total_shares: i128,
        volume: i128,
        fees: i128,
        pool_type: PoolType,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        liquidity_pool::record_pool_state(
            &env,
            pool_id,
            reserve_a,
            reserve_b,
            total_shares,
            volume,
            fees,
            pool_type,
        );
    }

    /// Calculate aggregated pool metrics over a time window.
    ///
    /// Returns volume, average depth, price change, fee APR, etc.
    /// for the specified `window_secs` lookback period.
    pub fn calculate_pool_metrics(
        env: Env,
        pool_id: String,
        window_secs: u64,
    ) -> PoolMetrics {
        liquidity_pool::calculate_pool_metrics(&env, pool_id, window_secs)
    }

    /// Retrieve historical pool snapshots within a time range.
    ///
    /// Public read access — no authorisation required.
    pub fn get_pool_history(
        env: Env,
        pool_id: String,
        from_timestamp: u64,
        to_timestamp: u64,
    ) -> Vec<PoolSnapshot> {
        liquidity_pool::get_pool_history(&env, pool_id, from_timestamp, to_timestamp)
    }

    /// Calculate impermanent loss for an LP position.
    ///
    /// Given the `entry_price` at which a position was opened and its
    /// `initial_value`, returns the current IL percentage, position value,
    /// and HODL comparison value.
    pub fn calculate_impermanent_loss(
        env: Env,
        pool_id: String,
        entry_price: i128,
        initial_value: i128,
    ) -> ImpermanentLossResult {
        liquidity_pool::calculate_impermanent_loss(&env, pool_id, entry_price, initial_value)
    }

    /// Get current liquidity depth information for a pool.
    ///
    /// Returns reserve amounts, total value locked, and a depth score
    /// from 0 to 100.
    pub fn get_liquidity_depth(env: Env, pool_id: String) -> LiquidityDepth {
        liquidity_pool::get_liquidity_depth(&env, pool_id)
    }

    /// Get daily aggregated buckets for a pool within a time range.
    ///
    /// Returns OHLC price data, volume, fees, and average reserves
    /// per day. Public read access.
    pub fn get_daily_history(
        env: Env,
        pool_id: String,
        from_timestamp: u64,
        to_timestamp: u64,
    ) -> Vec<DailyBucket> {
        liquidity_pool::get_daily_history(&env, pool_id, from_timestamp, to_timestamp)
    }

    /// Get all registered liquidity pool IDs.
    pub fn get_registered_pools(env: Env) -> Vec<String> {
        liquidity_pool::get_registered_pools(&env)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger;
    use soroban_sdk::Env;

    /// Helper: set up a fresh contract with an admin, returning (env, client, admin).
    fn setup() -> (Env, BridgeWatchContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeWatchContract);
        let client = BridgeWatchContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    // -----------------------------------------------------------------------
    // Original tests (kept for backwards compatibility)
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeWatchContract);
        let client = BridgeWatchContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let assets = client.get_monitored_assets();
        assert_eq!(assets.len(), 0);
    }

    #[test]
    fn test_register_and_get_assets() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeWatchContract);
        let client = BridgeWatchContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let usdc = String::from_str(&env, "USDC");
        client.register_asset(&usdc);

        let assets = client.get_monitored_assets();
        assert_eq!(assets.len(), 1);
    }

    #[test]
    fn test_submit_and_get_health() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, BridgeWatchContract);
        let client = BridgeWatchContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let usdc = String::from_str(&env, "USDC");
        client.submit_health(&usdc, &85, &90, &80, &85);

        let health = client.get_health(&usdc);
        assert!(health.is_some());
        assert_eq!(health.unwrap().health_score, 85);
    }

    // -----------------------------------------------------------------------
    // Batch health submission tests (issue #21)
    // -----------------------------------------------------------------------

    #[test]
    fn test_submit_health_batch_stores_all_records() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(1_000_000);

        let assets = ["USDC", "EURC", "PYUSD"];
        let mut batch = Vec::new(&env);
        for (i, code) in assets.iter().enumerate() {
            batch.push_back(HealthScoreBatch {
                asset_code: String::from_str(&env, code),
                health_score: 80 + i as u32,
                liquidity_score: 75,
                price_stability_score: 78,
                bridge_uptime_score: 82,
            });
        }

        client.submit_health_batch(&batch);

        for (i, code) in assets.iter().enumerate() {
            let health = client.get_health(&String::from_str(&env, code)).unwrap();
            assert_eq!(health.health_score, 80 + i as u32);
            assert_eq!(health.timestamp, 1_000_000);
        }
    }

    #[test]
    fn test_submit_health_batch_consistent_timestamps() {
        let (env, client, _admin) = setup();
        env.ledger().set_timestamp(5_000_000);

        let mut batch = Vec::new(&env);
        batch.push_back(HealthScoreBatch {
            asset_code: String::from_str(&env, "USDC"),
            health_score: 90,
            liquidity_score: 90,
            price_stability_score: 90,
            bridge_uptime_score: 90,
        });
        batch.push_back(HealthScoreBatch {
            asset_code: String::from_str(&env, "EURC"),
            health_score: 70,
            liquidity_score: 70,
            price_stability_score: 70,
            bridge_uptime_score: 70,
        });

        client.submit_health_batch(&batch);

        let usdc = client.get_health(&String::from_str(&env, "USDC")).unwrap();
        let eurc = client.get_health(&String::from_str(&env, "EURC")).unwrap();
        assert_eq!(usdc.timestamp, eurc.timestamp);
        assert_eq!(usdc.timestamp, 5_000_000);
    }

    #[test]
    #[should_panic]
    fn test_submit_health_batch_exceeds_limit() {
        let (env, client, _admin) = setup();

        let mut batch = Vec::new(&env);
        for _ in 0..21u32 {
            batch.push_back(HealthScoreBatch {
                asset_code: String::from_str(&env, "USDC"),
                health_score: 85,
                liquidity_score: 85,
                price_stability_score: 85,
                bridge_uptime_score: 85,
            });
        }
        client.submit_health_batch(&batch);
    }

    // -----------------------------------------------------------------------
    // Liquidity Pool Monitor tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_record_pool_state_basic() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");

        env.ledger().set_timestamp(1_000_000);

        client.record_pool_state(
            &pool_id,
            &(1_000_000 * liquidity_pool::PRECISION),
            &(5_000_000 * liquidity_pool::PRECISION),
            &(2_000_000 * liquidity_pool::PRECISION),
            &(100_000 * liquidity_pool::PRECISION),
            &(1_000 * liquidity_pool::PRECISION),
            &PoolType::Amm,
        );

        let pools = client.get_registered_pools();
        assert_eq!(pools.len(), 1);
        assert_eq!(pools.get(0).unwrap(), pool_id);
    }

    #[test]
    fn test_record_multiple_pools() {
        let (env, client, _admin) = setup();

        env.ledger().set_timestamp(1_000_000);

        let pool1 = String::from_str(&env, "USDC_XLM");
        let pool2 = String::from_str(&env, "EURC_XLM");
        let pool3 = String::from_str(&env, "PYUSD_XLM");
        let pool4 = String::from_str(&env, "FOBXX_USDC");

        for pool_id in [&pool1, &pool2, &pool3, &pool4] {
            client.record_pool_state(
                pool_id,
                &(1_000_000 * liquidity_pool::PRECISION),
                &(2_000_000 * liquidity_pool::PRECISION),
                &(1_500_000 * liquidity_pool::PRECISION),
                &(50_000 * liquidity_pool::PRECISION),
                &(500 * liquidity_pool::PRECISION),
                &PoolType::Amm,
            );
        }

        let pools = client.get_registered_pools();
        assert_eq!(pools.len(), 4);
    }

    #[test]
    fn test_record_pool_state_does_not_duplicate_registration() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * liquidity_pool::PRECISION),
            &(2_000_000 * liquidity_pool::PRECISION),
            &(1_000_000 * liquidity_pool::PRECISION),
            &(10_000 * liquidity_pool::PRECISION),
            &(100 * liquidity_pool::PRECISION),
            &PoolType::Amm,
        );

        env.ledger().set_timestamp(1_003_600);
        client.record_pool_state(
            &pool_id,
            &(1_100_000 * liquidity_pool::PRECISION),
            &(2_200_000 * liquidity_pool::PRECISION),
            &(1_100_000 * liquidity_pool::PRECISION),
            &(12_000 * liquidity_pool::PRECISION),
            &(120 * liquidity_pool::PRECISION),
            &PoolType::Amm,
        );

        let pools = client.get_registered_pools();
        assert_eq!(pools.len(), 1);
    }

    #[test]
    fn test_get_pool_history() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record 3 snapshots at different timestamps
        for i in 0..3u64 {
            env.ledger().set_timestamp(1_000_000 + i * 3_600);
            client.record_pool_state(
                &pool_id,
                &((1_000_000 + i as i128 * 10_000) * p),
                &((5_000_000 + i as i128 * 50_000) * p),
                &(2_000_000 * p),
                &((100_000 + i as i128 * 1_000) * p),
                &((1_000 + i as i128 * 10) * p),
                &PoolType::Amm,
            );
        }

        // Get all history
        let history = client.get_pool_history(&pool_id, &1_000_000, &1_010_000);
        assert_eq!(history.len(), 3);

        // Get partial range
        let partial = client.get_pool_history(&pool_id, &1_003_600, &1_007_200);
        assert_eq!(partial.len(), 2);
    }

    #[test]
    fn test_get_pool_history_empty() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "NONEXISTENT");

        let history = client.get_pool_history(&pool_id, &0, &9_999_999);
        assert_eq!(history.len(), 0);
    }

    #[test]
    fn test_calculate_pool_metrics_basic() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record snapshots over ~2 hours
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(1_000 * p),
            &PoolType::Amm,
        );

        env.ledger().set_timestamp(1_003_600);
        client.record_pool_state(
            &pool_id,
            &(1_100_000 * p),
            &(5_500_000 * p),
            &(2_100_000 * p),
            &(120_000 * p),
            &(1_200 * p),
            &PoolType::Amm,
        );

        // Calculate metrics over the last 2 hours
        let metrics = client.calculate_pool_metrics(
            &pool_id,
            &(2 * liquidity_pool::HOUR_SECS),
        );

        assert_eq!(metrics.data_points, 2);
        assert_eq!(metrics.total_volume, (100_000 + 120_000) * p);
        assert_eq!(metrics.total_fees, (1_000 + 1_200) * p);
        assert!(metrics.avg_depth > 0);
        assert!(metrics.fee_apr > 0);
    }

    #[test]
    fn test_calculate_pool_metrics_no_data() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");

        let metrics = client.calculate_pool_metrics(
            &pool_id,
            &liquidity_pool::DAY_SECS,
        );

        assert_eq!(metrics.data_points, 0);
        assert_eq!(metrics.total_volume, 0);
        assert_eq!(metrics.avg_depth, 0);
        assert_eq!(metrics.fee_apr, 0);
    }

    #[test]
    fn test_calculate_pool_metrics_price_change() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Price = reserve_b / reserve_a
        // Snapshot 1: price = 5_000_000 / 1_000_000 = 5.0
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Snapshot 2: price = 6_000_000 / 1_000_000 = 6.0 (20% increase)
        env.ledger().set_timestamp(1_003_600);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(6_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let metrics = client.calculate_pool_metrics(&pool_id, &(2 * liquidity_pool::HOUR_SECS));
        // price_change = (6 - 5) / 5 * PRECISION = 0.2 * PRECISION = 2_000_000
        assert_eq!(metrics.price_change, 2_000_000);
    }

    #[test]
    fn test_calculate_impermanent_loss_no_price_change() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record a pool state with price = 5.0
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Entry price == current price → no IL
        let result = client.calculate_impermanent_loss(
            &pool_id,
            &(5 * p), // entry_price = 5.0
            &(10_000 * p),
        );

        // When price hasn't changed, IL should be 0
        assert_eq!(result.il_percentage, 0);
        assert_eq!(result.entry_price, 5 * p);
        assert_eq!(result.current_price, 5 * p);
    }

    #[test]
    fn test_calculate_impermanent_loss_with_price_change() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Current price = 20.0 (reserve_b/reserve_a = 20_000_000/1_000_000)
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(20_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Entry price was 5.0 → 4x price change
        let result = client.calculate_impermanent_loss(
            &pool_id,
            &(5 * p),
            &(10_000 * p),
        );

        // For a 4x price change, IL ≈ 20%
        // IL = 1 - 2*sqrt(4)/(1+4) = 1 - 4/5 = 0.20 = 20%
        assert!(result.il_percentage > 0);
        assert!(result.current_price == 20 * p);
        assert!(result.hodl_value > result.current_value);
        assert!(result.net_loss > 0);

        // IL should be approximately 20% (2_000_000 in PRECISION units)
        // Allow ±1% tolerance due to integer math
        let expected_il = 2_000_000i128; // 20% * PRECISION
        let tolerance = 100_000i128; // 1%
        assert!(
            (result.il_percentage - expected_il).abs() < tolerance,
            "Expected IL ~20% ({}), got {}",
            expected_il,
            result.il_percentage
        );
    }

    #[test]
    fn test_calculate_impermanent_loss_nonexistent_pool() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "NONEXISTENT");
        let p = liquidity_pool::PRECISION;

        let result = client.calculate_impermanent_loss(&pool_id, &(5 * p), &(10_000 * p));

        assert_eq!(result.il_percentage, 0);
        assert_eq!(result.current_value, 10_000 * p);
        assert_eq!(result.hodl_value, 10_000 * p);
    }

    #[test]
    fn test_calculate_impermanent_loss_zero_entry_price() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let result = client.calculate_impermanent_loss(&pool_id, &0, &(10_000 * p));
        assert_eq!(result.il_percentage, 0);
    }

    #[test]
    fn test_get_liquidity_depth_with_data() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(500_000 * p),
            &(2_500_000 * p),
            &(1_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let depth = client.get_liquidity_depth(&pool_id);
        assert_eq!(depth.pool_id, pool_id);
        assert_eq!(depth.reserve_a, 500_000 * p);
        assert_eq!(depth.reserve_b, 2_500_000 * p);
        assert!(depth.total_value_locked > 0);
        assert!(depth.depth_score <= 100);
        assert_eq!(depth.timestamp, 1_000_000);
    }

    #[test]
    fn test_get_liquidity_depth_no_data() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "NONEXISTENT");

        let depth = client.get_liquidity_depth(&pool_id);
        assert_eq!(depth.reserve_a, 0);
        assert_eq!(depth.reserve_b, 0);
        assert_eq!(depth.total_value_locked, 0);
        assert_eq!(depth.depth_score, 0);
    }

    #[test]
    fn test_get_liquidity_depth_high_tvl() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Very large reserves → score should be 100
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(10_000_000 * p),
            &(50_000_000 * p),
            &(20_000_000 * p),
            &(100_000 * p),
            &(1_000 * p),
            &PoolType::Amm,
        );

        let depth = client.get_liquidity_depth(&pool_id);
        assert_eq!(depth.depth_score, 100);
    }

    #[test]
    fn test_sdex_pool_type() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM_SDEX");
        let p = liquidity_pool::PRECISION;

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(50_000 * p),
            &(500 * p),
            &PoolType::Sdex,
        );

        let history = client.get_pool_history(&pool_id, &0, &2_000_000);
        assert_eq!(history.len(), 1);
        assert_eq!(history.get(0).unwrap().pool_type, PoolType::Sdex);
    }

    #[test]
    fn test_daily_bucket_creation() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Day 1, snapshot 1
        let day1_ts = 86_400u64; // start of day 1
        env.ledger().set_timestamp(day1_ts + 100);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(1_000 * p),
            &PoolType::Amm,
        );

        // Day 1, snapshot 2 (higher price)
        env.ledger().set_timestamp(day1_ts + 3_700);
        client.record_pool_state(
            &pool_id,
            &(900_000 * p),
            &(5_400_000 * p),
            &(2_000_000 * p),
            &(110_000 * p),
            &(1_100 * p),
            &PoolType::Amm,
        );

        let buckets = client.get_daily_history(&pool_id, &0, &200_000);
        assert_eq!(buckets.len(), 1);

        let bucket = buckets.get(0).unwrap();
        assert_eq!(bucket.day_timestamp, day1_ts);
        assert_eq!(bucket.snapshot_count, 2);
        assert_eq!(bucket.total_volume, (100_000 + 110_000) * p);
        assert_eq!(bucket.total_fees, (1_000 + 1_100) * p);
    }

    #[test]
    fn test_daily_bucket_multiple_days() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Day 0
        env.ledger().set_timestamp(100);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(50_000 * p),
            &(500 * p),
            &PoolType::Amm,
        );

        // Day 1
        env.ledger().set_timestamp(86_400 + 100);
        client.record_pool_state(
            &pool_id,
            &(1_100_000 * p),
            &(5_500_000 * p),
            &(2_100_000 * p),
            &(60_000 * p),
            &(600 * p),
            &PoolType::Amm,
        );

        // Day 2
        env.ledger().set_timestamp(2 * 86_400 + 100);
        client.record_pool_state(
            &pool_id,
            &(1_200_000 * p),
            &(6_000_000 * p),
            &(2_200_000 * p),
            &(70_000 * p),
            &(700 * p),
            &PoolType::Amm,
        );

        let buckets = client.get_daily_history(&pool_id, &0, &300_000);
        assert_eq!(buckets.len(), 3);
    }

    #[test]
    fn test_daily_history_empty_pool() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "NONEXISTENT");

        let buckets = client.get_daily_history(&pool_id, &0, &999_999);
        assert_eq!(buckets.len(), 0);
    }

    #[test]
    fn test_daily_bucket_ohlc_prices() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        let day_ts = 86_400u64;

        // Snapshot 1: price = 5_000_000 / 1_000_000 = 5.0
        env.ledger().set_timestamp(day_ts + 100);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Snapshot 2: price = 7_000_000 / 1_000_000 = 7.0 (high)
        env.ledger().set_timestamp(day_ts + 3_700);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(7_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Snapshot 3: price = 4_000_000 / 1_000_000 = 4.0 (low, close)
        env.ledger().set_timestamp(day_ts + 7_300);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(4_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let buckets = client.get_daily_history(&pool_id, &0, &200_000);
        assert_eq!(buckets.len(), 1);

        let bucket = buckets.get(0).unwrap();
        assert_eq!(bucket.open_price, 5 * p);
        assert_eq!(bucket.high_price, 7 * p);
        assert_eq!(bucket.low_price, 4 * p);
        assert_eq!(bucket.close_price, 4 * p);
        assert_eq!(bucket.snapshot_count, 3);
    }

    #[test]
    fn test_pool_history_ordering() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        for i in 0..5u64 {
            env.ledger().set_timestamp(1_000_000 + i * 3_600);
            client.record_pool_state(
                &pool_id,
                &((1_000_000 + i as i128 * 10_000) * p),
                &(5_000_000 * p),
                &(2_000_000 * p),
                &(10_000 * p),
                &(100 * p),
                &PoolType::Amm,
            );
        }

        let history = client.get_pool_history(&pool_id, &0, &2_000_000);
        assert_eq!(history.len(), 5);

        // Verify chronological ordering
        for i in 0..(history.len() - 1) {
            let curr = history.get(i).unwrap();
            let next = history.get(i + 1).unwrap();
            assert!(curr.timestamp <= next.timestamp);
        }
    }

    #[test]
    fn test_metrics_24h_window() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record a snapshot at the start
        env.ledger().set_timestamp(0);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(50_000 * p),
            &(500 * p),
            &PoolType::Amm,
        );

        // Record a snapshot 12h later
        env.ledger().set_timestamp(43_200);
        client.record_pool_state(
            &pool_id,
            &(1_050_000 * p),
            &(5_250_000 * p),
            &(2_050_000 * p),
            &(55_000 * p),
            &(550 * p),
            &PoolType::Amm,
        );

        // Now calculate 24h metrics
        let metrics = client.calculate_pool_metrics(&pool_id, &liquidity_pool::DAY_SECS);
        assert_eq!(metrics.data_points, 2);
        assert!(metrics.total_volume > 0);
    }

    #[test]
    fn test_metrics_7d_window() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record snapshots across 7 days
        for day in 0..7u64 {
            env.ledger().set_timestamp(day * liquidity_pool::DAY_SECS + 100);
            client.record_pool_state(
                &pool_id,
                &((1_000_000 + day as i128 * 10_000) * p),
                &((5_000_000 + day as i128 * 50_000) * p),
                &(2_000_000 * p),
                &((50_000 + day as i128 * 5_000) * p),
                &((500 + day as i128 * 50) * p),
                &PoolType::Amm,
            );
        }

        let metrics = client.calculate_pool_metrics(&pool_id, &liquidity_pool::WEEK_SECS);
        assert_eq!(metrics.data_points, 7);
        assert!(metrics.avg_depth > 0);
    }

    #[test]
    fn test_impermanent_loss_small_price_change() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Current price = 5.5 (10% increase from 5.0)
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_500_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let result = client.calculate_impermanent_loss(
            &pool_id,
            &(5 * p), // entry at 5.0
            &(10_000 * p),
        );

        // For 10% price change (ratio = 1.1), IL is very small (~0.023%)
        assert!(result.il_percentage >= 0);
        assert!(result.il_percentage < 500_000); // < 5%
    }

    #[test]
    fn test_multiple_pool_types_metrics() {
        let (env, client, _admin) = setup();
        let p = liquidity_pool::PRECISION;

        let amm_pool = String::from_str(&env, "USDC_XLM_AMM");
        let sdex_pool = String::from_str(&env, "USDC_XLM_SDEX");

        env.ledger().set_timestamp(1_000_000);

        client.record_pool_state(
            &amm_pool,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(1_000 * p),
            &PoolType::Amm,
        );

        client.record_pool_state(
            &sdex_pool,
            &(800_000 * p),
            &(4_000_000 * p),
            &(1_600_000 * p),
            &(80_000 * p),
            &(800 * p),
            &PoolType::Sdex,
        );

        let amm_depth = client.get_liquidity_depth(&amm_pool);
        let sdex_depth = client.get_liquidity_depth(&sdex_pool);

        assert!(amm_depth.total_value_locked > sdex_depth.total_value_locked);
    }

    #[test]
    fn test_zero_reserves_handling() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "EMPTY_POOL");
        let _p = liquidity_pool::PRECISION;

        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &0,
            &0,
            &0,
            &0,
            &0,
            &PoolType::Amm,
        );

        let depth = client.get_liquidity_depth(&pool_id);
        assert_eq!(depth.depth_score, 0);
        assert_eq!(depth.total_value_locked, 0);

        let metrics = client.calculate_pool_metrics(&pool_id, &liquidity_pool::DAY_SECS);
        assert_eq!(metrics.total_volume, 0);
    }

    #[test]
    fn test_phase1_asset_pairs() {
        let (env, client, _admin) = setup();
        let p = liquidity_pool::PRECISION;

        let pairs = [
            "USDC_XLM",
            "EURC_XLM",
            "PYUSD_XLM",
            "FOBXX_USDC",
        ];

        env.ledger().set_timestamp(1_000_000);

        for pair_str in pairs.iter() {
            let pool_id = String::from_str(&env, pair_str);
            client.record_pool_state(
                &pool_id,
                &(1_000_000 * p),
                &(5_000_000 * p),
                &(2_000_000 * p),
                &(50_000 * p),
                &(500 * p),
                &PoolType::Amm,
            );
        }

        let pools = client.get_registered_pools();
        assert_eq!(pools.len(), 4);

        // Verify all pools have valid depth
        for pair_str in pairs.iter() {
            let pool_id = String::from_str(&env, pair_str);
            let depth = client.get_liquidity_depth(&pool_id);
            assert!(depth.total_value_locked > 0);
        }
    }

    #[test]
    fn test_fee_apr_calculation() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Record two snapshots 1 day apart
        env.ledger().set_timestamp(0);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(10_000 * p), // 10k fees
            &PoolType::Amm,
        );

        env.ledger().set_timestamp(liquidity_pool::DAY_SECS);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(100_000 * p),
            &(10_000 * p), // 10k fees
            &PoolType::Amm,
        );

        let metrics = client.calculate_pool_metrics(&pool_id, &(2 * liquidity_pool::DAY_SECS));
        assert!(metrics.fee_apr > 0, "Fee APR should be positive");
    }

    #[test]
    fn test_snapshot_ring_buffer_wrapping() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // We won't write MAX_SNAPSHOTS entries in a test (too expensive),
        // but we can verify the ring buffer logic with a smaller number.
        let num_snapshots = 10u64;

        for i in 0..num_snapshots {
            env.ledger().set_timestamp(1_000_000 + i * 3_600);
            client.record_pool_state(
                &pool_id,
                &((1_000_000 + i as i128 * 1_000) * p),
                &((5_000_000 + i as i128 * 5_000) * p),
                &(2_000_000 * p),
                &(10_000 * p),
                &(100 * p),
                &PoolType::Amm,
            );
        }

        let history = client.get_pool_history(&pool_id, &0, &2_000_000);
        assert_eq!(history.len(), num_snapshots as u32);
    }

    #[test]
    fn test_get_pool_history_boundary_timestamps() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Exact timestamp matches
        env.ledger().set_timestamp(1_000);
        client.record_pool_state(
            &pool_id,
            &(1_000_000 * p),
            &(5_000_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        env.ledger().set_timestamp(2_000);
        client.record_pool_state(
            &pool_id,
            &(1_100_000 * p),
            &(5_500_000 * p),
            &(2_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        // Exact from=1_000, to=2_000 should include both
        let history = client.get_pool_history(&pool_id, &1_000, &2_000);
        assert_eq!(history.len(), 2);

        // from=1_001 should exclude the first
        let history2 = client.get_pool_history(&pool_id, &1_001, &2_000);
        assert_eq!(history2.len(), 1);

        // to=1_999 should exclude the second
        let history3 = client.get_pool_history(&pool_id, &1_000, &1_999);
        assert_eq!(history3.len(), 1);
    }

    #[test]
    fn test_price_computation_from_reserves() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // reserve_a = 2_000_000, reserve_b = 10_000_000 → price = 5.0
        env.ledger().set_timestamp(1_000_000);
        client.record_pool_state(
            &pool_id,
            &(2_000_000 * p),
            &(10_000_000 * p),
            &(4_000_000 * p),
            &(10_000 * p),
            &(100 * p),
            &PoolType::Amm,
        );

        let history = client.get_pool_history(&pool_id, &0, &2_000_000);
        assert_eq!(history.len(), 1);

        let snap = history.get(0).unwrap();
        // price = (10_000_000 * P * P) / (2_000_000 * P) = 5 * P
        assert_eq!(snap.price, 5 * p);
    }

    #[test]
    fn test_daily_history_range_filter() {
        let (env, client, _admin) = setup();
        let pool_id = String::from_str(&env, "USDC_XLM");
        let p = liquidity_pool::PRECISION;

        // Create buckets for day 0, 1, 2
        for day in 0..3u64 {
            env.ledger().set_timestamp(day * liquidity_pool::DAY_SECS + 100);
            client.record_pool_state(
                &pool_id,
                &(1_000_000 * p),
                &(5_000_000 * p),
                &(2_000_000 * p),
                &(10_000 * p),
                &(100 * p),
                &PoolType::Amm,
            );
        }

        // Query only day 1
        let buckets = client.get_daily_history(
            &pool_id,
            &liquidity_pool::DAY_SECS,
            &(2 * liquidity_pool::DAY_SECS - 1),
        );
        assert_eq!(buckets.len(), 1);
    }
}
