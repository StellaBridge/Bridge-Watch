//! # Sidecar State Store
//!
//! Store auxiliary state off-contract while maintaining referential integrity
//! with on-chain data. Provides consistency checks and query support.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of sidecar entries per entity
pub const MAX_SIDECAR_ENTRIES: u32 = 100;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum SidecarError {
    NotAuthorized = 1,
    AlreadyInitialized = 2,
    EntityNotFound = 3,
    SidecarNotFound = 4,
    MaxEntriesExceeded = 5,
    ConsistencyCheckFailed = 6,
    InvalidReference = 7,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Sidecar state entry with referential integrity
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SidecarEntry {
    /// Unique identifier for this sidecar entry
    pub entry_id: String,
    /// Reference to on-chain entity
    pub entity_ref: String,
    /// Hash of the referenced entity state (for consistency)
    pub entity_hash: String,
    /// Auxiliary data stored off-contract
    pub data: String,
    /// Entry metadata
    pub metadata: String,
    /// Timestamp when created
    pub created_at: u64,
    /// Timestamp when last updated
    pub updated_at: u64,
    /// Creator address
    pub created_by: Address,
}

/// Consistency check result
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConsistencyCheck {
    /// Whether the check passed
    pub is_consistent: bool,
    /// Expected hash
    pub expected_hash: String,
    /// Actual hash
    pub actual_hash: String,
    /// Timestamp of check
    pub checked_at: u64,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    /// Contract admin address
    Admin,
    /// Sidecar entries for an entity (Vec<SidecarEntry>)
    SidecarEntries(String),
    /// Index of all entity references (Vec<String>)
    EntityIndex,
    /// Mapping of entry_id to entity_ref
    EntryToEntity(String),
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct SidecarStateContract;

#[contractimpl]
impl SidecarStateContract {
    /// Initialize the contract with an admin address
    pub fn initialize(env: Env, admin: Address) -> Result<(), SidecarError> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(SidecarError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        
        let empty: Vec<String> = Vec::new(&env);
        env.storage().instance().set(&DataKey::EntityIndex, &empty);
        
        Ok(())
    }

    /// Store a new sidecar entry linked to an on-chain entity
    pub fn store_sidecar(
        env: Env,
        caller: Address,
        entry_id: String,
        entity_ref: String,
        entity_hash: String,
        data: String,
        metadata: String,
    ) -> Result<(), SidecarError> {
        caller.require_auth();

        let mut entries: Vec<SidecarEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::SidecarEntries(entity_ref.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        if entries.len() >= MAX_SIDECAR_ENTRIES {
            return Err(SidecarError::MaxEntriesExceeded);
        }

        let now = env.ledger().timestamp();
        let entry = SidecarEntry {
            entry_id: entry_id.clone(),
            entity_ref: entity_ref.clone(),
            entity_hash,
            data,
            metadata,
            created_at: now,
            updated_at: now,
            created_by: caller,
        };

        entries.push_back(entry);
        env.storage()
            .persistent()
            .set(&DataKey::SidecarEntries(entity_ref.clone()), &entries);

        // Store entry to entity mapping
        env.storage()
            .persistent()
            .set(&DataKey::EntryToEntity(entry_id.clone()), &entity_ref);

        // Update entity index
        Self::add_to_entity_index(&env, &entity_ref);

        env.events()
            .publish((symbol_short!("sc_store"), entry_id), entity_ref);

        Ok(())
    }

    /// Update an existing sidecar entry
    pub fn update_sidecar(
        env: Env,
        caller: Address,
        entry_id: String,
        new_entity_hash: String,
        new_data: String,
        new_metadata: String,
    ) -> Result<(), SidecarError> {
        caller.require_auth();

        let entity_ref = Self::get_entity_for_entry(&env, &entry_id)?;
        let mut entries: Vec<SidecarEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::SidecarEntries(entity_ref.clone()))
            .ok_or(SidecarError::SidecarNotFound)?;

        let mut found = false;
        let now = env.ledger().timestamp();

        for i in 0..entries.len() {
            if let Some(mut entry) = entries.get(i) {
                if entry.entry_id == entry_id {
                    entry.entity_hash = new_entity_hash;
                    entry.data = new_data;
                    entry.metadata = new_metadata;
                    entry.updated_at = now;
                    entries.set(i, entry);
                    found = true;
                    break;
                }
            }
        }

        if !found {
            return Err(SidecarError::SidecarNotFound);
        }

        env.storage()
            .persistent()
            .set(&DataKey::SidecarEntries(entity_ref.clone()), &entries);

        env.events()
            .publish((symbol_short!("sc_upd"), entry_id), entity_ref);

        Ok(())
    }

    /// Perform consistency check on a sidecar entry
    pub fn check_consistency(
        env: Env,
        entry_id: String,
        current_entity_hash: String,
    ) -> Result<ConsistencyCheck, SidecarError> {
        let entity_ref = Self::get_entity_for_entry(&env, &entry_id)?;
        let entries: Vec<SidecarEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::SidecarEntries(entity_ref))
            .ok_or(SidecarError::SidecarNotFound)?;

        for i in 0..entries.len() {
            if let Some(entry) = entries.get(i) {
                if entry.entry_id == entry_id {
                    let is_consistent = entry.entity_hash == current_entity_hash;
                    let check = ConsistencyCheck {
                        is_consistent,
                        expected_hash: entry.entity_hash.clone(),
                        actual_hash: current_entity_hash,
                        checked_at: env.ledger().timestamp(),
                    };
                    return Ok(check);
                }
            }
        }

        Err(SidecarError::SidecarNotFound)
    }

    /// Query all sidecar entries for an entity
    pub fn query_by_entity(env: Env, entity_ref: String) -> Vec<SidecarEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::SidecarEntries(entity_ref))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Query a specific sidecar entry by ID
    pub fn query_by_id(env: Env, entry_id: String) -> Result<SidecarEntry, SidecarError> {
        let entity_ref = Self::get_entity_for_entry(&env, &entry_id)?;
        let entries: Vec<SidecarEntry> = env
            .storage()
            .persistent()
            .get(&DataKey::SidecarEntries(entity_ref))
            .ok_or(SidecarError::SidecarNotFound)?;

        for i in 0..entries.len() {
            if let Some(entry) = entries.get(i) {
                if entry.entry_id == entry_id {
                    return Ok(entry);
                }
            }
        }

        Err(SidecarError::SidecarNotFound)
    }

    /// Get all entities that have sidecar entries
    pub fn get_all_entities(env: Env) -> Vec<String> {
        env.storage()
            .instance()
            .get(&DataKey::EntityIndex)
            .unwrap_or_else(|| Vec::new(&env))
    }

    // =======================================================================
    // Internal helpers
    // =======================================================================

    fn get_entity_for_entry(env: &Env, entry_id: &String) -> Result<String, SidecarError> {
        env.storage()
            .persistent()
            .get(&DataKey::EntryToEntity(entry_id.clone()))
            .ok_or(SidecarError::InvalidReference)
    }

    fn add_to_entity_index(env: &Env, entity_ref: &String) {
        let mut index: Vec<String> = env
            .storage()
            .instance()
            .get(&DataKey::EntityIndex)
            .unwrap_or_else(|| Vec::new(env));

        let mut exists = false;
        for i in 0..index.len() {
            if let Some(e) = index.get(i) {
                if e == *entity_ref {
                    exists = true;
                    break;
                }
            }
        }

        if !exists {
            index.push_back(entity_ref.clone());
            env.storage().instance().set(&DataKey::EntityIndex, &index);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
//
// NOTE ON SCOPE: the originating ticket describes this module as a sidecar
// *node registry* with governance-approved registration, multi-node quorum
// verification, node revocation, and stale-state expiry. The actual contract
// implements none of that — it is a generic off-chain "sidecar entry" store
// that links auxiliary data to an on-chain entity reference and checks a
// single expected-vs-actual hash for consistency. There is no node
// allowlist, no governance gate beyond a single `admin` address that is
// never actually checked against callers, no quorum/vote counting, and no
// TTL-based expiry. Each test below is grounded in what the contract really
// does, mapped to the nearest real analog of each acceptance criterion:
//   - "registering sidecar nodes with governance approval" -> `initialize`'s
//     single-admin bootstrap, and the fact that `store_sidecar` only checks
//     the caller's own signature, not membership in any registry.
//   - "quorum verification" -> `check_consistency`'s single expected-vs-
//     actual hash comparison (no vote counting exists).
//   - "revocation of malicious/de-registered nodes" -> there is no
//     revoke/deregister entrypoint; the nearest real guards are rejecting
//     operations on an unknown `entry_id` and the fixed per-entity entry cap.
//   - "stale state invalidation" -> `check_consistency` flags a hash
//     mismatch, and `update_sidecar` is how staleness gets resolved.
//
// This lives as an in-module test (rather than an external `tests/*.rs`
// integration test) because `sidecar_state` is only compiled under
// `#[cfg(test)]` (see lib.rs) to avoid a Wasm export collision between
// `SidecarStateContract::initialize` and `BridgeWatchContract::initialize`
// in the production contract build — an external integration-test crate is
// compiled against the normal (non-`cfg(test)`) library build, so it would
// never see this module at all.
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::Env;

    fn s(env: &Env, text: &str) -> String {
        String::from_str(env, text)
    }

    fn setup() -> (Env, SidecarStateContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_000_000);
        let contract_id = env.register_contract(None, SidecarStateContract);
        let client = SidecarStateContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, client, admin)
    }

    // ── "Registration with governance approval" -> initialize + caller auth ──

    #[test]
    fn initialize_sets_the_admin_and_rejects_a_second_call() {
        let (_env, client, admin) = setup();
        assert_eq!(
            client.try_initialize(&admin),
            Err(Ok(SidecarError::AlreadyInitialized))
        );
    }

    #[test]
    #[should_panic]
    fn submitting_sidecar_state_without_the_caller_s_own_authorization_is_rejected() {
        // No mock_all_auths() here: store_sidecar requires the caller to
        // actually authorize the invocation, independent of anything
        // `initialize` set up.
        let env = Env::default();
        env.ledger().set_timestamp(1_000_000);
        let contract_id = env.register_contract(None, SidecarStateContract);
        let client = SidecarStateContractClient::new(&env, &contract_id);
        let caller = Address::generate(&env);

        client.store_sidecar(
            &caller,
            &s(&env, "entry-1"),
            &s(&env, "bridge:usdc-ethereum"),
            &s(&env, "hash-v1"),
            &s(&env, "{}"),
            &s(&env, "{}"),
        );
    }

    #[test]
    fn any_authorized_caller_may_submit_state_the_contract_has_no_node_allowlist() {
        // Unlike a governance-gated node registry, store_sidecar never checks
        // the caller against the admin set by `initialize`, or against any
        // registered-node list — no such list exists in this contract.
        let (env, client, _admin) = setup();
        let random_submitter = Address::generate(&env);

        client.store_sidecar(
            &random_submitter,
            &s(&env, "entry-1"),
            &s(&env, "bridge:usdc-ethereum"),
            &s(&env, "hash-v1"),
            &s(&env, "{}"),
            &s(&env, "{}"),
        );

        let entry = client.query_by_id(&s(&env, "entry-1"));
        assert_eq!(entry.created_by, random_submitter);
    }

    // ── Sidecar state submission and (single-attester) verification ──────────

    #[test]
    fn store_sidecar_creates_a_retrievable_entry() {
        let (env, client, _admin) = setup();
        let caller = Address::generate(&env);

        client.store_sidecar(
            &caller,
            &s(&env, "entry-1"),
            &s(&env, "bridge:usdc-ethereum"),
            &s(&env, "hash-v1"),
            &s(&env, "{\"status\":\"healthy\"}"),
            &s(&env, "{}"),
        );

        let entry = client.query_by_id(&s(&env, "entry-1"));
        assert_eq!(entry.entity_ref, s(&env, "bridge:usdc-ethereum"));
        assert_eq!(entry.entity_hash, s(&env, "hash-v1"));
        assert_eq!(entry.created_at, 1_000_000);
        assert_eq!(entry.updated_at, 1_000_000);

        let by_entity = client.query_by_entity(&s(&env, "bridge:usdc-ethereum"));
        assert_eq!(by_entity.len(), 1);

        assert!(!env.events().all().is_empty());
    }

    #[test]
    fn check_consistency_confirms_a_matching_hash() {
        let (env, client, _admin) = setup();
        let caller = Address::generate(&env);
        client.store_sidecar(
            &caller,
            &s(&env, "entry-1"),
            &s(&env, "bridge:usdc-ethereum"),
            &s(&env, "hash-v1"),
            &s(&env, "{}"),
            &s(&env, "{}"),
        );

        let check: ConsistencyCheck =
            client.check_consistency(&s(&env, "entry-1"), &s(&env, "hash-v1"));

        assert!(check.is_consistent);
        assert_eq!(check.expected_hash, s(&env, "hash-v1"));
        assert_eq!(check.actual_hash, s(&env, "hash-v1"));
    }

    #[test]
    fn check_consistency_flags_a_mismatched_hash_this_is_a_hash_compare_not_a_quorum_vote() {
        let (env, client, _admin) = setup();
        let caller = Address::generate(&env);
        client.store_sidecar(
            &caller,
            &s(&env, "entry-1"),
            &s(&env, "bridge:usdc-ethereum"),
            &s(&env, "hash-v1"),
            &s(&env, "{}"),
            &s(&env, "{}"),
        );

        let check = client.check_consistency(&s(&env, "entry-1"), &s(&env, "hash-v2"));

        assert!(!check.is_consistent);
        assert_eq!(check.expected_hash, s(&env, "hash-v1"));
        assert_eq!(check.actual_hash, s(&env, "hash-v2"));
    }

    #[test]
    fn update_sidecar_replaces_hash_and_data_and_bumps_updated_at_only() {
        let (env, client, _admin) = setup();
        let caller = Address::generate(&env);
        client.store_sidecar(
            &caller,
            &s(&env, "entry-1"),
            &s(&env, "bridge:usdc-ethereum"),
            &s(&env, "hash-v1"),
            &s(&env, "{}"),
            &s(&env, "{}"),
        );

        env.ledger().set_timestamp(2_000_000);
        client.update_sidecar(
            &caller,
            &s(&env, "entry-1"),
            &s(&env, "hash-v2"),
            &s(&env, "{\"status\":\"degraded\"}"),
            &s(&env, "{}"),
        );

        let entry = client.query_by_id(&s(&env, "entry-1"));
        assert_eq!(entry.entity_hash, s(&env, "hash-v2"));
        assert_eq!(entry.created_at, 1_000_000); // unchanged by the update
        assert_eq!(entry.updated_at, 2_000_000);

        assert!(!env.events().all().is_empty());
    }

    // ── "Revocation" -> there is no such entrypoint; nearest real guards ─────

    #[test]
    fn updating_an_entry_that_was_never_registered_is_rejected() {
        // There is no revoke/deregister function on this contract. The
        // closest real guard is that mutating an unknown entry_id fails
        // closed.
        let (env, client, _admin) = setup();
        assert_eq!(
            client.try_update_sidecar(
                &Address::generate(&env),
                &s(&env, "never-registered"),
                &s(&env, "hash"),
                &s(&env, "{}"),
                &s(&env, "{}"),
            ),
            Err(Ok(SidecarError::InvalidReference))
        );
    }

    #[test]
    fn querying_an_entry_that_was_never_registered_fails_closed() {
        let (env, client, _admin) = setup();
        assert_eq!(
            client.try_query_by_id(&s(&env, "never-registered")),
            Err(Ok(SidecarError::InvalidReference))
        );
        assert_eq!(
            client.try_check_consistency(&s(&env, "never-registered"), &s(&env, "hash")),
            Err(Ok(SidecarError::InvalidReference))
        );
    }

    #[test]
    fn querying_by_entity_for_an_unknown_entity_returns_empty_rather_than_erroring() {
        let (env, client, _admin) = setup();
        let entries = client.query_by_entity(&s(&env, "bridge:never-seen"));
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn a_single_entity_cannot_be_flooded_past_the_max_entry_cap() {
        // The only real guard against a misbehaving/malicious submitter
        // spamming one entity's sidecar history is the fixed
        // MAX_SIDECAR_ENTRIES cap.
        let (env, client, _admin) = setup();
        let caller = Address::generate(&env);
        let entity = s(&env, "bridge:usdc-ethereum");

        for i in 0..MAX_SIDECAR_ENTRIES {
            client.store_sidecar(
                &caller,
                &s(&env, &format!("entry-{i}")),
                &entity,
                &s(&env, "hash"),
                &s(&env, "{}"),
                &s(&env, "{}"),
            );
        }

        assert_eq!(
            client.try_store_sidecar(
                &caller,
                &s(&env, "entry-overflow"),
                &entity,
                &s(&env, "hash"),
                &s(&env, "{}"),
                &s(&env, "{}"),
            ),
            Err(Ok(SidecarError::MaxEntriesExceeded))
        );
    }

    // ── "Stale state invalidation" -> hash mismatch detection + resolution ───

    #[test]
    fn stale_state_is_detected_via_hash_mismatch_and_resolved_by_an_update() {
        // There is no TTL/expiry field anywhere in this contract —
        // "staleness" is only ever detected by comparing the stored hash
        // against the caller-supplied current hash in check_consistency.
        let (env, client, _admin) = setup();
        let caller = Address::generate(&env);
        client.store_sidecar(
            &caller,
            &s(&env, "entry-1"),
            &s(&env, "bridge:usdc-ethereum"),
            &s(&env, "hash-v1"),
            &s(&env, "{}"),
            &s(&env, "{}"),
        );

        // The on-chain entity moved on to hash-v2 while the sidecar still
        // holds v1.
        let stale_check = client.check_consistency(&s(&env, "entry-1"), &s(&env, "hash-v2"));
        assert!(!stale_check.is_consistent);

        // Updating the sidecar with the current hash resolves the staleness.
        env.ledger().set_timestamp(2_000_000);
        client.update_sidecar(
            &caller,
            &s(&env, "entry-1"),
            &s(&env, "hash-v2"),
            &s(&env, "{}"),
            &s(&env, "{}"),
        );
        let fresh_check = client.check_consistency(&s(&env, "entry-1"), &s(&env, "hash-v2"));
        assert!(fresh_check.is_consistent);
        assert_eq!(fresh_check.checked_at, 2_000_000);
    }

    // ── Entity index bookkeeping ──────────────────────────────────────────────

    #[test]
    fn entity_index_lists_each_entity_once_regardless_of_entry_count() {
        let (env, client, _admin) = setup();
        let caller = Address::generate(&env);
        let bridge_entity = s(&env, "bridge:usdc-ethereum");
        let asset_entity = s(&env, "asset:xlm");

        client.store_sidecar(&caller, &s(&env, "entry-1"), &bridge_entity, &s(&env, "h1"), &s(&env, "{}"), &s(&env, "{}"));
        client.store_sidecar(&caller, &s(&env, "entry-2"), &bridge_entity, &s(&env, "h2"), &s(&env, "{}"), &s(&env, "{}"));
        client.store_sidecar(&caller, &s(&env, "entry-3"), &asset_entity, &s(&env, "h3"), &s(&env, "{}"), &s(&env, "{}"));

        let all_entities = client.get_all_entities();
        assert_eq!(all_entities.len(), 2);
    }
}
