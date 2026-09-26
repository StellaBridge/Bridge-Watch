use soroban_sdk::{contracttype, symbol_short, Address, Env, String, Vec};

use crate::keys;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlessedSource {
    pub source_address: Address,
    pub asset_code: String,
    pub name: String,
    pub blessed_by: Address,
    pub blessed_at: u64,
    pub is_active: bool,
    pub unblessed_by: Option<Address>,
    pub unblessed_at: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BlessedSourceEntry {
    pub source_address: Address,
    pub asset_code: String,
    pub name: String,
    pub is_active: bool,
    pub blessed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SourceBlessingKey {
    Blessing(Address, String),
    AllBlessings,
    AssetBlessings(String),
}

fn require_admin(env: &Env, caller: &Address) {
    caller.require_auth();
    let admin: Address = env
        .storage()
        .instance()
        .get(&keys::ADMIN)
        .unwrap_or_else(|| panic!("contract not initialized"));
    if *caller != admin {
        panic!("only admin can manage source blessings");
    }
}

pub fn bless_source(
    env: &Env,
    caller: &Address,
    source_address: &Address,
    asset_code: String,
    name: String,
) {
    require_admin(env, caller);

    if name.is_empty() {
        panic!("source name cannot be empty");
    }
    if asset_code.is_empty() {
        panic!("asset_code cannot be empty");
    }

    let now = env.ledger().timestamp();
    let key = SourceBlessingKey::Blessing(source_address.clone(), asset_code.clone());
    let existing: Option<BlessedSource> = env.storage().persistent().get(&key);

    let blessing = match existing {
        Some(mut existing_blessing) => {
            existing_blessing.is_active = true;
            existing_blessing.name = name.clone();
            existing_blessing.blessed_by = caller.clone();
            existing_blessing.blessed_at = now;
            existing_blessing.unblessed_by = None;
            existing_blessing.unblessed_at = None;
            existing_blessing
        }
        None => BlessedSource {
            source_address: source_address.clone(),
            asset_code: asset_code.clone(),
            name: name.clone(),
            blessed_by: caller.clone(),
            blessed_at: now,
            is_active: true,
            unblessed_by: None,
            unblessed_at: None,
        },
    };

    env.storage().persistent().set(&key, &blessing);

    let all_key = SourceBlessingKey::AllBlessings;
    let mut all: Vec<(Address, String)> = env
        .storage()
        .persistent()
        .get(&all_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut found = false;
    for (addr, code) in all.iter() {
        if &addr == source_address && code == asset_code {
            found = true;
            break;
        }
    }

    if !found {
        all.push_back((source_address.clone(), asset_code.clone()));
        env.storage().persistent().set(&all_key, &all);
    }

    let asset_key = SourceBlessingKey::AssetBlessings(asset_code.clone());
    let mut asset_sources: Vec<Address> = env
        .storage()
        .persistent()
        .get(&asset_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut asset_found = false;
    for addr in asset_sources.iter() {
        if &addr == source_address {
            asset_found = true;
            break;
        }
    }

    if !asset_found {
        asset_sources.push_back(source_address.clone());
        env.storage().persistent().set(&asset_key, &asset_sources);
    }

    env.events().publish(
        (symbol_short!("src_bls"),),
        (
            source_address.clone(),
            asset_code,
            name,
            caller.clone(),
            now,
        ),
    );
}

pub fn unbless_source(env: &Env, caller: &Address, source_address: &Address, asset_code: String) {
    require_admin(env, caller);

    let key = SourceBlessingKey::Blessing(source_address.clone(), asset_code.clone());
    let mut blessing: BlessedSource = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| panic!("source not blessed for this asset"));

    if !blessing.is_active {
        panic!("source is already unblessed for this asset");
    }

    let now = env.ledger().timestamp();
    blessing.is_active = false;
    blessing.unblessed_by = Some(caller.clone());
    blessing.unblessed_at = Some(now);

    env.storage().persistent().set(&key, &blessing);

    env.events().publish(
        (symbol_short!("src_unb"),),
        (source_address.clone(), asset_code, caller.clone(), now),
    );
}

pub fn is_source_blessed(env: &Env, source_address: &Address, asset_code: &String) -> bool {
    let key = SourceBlessingKey::Blessing(source_address.clone(), asset_code.clone());
    let blessing: Option<BlessedSource> = env.storage().persistent().get(&key);
    match blessing {
        Some(b) => b.is_active,
        None => false,
    }
}

pub fn get_blessing(
    env: &Env,
    source_address: &Address,
    asset_code: &String,
) -> Option<BlessedSource> {
    let key = SourceBlessingKey::Blessing(source_address.clone(), asset_code.clone());
    env.storage().persistent().get(&key)
}

pub fn get_blessed_sources_for_asset(env: &Env, asset_code: &String) -> Vec<BlessedSourceEntry> {
    let asset_key = SourceBlessingKey::AssetBlessings(asset_code.clone());
    let asset_sources: Vec<Address> = env
        .storage()
        .persistent()
        .get(&asset_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut result: Vec<BlessedSourceEntry> = Vec::new(env);
    for addr in asset_sources.iter() {
        let key = SourceBlessingKey::Blessing(addr.clone(), asset_code.clone());
        if let Some(b) = env.storage().persistent().get::<_, BlessedSource>(&key) {
            result.push_back(BlessedSourceEntry {
                source_address: b.source_address,
                asset_code: b.asset_code,
                name: b.name,
                is_active: b.is_active,
                blessed_at: b.blessed_at,
            });
        }
    }
    result
}

pub fn get_all_blessings(env: &Env) -> Vec<BlessedSourceEntry> {
    let all_key = SourceBlessingKey::AllBlessings;
    let all: Vec<(Address, String)> = env
        .storage()
        .persistent()
        .get(&all_key)
        .unwrap_or_else(|| Vec::new(env));

    let mut result: Vec<BlessedSourceEntry> = Vec::new(env);
    for (addr, code) in all.iter() {
        let key = SourceBlessingKey::Blessing(addr.clone(), code.clone());
        if let Some(b) = env.storage().persistent().get::<_, BlessedSource>(&key) {
            result.push_back(BlessedSourceEntry {
                source_address: b.source_address,
                asset_code: b.asset_code,
                name: b.name,
                is_active: b.is_active,
                blessed_at: b.blessed_at,
            });
        }
    }
    result
}

pub fn get_preferred_source_for_asset(env: &Env, asset_code: &String) -> Option<Address> {
    let blessed = get_blessed_sources_for_asset(env, asset_code);
    if blessed.is_empty() {
        return None;
    }

    let mut active_sources: Vec<BlessedSourceEntry> = Vec::new(env);
    for b in blessed.iter() {
        if b.is_active {
            active_sources.push_back(b);
        }
    }

    if active_sources.is_empty() {
        return None;
    }

    active_sources.get(0).map(|preferred| preferred.source_address)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::testutils::Ledger;
    use soroban_sdk::Env;

    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        env.storage().instance().set(&keys::ADMIN, &admin);
        env.ledger().set_timestamp(1_000_000);
        (env, admin)
    }

    #[test]
    fn test_bless_source() {
        let (env, admin) = setup();
        let source = Address::generate(&env);

        bless_source(
            &env,
            &admin,
            &source,
            String::from_str(&env, "USDC"),
            String::from_str(&env, "CoinGecko"),
        );

        assert!(is_source_blessed(
            &env,
            &source,
            &String::from_str(&env, "USDC")
        ));
    }

    #[test]
    fn test_unbless_source() {
        let (env, admin) = setup();
        let source = Address::generate(&env);

        bless_source(
            &env,
            &admin,
            &source,
            String::from_str(&env, "USDC"),
            String::from_str(&env, "CoinGecko"),
        );
        assert!(is_source_blessed(
            &env,
            &source,
            &String::from_str(&env, "USDC")
        ));

        unbless_source(&env, &admin, &source, String::from_str(&env, "USDC"));
        assert!(!is_source_blessed(
            &env,
            &source,
            &String::from_str(&env, "USDC")
        ));
    }

    #[test]
    fn test_blessing_is_per_asset() {
        let (env, admin) = setup();
        let source = Address::generate(&env);

        bless_source(
            &env,
            &admin,
            &source,
            String::from_str(&env, "USDC"),
            String::from_str(&env, "CoinGecko"),
        );

        assert!(is_source_blessed(
            &env,
            &source,
            &String::from_str(&env, "USDC")
        ));
        assert!(!is_source_blessed(
            &env,
            &source,
            &String::from_str(&env, "EURC")
        ));
    }

    #[test]
    fn test_get_blessed_sources_for_asset() {
        let (env, admin) = setup();
        let source1 = Address::generate(&env);
        let source2 = Address::generate(&env);

        bless_source(
            &env,
            &admin,
            &source1,
            String::from_str(&env, "USDC"),
            String::from_str(&env, "Oracle 1"),
        );
        bless_source(
            &env,
            &admin,
            &source2,
            String::from_str(&env, "USDC"),
            String::from_str(&env, "Oracle 2"),
        );

        let blessed = get_blessed_sources_for_asset(&env, &String::from_str(&env, "USDC"));
        assert_eq!(blessed.len(), 2);
    }

    #[test]
    fn test_get_all_blessings() {
        let (env, admin) = setup();
        let source1 = Address::generate(&env);
        let source2 = Address::generate(&env);

        bless_source(
            &env,
            &admin,
            &source1,
            String::from_str(&env, "USDC"),
            String::from_str(&env, "Oracle 1"),
        );
        bless_source(
            &env,
            &admin,
            &source2,
            String::from_str(&env, "EURC"),
            String::from_str(&env, "Oracle 2"),
        );

        let all = get_all_blessings(&env);
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_unblessed_source_not_preferred() {
        let (env, admin) = setup();
        let source = Address::generate(&env);

        bless_source(
            &env,
            &admin,
            &source,
            String::from_str(&env, "USDC"),
            String::from_str(&env, "Oracle"),
        );
        unbless_source(&env, &admin, &source, String::from_str(&env, "USDC"));

        let preferred = get_preferred_source_for_asset(&env, &String::from_str(&env, "USDC"));
        assert!(preferred.is_none());
    }

    #[test]
    fn test_preferred_source_for_asset() {
        let (env, admin) = setup();
        let source = Address::generate(&env);

        bless_source(
            &env,
            &admin,
            &source,
            String::from_str(&env, "USDC"),
            String::from_str(&env, "Primary Oracle"),
        );

        let preferred = get_preferred_source_for_asset(&env, &String::from_str(&env, "USDC"));
        assert!(preferred.is_some());
        assert_eq!(preferred.unwrap(), source);
    }

    #[test]
    fn test_no_blessed_sources_returns_none() {
        let (env, _admin) = setup();
        let preferred = get_preferred_source_for_asset(&env, &String::from_str(&env, "USDC"));
        assert!(preferred.is_none());
    }

    #[test]
    #[should_panic(expected = "source name cannot be empty")]
    fn test_bless_source_empty_name() {
        let (env, admin) = setup();
        let source = Address::generate(&env);
        bless_source(
            &env,
            &admin,
            &source,
            String::from_str(&env, "USDC"),
            String::from_str(&env, ""),
        );
    }

    #[test]
    #[should_panic(expected = "asset_code cannot be empty")]
    fn test_bless_source_empty_asset() {
        let (env, admin) = setup();
        let source = Address::generate(&env);
        bless_source(
            &env,
            &admin,
            &source,
            String::from_str(&env, ""),
            String::from_str(&env, "Oracle"),
        );
    }
}
