#!/usr/bin/env python3

import re

def camel_to_snake_upper(name):
    """Convert CamelCase to SCREAMING_SNAKE_CASE"""
    # Insert underscore before uppercase letters (except the first)
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).upper()

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Create a mapping of known variant names to key constant names based on the keys module
variant_to_key = {
    'Admin': 'ADMIN',
    'AssetHealth': 'ASSET_HEALTH',
    'PriceRecord': 'PRICE_RECORD',
    'MonitoredAssets': 'MONITORED_ASSETS',
    'DeviationAlert': 'DEVIATION_ALERT',
    'DeviationThreshold': 'DEVIATION_THRESHOLD',
    'SupplyMismatches': 'SUPPLY_MISMATCHES',
    'MismatchThreshold': 'MISMATCH_THRESHOLD',
    'Bridge Ids': 'BRIDGE_IDS',
    'RoleKey': 'ROLE_KEY',
    'RolesList': 'ROLES_LIST',
    'Signer': 'SIGNER',
    'SignerList': 'SIGNER_LIST',
    'SignatureThreshold': 'SIGNATURE_THRESHOLD',
    'SignerNonce': 'SIGNER_NONCE',
    'SignatureCache': 'SIGNATURE_CACHE',
    'LiquidityDepth': 'LIQUIDITY_DEPTH',
    'LiquidityHistory': 'LIQUIDITY_HISTORY',
    'LiquidityPairs': 'LIQUIDITY_PAIRS',
    'PriceHistory': 'PRICE_HISTORY',
    'HealthWeights': 'HEALTH_WEIGHTS',
    'HealthScoreResult': 'HEALTH_SCORE_RESULT',
    'CheckpointConfig': 'CHECKPOINT_CONFIG',
    'CheckpointCounter': 'CHECKPOINT_COUNTER',
    'CheckpointMetadataList': 'CHECKPOINT_METADATA_LIST',
    'CheckpointSnapshot': 'CHECKPOINT_SNAPSHOT',
    'LastCheckpointAt': 'LAST_CHECKPOINT_AT',
    'LastCheckpointId': 'LAST_CHECKPOINT_ID',
    'RetentionPolicy': 'RETENTION_POLICY',
    'AssetRetentionOvr': 'ASSET_RETENTION_OVR',
    'LastCleanupAt': 'LAST_CLEANUP_AT',
    'ArchivedMismatches': 'ARCHIVED_MISMATCHES',
    'ArchivedLiquidityHistory': 'ARCHIVED_LIQUIDITY_HISTORY',
    'ArchivedCheckpointMeta': 'ARCHIVED_CHECKPOINT_META',
    'ArchivedCheckpointSnapshot': 'ARCHIVED_CHECKPOINT_SNAPSHOT',
    'GlobalPaused': 'GLOBAL_PAUSED',
    'PauseGuardian': 'PAUSE_GUARDIAN',
    'PauseReason': 'PAUSE_REASON',
    'PausedAt': 'PAUSED_AT',
    'UnpauseAvailableAt': 'UNPAUSE_AVAILABLE_AT',
    'PauseHistory': 'PAUSE_HISTORY',
    'EmergencyContact': 'EMERGENCY_CONTACT',
    'AssetPauseReason': 'ASSET_PAUSE_REASON',
    'PendingTransfer': 'PENDING_TRANSFER',
    'PendingUpgrade': 'PENDING_UPGRADE',
    'UpgradeProposalCounter': 'UPGRADE_PROPOSAL_COUNTER',
    'UpgradeHistory': 'UPGRADE_HISTORY',
    'ContractVersion': 'CONTRACT_VERSION',
    'CurrentContractWasmHash': 'CURRENT_CONTRACT_WASM_HASH',
    'RollbackTargetHash': 'ROLLBACK_TARGET_HASH',
    'ConfigEntry': 'CONFIG_ENTRY',
    'ConfigKeys': 'CONFIG_KEYS',
    'ConfigAuditLog': 'CONFIG_AUDIT_LOG',
    'AssetStatistics': 'ASSET_STATISTICS',
}

# Replace all incorrect uppercase variants with correct ones
for variant, key in variant_to_key.items():
    wrong_key = variant.upper()  # This is what was generated incorrectly
    if wrong_key != key:  # Only if they differ
        content = content.replace(f'keys::{wrong_key}', f'keys::{key}')

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Fixed key constant naming")
