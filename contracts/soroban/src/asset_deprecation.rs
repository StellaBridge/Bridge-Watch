//! # Asset Deprecation Path
//!
//! Safely deprecate assets while redirecting clients to replacement assets.
//! Provides a controlled migration path with configurable deprecation periods.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default migration period in seconds (30 days)
pub const DEFAULT_MIGRATION_PERIOD: u64 = 30 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DeprecationError {
    NotAuthorized = 1,
    AlreadyInitialized = 2,
    AssetNotFound = 3,
    AlreadyDeprecated = 4,
    ReplacementNotFound = 5,
    MigrationPeriodExpired = 6,
    WriteOperationBlocked = 7,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Deprecation configuration for an asset
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeprecationConfig {
    /// The asset being deprecated
    pub deprecated_asset: String,
    /// The replacement asset code (if any)
    pub replacement_asset: Option<String>,
    /// Timestamp when deprecation was initiated
    pub deprecated_at: u64,
    /// Migration period end timestamp
    pub migration_end: u64,
    /// Reason for deprecation
    pub reason: String,
    /// Admin who initiated deprecation
    pub deprecated_by: Address,
    /// Whether the asset is in read-only mode
    pub read_only: bool,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    /// Contract admin address
    Admin,
    /// Deprecation config for an asset
    Deprecation(String),
    /// Redirect mapping: deprecated asset -> replacement asset
    Redirect(String),
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct AssetDeprecationContract;

#[contractimpl]
impl AssetDeprecationContract {
    /// Initialize the contract with an admin address
    pub fn initialize(env: Env, admin: Address) -> Result<(), DeprecationError> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(DeprecationError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Deprecate an asset with an optional replacement and custom migration period
    pub fn deprecate_asset(
        env: Env,
        admin: Address,
        asset_code: String,
        replacement_asset: Option<String>,
        migration_period_seconds: Option<u64>,
        reason: String,
    ) -> Result<(), DeprecationError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        // Check if already deprecated
        if env
            .storage()
            .persistent()
            .has(&DataKey::Deprecation(asset_code.clone()))
        {
            return Err(DeprecationError::AlreadyDeprecated);
        }

        let now = env.ledger().timestamp();
        let migration_period = migration_period_seconds.unwrap_or(DEFAULT_MIGRATION_PERIOD);
        let migration_end = now + migration_period;

        let config = DeprecationConfig {
            deprecated_asset: asset_code.clone(),
            replacement_asset: replacement_asset.clone(),
            deprecated_at: now,
            migration_end,
            reason: reason.clone(),
            deprecated_by: admin,
            read_only: false,
        };

        // Store deprecation config
        env.storage()
            .persistent()
            .set(&DataKey::Deprecation(asset_code.clone()), &config);

        // Set up redirect if replacement exists
        if let Some(replacement) = replacement_asset.clone() {
            env.storage()
                .persistent()
                .set(&DataKey::Redirect(asset_code.clone()), &replacement);
        }

        // Emit deprecation event
        env.events().publish(
            (symbol_short!("depr_init"), asset_code.clone()),
            replacement_asset,
        );

        Ok(())
    }

    /// Enable read-only mode for a deprecated asset (blocks write operations)
    pub fn enable_read_only(
        env: Env,
        admin: Address,
        asset_code: String,
    ) -> Result<(), DeprecationError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;

        let mut config = Self::get_deprecation_config(&env, &asset_code)?;
        config.read_only = true;

        env.storage()
            .persistent()
            .set(&DataKey::Deprecation(asset_code.clone()), &config);

        env.events()
            .publish((symbol_short!("depr_ro"), asset_code), true);

        Ok(())
    }

    /// Get the replacement asset for a deprecated asset
    pub fn get_replacement(env: Env, asset_code: String) -> Option<String> {
        env.storage()
            .persistent()
            .get(&DataKey::Redirect(asset_code))
    }

    /// Check if an asset is deprecated
    pub fn is_deprecated(env: Env, asset_code: String) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Deprecation(asset_code))
    }

    /// Check if migration period has expired
    pub fn is_migration_expired(env: Env, asset_code: String) -> Result<bool, DeprecationError> {
        let config = Self::get_deprecation_config(&env, &asset_code)?;
        let now = env.ledger().timestamp();
        Ok(now > config.migration_end)
    }

    /// Get deprecation configuration for an asset (internal helper; exported
    /// contract functions cannot take borrowed arguments).
    fn get_deprecation_config(
        env: &Env,
        asset_code: &String,
    ) -> Result<DeprecationConfig, DeprecationError> {
        env.storage()
            .persistent()
            .get(&DataKey::Deprecation(asset_code.clone()))
            .ok_or(DeprecationError::AssetNotFound)
    }

    /// Guard function to check if write operations are allowed (internal
    /// helper; exported contract functions cannot take borrowed arguments).
    fn check_write_allowed(
        env: &Env,
        asset_code: &String,
    ) -> Result<(), DeprecationError> {
        if let Ok(config) = Self::get_deprecation_config(env, asset_code) {
            if config.read_only {
                return Err(DeprecationError::WriteOperationBlocked);
            }
        }
        Ok(())
    }

    // =======================================================================
    // Internal helpers
    // =======================================================================

    fn require_admin(env: &Env, admin: &Address) -> Result<(), DeprecationError> {
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(DeprecationError::NotAuthorized)?;
        if stored_admin != *admin {
            return Err(DeprecationError::NotAuthorized);
        }
        Ok(())
    }
}
