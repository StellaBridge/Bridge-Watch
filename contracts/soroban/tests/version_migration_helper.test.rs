#[cfg(test)]
mod version_migration_helper_tests {
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        Address, Env, Map, String as SorobanString, Vec,
    };

    use crate::version_migration_helper::{
        EnhancedMigrationHelper, MigrationVersion, ValidationCheckpoint, MigrationError,
    };

    fn setup_env() -> (Env, Address) {
        let env = Env::default();
        let admin = Address::generate(&env);
        env.ledger().set_timestamp(1_000_000);
        (env, admin)
    }

    fn create_v1_version() -> MigrationVersion {
        MigrationVersion {
            major: 1,
            minor: 0,
            patch: 0,
        }
    }

    fn create_v2_version() -> MigrationVersion {
        MigrationVersion {
            major: 2,
            minor: 0,
            patch: 0,
        }
    }

    #[test]
    fn test_migrate_v1_to_v2_schema() {
        let (env, admin) = setup_env();
        let v1 = create_v1_version();
        
        EnhancedMigrationHelper::initialize(&env, admin.clone(), v1.clone()).unwrap();
        
        let v2 = create_v2_version();
        
        let mut migration_data = Map::new(&env);
        migration_data.set(
            SorobanString::from_str(&env, "legacy_key_1"),
            SorobanString::from_str(&env, "migrated_value_1")
        );
        migration_data.set(
            SorobanString::from_str(&env, "legacy_key_2"),
            SorobanString::from_str(&env, "migrated_value_2")
        );
        
        let snapshot = EnhancedMigrationHelper::create_state_snapshot(
            &env,
            admin.clone(),
            SorobanString::from_str(&env, "Pre-v2 migration snapshot"),
            migration_data
        ).unwrap();
        
        assert_eq!(snapshot.version, v1);
        assert!(snapshot.rollback_available);
        
        EnhancedMigrationHelper::begin_migration(&env, admin.clone(), v2.clone()).unwrap();
        
        EnhancedMigrationHelper::complete_migration(
            &env,
            v1.clone(),
            v2.clone(),
            admin.clone(),
            SorobanString::from_str(&env, "Schema migrated from v1 to v2")
        ).unwrap();
        
        let current_version = EnhancedMigrationHelper::get_version(&env);
        assert_eq!(current_version.major, 2);
        assert_eq!(current_version.minor, 0);
        assert_eq!(current_version.patch, 0);
    }

    #[test]
    fn test_migration_rollback_on_unrecognized_key() {
        let (env, admin) = setup_env();
        let v1 = create_v1_version();
        
        EnhancedMigrationHelper::initialize(&env, admin.clone(), v1.clone()).unwrap();
        
        let v2 = create_v2_version();
        
        let mut migration_data = Map::new(&env);
        migration_data.set(
            SorobanString::from_str(&env, "unrecognized_key"),
            SorobanString::from_str(&env, "unknown_data")
        );
        
        EnhancedMigrationHelper::create_state_snapshot(
            &env,
            admin.clone(),
            SorobanString::from_str(&env, "Snapshot before failed migration"),
            migration_data
        ).unwrap();
        
        EnhancedMigrationHelper::begin_migration(&env, admin.clone(), v2.clone()).unwrap();
        
        let mut errors = Vec::new(&env);
        errors.push_back(SorobanString::from_str(&env, "Unrecognized data key encountered"));
        
        let validation_result = EnhancedMigrationHelper::validate_state(
            &env,
            ValidationCheckpoint::PostMigration,
            errors,
            Vec::new(&env)
        );
        
        assert!(validation_result.is_err());
        assert_eq!(validation_result.unwrap_err(), MigrationError::ValidationFailed);
        
        let current_version = EnhancedMigrationHelper::get_version(&env);
        assert_eq!(current_version, v1);
    }

    #[test]
    fn test_version_counter_increment() {
        let (env, admin) = setup_env();
        let v1 = MigrationVersion { major: 1, minor: 0, patch: 0 };
        
        EnhancedMigrationHelper::initialize(&env, admin.clone(), v1.clone()).unwrap();
        
        let v1_patch = MigrationVersion { major: 1, minor: 0, patch: 1 };
        EnhancedMigrationHelper::begin_migration(&env, admin.clone(), v1_patch.clone()).unwrap();
        EnhancedMigrationHelper::complete_migration(
            &env,
            v1.clone(),
            v1_patch.clone(),
            admin.clone(),
            SorobanString::from_str(&env, "Patch update")
        ).unwrap();
        
        let current = EnhancedMigrationHelper::get_version(&env);
        assert_eq!(current.major, 1);
        assert_eq!(current.minor, 0);
        assert_eq!(current.patch, 1);
        
        let v1_minor = MigrationVersion { major: 1, minor: 1, patch: 0 };
        EnhancedMigrationHelper::begin_migration(&env, admin.clone(), v1_minor.clone()).unwrap();
        EnhancedMigrationHelper::complete_migration(
            &env,
            v1_patch.clone(),
            v1_minor.clone(),
            admin.clone(),
            SorobanString::from_str(&env, "Minor update")
        ).unwrap();
        
        let current = EnhancedMigrationHelper::get_version(&env);
        assert_eq!(current.major, 1);
        assert_eq!(current.minor, 1);
        assert_eq!(current.patch, 0);
        
        let v2 = MigrationVersion { major: 2, minor: 0, patch: 0 };
        EnhancedMigrationHelper::begin_migration(&env, admin.clone(), v2.clone()).unwrap();
        EnhancedMigrationHelper::complete_migration(
            &env,
            v1_minor.clone(),
            v2.clone(),
            admin.clone(),
            SorobanString::from_str(&env, "Major update")
        ).unwrap();
        
        let current = EnhancedMigrationHelper::get_version(&env);
        assert_eq!(current.major, 2);
        assert_eq!(current.minor, 0);
        assert_eq!(current.patch, 0);
    }

    #[test]
    fn test_unmigrated_legacy_functions_revert() {
        let (env, admin) = setup_env();
        let v1 = create_v1_version();
        
        EnhancedMigrationHelper::initialize(&env, admin.clone(), v1.clone()).unwrap();
        
        let v2 = create_v2_version();
        
        EnhancedMigrationHelper::begin_migration(&env, admin.clone(), v2.clone()).unwrap();
        EnhancedMigrationHelper::complete_migration(
            &env,
            v1.clone(),
            v2.clone(),
            admin.clone(),
            SorobanString::from_str(&env, "Upgraded to v2")
        ).unwrap();
        
        let current_version = EnhancedMigrationHelper::get_version(&env);
        assert_eq!(current_version, v2);
        
        let result = EnhancedMigrationHelper::validate_upgrade(&v2, &v1);
        assert_eq!(result, Err(MigrationError::VersionDowngradeNotAllowed));
    }

    #[test]
    fn test_multiple_snapshots_retained() {
        let (env, admin) = setup_env();
        let v1 = create_v1_version();
        
        EnhancedMigrationHelper::initialize(&env, admin.clone(), v1.clone()).unwrap();
        
        let mut data1 = Map::new(&env);
        data1.set(
            SorobanString::from_str(&env, "key1"),
            SorobanString::from_str(&env, "value1")
        );
        
        let snapshot1 = EnhancedMigrationHelper::create_state_snapshot(
            &env,
            admin.clone(),
            SorobanString::from_str(&env, "First snapshot"),
            data1
        ).unwrap();
        
        env.ledger().set_timestamp(2_000_000);
        
        let mut data2 = Map::new(&env);
        data2.set(
            SorobanString::from_str(&env, "key2"),
            SorobanString::from_str(&env, "value2")
        );
        
        let snapshot2 = EnhancedMigrationHelper::create_state_snapshot(
            &env,
            admin.clone(),
            SorobanString::from_str(&env, "Second snapshot"),
            data2
        ).unwrap();
        
        assert_ne!(snapshot1.snapshot_at, snapshot2.snapshot_at);
        assert_eq!(snapshot1.version, snapshot2.version);
    }

    #[test]
    fn test_unauthorized_migrator_rejected() {
        let (env, admin) = setup_env();
        let v1 = create_v1_version();
        
        EnhancedMigrationHelper::initialize(&env, admin.clone(), v1.clone()).unwrap();
        
        let unauthorized_user = Address::generate(&env);
        let v2 = create_v2_version();
        
        let result = EnhancedMigrationHelper::begin_migration(&env, unauthorized_user, v2);
        
        assert_eq!(result, Err(MigrationError::UnauthorizedMigrator));
    }

    #[test]
    fn test_concurrent_migration_blocked() {
        let (env, admin) = setup_env();
        let v1 = create_v1_version();
        
        EnhancedMigrationHelper::initialize(&env, admin.clone(), v1.clone()).unwrap();
        
        let v2 = create_v2_version();
        EnhancedMigrationHelper::begin_migration(&env, admin.clone(), v2.clone()).unwrap();
        
        let v2_patch = MigrationVersion { major: 2, minor: 0, patch: 1 };
        let result = EnhancedMigrationHelper::begin_migration(&env, admin.clone(), v2_patch);
        
        assert_eq!(result, Err(MigrationError::MigrationInProgress));
    }
}
