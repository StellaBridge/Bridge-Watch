/// Access Control List (ACL) module for Stellar Bridge Watch.
///
/// # Permission Model
///
/// ```text
/// Role hierarchy (highest → lowest privilege):
///
///   SuperAdmin
///     └─ inherits all permissions
///
///   Admin
///     └─ SubmitHealth, SubmitPrice, ManageAssets, ManageAlerts,
///        ManageConfig, ViewAnalytics, ViewHealth, ViewPrice
///
///   Operator
///     └─ SubmitHealth, SubmitPrice, ManageAlerts,
///        ViewAnalytics, ViewHealth, ViewPrice
///
///   ReadOnly
///     └─ ViewAnalytics, ViewHealth, ViewPrice
/// ```
///
/// Permissions can also be granted individually to any address, independent
/// of role. An address passes an ACL check when **any** of the following is
/// true:
///
/// 1. It is the contract admin (set at `initialize`).
/// 2. It holds the `SuperAdmin` role.
/// 3. It holds a role whose inherited permissions include the required one.
/// 4. It has been granted the specific permission directly.
///
/// All grants support an optional expiry timestamp (ledger seconds). A grant
/// with `expires_at == 0` never expires.
use soroban_sdk::{contracttype, Address, Env, Vec};

// ── Permission ────────────────────────────────────────────────────────────────

/// Fine-grained permission flags used throughout the contract.
///
/// Permissions can be granted individually or inherited through a [`Role`].
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Permission {
    /// Submit or update health scores for monitored assets.
    SubmitHealth,
    /// Submit or update price records for monitored assets.
    SubmitPrice,
    /// Register, pause, unpause, or deregister assets.
    ManageAssets,
    /// Create, update, or delete alert rules.
    ManageAlerts,
    /// Update contract configuration and thresholds.
    ManageConfig,
    /// Read analytics and aggregated statistics.
    ViewAnalytics,
    /// Read asset health scores and history.
    ViewHealth,
    /// Read price records and history.
    ViewPrice,
    /// Grant or revoke roles and permissions for other addresses.
    ManagePermissions,
    /// Trigger or lift emergency pauses.
    EmergencyPause,
    /// Propose, approve, or execute contract upgrades.
    ManageUpgrades,
}

// ── Role ──────────────────────────────────────────────────────────────────────

/// Coarse-grained roles that bundle common permission sets.
///
/// Roles provide a convenient shorthand; individual permissions can still be
/// granted on top of (or instead of) a role.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Role {
    /// Full access — inherits every [`Permission`].
    SuperAdmin,
    /// Administrative access — can manage assets, config, and data submissions.
    Admin,
    /// Operational access — can submit data and manage alerts; no config changes.
    Operator,
    /// Read-only access — can query analytics, health, and price data.
    ReadOnly,
}

// ── Storage types ─────────────────────────────────────────────────────────────

/// A role assignment record stored in the global roles list.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleGrant {
    /// Address that holds this role.
    pub grantee: Address,
    /// The role granted.
    pub role: Role,
    /// Address that performed the grant.
    pub granted_by: Address,
    /// Ledger timestamp when the grant was created.
    pub granted_at: u64,
    /// Ledger timestamp after which this grant is no longer valid.
    /// `0` means the grant never expires.
    pub expires_at: u64,
}

/// A direct permission grant record stored in the global permissions list.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PermissionGrant {
    /// Address that holds this permission.
    pub grantee: Address,
    /// The permission granted.
    pub permission: Permission,
    /// Address that performed the grant.
    pub granted_by: Address,
    /// Ledger timestamp when the grant was created.
    pub granted_at: u64,
    /// Ledger timestamp after which this grant is no longer valid.
    /// `0` means the grant never expires.
    pub expires_at: u64,
}

/// Input record used by bulk grant/revoke operations.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BulkRoleEntry {
    pub grantee: Address,
    pub role: Role,
    /// Expiry for the grant (`0` = never expires). Ignored for revoke.
    pub expires_at: u64,
}

