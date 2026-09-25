//! # Batch Query Optimization
//!
//! Allow querying multiple assets or bridges in one call to reduce overhead.
//! Provides deterministic output with comprehensive error handling and size limits.

extern crate std;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Env, String, Vec,
};

/// Copy a Soroban string into a std string. This module only compiles for
/// native tests, so std is available.
fn to_std_string(value: &String) -> std::string::String {
    let mut buf = std::vec![0u8; value.len() as usize];
    value.copy_into_slice(&mut buf);
    std::string::String::from_utf8_lossy(&buf).into_owned()
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of items in a single batch query
pub const MAX_BATCH_SIZE: u32 = 50;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum BatchQueryError {
    AlreadyInitialized = 1,
    BatchSizeExceeded = 2,
    EmptyBatch = 3,
    InvalidQuery = 4,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Query result for a single item (success or failure)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum QueryResult {
    /// Successful query with data
    Success(String),
    /// Query failed with error message
    Failure(String),
}

/// Batch query response with deterministic ordering
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchQueryResponse {
    /// Results in the same order as the input queries
    pub results: Vec<QueryResult>,
    /// Total number of successful queries
    pub success_count: u32,
    /// Total number of failed queries
    pub error_count: u32,
    /// Timestamp when the batch was processed
    pub processed_at: u64,
}

/// Asset data returned in batch queries
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetData {
    pub asset_code: String,
    pub name: String,
    pub symbol: String,
    pub issuer: String,
    pub status: String,
}

/// Bridge data returned in batch queries
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BridgeData {
    pub bridge_id: String,
    pub name: String,
    pub source_chain: String,
    pub dest_chain: String,
    pub status: String,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    /// Whether contract is initialized
    Initialized,
    /// Asset data storage
    Asset(String),
    /// Bridge data storage
    Bridge(String),
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct BatchQueryContract;

#[contractimpl]
impl BatchQueryContract {
    /// Initialize the contract
    pub fn initialize(env: Env) -> Result<(), BatchQueryError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(BatchQueryError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Initialized, &true);
        Ok(())
    }

    /// Query multiple assets in a single call
    pub fn batch_query_assets(
        env: Env,
        asset_codes: Vec<String>,
    ) -> Result<BatchQueryResponse, BatchQueryError> {
        Self::validate_batch_size(&asset_codes)?;

        let mut results: Vec<QueryResult> = Vec::new(&env);
        let mut success_count = 0u32;
        let mut error_count = 0u32;

        for i in 0..asset_codes.len() {
            if let Some(asset_code) = asset_codes.get(i) {
                match Self::query_single_asset(&env, &asset_code) {
                    Ok(data) => {
                        let json = Self::serialize_asset_data(&env, &data);
                        results.push_back(QueryResult::Success(json));
                        success_count += 1;
                    }
                    Err(e) => {
                        let error_msg = String::from_str(&env, e);
                        results.push_back(QueryResult::Failure(error_msg));
                        error_count += 1;
                    }
                }
            }
        }

        let response = BatchQueryResponse {
            results,
            success_count,
            error_count,
            processed_at: env.ledger().timestamp(),
        };

        env.events()
            .publish((symbol_short!("bq_asset"), success_count), error_count);

        Ok(response)
    }

    /// Query multiple bridges in a single call
    pub fn batch_query_bridges(
        env: Env,
        bridge_ids: Vec<String>,
    ) -> Result<BatchQueryResponse, BatchQueryError> {
        Self::validate_batch_size(&bridge_ids)?;

        let mut results: Vec<QueryResult> = Vec::new(&env);
        let mut success_count = 0u32;
        let mut error_count = 0u32;

        for i in 0..bridge_ids.len() {
            if let Some(bridge_id) = bridge_ids.get(i) {
                match Self::query_single_bridge(&env, &bridge_id) {
                    Ok(data) => {
                        let json = Self::serialize_bridge_data(&env, &data);
                        results.push_back(QueryResult::Success(json));
                        success_count += 1;
                    }
                    Err(e) => {
                        let error_msg = String::from_str(&env, e);
                        results.push_back(QueryResult::Failure(error_msg));
                        error_count += 1;
                    }
                }
            }
        }

        let response = BatchQueryResponse {
            results,
            success_count,
            error_count,
            processed_at: env.ledger().timestamp(),
        };

        env.events()
            .publish((symbol_short!("bq_brdg"), success_count), error_count);

        Ok(response)
    }

    /// Store mock asset data for testing (would integrate with real registry in production)
    pub fn store_asset(
        env: Env,
        asset_code: String,
        name: String,
        symbol: String,
        issuer: String,
        status: String,
    ) -> Result<(), BatchQueryError> {
        let data = AssetData {
            asset_code: asset_code.clone(),
            name,
            symbol,
            issuer,
            status,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Asset(asset_code), &data);
        Ok(())
    }

    /// Store mock bridge data for testing (would integrate with real registry in production)
    pub fn store_bridge(
        env: Env,
        bridge_id: String,
        name: String,
        source_chain: String,
        dest_chain: String,
        status: String,
    ) -> Result<(), BatchQueryError> {
        let data = BridgeData {
            bridge_id: bridge_id.clone(),
            name,
            source_chain,
            dest_chain,
            status,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Bridge(bridge_id), &data);
        Ok(())
    }

    // =======================================================================
    // Internal helpers
    // =======================================================================

    fn validate_batch_size(items: &Vec<String>) -> Result<(), BatchQueryError> {
        if items.is_empty() {
            return Err(BatchQueryError::EmptyBatch);
        }
        if items.len() > MAX_BATCH_SIZE {
            return Err(BatchQueryError::BatchSizeExceeded);
        }
        Ok(())
    }

    fn query_single_asset(env: &Env, asset_code: &String) -> Result<AssetData, &'static str> {
        env.storage()
            .persistent()
            .get(&DataKey::Asset(asset_code.clone()))
            .ok_or("Asset not found")
    }

    fn query_single_bridge(env: &Env, bridge_id: &String) -> Result<BridgeData, &'static str> {
        env.storage()
            .persistent()
            .get(&DataKey::Bridge(bridge_id.clone()))
            .ok_or("Bridge not found")
    }

    fn serialize_asset_data(env: &Env, data: &AssetData) -> String {
        // Simple JSON-like serialization
        String::from_str(
            env,
            &std::format!(
                "{{\"asset_code\":\"{}\",\"name\":\"{}\",\"symbol\":\"{}\",\"issuer\":\"{}\",\"status\":\"{}\"}}",
                to_std_string(&data.asset_code),
                to_std_string(&data.name),
                to_std_string(&data.symbol),
                to_std_string(&data.issuer),
                to_std_string(&data.status)
            ),
        )
    }

    fn serialize_bridge_data(env: &Env, data: &BridgeData) -> String {
        // Simple JSON-like serialization
        String::from_str(
            env,
            &std::format!(
                "{{\"bridge_id\":\"{}\",\"name\":\"{}\",\"source_chain\":\"{}\",\"dest_chain\":\"{}\",\"status\":\"{}\"}}",
                to_std_string(&data.bridge_id),
                to_std_string(&data.name),
                to_std_string(&data.source_chain),
                to_std_string(&data.dest_chain),
                to_std_string(&data.status)
            ),
        )
    }
}
