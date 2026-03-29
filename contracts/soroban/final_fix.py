#!/usr/bin/env python3
import re

# Mapping of DataKey variants to key constants
key_mapping = {
    'DataKey::Admin': 'keys::ADMIN',
    'DataKey::AssetHealth': 'keys::ASSET_HEALTH',
    'DataKey::PriceRecord': 'keys::PRICE_RECORD',
    'DataKey::MonitoredAssets': 'keys::MONITORED_ASSETS',
    'DataKey::DeviationAlert': 'keys::DEVIATION_ALERT',
    'DataKey::DeviationThreshold': 'keys::DEVIATION_THRESHOLD',
    'DataKey::SupplyMismatches': 'keys::SUPPLY_MISMATCHES',
    'DataKey::MismatchThreshold': 'keys::MISMATCH_THRESHOLD',
    'DataKey::BridgeIds': 'keys::BRIDGE_IDS',
    'DataKey::RoleKey': 'keys::ROLE_KEY',
    'DataKey::RolesList': 'keys::ROLES_LIST',
    'DataKey::Signer': 'keys::SIGNER',
    'DataKey::SignerList': 'keys::SIGNER_LIST',
    'DataKey::SignatureThreshold': 'keys::SIGNATURE_THRESHOLD',
    'DataKey::SignerNonce': 'keys::SIGNER_NONCE',
    'DataKey::SignatureCache': 'keys::SIGNATURE_CACHE',
    'DataKey::LiquidityDepth': 'keys::LIQUIDITY_DEPTH',
    'DataKey::LiquidityHistory': 'keys::LIQUIDITY_HISTORY',
    'DataKey::LiquidityPairs': 'keys::LIQUIDITY_PAIRS',
    'DataKey::PriceHistory': 'keys::PRICE_HISTORY',
    'DataKey::HealthWeights': 'keys::HEALTH_WEIGHTS',
    'DataKey::HealthScoreResult': 'keys::HEALTH_SCORE_RESULT',
    'DataKey::CheckpointConfig': 'keys::CHECKPOINT_CONFIG',
    'DataKey::CheckpointCounter': 'keys::CHECKPOINT_COUNTER',
    'DataKey::CheckpointMetadataList': 'keys::CHECKPOINT_METADATA_LIST',
    'DataKey::CheckpointSnapshot': 'keys::CHECKPOINT_SNAPSHOT',
    'DataKey::LastCheckpointAt': 'keys::LAST_CHECKPOINT_AT',
    'DataKey::LastCheckpointId': 'keys::LAST_CHECKPOINT_ID',
    'DataKey::RetentionPolicy': 'keys::RETENTION_POLICY',
    'DataKey::AssetRetentionOvr': 'keys::ASSET_RETENTION_OVR',
    'DataKey::LastCleanupAt': 'keys::LAST_CLEANUP_AT',
    'DataKey::ArchivedMismatches': 'keys::ARCHIVED_MISMATCHES',
    'DataKey::ArchivedLiquidityHistory': 'keys::ARCHIVED_LIQUIDITY_HISTORY',
    'DataKey::ArchivedCheckpointMeta': 'keys::ARCHIVED_CHECKPOINT_META',
    'DataKey::ArchivedCheckpointSnapshot': 'keys::ARCHIVED_CHECKPOINT_SNAPSHOT',
    'DataKey::GlobalPaused': 'keys::GLOBAL_PAUSED',
    'DataKey::PauseGuardian': 'keys::PAUSE_GUARDIAN',
    'DataKey::PauseReason': 'keys::PAUSE_REASON',
    'DataKey::PausedAt': 'keys::PAUSED_AT',
    'DataKey::UnpauseAvailableAt': 'keys::UNPAUSE_AVAILABLE_AT',
    'DataKey::PauseHistory': 'keys::PAUSE_HISTORY',
    'DataKey::EmergencyContact': 'keys::EMERGENCY_CONTACT',
    'DataKey::AssetPauseReason': 'keys::ASSET_PAUSE_REASON',
    'DataKey::PendingTransfer': 'keys::PENDING_TRANSFER',
    'DataKey::PendingUpgrade': 'keys::PENDING_UPGRADE',
    'DataKey::UpgradeProposalCounter': 'keys::UPGRADE_PROPOSAL_COUNTER',
    'DataKey::UpgradeHistory': 'keys::UPGRADE_HISTORY',
    'DataKey::ContractVersion': 'keys::CONTRACT_VERSION',
    'DataKey::CurrentContractWasmHash': 'keys::CURRENT_CONTRACT_WASM_HASH',
    'DataKey::RollbackTargetHash': 'keys::ROLLBACK_TARGET_HASH',
    'DataKey::ConfigEntry': 'keys::CONFIG_ENTRY',
    'DataKey::ConfigKeys': 'keys::CONFIG_KEYS',
    'DataKey::ConfigAuditLog': 'keys::CONFIG_AUDIT_LOG',
    'DataKey::AssetStatistics': 'keys::ASSET_STATISTICS',
}

with open('src/lib.rs', 'r') as f:
    content = f.read()

# For each DataKey variant with parameters, we need to handle the key concatenation
# For now, let's handle the simple cases without parameters

# Replace &DataKey::Variant with &keys::VARIANT
for datakey, keyconst in key_mapping.items():
    # Match without parameters: &DataKey::Variant
    pattern1 = r'&' + re.escape(datakey) + r'(?![a-zA-Z_])'
    content = re.sub(pattern1, f'&{keyconst}', content)

# Handle cases with parameters by looking for specific patterns
# For DataKey variants with parameters like AssetHealth(asset), we need to concatenate keys
# This is more complex - for now, we'll create dynamic keys for these

# Replace more carefully for parameterized variants
# Pattern: DataKey::Variant(param) -> create a composite key

# First, let's handle the simpler cases - simple field access
content = content.replace('&DataKey::Admin', '&keys::ADMIN')

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Applied key constant replacements")
count = sum(1 for key in key_mapping.values() if key in content)
print(f"Replacements found: {count}")