/// Input record used by bulk permission grant/revoke operations.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BulkPermissionEntry {
    pub grantee: Address,
    pub permission: Permission,
    /// Expiry for the grant (`0` = never expires). Ignored for revoke.
    pub expires_at: u64,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum AclKey {
    /// All role grants (`Vec<RoleGrant>`).
    RoleGrants,
    /// All direct permission grants (`Vec<PermissionGrant>`).
    PermissionGrants,
}

// ── Role → Permission inheritance table ──────────────────────────────────────

/// Returns the set of [`Permission`]s inherited by `role`.
///
/// `SuperAdmin` is handled separately in [`has_permission_internal`] (it
/// passes every check unconditionally), so it is not listed here.
pub fn role_permissions(role: &Role) -> &'static [Permission] {
    match role {
        Role::SuperAdmin => &[
            Permission::SubmitHealth,
            Permission::SubmitPrice,
            Permission::ManageAssets,
            Permission::ManageAlerts,
            Permission::ManageConfig,
            Permission::ViewAnalytics,
            Permission::ViewHealth,
            Permission::ViewPrice,
            Permission::ManagePermissions,
            Permission::EmergencyPause,
            Permission::ManageUpgrades,
        ],
        Role::Admin => &[
            Permission::SubmitHealth,
            Permission::SubmitPrice,
            Permission::ManageAssets,
            Permission::ManageAlerts,
            Permission::ManageConfig,
            Permission::ViewAnalytics,
            Permission::ViewHealth,
            Permission::ViewPrice,
        ],
        Role::Operator => &[
            Permission::SubmitHealth,
            Permission::SubmitPrice,
            Permission::ManageAlerts,
            Permission::ViewAnalytics,
            Permission::ViewHealth,
            Permission::ViewPrice,
        ],
        Role::ReadOnly => &[
            Permission::ViewAnalytics,
            Permission::ViewHealth,
            Permission::ViewPrice,
        ],
    }
}

// ── Core ACL helpers ──────────────────────────────────────────────────────────

/// Return `true` if `address` currently holds `role` (respects expiry).
pub fn has_role_internal(env: &Env, address: &Address, role: &Role) -> bool {
    let now = env.ledger().timestamp();
    let grants: Vec<RoleGrant> = env
        .storage()
        .persistent()
        .get(&AclKey::RoleGrants)
        .unwrap_or_else(|| Vec::new(env));

    for g in grants.iter() {
        if &g.grantee == address && &g.role == role {
            if g.expires_at == 0 || g.expires_at > now {
                return true;
            }
        }
    }
    false
}

/// Return `true` if `address` has `permission` via any active role or direct grant.
///
/// Evaluation order:
/// 1. `SuperAdmin` role → always passes.
/// 2. Any role whose inherited permissions include `permission`.
/// 3. Direct permission grant.
pub fn has_permission_internal(env: &Env, address: &Address, permission: &Permission) -> bool {
    let now = env.ledger().timestamp();
    let grants: Vec<RoleGrant> = env
        .storage()
        .persistent()
        .get(&AclKey::RoleGrants)
        .unwrap_or_else(|| Vec::new(env));

    for g in grants.iter() {
        if &g.grantee != address {
            continue;
        }
        if g.expires_at != 0 && g.expires_at <= now {
            continue;
        }
        // SuperAdmin passes everything
        if g.role == Role::SuperAdmin {
            return true;
        }
        // Check inherited permissions for this role
        for p in role_permissions(&g.role) {
            if p == permission {
                return true;
            }
        }
    }

    // Check direct permission grants
    let perm_grants: Vec<PermissionGrant> = env
        .storage()
        .persistent()
        .get(&AclKey::PermissionGrants)
        .unwrap_or_else(|| Vec::new(env));

    for pg in perm_grants.iter() {
        if &pg.grantee == address && &pg.permission == permission {
            if pg.expires_at == 0 || pg.expires_at > now {
                return true;
            }
        }
    }

    false
}

