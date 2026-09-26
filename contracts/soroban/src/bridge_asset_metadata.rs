//! Safe asset metadata updates for Bridge Watch monitored assets.
//!
//! Updates metadata in-place without recreating the asset registration entry.

use soroban_sdk::{contracterror, contracttype, symbol_short, Address, Env, String, Vec};

use crate::keys;

/// Maximum metadata field lengths (bytes).
pub const MAX_NAME_LEN: u32 = 128;
pub const MAX_SYMBOL_LEN: u32 = 32;
pub const MAX_DESCRIPTION_LEN: u32 = 512;
pub const MAX_URL_LEN: u32 = 256;
pub const MAX_REASON_LEN: u32 = 256;
pub const MAX_VERSION_HISTORY: u32 = 50;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AssetMetadataError {
    NotInitialized = 1,
    NotAuthorized = 2,
    EmptyField = 3,
    FieldTooLong = 4,
    AssetNotRegistered = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MetadataStorageKey {
    Meta(String),
    History(String),
}

/// Current metadata document for a monitored asset.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BridgeAssetMetadata {
    pub asset_code: String,
    pub name: String,
    pub symbol: String,
    pub description: String,
    pub url: String,
    pub version: u32,
    pub updated_at: u64,
    pub updated_by: Address,
}

/// One historical metadata change record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataChangeRecord {
    pub version: u32,
    pub metadata: BridgeAssetMetadata,
    pub change_reason: String,
    pub changed_by: Address,
    pub timestamp: u64,
}

fn require_admin(env: &Env, caller: &Address) -> Result<(), AssetMetadataError> {
    caller.require_auth();
    let admin: Address = env
        .storage()
        .instance()
        .get(&keys::ADMIN)
        .ok_or(AssetMetadataError::NotInitialized)?;
    if *caller != admin {
        return Err(AssetMetadataError::NotAuthorized);
    }
    Ok(())
}

fn validate_field(value: &String, max_len: u32) -> Result<(), AssetMetadataError> {
    if value.len() == 0 {
        return Err(AssetMetadataError::EmptyField);
    }
    if value.len() > max_len {
        return Err(AssetMetadataError::FieldTooLong);
    }
    Ok(())
}

fn asset_is_registered(env: &Env, asset_code: &String) -> bool {
    env.storage()
        .persistent()
        .has(&crate::AssetDataKey::Health(asset_code.clone()))
}

fn load_history(env: &Env, asset_code: &String) -> Vec<MetadataChangeRecord> {
    env.storage()
        .persistent()
        .get(&MetadataStorageKey::History(asset_code.clone()))
        .unwrap_or_else(|| Vec::new(env))
}

fn save_history(env: &Env, asset_code: &String, history: Vec<MetadataChangeRecord>) {
    let mut trimmed = history;
    if trimmed.len() > MAX_VERSION_HISTORY {
        let mut next: Vec<MetadataChangeRecord> = Vec::new(env);
        for i in 1..trimmed.len() {
            next.push_back(trimmed.get(i).unwrap());
        }
        trimmed = next;
    }
    env.storage()
        .persistent()
        .set(&MetadataStorageKey::History(asset_code.clone()), &trimmed);
}

/// Read metadata for an asset. Returns `None` when no metadata has been set.
pub fn get_metadata(env: Env, asset_code: String) -> Option<BridgeAssetMetadata> {
    env.storage()
        .persistent()
        .get(&MetadataStorageKey::Meta(asset_code))
}

/// Read metadata change history for an asset.
pub fn get_metadata_history(env: Env, asset_code: String) -> Vec<MetadataChangeRecord> {
    load_history(&env, &asset_code)
}

