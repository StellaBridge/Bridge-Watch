#!/usr/bin/env python3
import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Step 1: Add the impl DataKey block (copy the impl impl we created earlier)
impl_code = '''
// Helper impl to convert DataKey to storable string keys
impl DataKey {
    pub fn to_string_key(&self) -> String {
        match self {
            DataKey::Admin => "Admin".into(),
            DataKey::AssetHealth(_) => "AssetHealth".into(),
            DataKey::PriceRecord(_) => "PriceRecord".into(),
            DataKey::MonitoredAssets => "MonitoredAssets".into(),
            DataKey::DeviationAlert(_) => "DeviationAlert".into(),
            DataKey::DeviationThreshold(_) => "DeviationThreshold".into(),
            DataKey::SupplyMismatches(_) => "SupplyMismatches".into(),
            DataKey::MismatchThreshold => "MismatchThreshold".into(),
            DataKey::BridgeIds => "BridgeIds".into(),
            DataKey::RoleKey(_) => "RoleKey".into(),
            DataKey::RolesList => "RolesList".into(),
            DataKey::Signer(_) => "Signer".into(),
            DataKey::SignerList => "SignerList".into(),
            DataKey::SignatureThreshold => "SignatureThreshold".into(),
            DataKey::SignerNonce(_) => "SignerNonce".into(),
            DataKey::SignatureCache(_) => "SignatureCache".into(),
            DataKey::LiquidityDepth(_) => "LiquidityDepth".into(),
            DataKey::LiquidityHistory(_) => "LiquidityHistory".into(),
            DataKey::LiquidityPairs => "LiquidityPairs".into(),
            DataKey::PriceHistory(_) => "PriceHistory".into(),
            DataKey::HealthWeights => "HealthWeights".into(),
            DataKey::HealthScoreResult(_) => "HealthScoreResult".into(),
            DataKey::CheckpointConfig => "CheckpointConfig".into(),
            DataKey::CheckpointCounter => "CheckpointCounter".into(),
            DataKey::CheckpointMetadataList => "CheckpointMetadataList".into(),
            DataKey::CheckpointSnapshot(_) => "CheckpointSnapshot".into(),
            DataKey::LastCheckpointAt => "LastCheckpointAt".into(),
            DataKey::LastCheckpointId => "LastCheckpointId".into(),
            DataKey::RetentionPolicy(_) => "RetentionPolicy".into(),
            DataKey::AssetRetentionOvr(_, _) => "AssetRetentionOvr".into(),
            DataKey::LastCleanupAt(_) => "LastCleanupAt".into(),
            DataKey::ArchivedMismatches(_) => "ArchivedMismatches".into(),
            DataKey::ArchivedLiquidityHistory(_) => "ArchivedLiquidityHistory".into(),
            DataKey::ArchivedCheckpointMeta => "ArchivedCheckpointMeta".into(),
            DataKey::ArchivedCheckpointSnapshot(_) => "ArchivedCheckpointSnapshot".into(),
            DataKey::GlobalPaused => "GlobalPaused".into(),
            DataKey::PauseGuardian => "PauseGuardian".into(),
            DataKey::PauseReason => "PauseReason".into(),
            DataKey::PausedAt => "PausedAt".into(),
            DataKey::UnpauseAvailableAt => "UnpauseAvailableAt".into(),
            DataKey::PauseHistory => "PauseHistory".into(),
            DataKey::EmergencyContact => "EmergencyContact".into(),
            DataKey::AssetPauseReason(_) => "AssetPauseReason".into(),
            DataKey::PendingTransfer => "PendingTransfer".into(),
            DataKey::PendingUpgrade => "PendingUpgrade".into(),
            DataKey::UpgradeProposalCounter => "UpgradeProposalCounter".into(),
            DataKey::UpgradeHistory => "UpgradeHistory".into(),
            DataKey::ContractVersion => "ContractVersion".into(),
            DataKey::CurrentContractWasmHash => "CurrentContractWasmHash".into(),
            DataKey::RollbackTargetHash => "RollbackTargetHash".into(),
            DataKey::ConfigEntry(_, _) => "ConfigEntry".into(),
            DataKey::ConfigKeys => "ConfigKeys".into(),
            DataKey::ConfigAuditLog(_, _) => "ConfigAuditLog".into(),
            DataKey::AssetStatistics(_) => "AssetStatistics".into(),
        }
    }
}
'''

# Find the position to insert impl before #[contract]
contract_marker = '#[contract]'
pos = content.rfind(contract_marker)
if pos >= 0:
    # Insert the impl block before #[contract]
    content = content[:pos] + impl_code + '\n' + content[pos:]

# Step 2: Replace all &DataKey:: with &DataKey::.to_string_key() in storage contexts
# Using a global regex approach with full-text processing, not line-by-line

# Pattern: &DataKey::IDENTIFIER with optional parameters ending with closing paren or comma or )
pattern = r'(&DataKey::([a-zA-Z_]+)(?:\([^)]*(?:\([^)]*\)[^)]*)*\))?)'
def replace_datakey(match):
    full_match = match.group(1)
    # Only replace if not already calling to_string_key() and we're in a storage context
    # Check the surrounding text to see if it's in a storage call
    start = max(0, match.start() - 200)
    end = min(len(content), match.end() + 50)
    context = content[start:end]
    
    if 'storage' in context and '.to_string_key()' not in context:
        return full_match + '.to_string_key()'
    else:
        return full_match

content = re.sub(pattern, replace_datakey, content)

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Improved storage fix applied successfully")
