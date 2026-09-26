//! # Asset Registry Contract with Metadata and Compliance Tracking
//!
//! Maintains detailed metadata for monitored assets, compliance status,
//! regulatory flags, and integration points for all Bridge Watch contracts.
//!
//! ## Features
//! - Structured asset metadata storage (name, symbol, issuer, type, chains)
//! - Compliance flags and regulatory status tracking
//! - Asset categorization (stablecoin, RWA, native, bridged)
//! - Bridge contract associations per asset
//! - Oracle feed registration for price sources
//! - Liquidity pool mappings
//! - Risk classification and ratings
//! - Historical metadata versioning
//! - Asset lifecycle management (active, deprecated, paused)
//! - Multi-chain asset linking (same asset on different chains)
//! - Admin controls for metadata updates
//! - Public read access with permissioned writes

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of metadata versions retained per asset.
pub const MAX_VERSIONS: u32 = 50;

/// Maximum number of chains an asset can be linked to.
pub const MAX_CHAINS: u32 = 20;

/// Maximum number of oracle feeds per asset.
pub const MAX_ORACLE_FEEDS: u32 = 10;

/// Maximum number of bridge associations per asset.
pub const MAX_BRIDGES: u32 = 10;

/// Maximum number of liquidity pool associations per asset.
pub const MAX_POOLS: u32 = 20;

/// Length of an encoded Stellar account strkey (G...).
pub const STRKEY_ENCODED_LEN: u32 = 56;

/// Decoded strkey length: 1 version byte + 32-byte Ed25519 key + 2-byte CRC16.
const STRKEY_DECODED_LEN: usize = 35;

/// Strkey version byte for an Ed25519 account public key (6 << 3, renders as 'G').
const STRKEY_VERSION_ACCOUNT_ID: u8 = 6 << 3;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistryError {
    NotAuthorized = 1,
    AlreadyInitialized = 2,
    AssetAlreadyRegistered = 3,
    AssetNotFound = 4,
    InvalidAssetData = 5,
    InvalidRiskRating = 6,
    InvalidLifecycleTransition = 7,
    MaxChainsExceeded = 8,
    MaxOracleFeedsExceeded = 9,
    MaxBridgesExceeded = 10,
    MaxPoolsExceeded = 11,
    DuplicateChainLink = 12,
    DuplicateOracleFeed = 13,
    DuplicateBridge = 14,
    DuplicatePool = 15,
    AssetPaused = 16,
    AssetDeprecated = 17,
    AssetNotWhitelisted = 18,
    AssetAlreadyWhitelisted = 19,
    AssetFrozen = 20,
    /// Attempted to deactivate an asset that is already in a non-restorable state or already active.
    /// Deactivation is only valid for Active assets. Check the asset's current status.
    AssetAlreadyActive = 21,
    /// Attempted to restore an asset that is not in a Deactivated state.
    /// Only deactivated assets can be restored. Use the asset's current status to determine next actions.
    AssetNotDeactivated = 22,
    /// Issuer is not a valid Stellar Ed25519 public key (G... strkey with checksum).
    InvalidIssuer = 23,
    /// The asset symbol is already registered under a different issuer, or the
    /// bridge already carries a different asset with the same symbol. Rejected to
    /// prevent cross-namespace asset spoofing.
    DuplicateAssetRegistrationRejected = 24,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Category of the registered asset.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AssetCategory {
    /// Fiat-pegged stablecoin (e.g. USDC, EURC).
    Stablecoin,
    /// Real-world asset (e.g. tokenized treasuries).
    RealWorldAsset,
    /// Native blockchain token (e.g. XLM, ETH).
    Native,
    /// Asset bridged from another chain.
    Bridged,
    /// Wrapped version of another token.
    Wrapped,
    /// Other / uncategorised.
    Other,
}

/// Lifecycle status of a registered asset.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AssetStatus {
    /// Asset is active and fully operational.
    Active,
    /// Asset monitoring is paused; most operations blocked.
    Paused,
    /// Asset has been deprecated; read-only.
    Deprecated,
    /// Asset is pending review before activation.
    PendingReview,
    /// Asset has been deactivated; awaiting restoration. All historical data is preserved.
    Deactivated,
}

/// Compliance status for regulatory tracking.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ComplianceStatus {
    /// Fully compliant.
    Compliant,
    /// Under regulatory review.
    UnderReview,
    /// Non-compliant — flagged.
    NonCompliant,
    /// Compliance status not yet determined.
    Pending,
    /// Exempt from compliance requirements.
    Exempt,
}

/// Risk classification rating.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RiskRating {
    /// Minimal risk.
    Low,
    /// Moderate risk.
    Medium,
    /// Elevated risk.
    High,
    /// Severe risk — extra scrutiny required.
    Critical,
}

/// Core metadata for a registered asset.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetMetadata {
    /// Unique asset identifier (e.g. "USDC").
    pub asset_code: String,
    /// Human-readable name (e.g. "USD Coin").
    pub name: String,
    /// Ticker symbol.
    pub symbol: String,
    /// Issuer identifier (address or domain).
    pub issuer: String,
    /// Number of decimal places.
    pub decimals: u32,
    /// Asset category.
    pub category: AssetCategory,
    /// Current lifecycle status.
    pub status: AssetStatus,
    /// Compliance status.
    pub compliance: ComplianceStatus,
    /// Risk classification.
    pub risk_rating: RiskRating,
    /// Risk score in basis points (0–10 000).
    pub risk_score_bps: u32,
    /// Free-form description.
    pub description: String,
    /// Homepage or documentation URL.
    pub url: String,
    /// Metadata version counter.
    pub version: u32,
    /// Timestamp when the asset was first registered.
    pub registered_at: u64,
    /// Timestamp of the latest metadata update.
    pub updated_at: u64,
    /// Address that registered the asset.
    pub registered_by: Address,
}

/// Represents a single chain on which the asset exists.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChainLink {
    /// Chain identifier (e.g. "ethereum", "stellar", "polygon").
    pub chain_id: String,
    /// Contract or asset address on that chain.
    pub contract_address: String,
    /// Whether this is the canonical (primary) chain for the asset.
    pub is_canonical: bool,
    /// Timestamp when this link was added.
    pub linked_at: u64,
}

/// An oracle price-feed registration.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleFeed {
    /// Oracle identifier (e.g. "chainlink_eth_usd").
    pub feed_id: String,
    /// Oracle provider name (e.g. "Chainlink", "Band").
    pub provider: String,
    /// Chain on which the oracle operates.
    pub chain_id: String,
    /// Contract address of the oracle feed.
    pub contract_address: String,
    /// Whether this feed is currently active.
    pub is_active: bool,
    /// Timestamp when this feed was registered.
    pub registered_at: u64,
}

/// Association between an asset and a bridge contract.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BridgeAssociation {
    /// Bridge identifier (e.g. "CIRCLE_USDC").
    pub bridge_id: String,
    /// Bridge contract address.
    pub contract_address: String,
    /// Source chain.
    pub source_chain: String,
    /// Destination chain.
    pub dest_chain: String,
    /// Whether the association is active.
    pub is_active: bool,
    /// Timestamp when the association was created.
    pub created_at: u64,
}

/// Association between an asset and a liquidity pool.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolAssociation {
    /// Pool identifier (e.g. "USDC_XLM").
    pub pool_id: String,
    /// The paired asset in the pool.
    pub paired_asset: String,
    /// Whether the pool is active.
    pub is_active: bool,
    /// Timestamp when the association was created.
    pub created_at: u64,
}

/// Compliance details for regulatory tracking.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComplianceRecord {
    /// Compliance status.
    pub status: ComplianceStatus,
    /// Regulatory jurisdiction (e.g. "US", "EU", "GLOBAL").
    pub jurisdiction: String,
    /// Name of the regulatory framework.
    pub framework: String,
    /// Date of last compliance audit.
    pub last_audit_date: u64,
    /// Date of next scheduled audit.
    pub next_audit_date: u64,
    /// Notes from compliance review.
    pub notes: String,
    /// Timestamp of this record.
    pub updated_at: u64,
}

/// A versioned snapshot of asset metadata for historical tracking.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataVersion {
    /// Version number.
    pub version: u32,
    /// Snapshot of metadata at this version.
    pub metadata: AssetMetadata,
    /// Who made the change.
    pub changed_by: Address,
    /// Reason for the change.
    pub change_reason: String,
    /// Timestamp of the change.
    pub timestamp: u64,
}

/// Frozen asset state for preventing updates.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FrozenAsset {
    /// Asset code that is frozen.
    pub asset_code: String,
    /// Whether the asset is currently frozen.
    pub is_frozen: bool,
    /// Admin who initiated the freeze.
    pub frozen_by: Address,
    /// Timestamp when frozen.
    pub frozen_at: u64,
    /// Reason for freezing.
    pub freeze_reason: String,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    /// Contract admin address.
    Admin,
    /// Core metadata for an asset (by asset_code).
    AssetMeta(String),
    /// Chain links for an asset (Vec<ChainLink>).
    ChainLinks(String),
    /// Oracle feeds for an asset (Vec<OracleFeed>).
    OracleFeeds(String),
    /// Bridge associations for an asset (Vec<BridgeAssociation>).
    BridgeAssocs(String),
    /// Liquidity pool associations for an asset (Vec<PoolAssociation>).
    PoolAssocs(String),
    /// Compliance records for an asset (Vec<ComplianceRecord>).
    Compliance(String),
    /// Metadata version history for an asset (Vec<MetadataVersion>).
    Versions(String),
    /// Global list of all registered asset codes (Vec<String>).
    AssetList,
    /// Assets filtered by category (Vec<String>).
    CategoryIndex(AssetCategory),
    /// Assets filtered by status (Vec<String>).
    StatusIndex(AssetStatus),
    /// Whitelist of permitted asset codes (Vec<String>). Admin-only writes.
    Whitelist,
    /// Frozen state for an asset (FrozenAsset).
    Frozen(String),
    /// Canonical owner of a symbol: the (issuer, asset_code) it was first registered under.
    CanonicalSymbol(String),
    /// Asset code a bridge carries for a given symbol, keyed by (bridge_id, symbol).
    BridgeSymbol(String, String),
}