/// Update asset metadata without recreating the asset registration entry.
pub fn update_metadata(
    env: Env,
    caller: Address,
    asset_code: String,
    name: String,
    symbol: String,
    description: String,
    url: String,
    change_reason: String,
) -> Result<BridgeAssetMetadata, AssetMetadataError> {
    require_admin(&env, &caller)?;

    if !asset_is_registered(&env, &asset_code) {
        return Err(AssetMetadataError::AssetNotRegistered);
    }

    validate_field(&name, MAX_NAME_LEN)?;
    validate_field(&symbol, MAX_SYMBOL_LEN)?;
    validate_field(&description, MAX_DESCRIPTION_LEN)?;
    validate_field(&url, MAX_URL_LEN)?;
    validate_field(&change_reason, MAX_REASON_LEN)?;

    let now = env.ledger().timestamp();
    let previous: Option<BridgeAssetMetadata> = get_metadata(env.clone(), asset_code.clone());
    let version = previous.as_ref().map(|m| m.version + 1).unwrap_or(1);

    let metadata = BridgeAssetMetadata {
        asset_code: asset_code.clone(),
        name,
        symbol,
        description,
        url,
        version,
        updated_at: now,
        updated_by: caller.clone(),
    };

    env.storage()
        .persistent()
        .set(&MetadataStorageKey::Meta(asset_code.clone()), &metadata);

    let mut history = load_history(&env, &asset_code);
    history.push_back(MetadataChangeRecord {
        version,
        metadata: metadata.clone(),
        change_reason,
        changed_by: caller.clone(),
        timestamp: now,
    });
    save_history(&env, &asset_code, history);

    env.events().publish(
        (symbol_short!("meta_up"), asset_code.clone()),
        (version, now),
    );

    Ok(metadata)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger;
    use soroban_sdk::Env;

    fn setup() -> (Env, Address, String, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract = Address::generate(&env);
        env.as_contract(&contract, || {
            env.storage().instance().set(&keys::ADMIN, &admin);
        });
        env.ledger().set_timestamp(1_000_000);

        let asset_code = String::from_str(&env, "USDC");
        env.as_contract(&contract, || {
            env.storage().persistent().set(
                &crate::AssetDataKey::Health(asset_code.clone()),
                &crate::AssetHealth {
                    asset_code: asset_code.clone(),
                    health_score: 0,
                    liquidity_score: 0,
                    price_stability_score: 0,
                    bridge_uptime_score: 0,
                    paused: false,
                    active: true,
                    timestamp: 1_000_000,
                    expires_at: 0,
                },
            );
        });

        (env, admin, asset_code, contract)
    }

    #[test]
    fn test_update_metadata_creates_version_history() {
        let (env, admin, asset_code, contract) = setup();

        let meta = env.as_contract(&contract, || {
            update_metadata(
                env.clone(),
                admin.clone(),
                asset_code.clone(),
                String::from_str(&env, "USD Coin"),
                String::from_str(&env, "USDC"),
                String::from_str(&env, "Stablecoin"),
                String::from_str(&env, "https://circle.com/usdc"),
                String::from_str(&env, "Initial metadata"),
            )
        }).unwrap();
        assert_eq!(meta.version, 1);

        let updated = env.as_contract(&contract, || {
            update_metadata(
                env.clone(),
                admin,
                asset_code.clone(),
                String::from_str(&env, "USD Coin v2"),
                String::from_str(&env, "USDC"),
                String::from_str(&env, "Updated stablecoin"),
                String::from_str(&env, "https://circle.com"),
                String::from_str(&env, "Refresh copy"),
            )
        }).unwrap();
        assert_eq!(updated.version, 2);

        let history = env.as_contract(&contract, || get_metadata_history(env.clone(), asset_code));
        assert_eq!(history.len(), 2);
    }

    #[test]
    fn test_update_metadata_unknown_asset_fails() {
        let (env, admin, _, contract) = setup();
        let result = env.as_contract(&contract, || update_metadata(
            env.clone(),
            admin,
            String::from_str(&env, "FAKE"),
            String::from_str(&env, "Fake"),
            String::from_str(&env, "FAKE"),
            String::from_str(&env, "desc"),
            String::from_str(&env, "https://example.com"),
            String::from_str(&env, "reason"),
        ));
        assert_eq!(result, Err(AssetMetadataError::AssetNotRegistered));
    }
}
