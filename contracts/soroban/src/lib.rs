#![no_std]

pub mod bridge_reserve_verifier;
pub use bridge_reserve_verifier::BridgeReserveVerifier;

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Map, String, Vec};

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
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

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
}