/// Canonical registration of a symbol, used to reject spoofed duplicates.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CanonicalSymbolEntry {
    pub symbol: String,
    pub issuer: String,
    pub asset_code: String,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct AssetRegistryContract;

#[contractimpl]
impl AssetRegistryContract {
    // =======================================================================
    // Initialization
    // =======================================================================

    /// Initialize the asset registry with an admin address.
    pub fn initialize(env: Env, admin: Address) -> Result<(), RegistryError> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(RegistryError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        let empty: Vec<String> = Vec::new(&env);
        env.storage().instance().set(&DataKey::AssetList, &empty);

        Ok(())
    }

    // =======================================================================
    // Asset registration
    // =======================================================================

    /// Register a new asset with initial metadata.
    ///
    /// The issuer must be a valid Stellar account strkey (except for `Native`
    /// assets), and the symbol must not already be registered under another
    /// issuer or asset code.
    #[allow(clippy::too_many_arguments)]
    pub fn register_asset(
        env: Env,
        admin: Address,
        asset_code: String,
        name: String,
        symbol: String,
        issuer: String,
        decimals: u32,
        category: AssetCategory,
        description: String,
        url: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;

        // Enforce whitelist: asset_code must be whitelisted before registration.
        // An empty whitelist is treated as open — no restriction applies.
        let whitelist: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::Whitelist)
            .unwrap_or_else(|| Vec::new(&env));
        if !whitelist.is_empty() {
            let whitelisted = whitelist.iter().any(|item| item == asset_code);
            if !whitelisted {
                return Err(RegistryError::AssetNotWhitelisted);
            }
        }

        // Ensure not already registered
        if env
            .storage()
            .persistent()
            .has(&DataKey::AssetMeta(asset_code.clone()))
        {
            return Err(RegistryError::AssetAlreadyRegistered);
        }

        // Reject malformed issuers and symbols already owned by another issuer
        // or asset code (cross-namespace spoofing).
        Self::validate_issuer(&category, &issuer)?;
        Self::check_symbol_conflict(&env, &symbol, &issuer, &asset_code)?;
        Self::set_canonical_symbol(&env, &symbol, &issuer, &asset_code);

        let now = env.ledger().timestamp();
        let metadata = AssetMetadata {
            asset_code: asset_code.clone(),
            name,
            symbol,
            issuer,
            decimals,
            category: category.clone(),
            status: AssetStatus::PendingReview,
            compliance: ComplianceStatus::Pending,
            risk_rating: RiskRating::Medium,
            risk_score_bps: 5_000,
            description,
            url,
            version: 1,
            registered_at: now,
            updated_at: now,
            registered_by: admin.clone(),
        };

        // Store metadata
        env.storage()
            .persistent()
            .set(&DataKey::AssetMeta(asset_code.clone()), &metadata);

        // Store initial version
        let version_entry = MetadataVersion {
            version: 1,
            metadata: metadata.clone(),
            changed_by: admin,
            change_reason: String::from_str(&env, "Initial registration"),
            timestamp: now,
        };
        let mut versions: Vec<MetadataVersion> = Vec::new(&env);
        versions.push_back(version_entry);
        env.storage()
            .persistent()
            .set(&DataKey::Versions(asset_code.clone()), &versions);

        // Initialize empty association lists
        let empty_chains: Vec<ChainLink> = Vec::new(&env);
        let empty_oracles: Vec<OracleFeed> = Vec::new(&env);
        let empty_bridges: Vec<BridgeAssociation> = Vec::new(&env);
        let empty_pools: Vec<PoolAssociation> = Vec::new(&env);
        let empty_compliance: Vec<ComplianceRecord> = Vec::new(&env);

        env.storage()
            .persistent()
            .set(&DataKey::ChainLinks(asset_code.clone()), &empty_chains);
        env.storage()
            .persistent()
            .set(&DataKey::OracleFeeds(asset_code.clone()), &empty_oracles);
        env.storage()
            .persistent()
            .set(&DataKey::BridgeAssocs(asset_code.clone()), &empty_bridges);
        env.storage()
            .persistent()
            .set(&DataKey::PoolAssocs(asset_code.clone()), &empty_pools);
        env.storage()
            .persistent()
            .set(&DataKey::Compliance(asset_code.clone()), &empty_compliance);