/// Require that `caller` holds `permission` (or is the contract admin).
///
/// `admin` is the address stored under `DataKey::Admin` in the caller's
/// contract — passed in to avoid a cross-module storage dependency.
///
/// Calls `caller.require_auth()` and panics with a descriptive message if the
/// check fails.
pub fn require_permission(
    env: &Env,
    caller: &Address,
    admin: &Address,
    permission: &Permission,
) {
    caller.require_auth();
    if caller == admin {
        return;
    }
    if !has_permission_internal(env, caller, permission) {
        panic!("unauthorized: caller lacks the required permission");
    }
}

// ── Grant / Revoke helpers (called from BridgeWatchContract) ──────────────────

/// Internal: add a role grant (deduplicates by grantee+role, updates expiry).
pub fn grant_role_internal(
    env: &Env,
    grantee: &Address,
    role: &Role,
    granted_by: &Address,
    expires_at: u64,
) {
    let now = env.ledger().timestamp();
    let mut grants: Vec<RoleGrant> = env
        .storage()
        .persistent()
        .get(&AclKey::RoleGrants)
        .unwrap_or_else(|| Vec::new(env));

    // Update existing entry if present
    for i in 0..grants.len() {
        let g = grants.get(i).unwrap();
        if &g.grantee == grantee && &g.role == role {
            let updated = RoleGrant {
                grantee: g.grantee,
                role: g.role,
                granted_by: granted_by.clone(),
                granted_at: now,
                expires_at,
            };
            grants.set(i, updated);
            env.storage()
                .persistent()
                .set(&AclKey::RoleGrants, &grants);
            return;
        }
    }

    grants.push_back(RoleGrant {
        grantee: grantee.clone(),
        role: role.clone(),
        granted_by: granted_by.clone(),
        granted_at: now,
        expires_at,
    });
    env.storage()
        .persistent()
        .set(&AclKey::RoleGrants, &grants);
}

/// Internal: remove a role grant.
pub fn revoke_role_internal(env: &Env, grantee: &Address, role: &Role) {
    let grants: Vec<RoleGrant> = env
        .storage()
        .persistent()
        .get(&AclKey::RoleGrants)
        .unwrap_or_else(|| Vec::new(env));

    let mut updated: Vec<RoleGrant> = Vec::new(env);
    for g in grants.iter() {
        if !(&g.grantee == grantee && &g.role == role) {
            updated.push_back(g);
        }
    }
    env.storage()
        .persistent()
        .set(&AclKey::RoleGrants, &updated);
}

/// Internal: add a direct permission grant (deduplicates, updates expiry).
pub fn grant_permission_internal(
    env: &Env,
    grantee: &Address,
    permission: &Permission,
    granted_by: &Address,
    expires_at: u64,
) {
    let now = env.ledger().timestamp();
    let mut grants: Vec<PermissionGrant> = env
        .storage()
        .persistent()
        .get(&AclKey::PermissionGrants)
        .unwrap_or_else(|| Vec::new(env));

    for i in 0..grants.len() {
        let g = grants.get(i).unwrap();
        if &g.grantee == grantee && &g.permission == permission {
            let updated = PermissionGrant {
                grantee: g.grantee,
                permission: g.permission,
                granted_by: granted_by.clone(),
                granted_at: now,
                expires_at,
            };
            grants.set(i, updated);
            env.storage()
                .persistent()
                .set(&AclKey::PermissionGrants, &grants);
            return;
        }
    }

    grants.push_back(PermissionGrant {
        grantee: grantee.clone(),
        permission: permission.clone(),
        granted_by: granted_by.clone(),
        granted_at: now,
        expires_at,
    });
    env.storage()
        .persistent()
        .set(&AclKey::PermissionGrants, &grants);
}

/// Internal: remove a direct permission grant.
pub fn revoke_permission_internal(env: &Env, grantee: &Address, permission: &Permission) {
    let grants: Vec<PermissionGrant> = env
        .storage()
        .persistent()
        .get(&AclKey::PermissionGrants)
        .unwrap_or_else(|| Vec::new(env));

    let mut updated: Vec<PermissionGrant> = Vec::new(env);
    for g in grants.iter() {
        if !(&g.grantee == grantee && &g.permission == permission) {
            updated.push_back(g);
        }
    }
    env.storage()
        .persistent()
        .set(&AclKey::PermissionGrants, &updated);
}
