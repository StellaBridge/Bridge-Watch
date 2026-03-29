#!/usr/bin/env python3

import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Replacements mapping
replacements = {
    '&DataKey::Admin,': '&keys::ADMIN,',
    '&DataKey::Admin)': '&keys::ADMIN)',
    '&DataKey::MonitoredAssets,': '&keys::MONITORED_ASSETS,',
    '&DataKey::MonitoredAssets)': '&keys::MONITORED_ASSETS)',
   '&DataKey::CheckpointConfig,': '&keys::CHECKPOINT_CONFIG,',
    '&DataKey::CheckpointMetadataList,': '&keys::CHECKPOINT_METADATA_LIST,',
    '&DataKey::ArchivedCheckpointMeta,': '&keys::ARCHIVED_CHECKPOINT_META,',
    '&DataKey::CheckpointCounter,': '&keys::CHECKPOINT_COUNTER,',
    '&DataKey::LastCheckpointAt,': '&keys::LAST_CHECKPOINT_AT,',
    '&DataKey::ContractVersion,': '&keys::CONTRACT_VERSION,',
    '&DataKey::UpgradeProposalCounter,': '&keys::UPGRADE_PROPOSAL_COUNTER,',
    '&DataKey::UpgradeHistory,': '&keys::UPGRADE_HISTORY,',
    '&DataKey::SignerList,': '&keys::SIGNER_LIST,',
    '&DataKey::SignerList)': '&keys::SIGNER_LIST)',
    '&DataKey::HealthWeights,': '&keys::HEALTH_WEIGHTS,',
    '&DataKey::PauseHistory,': '&keys::PAUSE_HISTORY,',
    '(&DataKey::Admin)': '(&keys::ADMIN)',
    '(&DataKey::Admin,': '(&keys::ADMIN,',
}

for old, new in replacements.items():
    content = content.replace(old, new)

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Replacements applied successfully")