        // Add to global list
        let mut asset_list: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::AssetList)
            .unwrap_or_else(|| Vec::new(&env));
        asset_list.push_back(asset_code.clone());
        env.storage()
            .instance()
            .set(&DataKey::AssetList, &asset_list);

        // Update category index
        Self::add_to_index(&env, &DataKey::CategoryIndex(category), &asset_code);

        // Update status index
        Self::add_to_index(
            &env,
            &DataKey::StatusIndex(AssetStatus::PendingReview),
            &asset_code,
        );

        // Emit event
        env.events()
            .publish((symbol_short!("ar_reg"), asset_code), 1u32);

        Ok(())
    }

    // =======================================================================
    // Metadata updates
    // =======================================================================

    /// Update basic metadata fields for a registered asset (admin only).
    ///
    /// Automatically increments the version counter and stores a historical
    /// snapshot.
    #[allow(clippy::too_many_arguments)]
    pub fn update_metadata(
        env: Env,
        admin: Address,
        asset_code: String,
        name: String,
        symbol: String,
        issuer: String,
        description: String,
        url: String,
        change_reason: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;

        let mut metadata = Self::get_asset_or_err(&env, &asset_code)?;

        // Cannot update frozen assets
        if Self::is_asset_frozen(env.clone(), asset_code.clone()) {
            return Err(RegistryError::AssetFrozen);
        }

        // Cannot update deprecated assets
        if metadata.status == AssetStatus::Deprecated {
            return Err(RegistryError::AssetDeprecated);
        }

        Self::validate_issuer(&metadata.category, &issuer)?;
        Self::check_symbol_conflict(&env, &symbol, &issuer, &asset_code)?;
        if metadata.symbol != symbol {
            // Release the previous symbol so it can be claimed canonically elsewhere.
            env.storage()
                .persistent()
                .remove(&DataKey::CanonicalSymbol(metadata.symbol.clone()));
        }
        Self::set_canonical_symbol(&env, &symbol, &issuer, &asset_code);

        let now = env.ledger().timestamp();
        metadata.name = name;
        metadata.symbol = symbol;
        metadata.issuer = issuer;
        metadata.description = description;
        metadata.url = url;
        metadata.version += 1;
        metadata.updated_at = now;

        Self::save_with_version(&env, &asset_code, &metadata, &admin, &change_reason, now);

        Ok(())
    }

    /// Update the asset category (admin only).
    pub fn update_category(
        env: Env,
        admin: Address,
        asset_code: String,
        new_category: AssetCategory,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        let mut metadata = Self::get_asset_or_err(&env, &asset_code)?;

        // Remove from old category index
        Self::remove_from_index(
            &env,
            &DataKey::CategoryIndex(metadata.category.clone()),
            &asset_code,
        );

        metadata.category = new_category.clone();
        metadata.version += 1;
        metadata.updated_at = env.ledger().timestamp();

        // Add to new category index
        Self::add_to_index(&env, &DataKey::CategoryIndex(new_category), &asset_code);

        let reason = String::from_str(&env, "Category updated");
        Self::save_with_version(
            &env,
            &asset_code,
            &metadata,
            &admin,
            &reason,
            metadata.updated_at,
        );

        Ok(())
    }

    /// Update risk classification and score (admin only).
    pub fn update_risk(
        env: Env,
        admin: Address,
        asset_code: String,
        risk_rating: RiskRating,
        risk_score_bps: u32,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        if risk_score_bps > 10_000 {
            return Err(RegistryError::InvalidRiskRating);
        }

        let mut metadata = Self::get_asset_or_err(&env, &asset_code)?;

        metadata.risk_rating = risk_rating;
        metadata.risk_score_bps = risk_score_bps;
        metadata.version += 1;
        metadata.updated_at = env.ledger().timestamp();

        let reason = String::from_str(&env, "Risk updated");
        Self::save_with_version(
            &env,
            &asset_code,
            &metadata,
            &admin,
            &reason,
            metadata.updated_at,
        );

        env.events()
            .publish((symbol_short!("ar_risk"), asset_code), risk_score_bps);

        Ok(())
    }

    // =======================================================================
    // Asset lifecycle management
    // =======================================================================

    /// Transition the asset to a new lifecycle status (admin only).
    ///
    /// Valid transitions:
    /// - PendingReview → Active
    /// - Active → Paused
    /// - Paused → Active
    /// - Active → Deprecated
    /// - Paused → Deprecated
    pub fn update_status(
        env: Env,
        admin: Address,
        asset_code: String,
        new_status: AssetStatus,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        let mut metadata = Self::get_asset_or_err(&env, &asset_code)?;

        // Validate lifecycle transition
        let valid = matches!(
            (&metadata.status, &new_status),
            (AssetStatus::PendingReview, AssetStatus::Active)
                | (AssetStatus::Active, AssetStatus::Paused)
                | (AssetStatus::Paused, AssetStatus::Active)
                | (AssetStatus::Active, AssetStatus::Deprecated)
                | (AssetStatus::Paused, AssetStatus::Deprecated)
                | (AssetStatus::Active, AssetStatus::Deactivated)
                | (AssetStatus::Paused, AssetStatus::Deactivated)
        );
        if !valid {
            return Err(RegistryError::InvalidLifecycleTransition);
        }

        // Update status indices
        Self::remove_from_index(
            &env,
            &DataKey::StatusIndex(metadata.status.clone()),
            &asset_code,
        );
        Self::add_to_index(&env, &DataKey::StatusIndex(new_status.clone()), &asset_code);

        metadata.status = new_status;
        metadata.version += 1;
        metadata.updated_at = env.ledger().timestamp();

        let reason = String::from_str(&env, "Status updated");
        Self::save_with_version(
            &env,
            &asset_code,
            &metadata,
            &admin,
            &reason,
            metadata.updated_at,
        );

        env.events()
            .publish((symbol_short!("ar_stat"), asset_code), 1u32);

        Ok(())
    }

    // =======================================================================
    // Asset deactivation and restoration
    // =======================================================================

    /// Deactivate an active asset while preserving all historical data (admin only).
    ///
    /// Transitions an asset from Active to Deactivated state, recording the change in version
    /// history. All asset metadata, chain links, compliance records, oracle feeds, and other
    /// associations are preserved intact. A deactivated asset can be restored at any time
    /// via [`restore_asset`].
    ///
    /// # Arguments
    /// * `env` — the contract environment
    /// * `admin` — the caller, must be the contract admin
    /// * `asset_code` — unique identifier for the asset to deactivate
    /// * `reason` — human-readable explanation for deactivation
    ///
    /// # Returns
    /// `Ok(())` if deactivation succeeds, or an error:
    /// - `NotAuthorized` if caller is not admin
    /// - `AssetNotFound` if the asset_code does not exist
    /// - `AssetAlreadyActive` if the asset is not currently Active (already deactivated, paused, deprecated, or pending)
    ///
    /// # Events
    /// Emits `(symbol_short!("asset_deact"), asset_code)` with admin address data.
    ///
    /// # State Continuity
    /// All metadata fields except `status`, `version`, and `updated_at` are preserved unchanged.
    /// The deactivation is recorded as a new version entry in the asset's history.
    pub fn deactivate_asset(
        env: Env,
        admin: Address,
        asset_code: String,
        reason: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        let mut metadata = Self::get_asset_or_err(&env, &asset_code)?;

        // Verify asset is currently Active (only Active assets can be deactivated)
        if metadata.status != AssetStatus::Active {
            return Err(RegistryError::AssetAlreadyActive);
        }

        // Update status indices: remove from Active, add to Deactivated
        Self::remove_from_index(
            &env,
            &DataKey::StatusIndex(AssetStatus::Active),
            &asset_code,
        );
        Self::add_to_index(
            &env,
            &DataKey::StatusIndex(AssetStatus::Deactivated),
            &asset_code,
        );

        // Transition to Deactivated status
        metadata.status = AssetStatus::Deactivated;
        metadata.version += 1;
        metadata.updated_at = env.ledger().timestamp();

        // Save with version tracking
        Self::save_with_version(
            &env,
            &asset_code,
            &metadata,
            &admin,
            &reason,
            metadata.updated_at,
        );

        // Emit deactivation event
        env.events()
            .publish((symbol_short!("ast_dact"), asset_code.clone()), admin);

        Ok(())
    }

    /// Restore a deactivated asset to Active state (admin only).
    ///
    /// Transitions an asset from Deactivated back to Active state, preserving all historical
    /// metadata, chain links, compliance records, oracle feeds, and other associations.
    /// The restoration is recorded as a new version entry.
    ///
    /// # Arguments
    /// * `env` — the contract environment
    /// * `admin` — the caller, must be the contract admin
    /// * `asset_code` — unique identifier for the asset to restore
    ///
    /// # Returns
    /// `Ok(())` if restoration succeeds, or an error:
    /// - `NotAuthorized` if caller is not admin
    /// - `AssetNotFound` if the asset_code does not exist
    /// - `AssetNotDeactivated` if the asset is not currently Deactivated (e.g. already Active, Paused, Deprecated)
    ///
    /// # Events
    /// Emits `(symbol_short!("asset_rest"), asset_code)` with admin address data.
    ///
    /// # State Continuity
    /// All metadata fields except `status`, `version`, and `updated_at` are restored unchanged.
    /// The entire asset history, including the deactivation event and prior versions, remains intact.
    pub fn restore_asset(
        env: Env,
        admin: Address,
        asset_code: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        let mut metadata = Self::get_asset_or_err(&env, &asset_code)?;

        // Verify asset is currently Deactivated (only Deactivated assets can be restored)
        if metadata.status != AssetStatus::Deactivated {
            return Err(RegistryError::AssetNotDeactivated);
        }

        // Update status indices: remove from Deactivated, add to Active
        Self::remove_from_index(
            &env,
            &DataKey::StatusIndex(AssetStatus::Deactivated),
            &asset_code,
        );
        Self::add_to_index(
            &env,
            &DataKey::StatusIndex(AssetStatus::Active),
            &asset_code,
        );

        // Transition to Active status
        metadata.status = AssetStatus::Active;
        metadata.version += 1;
        metadata.updated_at = env.ledger().timestamp();

        // Save with version tracking
        let reason = String::from_str(&env, "Asset restored");
        Self::save_with_version(
            &env,
            &asset_code,
            &metadata,
            &admin,
            &reason,
            metadata.updated_at,
        );

        // Emit restoration event
        env.events()
            .publish((symbol_short!("ast_rest"), asset_code.clone()), admin);

        Ok(())
    }

    // =======================================================================
    // Compliance tracking
    // ======================================================================="

    /// Update compliance status and add a compliance record (admin only).
    #[allow(clippy::too_many_arguments)]
    pub fn update_compliance(
        env: Env,
        admin: Address,
        asset_code: String,
        status: ComplianceStatus,
        jurisdiction: String,
        framework: String,
        last_audit_date: u64,
        next_audit_date: u64,
        notes: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        let mut metadata = Self::get_asset_or_err(&env, &asset_code)?;

        let now = env.ledger().timestamp();
        metadata.compliance = status.clone();
        metadata.version += 1;
        metadata.updated_at = now;

        let record = ComplianceRecord {
            status,
            jurisdiction,
            framework,
            last_audit_date,
            next_audit_date,
            notes,
            updated_at: now,
        };

        let mut records: Vec<ComplianceRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::Compliance(asset_code.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        records.push_back(record);
        env.storage()
            .persistent()
            .set(&DataKey::Compliance(asset_code.clone()), &records);

        let reason = String::from_str(&env, "Compliance updated");
        Self::save_with_version(&env, &asset_code, &metadata, &admin, &reason, now);

        env.events()
            .publish((symbol_short!("ar_comp"), asset_code), 1u32);

        Ok(())
    }

    // =======================================================================
    // Multi-chain asset linking
    // =======================================================================

    /// Link an asset to a chain with its contract address.
    pub fn link_chain(
        env: Env,
        admin: Address,
        asset_code: String,
        chain_id: String,
        contract_address: String,
        is_canonical: bool,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        Self::require_asset_exists(&env, &asset_code)?;

        let mut chains: Vec<ChainLink> = env
            .storage()
            .persistent()
            .get(&DataKey::ChainLinks(asset_code.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        if chains.len() >= MAX_CHAINS {
            return Err(RegistryError::MaxChainsExceeded);
        }

        // Check for duplicates
        for c in chains.iter() {
            if c.chain_id == chain_id {
                return Err(RegistryError::DuplicateChainLink);
            }
        }

        let now = env.ledger().timestamp();
        chains.push_back(ChainLink {
            chain_id,
            contract_address,
            is_canonical,
            linked_at: now,
        });

        env.storage()
            .persistent()
            .set(&DataKey::ChainLinks(asset_code), &chains);

        Ok(())
    }

    // =======================================================================
    // Bridge contract associations
    // =======================================================================

    /// Associate a bridge contract with an asset (admin only).
    ///
    /// Rejects the link with `DuplicateAssetRegistrationRejected` if the bridge
    /// already carries a different asset with the same symbol.
    pub fn link_bridge_contract(
        env: Env,
        admin: Address,
        asset_code: String,
        bridge_id: String,
        contract_address: String,
        source_chain: String,
        dest_chain: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        let metadata = Self::get_asset_or_err(&env, &asset_code)?;

        // Composite uniqueness on (bridge_id, symbol): a bridge may not carry two
        // different assets presenting the same symbol.
        let bridge_symbol_key = DataKey::BridgeSymbol(bridge_id.clone(), metadata.symbol.clone());
        let existing_code: Option<String> = env.storage().persistent().get(&bridge_symbol_key);
        if let Some(code) = existing_code {
            if code != asset_code {
                env.events().publish(
                    (symbol_short!("ar_dup"), metadata.symbol.clone()),
                    (asset_code.clone(), code),
                );
                return Err(RegistryError::DuplicateAssetRegistrationRejected);
            }
        }

        let mut bridges: Vec<BridgeAssociation> = env
            .storage()
            .persistent()
            .get(&DataKey::BridgeAssocs(asset_code.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        if bridges.len() >= MAX_BRIDGES {
            return Err(RegistryError::MaxBridgesExceeded);
        }

        for b in bridges.iter() {
            if b.bridge_id == bridge_id {
                return Err(RegistryError::DuplicateBridge);
            }
        }

        let now = env.ledger().timestamp();
        bridges.push_back(BridgeAssociation {
            bridge_id,
            contract_address,
            source_chain,
            dest_chain,
            is_active: true,
            created_at: now,
        });

        env.storage()
            .persistent()
            .set(&bridge_symbol_key, &asset_code);
        env.storage()
            .persistent()
            .set(&DataKey::BridgeAssocs(asset_code), &bridges);

        Ok(())
    }

    // =======================================================================
    // Oracle feed registration
    // =======================================================================

    /// Register an oracle price feed for an asset (admin only).
    pub fn register_oracle_feed(
        env: Env,
        admin: Address,
        asset_code: String,
        feed_id: String,
        provider: String,
        chain_id: String,
        contract_address: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        Self::require_asset_exists(&env, &asset_code)?;

        let mut feeds: Vec<OracleFeed> = env
            .storage()
            .persistent()
            .get(&DataKey::OracleFeeds(asset_code.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        if feeds.len() >= MAX_ORACLE_FEEDS {
            return Err(RegistryError::MaxOracleFeedsExceeded);
        }

        for f in feeds.iter() {
            if f.feed_id == feed_id {
                return Err(RegistryError::DuplicateOracleFeed);
            }
        }

        let now = env.ledger().timestamp();
        feeds.push_back(OracleFeed {
            feed_id,
            provider,
            chain_id,
            contract_address,
            is_active: true,
            registered_at: now,
        });

        env.storage()
            .persistent()
            .set(&DataKey::OracleFeeds(asset_code), &feeds);

        Ok(())
    }

    // =======================================================================
    // Liquidity pool mappings
    // =======================================================================

    /// Associate a liquidity pool with an asset (admin only).
    pub fn add_liquidity_pool(
        env: Env,
        admin: Address,
        asset_code: String,
        pool_id: String,
        paired_asset: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        Self::require_asset_exists(&env, &asset_code)?;

        let mut pools: Vec<PoolAssociation> = env
            .storage()
            .persistent()
            .get(&DataKey::PoolAssocs(asset_code.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        if pools.len() >= MAX_POOLS {
            return Err(RegistryError::MaxPoolsExceeded);
        }

        for p in pools.iter() {
            if p.pool_id == pool_id {
                return Err(RegistryError::DuplicatePool);
            }
        }

        let now = env.ledger().timestamp();
        pools.push_back(PoolAssociation {
            pool_id,
            paired_asset,
            is_active: true,
            created_at: now,
        });

        env.storage()
            .persistent()
            .set(&DataKey::PoolAssocs(asset_code), &pools);

        Ok(())
    }

    // =======================================================================
    // Asset whitelisting
    // =======================================================================

    /// Add an asset code to the whitelist (admin only).
    ///
    /// Whitelisted assets are the only ones that may be registered via
    /// `register_asset`. Emits an `ar_wl_add` event on success.
    pub fn whitelist_add(
        env: Env,
        admin: Address,
        asset_code: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;

        let mut whitelist: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::Whitelist)
            .unwrap_or_else(|| Vec::new(&env));

        for item in whitelist.iter() {
            if item == asset_code {
                return Err(RegistryError::AssetAlreadyWhitelisted);
            }
        }

        whitelist.push_back(asset_code.clone());
        env.storage()
            .instance()
            .set(&DataKey::Whitelist, &whitelist);

        env.events()
            .publish((symbol_short!("wl_add"), asset_code), 1u32);

        Ok(())
    }

    /// Remove an asset code from the whitelist (admin only).
    ///
    /// Removing an already-registered asset from the whitelist does not
    /// affect its existing registration — it only prevents future
    /// re-registration under that code. Emits an `ar_wl_rm` event.
    pub fn whitelist_remove(
        env: Env,
        admin: Address,
        asset_code: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;

        let whitelist: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::Whitelist)
            .unwrap_or_else(|| Vec::new(&env));

        let mut found = false;
        let mut updated: Vec<String> = Vec::new(&env);
        for item in whitelist.iter() {
            if item == asset_code {
                found = true;
            } else {
                updated.push_back(item);
            }
        }

        if !found {
            return Err(RegistryError::AssetNotWhitelisted);
        }

        env.storage().instance().set(&DataKey::Whitelist, &updated);

        env.events()
            .publish((symbol_short!("wl_rm"), asset_code), 1u32);

        Ok(())
    }

    /// Check whether an asset code is on the whitelist. Public read.
    pub fn is_whitelisted(env: Env, asset_code: String) -> bool {
        let whitelist: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::Whitelist)
            .unwrap_or_else(|| Vec::new(&env));

        for item in whitelist.iter() {
            if item == asset_code {
                return true;
            }
        }
        false
    }

    /// Return the full whitelist. Public read.
    pub fn get_whitelist(env: Env) -> Vec<String> {
        env.storage()
            .instance()
            .get(&DataKey::Whitelist)
            .unwrap_or_else(|| Vec::new(&env))
    }

    // =======================================================================
    // Frozen asset controls
    // =======================================================================

    /// Freeze an asset to prevent updates (admin only).
    pub fn freeze_asset(
        env: Env,
        admin: Address,
        asset_code: String,
        reason: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        Self::require_asset_exists(&env, &asset_code)?;

        let now = env.ledger().timestamp();
        let frozen_asset = FrozenAsset {
            asset_code: asset_code.clone(),
            is_frozen: true,
            frozen_by: admin,
            frozen_at: now,
            freeze_reason: reason,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Frozen(asset_code.clone()), &frozen_asset);

        env.events()
            .publish((symbol_short!("ar_frz"), asset_code), 1u32);

        Ok(())
    }

    /// Unfreeze an asset to allow updates (admin only).
    pub fn unfreeze_asset(
        env: Env,
        admin: Address,
        asset_code: String,
    ) -> Result<(), RegistryError> {
        Self::require_admin(&env, &admin)?;
        Self::require_asset_exists(&env, &asset_code)?;

        let now = env.ledger().timestamp();
        let frozen_asset = FrozenAsset {
            asset_code: asset_code.clone(),
            is_frozen: false,
            frozen_by: admin,
            frozen_at: now,
            freeze_reason: String::from_str(&env, "Unfrozen"),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Frozen(asset_code.clone()), &frozen_asset);

        env.events()
            .publish((symbol_short!("ar_unfr"), asset_code), 1u32);

        Ok(())
    }

    /// Check if an asset is currently frozen. Public read.
    pub fn is_asset_frozen(env: Env, asset_code: String) -> bool {
        let frozen: Option<FrozenAsset> =
            env.storage().persistent().get(&DataKey::Frozen(asset_code));

        match frozen {
            Some(f) => f.is_frozen,
            None => false,
        }
    }

    /// Get the frozen state of an asset. Public read.
    pub fn get_frozen_state(env: Env, asset_code: String) -> Option<FrozenAsset> {
        env.storage().persistent().get(&DataKey::Frozen(asset_code))
    }

    // =======================================================================
    // Read-only queries
    // =======================================================================

    /// Get the full metadata for an asset. Public read.
    pub fn get_asset(env: Env, asset_code: String) -> Option<AssetMetadata> {
        env.storage()
            .persistent()
            .get(&DataKey::AssetMeta(asset_code))
    }

    /// Get all registered asset codes. Public read.
    pub fn get_all_assets(env: Env) -> Vec<String> {
        env.storage()
            .instance()
            .get(&DataKey::AssetList)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get assets by category. Public read.
    pub fn get_assets_by_category(env: Env, category: AssetCategory) -> Vec<String> {
        env.storage()
            .persistent()
            .get(&DataKey::CategoryIndex(category))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get assets by lifecycle status. Public read.
    pub fn get_assets_by_status(env: Env, status: AssetStatus) -> Vec<String> {
        env.storage()
            .persistent()
            .get(&DataKey::StatusIndex(status))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get chain links for an asset. Public read.
    pub fn get_chain_links(env: Env, asset_code: String) -> Vec<ChainLink> {
        env.storage()
            .persistent()
            .get(&DataKey::ChainLinks(asset_code))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get oracle feeds for an asset. Public read.
    pub fn get_oracle_feeds(env: Env, asset_code: String) -> Vec<OracleFeed> {
        env.storage()
            .persistent()
            .get(&DataKey::OracleFeeds(asset_code))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get bridge associations for an asset. Public read.
    pub fn get_bridge_associations(env: Env, asset_code: String) -> Vec<BridgeAssociation> {
        env.storage()
            .persistent()
            .get(&DataKey::BridgeAssocs(asset_code))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get liquidity pool associations for an asset. Public read.
    pub fn get_pool_associations(env: Env, asset_code: String) -> Vec<PoolAssociation> {
        env.storage()
            .persistent()
            .get(&DataKey::PoolAssocs(asset_code))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get compliance records for an asset. Public read.
    pub fn get_compliance_records(env: Env, asset_code: String) -> Vec<ComplianceRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Compliance(asset_code))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get the metadata version history for an asset. Public read.
    pub fn get_metadata_versions(env: Env, asset_code: String) -> Vec<MetadataVersion> {
        env.storage()
            .persistent()
            .get(&DataKey::Versions(asset_code))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get a specific metadata version. Public read.
    pub fn get_metadata_at_version(
        env: Env,
        asset_code: String,
        version: u32,
    ) -> Option<MetadataVersion> {
        let versions: Vec<MetadataVersion> = env
            .storage()
            .persistent()
            .get(&DataKey::Versions(asset_code))
            .unwrap_or_else(|| Vec::new(&env));

        versions.iter().find(|v| v.version == version)
    }

    // =======================================================================
    // Private helpers
    // =======================================================================

    /// Verify `caller` is the contract admin.
    fn require_admin(env: &Env, caller: &Address) -> Result<(), RegistryError> {
        caller.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(RegistryError::NotAuthorized)?;
        if *caller != admin {
            return Err(RegistryError::NotAuthorized);
        }
        Ok(())
    }

    /// Ensure an asset exists in the registry.
    fn require_asset_exists(env: &Env, asset_code: &String) -> Result<(), RegistryError> {
        if !env
            .storage()
            .persistent()
            .has(&DataKey::AssetMeta(asset_code.clone()))
        {
            return Err(RegistryError::AssetNotFound);
        }
        Ok(())
    }

    /// Fetch asset metadata, returning an error if not found.
    fn get_asset_or_err(env: &Env, asset_code: &String) -> Result<AssetMetadata, RegistryError> {
        env.storage()
            .persistent()
            .get(&DataKey::AssetMeta(asset_code.clone()))
            .ok_or(RegistryError::AssetNotFound)
    }

    /// Save metadata and record a versioned snapshot.
    fn save_with_version(
        env: &Env,
        asset_code: &String,
        metadata: &AssetMetadata,
        admin: &Address,
        reason: &String,
        now: u64,
    ) {
        env.storage()
            .persistent()
            .set(&DataKey::AssetMeta(asset_code.clone()), metadata);

        let mut versions: Vec<MetadataVersion> = env
            .storage()
            .persistent()
            .get(&DataKey::Versions(asset_code.clone()))
            .unwrap_or_else(|| Vec::new(env));

        // Trim if exceeding max versions
        if versions.len() >= MAX_VERSIONS {
            let mut trimmed: Vec<MetadataVersion> = Vec::new(env);
            for i in 1..versions.len() {
                trimmed.push_back(versions.get(i).unwrap());
            }
            versions = trimmed;
        }

        versions.push_back(MetadataVersion {
            version: metadata.version,
            metadata: metadata.clone(),
            changed_by: admin.clone(),
            change_reason: reason.clone(),
            timestamp: now,
        });

        env.storage()
            .persistent()
            .set(&DataKey::Versions(asset_code.clone()), &versions);
    }

    /// Validate the issuer for an asset. Native assets have no issuer account;
    /// every other category must name a valid Stellar Ed25519 account.
    fn validate_issuer(category: &AssetCategory, issuer: &String) -> Result<(), RegistryError> {
        if *category == AssetCategory::Native {
            return Ok(());
        }
        if is_valid_account_strkey(issuer) {
            Ok(())
        } else {
            Err(RegistryError::InvalidIssuer)
        }
    }

    /// Ensure `symbol` is not already owned by a different issuer or asset code.
    fn check_symbol_conflict(
        env: &Env,
        symbol: &String,
        issuer: &String,
        asset_code: &String,
    ) -> Result<(), RegistryError> {
        let existing: Option<CanonicalSymbolEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::CanonicalSymbol(symbol.clone()));
        if let Some(entry) = existing {
            if entry.issuer != *issuer || entry.asset_code != *asset_code {
                env.events().publish(
                    (symbol_short!("ar_dup"), symbol.clone()),
                    (asset_code.clone(), entry.asset_code),
                );
                return Err(RegistryError::DuplicateAssetRegistrationRejected);
            }
        }
        Ok(())
    }

    fn set_canonical_symbol(env: &Env, symbol: &String, issuer: &String, asset_code: &String) {
        env.storage().persistent().set(
            &DataKey::CanonicalSymbol(symbol.clone()),
            &CanonicalSymbolEntry {
                symbol: symbol.clone(),
                issuer: issuer.clone(),
                asset_code: asset_code.clone(),
            },
        );
    }

    /// Add an asset code to a persistent index Vec.
    fn add_to_index(env: &Env, key: &DataKey, asset_code: &String) {
        let mut list: Vec<String> = env
            .storage()
            .persistent()
            .get(key)
            .unwrap_or_else(|| Vec::new(env));

        // Prevent duplicates
        for item in list.iter() {
            if item == *asset_code {
                return;
            }
        }
        list.push_back(asset_code.clone());
        env.storage().persistent().set(key, &list);
    }

    /// Remove an asset code from a persistent index Vec.
    fn remove_from_index(env: &Env, key: &DataKey, asset_code: &String) {
        let list: Vec<String> = env
            .storage()
            .persistent()
            .get(key)
            .unwrap_or_else(|| Vec::new(env));

        let mut updated: Vec<String> = Vec::new(env);
        for item in list.iter() {
            if item != *asset_code {
                updated.push_back(item);
            }
        }
        env.storage().persistent().set(key, &updated);
    }
}

// ===========================================================================
// Strkey validation
// ===========================================================================

/// Returns true when `issuer` is a well-formed Stellar account strkey: 56 base32
/// characters decoding to version byte `G`, a 32-byte Ed25519 key and a valid
/// CRC16-XModem checksum.
pub fn is_valid_account_strkey(issuer: &String) -> bool {
    if issuer.len() != STRKEY_ENCODED_LEN {
        return false;
    }
    let mut encoded = [0u8; STRKEY_ENCODED_LEN as usize];
    issuer.copy_into_slice(&mut encoded);

    let mut decoded = [0u8; STRKEY_DECODED_LEN];
    if !base32_decode(&encoded, &mut decoded) {
        return false;
    }
    if decoded[0] != STRKEY_VERSION_ACCOUNT_ID {
        return false;
    }

    let payload_len = STRKEY_DECODED_LEN - 2;
    let expected = crc16_xmodem(&decoded[..payload_len]);
    let actual = (decoded[payload_len] as u16) | ((decoded[payload_len + 1] as u16) << 8);
    expected == actual
}

fn base32_value(c: u8) -> Option<u8> {
    match c {
        b'A'..=b'Z' => Some(c - b'A'),
        b'2'..=b'7' => Some(c - b'2' + 26),
        _ => None,
    }
}

/// Decodes unpadded RFC4648 base32. 56 chars map exactly onto 35 bytes.
fn base32_decode(input: &[u8], out: &mut [u8]) -> bool {
    let mut buffer: u32 = 0;
    let mut bits: u32 = 0;
    let mut idx = 0usize;
    for &c in input {
        let v = match base32_value(c) {
            Some(v) => v as u32,
            None => return false,
        };
        buffer = (buffer << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            if idx >= out.len() {
                return false;
            }
            out[idx] = ((buffer >> bits) & 0xff) as u8;
            idx += 1;
        }
    }
    idx == out.len() && bits == 0
}

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
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

    /// Helper: set up a fresh asset registry contract.
    fn setup() -> (Env, AssetRegistryContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, AssetRegistryContract);
        let client = AssetRegistryContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        env.ledger().set_timestamp(1_000_000);
        client.initialize(&admin);
        (env, client, admin)
    }

    /// Helper: register a standard USDC asset and return its code.
    fn register_usdc(env: &Env, client: &AssetRegistryContractClient, admin: &Address) -> String {
        let asset_code = String::from_str(env, "USDC");
        let name = String::from_str(env, "USD Coin");
        let symbol = String::from_str(env, "USDC");
        let issuer = String::from_str(env, "circle.com");
        let desc = String::from_str(env, "Fiat-backed stablecoin");
        let url = String::from_str(env, "https://www.circle.com");

        client.register_asset(
            admin,
            &asset_code,
            &name,
            &symbol,
            &issuer,
            &6,
            &AssetCategory::Stablecoin,
            &desc,
            &url,
        );
        asset_code
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialize_success() {
        let (_env, client, _admin) = setup();
        let assets = client.get_all_assets();
        assert_eq!(assets.len(), 0);
    }

    #[test]
    fn test_initialize_twice_fails() {
        let (_env, client, admin) = setup();
        let result = client.try_initialize(&admin);
        assert_eq!(result, Err(Ok(RegistryError::AlreadyInitialized)));
    }

    // -----------------------------------------------------------------------
    // Asset registration
    // -----------------------------------------------------------------------

    #[test]
    fn test_register_asset_basic() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.asset_code, asset_code);
        assert_eq!(meta.name, String::from_str(&env, "USD Coin"));
        assert_eq!(meta.decimals, 6);
        assert_eq!(meta.category, AssetCategory::Stablecoin);
        assert_eq!(meta.status, AssetStatus::PendingReview);
        assert_eq!(meta.compliance, ComplianceStatus::Pending);
        assert_eq!(meta.risk_rating, RiskRating::Medium);
        assert_eq!(meta.version, 1);
    }

    #[test]
    fn test_register_asset_appears_in_list() {
        let (env, client, admin) = setup();
        register_usdc(&env, &client, &admin);

        let assets = client.get_all_assets();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets.get(0).unwrap(), String::from_str(&env, "USDC"));
    }

    #[test]
    fn test_register_multiple_assets() {
        let (env, client, admin) = setup();
        register_usdc(&env, &client, &admin);

        let asset_code2 = String::from_str(&env, "EURC");
        client.register_asset(
            &admin,
            &asset_code2,
            &String::from_str(&env, "Euro Coin"),
            &String::from_str(&env, "EURC"),
            &String::from_str(&env, "circle.com"),
            &6,
            &AssetCategory::Stablecoin,
            &String::from_str(&env, "Euro stablecoin"),
            &String::from_str(&env, "https://www.circle.com"),
        );

        let assets = client.get_all_assets();
        assert_eq!(assets.len(), 2);
    }

    #[test]
    fn test_register_duplicate_fails() {
        let (env, client, admin) = setup();
        register_usdc(&env, &client, &admin);

        let result = client.try_register_asset(
            &admin,
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "USD Coin"),
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "circle.com"),
            &6,
            &AssetCategory::Stablecoin,
            &String::from_str(&env, "desc"),
            &String::from_str(&env, "url"),
        );
        assert_eq!(result, Err(Ok(RegistryError::AssetAlreadyRegistered)));
    }

    #[test]
    fn test_register_non_admin_fails() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);

        let result = client.try_register_asset(
            &stranger,
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "USD Coin"),
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "circle.com"),
            &6,
            &AssetCategory::Stablecoin,
            &String::from_str(&env, "desc"),
            &String::from_str(&env, "url"),
        );
        assert_eq!(result, Err(Ok(RegistryError::NotAuthorized)));
    }

    // -----------------------------------------------------------------------
    // Metadata updates
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_metadata() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        env.ledger().set_timestamp(2_000_000);
        client.update_metadata(
            &admin,
            &asset_code,
            &String::from_str(&env, "USD Coin v2"),
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "circle.com"),
            &String::from_str(&env, "Updated stablecoin"),
            &String::from_str(&env, "https://new.circle.com"),
            &String::from_str(&env, "Name update"),
        );

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.name, String::from_str(&env, "USD Coin v2"));
        assert_eq!(meta.version, 2);
        assert_eq!(meta.updated_at, 2_000_000);
    }

    #[test]
    fn test_update_metadata_creates_version() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_metadata(
            &admin,
            &asset_code,
            &String::from_str(&env, "USD Coin v2"),
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "circle.com"),
            &String::from_str(&env, "desc"),
            &String::from_str(&env, "url"),
            &String::from_str(&env, "Test update"),
        );

        let versions = client.get_metadata_versions(&asset_code);
        assert_eq!(versions.len(), 2); // initial + update
        assert_eq!(versions.get(0).unwrap().version, 1);
        assert_eq!(versions.get(1).unwrap().version, 2);
    }

    #[test]
    fn test_update_metadata_nonexistent_fails() {
        let (env, client, admin) = setup();
        let result = client.try_update_metadata(
            &admin,
            &String::from_str(&env, "FAKE"),
            &String::from_str(&env, "Fake"),
            &String::from_str(&env, "FAKE"),
            &String::from_str(&env, ""),
            &String::from_str(&env, ""),
            &String::from_str(&env, ""),
            &String::from_str(&env, "reason"),
        );
        assert_eq!(result, Err(Ok(RegistryError::AssetNotFound)));
    }

    // -----------------------------------------------------------------------
    // Category management
    // -----------------------------------------------------------------------

    #[test]
    fn test_category_index() {
        let (env, client, admin) = setup();
        register_usdc(&env, &client, &admin);

        let stablecoins = client.get_assets_by_category(&AssetCategory::Stablecoin);
        assert_eq!(stablecoins.len(), 1);

        let rwa = client.get_assets_by_category(&AssetCategory::RealWorldAsset);
        assert_eq!(rwa.len(), 0);
    }

    #[test]
    fn test_update_category() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_category(&admin, &asset_code, &AssetCategory::Bridged);

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.category, AssetCategory::Bridged);

        // Old category index cleared
        let stablecoins = client.get_assets_by_category(&AssetCategory::Stablecoin);
        assert_eq!(stablecoins.len(), 0);

        // New category index populated
        let bridged = client.get_assets_by_category(&AssetCategory::Bridged);
        assert_eq!(bridged.len(), 1);
    }

    // -----------------------------------------------------------------------
    // Risk management
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_risk() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_risk(&admin, &asset_code, &RiskRating::Low, &1_500);

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.risk_rating, RiskRating::Low);
        assert_eq!(meta.risk_score_bps, 1_500);
    }

    #[test]
    fn test_update_risk_invalid_score() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        let result = client.try_update_risk(&admin, &asset_code, &RiskRating::High, &10_001);
        assert_eq!(result, Err(Ok(RegistryError::InvalidRiskRating)));
    }

    // -----------------------------------------------------------------------
    // Lifecycle management
    // -----------------------------------------------------------------------

    #[test]
    fn test_lifecycle_pending_to_active() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Active);
    }

    #[test]
    fn test_lifecycle_active_to_paused() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);
        client.update_status(&admin, &asset_code, &AssetStatus::Paused);

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Paused);
    }

    #[test]
    fn test_lifecycle_paused_to_active() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);
        client.update_status(&admin, &asset_code, &AssetStatus::Paused);
        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Active);
    }

    #[test]
    fn test_lifecycle_active_to_deprecated() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);
        client.update_status(&admin, &asset_code, &AssetStatus::Deprecated);

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Deprecated);
    }

    #[test]
    fn test_lifecycle_invalid_transition() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        // PendingReview → Paused is invalid
        let result = client.try_update_status(&admin, &asset_code, &AssetStatus::Paused);
        assert_eq!(result, Err(Ok(RegistryError::InvalidLifecycleTransition)));
    }

    #[test]
    fn test_lifecycle_deprecated_to_active_invalid() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);
        client.update_status(&admin, &asset_code, &AssetStatus::Deprecated);

        // Deprecated → Active is invalid
        let result = client.try_update_status(&admin, &asset_code, &AssetStatus::Active);
        assert_eq!(result, Err(Ok(RegistryError::InvalidLifecycleTransition)));
    }

    #[test]
    fn test_status_index() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        let pending = client.get_assets_by_status(&AssetStatus::PendingReview);
        assert_eq!(pending.len(), 1);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        let pending = client.get_assets_by_status(&AssetStatus::PendingReview);
        assert_eq!(pending.len(), 0);

        let active = client.get_assets_by_status(&AssetStatus::Active);
        assert_eq!(active.len(), 1);
    }

    #[test]
    fn test_update_deprecated_metadata_fails() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);
        client.update_status(&admin, &asset_code, &AssetStatus::Deprecated);

        let result = client.try_update_metadata(
            &admin,
            &asset_code,
            &String::from_str(&env, "New Name"),
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "circle.com"),
            &String::from_str(&env, "desc"),
            &String::from_str(&env, "url"),
            &String::from_str(&env, "reason"),
        );
        assert_eq!(result, Err(Ok(RegistryError::AssetDeprecated)));
    }

    // -----------------------------------------------------------------------
    // Asset deactivation and restoration
    // -----------------------------------------------------------------------

    #[test]
    fn test_deactivate_asset_happy_path() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        // Verify asset is active before deactivation
        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Active);
        let version_before = meta.version;

        // Deactivate the asset
        client.deactivate_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "Temporary suspension"),
        );

        // Verify asset is now deactivated
        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Deactivated);
        assert_eq!(meta.version, version_before + 1);

        // Verify it appears in the Deactivated index
        let deactivated = client.get_assets_by_status(&AssetStatus::Deactivated);
        assert_eq!(deactivated.len(), 1);
        assert_eq!(deactivated.get(0).unwrap(), asset_code);
    }

    #[test]
    fn test_restore_asset_happy_path() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        // Setup: activate and deactivate
        client.update_status(&admin, &asset_code, &AssetStatus::Active);
        client.deactivate_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "Temporary suspension"),
        );

        // Verify deactivated
        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Deactivated);
        let version_before = meta.version;

        // Restore the asset
        client.restore_asset(&admin, &asset_code);

        // Verify restored to Active
        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Active);
        assert_eq!(meta.version, version_before + 1);

        // Verify it appears in the Active index
        let active = client.get_assets_by_status(&AssetStatus::Active);
        assert_eq!(active.len(), 1);
        assert_eq!(active.get(0).unwrap(), asset_code);
    }

    #[test]
    fn test_deactivate_non_active_asset_fails() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        // Do not activate; asset is still PendingReview
        let result = client.try_deactivate_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "Unexpected deactivation"),
        );
        assert_eq!(result, Err(Ok(RegistryError::AssetAlreadyActive)));
    }

    #[test]
    fn test_restore_non_deactivated_asset_fails() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        // Activate the asset
        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        // Try to restore an Active (not Deactivated) asset
        let result = client.try_restore_asset(&admin, &asset_code);
        assert_eq!(result, Err(Ok(RegistryError::AssetNotDeactivated)));
    }

    #[test]
    fn test_deactivate_nonexistent_asset_fails() {
        let (env, client, admin) = setup();
        let nonexistent = String::from_str(&env, "FAKE");

        let result =
            client.try_deactivate_asset(&admin, &nonexistent, &String::from_str(&env, "Attempt"));
        assert_eq!(result, Err(Ok(RegistryError::AssetNotFound)));
    }

    #[test]
    fn test_restore_nonexistent_asset_fails() {
        let (env, client, admin) = setup();
        let nonexistent = String::from_str(&env, "FAKE");

        let result = client.try_restore_asset(&admin, &nonexistent);
        assert_eq!(result, Err(Ok(RegistryError::AssetNotFound)));
    }

    #[test]
    fn test_deactivate_unauthorized_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, AssetRegistryContract);
        let client = AssetRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.initialize(&admin);
        let asset_code = register_usdc(&env, &client, &admin);
        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        // Try to deactivate from unauthorized address
        let result = client.try_deactivate_asset(
            &unauthorized,
            &asset_code,
            &String::from_str(&env, "Unauthorized"),
        );
        assert!(result.is_err());

        // Verify asset remains active (no state change)
        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Active);
    }

    #[test]
    fn test_restore_unauthorized_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, AssetRegistryContract);
        let client = AssetRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let unauthorized = Address::generate(&env);

        client.initialize(&admin);
        let asset_code = register_usdc(&env, &client, &admin);
        client.update_status(&admin, &asset_code, &AssetStatus::Active);
        client.deactivate_asset(&admin, &asset_code, &String::from_str(&env, "Temporary"));

        // Try to restore from unauthorized address
        let result = client.try_restore_asset(&unauthorized, &asset_code);
        assert!(result.is_err());

        // Verify asset remains deactivated (no state change)
        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Deactivated);
    }

    #[test]
    fn test_deactivate_restore_idempotency() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        // First cycle: deactivate and restore
        client.deactivate_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "First deactivation"),
        );
        client.restore_asset(&admin, &asset_code);

        let meta1 = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta1.status, AssetStatus::Active);
        let version_after_first = meta1.version;

        // Second cycle: deactivate and restore again
        client.deactivate_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "Second deactivation"),
        );
        client.restore_asset(&admin, &asset_code);

        let meta2 = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta2.status, AssetStatus::Active);
        // Version should continue incrementing, not reset
        assert_eq!(meta2.version, version_after_first + 2);
    }

    #[test]
    fn test_state_continuity_deactivate_restore() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, AssetRegistryContract);
        let client = AssetRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Register asset with specific metadata
        let asset_code = String::from_str(&env, "LEGACY");
        client.register_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "Legacy Token"),
            &String::from_str(&env, "LEG"),
            &String::from_str(&env, "legacy.com"),
            &8u32,
            &AssetCategory::Other,
            &String::from_str(&env, "Historical asset"),
            &String::from_str(&env, "https://legacy.com"),
        );

        // Activate and record base state
        client.update_status(&admin, &asset_code, &AssetStatus::Active);
        let base_meta = client.get_asset(&asset_code).unwrap();

        // Deactivate
        client.deactivate_asset(&admin, &asset_code, &String::from_str(&env, "Archived"));

        // Restore
        client.restore_asset(&admin, &asset_code);
        let restored_meta = client.get_asset(&asset_code).unwrap();

        // Verify all non-status fields are identical
        assert_eq!(restored_meta.asset_code, base_meta.asset_code);
        assert_eq!(restored_meta.name, base_meta.name);
        assert_eq!(restored_meta.symbol, base_meta.symbol);
        assert_eq!(restored_meta.issuer, base_meta.issuer);
        assert_eq!(restored_meta.decimals, base_meta.decimals);
        assert_eq!(restored_meta.category, base_meta.category);
        assert_eq!(restored_meta.compliance, base_meta.compliance);
        assert_eq!(restored_meta.risk_rating, base_meta.risk_rating);
        assert_eq!(restored_meta.risk_score_bps, base_meta.risk_score_bps);
        assert_eq!(restored_meta.description, base_meta.description);
        assert_eq!(restored_meta.url, base_meta.url);
        assert_eq!(restored_meta.registered_at, base_meta.registered_at);
        assert_eq!(restored_meta.registered_by, base_meta.registered_by);
        // Status must change
        assert_eq!(restored_meta.status, AssetStatus::Active);
        // Version incremented twice (once for deactivate, once for restore)
        assert_eq!(restored_meta.version, base_meta.version + 2);
    }

    #[test]
    fn test_version_history_tracks_deactivation() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        // De activate the asset
        client.deactivate_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "Maintenance break"),
        );

        // Restore the asset
        client.restore_asset(&admin, &asset_code);

        // Check version history: should have 3 entries (registration, deactivation, restoration)
        let versions = client.get_metadata_versions(&asset_code);
        assert!(versions.len() >= 3);

        // Latest version should reflect Active status
        let latest = versions.get(versions.len() - 1).unwrap();
        assert_eq!(latest.metadata.status, AssetStatus::Active);
    }

    // -----------------------------------------------------------------------
    // Compliance tracking
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_compliance() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_compliance(
            &admin,
            &asset_code,
            &ComplianceStatus::Compliant,
            &String::from_str(&env, "US"),
            &String::from_str(&env, "SOC2"),
            &1_000_000,
            &2_000_000,
            &String::from_str(&env, "Passed audit"),
        );

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.compliance, ComplianceStatus::Compliant);

        let records = client.get_compliance_records(&asset_code);
        assert_eq!(records.len(), 1);
        assert_eq!(
            records.get(0).unwrap().jurisdiction,
            String::from_str(&env, "US")
        );
    }

    #[test]
    fn test_multiple_compliance_records() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.update_compliance(
            &admin,
            &asset_code,
            &ComplianceStatus::Compliant,
            &String::from_str(&env, "US"),
            &String::from_str(&env, "SOC2"),
            &1_000_000,
            &2_000_000,
            &String::from_str(&env, "US audit"),
        );

        client.update_compliance(
            &admin,
            &asset_code,
            &ComplianceStatus::UnderReview,
            &String::from_str(&env, "EU"),
            &String::from_str(&env, "MiCA"),
            &1_500_000,
            &3_000_000,
            &String::from_str(&env, "EU review"),
        );

        let records = client.get_compliance_records(&asset_code);
        assert_eq!(records.len(), 2);

        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.compliance, ComplianceStatus::UnderReview);
    }

    // -----------------------------------------------------------------------
    // Multi-chain linking
    // -----------------------------------------------------------------------

    #[test]
    fn test_link_chain() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.link_chain(
            &admin,
            &asset_code,
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
            &true,
        );

        let chains = client.get_chain_links(&asset_code);
        assert_eq!(chains.len(), 1);
        assert_eq!(
            chains.get(0).unwrap().chain_id,
            String::from_str(&env, "ethereum")
        );
        assert!(chains.get(0).unwrap().is_canonical);
    }

    #[test]
    fn test_link_multiple_chains() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.link_chain(
            &admin,
            &asset_code,
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xa0b8..."),
            &true,
        );

        client.link_chain(
            &admin,
            &asset_code,
            &String::from_str(&env, "stellar"),
            &String::from_str(&env, "GA5ZS..."),
            &false,
        );

        client.link_chain(
            &admin,
            &asset_code,
            &String::from_str(&env, "polygon"),
            &String::from_str(&env, "0x2791..."),
            &false,
        );

        let chains = client.get_chain_links(&asset_code);
        assert_eq!(chains.len(), 3);
    }

    #[test]
    fn test_link_duplicate_chain_fails() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.link_chain(
            &admin,
            &asset_code,
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xa0b8..."),
            &true,
        );

        let result = client.try_link_chain(
            &admin,
            &asset_code,
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xdiff..."),
            &false,
        );
        assert_eq!(result, Err(Ok(RegistryError::DuplicateChainLink)));
    }

    #[test]
    fn test_link_chain_nonexistent_asset() {
        let (env, client, admin) = setup();

        let result = client.try_link_chain(
            &admin,
            &String::from_str(&env, "FAKE"),
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0x..."),
            &true,
        );
        assert_eq!(result, Err(Ok(RegistryError::AssetNotFound)));
    }

    // -----------------------------------------------------------------------
    // Bridge associations
    // -----------------------------------------------------------------------

    #[test]
    fn test_link_bridge_contract() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.link_bridge_contract(
            &admin,
            &asset_code,
            &String::from_str(&env, "CIRCLE_USDC"),
            &String::from_str(&env, "0xbridge..."),
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "stellar"),
        );

        let bridges = client.get_bridge_associations(&asset_code);
        assert_eq!(bridges.len(), 1);
        assert_eq!(
            bridges.get(0).unwrap().bridge_id,
            String::from_str(&env, "CIRCLE_USDC")
        );
        assert!(bridges.get(0).unwrap().is_active);
    }

    #[test]
    fn test_duplicate_bridge_fails() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.link_bridge_contract(
            &admin,
            &asset_code,
            &String::from_str(&env, "CIRCLE_USDC"),
            &String::from_str(&env, "0xbridge..."),
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "stellar"),
        );

        let result = client.try_link_bridge_contract(
            &admin,
            &asset_code,
            &String::from_str(&env, "CIRCLE_USDC"),
            &String::from_str(&env, "0xother..."),
            &String::from_str(&env, "polygon"),
            &String::from_str(&env, "stellar"),
        );
        assert_eq!(result, Err(Ok(RegistryError::DuplicateBridge)));
    }

    // -----------------------------------------------------------------------
    // Oracle feed registration
    // -----------------------------------------------------------------------

    #[test]
    fn test_register_oracle_feed() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.register_oracle_feed(
            &admin,
            &asset_code,
            &String::from_str(&env, "chainlink_usdc_usd"),
            &String::from_str(&env, "Chainlink"),
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xfeed..."),
        );

        let feeds = client.get_oracle_feeds(&asset_code);
        assert_eq!(feeds.len(), 1);
        assert!(feeds.get(0).unwrap().is_active);
    }

    #[test]
    fn test_duplicate_oracle_feed_fails() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.register_oracle_feed(
            &admin,
            &asset_code,
            &String::from_str(&env, "chainlink_usdc_usd"),
            &String::from_str(&env, "Chainlink"),
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xfeed..."),
        );

        let result = client.try_register_oracle_feed(
            &admin,
            &asset_code,
            &String::from_str(&env, "chainlink_usdc_usd"),
            &String::from_str(&env, "Chainlink"),
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xother..."),
        );
        assert_eq!(result, Err(Ok(RegistryError::DuplicateOracleFeed)));
    }

    // -----------------------------------------------------------------------
    // Liquidity pool mappings
    // -----------------------------------------------------------------------

    #[test]
    fn test_add_liquidity_pool() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.add_liquidity_pool(
            &admin,
            &asset_code,
            &String::from_str(&env, "USDC_XLM"),
            &String::from_str(&env, "XLM"),
        );

        let pools = client.get_pool_associations(&asset_code);
        assert_eq!(pools.len(), 1);
        assert_eq!(
            pools.get(0).unwrap().pool_id,
            String::from_str(&env, "USDC_XLM")
        );
    }

    #[test]
    fn test_duplicate_pool_fails() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.add_liquidity_pool(
            &admin,
            &asset_code,
            &String::from_str(&env, "USDC_XLM"),
            &String::from_str(&env, "XLM"),
        );

        let result = client.try_add_liquidity_pool(
            &admin,
            &asset_code,
            &String::from_str(&env, "USDC_XLM"),
            &String::from_str(&env, "XLM"),
        );
        assert_eq!(result, Err(Ok(RegistryError::DuplicatePool)));
    }

    // -----------------------------------------------------------------------
    // Metadata versioning
    // -----------------------------------------------------------------------

    #[test]
    fn test_version_history_tracked() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        // Make 3 updates
        for _i in 0..3u32 {
            let name = String::from_str(&env, "USD Coin");
            client.update_metadata(
                &admin,
                &asset_code,
                &name,
                &String::from_str(&env, "USDC"),
                &String::from_str(&env, "circle.com"),
                &String::from_str(&env, "desc"),
                &String::from_str(&env, "url"),
                &String::from_str(&env, "update"),
            );
        }

        let versions = client.get_metadata_versions(&asset_code);
        assert_eq!(versions.len(), 4); // 1 initial + 3 updates
    }

    #[test]
    fn test_get_metadata_at_version() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        // Update name
        client.update_metadata(
            &admin,
            &asset_code,
            &String::from_str(&env, "USD Coin v2"),
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "circle.com"),
            &String::from_str(&env, "desc"),
            &String::from_str(&env, "url"),
            &String::from_str(&env, "Name update"),
        );

        // Retrieve v1
        let v1 = client.get_metadata_at_version(&asset_code, &1).unwrap();
        assert_eq!(v1.metadata.name, String::from_str(&env, "USD Coin"));

        // Retrieve v2
        let v2 = client.get_metadata_at_version(&asset_code, &2).unwrap();
        assert_eq!(v2.metadata.name, String::from_str(&env, "USD Coin v2"));
        assert_eq!(v2.change_reason, String::from_str(&env, "Name update"));
    }

    #[test]
    fn test_get_metadata_nonexistent_version() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        let result = client.get_metadata_at_version(&asset_code, &99);
        assert!(result.is_none());
    }

    // -----------------------------------------------------------------------
    // Read queries for nonexistent assets
    // -----------------------------------------------------------------------

    #[test]
    fn test_get_nonexistent_asset() {
        let (env, client, _admin) = setup();
        let result = client.get_asset(&String::from_str(&env, "FAKE"));
        assert!(result.is_none());
    }

    #[test]
    fn test_get_empty_chain_links() {
        let (env, client, _admin) = setup();
        let links = client.get_chain_links(&String::from_str(&env, "FAKE"));
        assert_eq!(links.len(), 0);
    }

    #[test]
    fn test_get_empty_oracle_feeds() {
        let (env, client, _admin) = setup();
        let feeds = client.get_oracle_feeds(&String::from_str(&env, "FAKE"));
        assert_eq!(feeds.len(), 0);
    }

    #[test]
    fn test_get_empty_bridge_assocs() {
        let (env, client, _admin) = setup();
        let bridges = client.get_bridge_associations(&String::from_str(&env, "FAKE"));
        assert_eq!(bridges.len(), 0);
    }

    #[test]
    fn test_get_empty_pool_assocs() {
        let (env, client, _admin) = setup();
        let pools = client.get_pool_associations(&String::from_str(&env, "FAKE"));
        assert_eq!(pools.len(), 0);
    }

    // -----------------------------------------------------------------------
    // Full integration: complete asset lifecycle
    // -----------------------------------------------------------------------

    #[test]
    fn test_full_asset_lifecycle() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        // 1. Register chains
        client.link_chain(
            &admin,
            &asset_code,
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xa0b8..."),
            &true,
        );
        client.link_chain(
            &admin,
            &asset_code,
            &String::from_str(&env, "stellar"),
            &String::from_str(&env, "GA5ZS..."),
            &false,
        );

        // 2. Register oracle
        client.register_oracle_feed(
            &admin,
            &asset_code,
            &String::from_str(&env, "chainlink_usdc_usd"),
            &String::from_str(&env, "Chainlink"),
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "0xfeed..."),
        );

        // 3. Link bridge
        client.link_bridge_contract(
            &admin,
            &asset_code,
            &String::from_str(&env, "CIRCLE_USDC"),
            &String::from_str(&env, "0xbridge..."),
            &String::from_str(&env, "ethereum"),
            &String::from_str(&env, "stellar"),
        );

        // 4. Add pool
        client.add_liquidity_pool(
            &admin,
            &asset_code,
            &String::from_str(&env, "USDC_XLM"),
            &String::from_str(&env, "XLM"),
        );

        // 5. Update compliance
        client.update_compliance(
            &admin,
            &asset_code,
            &ComplianceStatus::Compliant,
            &String::from_str(&env, "US"),
            &String::from_str(&env, "SOC2"),
            &1_000_000,
            &2_000_000,
            &String::from_str(&env, "Passed"),
        );

        // 6. Activate
        client.update_status(&admin, &asset_code, &AssetStatus::Active);

        // 7. Verify everything
        let meta = client.get_asset(&asset_code).unwrap();
        assert_eq!(meta.status, AssetStatus::Active);
        assert_eq!(meta.compliance, ComplianceStatus::Compliant);

        assert_eq!(client.get_chain_links(&asset_code).len(), 2);
        assert_eq!(client.get_oracle_feeds(&asset_code).len(), 1);
        assert_eq!(client.get_bridge_associations(&asset_code).len(), 1);
        assert_eq!(client.get_pool_associations(&asset_code).len(), 1);
        assert_eq!(client.get_compliance_records(&asset_code).len(), 1);

        // Versions: initial + compliance + status = multiple versions
        let versions = client.get_metadata_versions(&asset_code);
        assert!(versions.len() >= 3);

        // 8. Pause
        client.update_status(&admin, &asset_code, &AssetStatus::Paused);
        assert_eq!(
            client.get_asset(&asset_code).unwrap().status,
            AssetStatus::Paused
        );

        // 9. Deprecate
        client.update_status(&admin, &asset_code, &AssetStatus::Deprecated);
        assert_eq!(
            client.get_asset(&asset_code).unwrap().status,
            AssetStatus::Deprecated
        );
    }

    // -----------------------------------------------------------------------
    // Asset categories
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Asset whitelisting
    // -----------------------------------------------------------------------

    #[test]
    fn test_whitelist_add_and_check() {
        let (env, client, admin) = setup();
        let asset_code = String::from_str(&env, "USDC");

        assert!(!client.is_whitelisted(&asset_code));

        client.whitelist_add(&admin, &asset_code);
        assert!(client.is_whitelisted(&asset_code));
    }

    #[test]
    fn test_whitelist_add_duplicate_fails() {
        let (env, client, admin) = setup();
        let asset_code = String::from_str(&env, "USDC");

        client.whitelist_add(&admin, &asset_code);
        let result = client.try_whitelist_add(&admin, &asset_code);
        assert_eq!(result, Err(Ok(RegistryError::AssetAlreadyWhitelisted)));
    }

    #[test]
    fn test_whitelist_remove() {
        let (env, client, admin) = setup();
        let asset_code = String::from_str(&env, "USDC");

        client.whitelist_add(&admin, &asset_code);
        assert!(client.is_whitelisted(&asset_code));

        client.whitelist_remove(&admin, &asset_code);
        assert!(!client.is_whitelisted(&asset_code));
    }

    #[test]
    fn test_whitelist_remove_nonexistent_fails() {
        let (env, client, admin) = setup();
        let asset_code = String::from_str(&env, "FAKE");

        let result = client.try_whitelist_remove(&admin, &asset_code);
        assert_eq!(result, Err(Ok(RegistryError::AssetNotWhitelisted)));
    }

    #[test]
    fn test_get_whitelist() {
        let (env, client, admin) = setup();

        let usdc = String::from_str(&env, "USDC");
        let eurc = String::from_str(&env, "EURC");

        client.whitelist_add(&admin, &usdc);
        client.whitelist_add(&admin, &eurc);

        let list = client.get_whitelist();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn test_whitelist_non_admin_fails() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);
        let asset_code = String::from_str(&env, "USDC");

        let result = client.try_whitelist_add(&stranger, &asset_code);
        assert_eq!(result, Err(Ok(RegistryError::NotAuthorized)));
    }

    #[test]
    fn test_register_blocked_when_not_whitelisted() {
        let (env, client, admin) = setup();

        // Put something else on the whitelist so it's non-empty
        client.whitelist_add(&admin, &String::from_str(&env, "EURC"));

        // USDC is not on the whitelist
        let result = client.try_register_asset(
            &admin,
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "USD Coin"),
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "circle.com"),
            &6,
            &AssetCategory::Stablecoin,
            &String::from_str(&env, "desc"),
            &String::from_str(&env, "url"),
        );
        assert_eq!(result, Err(Ok(RegistryError::AssetNotWhitelisted)));
    }

    #[test]
    fn test_register_allowed_when_whitelisted() {
        let (env, client, admin) = setup();

        let asset_code = String::from_str(&env, "USDC");
        client.whitelist_add(&admin, &asset_code);
        register_usdc(&env, &client, &admin);

        assert!(client.get_asset(&asset_code).is_some());
    }

    #[test]
    fn test_register_allowed_when_whitelist_empty() {
        // Empty whitelist = open registry (no restriction)
        let (env, client, admin) = setup();
        register_usdc(&env, &client, &admin);

        assert!(client.get_asset(&String::from_str(&env, "USDC")).is_some());
    }

    #[test]
    fn test_all_asset_categories() {
        let (env, client, admin) = setup();

        let categories = [
            ("USDC", AssetCategory::Stablecoin),
            ("FOBXX", AssetCategory::RealWorldAsset),
            ("XLM", AssetCategory::Native),
            ("wETH", AssetCategory::Bridged),
            ("wBTC", AssetCategory::Wrapped),
            ("MISC", AssetCategory::Other),
        ];

        for (code, cat) in categories.iter() {
            let asset_code = String::from_str(&env, code);
            client.register_asset(
                &admin,
                &asset_code,
                &String::from_str(&env, code),
                &String::from_str(&env, code),
                &String::from_str(&env, "issuer"),
                &6,
                cat,
                &String::from_str(&env, "desc"),
                &String::from_str(&env, "url"),
            );
        }

        assert_eq!(client.get_all_assets().len(), 6);
        assert_eq!(
            client
                .get_assets_by_category(&AssetCategory::Stablecoin)
                .len(),
            1
        );
        assert_eq!(
            client
                .get_assets_by_category(&AssetCategory::RealWorldAsset)
                .len(),
            1
        );
        assert_eq!(
            client.get_assets_by_category(&AssetCategory::Native).len(),
            1
        );
    }

    // -----------------------------------------------------------------------
    // Frozen asset controls
    // -----------------------------------------------------------------------

    #[test]
    fn test_freeze_asset() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        assert!(!client.is_asset_frozen(&asset_code));

        client.freeze_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "Unsafe asset detected"),
        );

        assert!(client.is_asset_frozen(&asset_code));
    }

    #[test]
    fn test_freeze_asset_state() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        let reason = String::from_str(&env, "Deprecated");
        client.freeze_asset(&admin, &asset_code, &reason);

        let frozen_state = client.get_frozen_state(&asset_code).unwrap();
        assert!(frozen_state.is_frozen);
        assert_eq!(frozen_state.freeze_reason, reason);
        assert_eq!(frozen_state.frozen_by, admin);
    }

    #[test]
    fn test_unfreeze_asset() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.freeze_asset(
            &admin,
            &asset_code,
            &String::from_str(&env, "Temporary freeze"),
        );
        assert!(client.is_asset_frozen(&asset_code));

        client.unfreeze_asset(&admin, &asset_code);
        assert!(!client.is_asset_frozen(&asset_code));
    }

    #[test]
    fn test_update_metadata_frozen_fails() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        client.freeze_asset(&admin, &asset_code, &String::from_str(&env, "Asset frozen"));

        let result = client.try_update_metadata(
            &admin,
            &asset_code,
            &String::from_str(&env, "New Name"),
            &String::from_str(&env, "USDC"),
            &String::from_str(&env, "circle.com"),
            &String::from_str(&env, "desc"),
            &String::from_str(&env, "url"),
            &String::from_str(&env, "reason"),
        );
        assert_eq!(result, Err(Ok(RegistryError::AssetFrozen)));
    }

    #[test]
    fn test_freeze_nonexistent_asset() {
        let (env, client, admin) = setup();

        let result = client.try_freeze_asset(
            &admin,
            &String::from_str(&env, "FAKE"),
            &String::from_str(&env, "reason"),
        );
        assert_eq!(result, Err(Ok(RegistryError::AssetNotFound)));
    }

    #[test]
    fn test_freeze_non_admin_fails() {
        let (env, client, admin) = setup();
        let stranger = Address::generate(&env);
        let asset_code = register_usdc(&env, &client, &admin);

        let result =
            client.try_freeze_asset(&stranger, &asset_code, &String::from_str(&env, "reason"));
        assert_eq!(result, Err(Ok(RegistryError::NotAuthorized)));
    }

    #[test]
    fn test_get_frozen_state_unfrozen() {
        let (env, client, admin) = setup();
        let asset_code = register_usdc(&env, &client, &admin);

        let state = client.get_frozen_state(&asset_code);
        assert!(state.is_none());

        assert!(!client.is_asset_frozen(&asset_code));
    }
}
