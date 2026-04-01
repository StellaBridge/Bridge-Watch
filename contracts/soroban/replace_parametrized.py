#!/usr/bin/env python3

import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Replace parametrized DataKey variants with format! strings
# Pattern: .set(&DataKey::Variant(param), ...) -> .set(&format!("key:{}", param).into(), ...)

replace_patterns = [
    (r'&DataKey::AssetHealth\(([^)]+)\)', r'&format!("asset_health:{}", \1).into()'),
    (r'&DataKey::PriceRecord\(([^)]+)\)', r'&format!("price_record:{}", \1).into()'),
    (r'&DataKey::PriceHistory\(([^)]+)\)', r'&format!("price_history:{}", \1).into()'),
    (r'&DataKey::DeviationAlert\(([^)]+)\)', r'&format!("deviation_alert:{}", \1).into()'),
    (r'&DataKey::DeviationThreshold\(([^)]+)\)', r'&format!("deviation_threshold:{}", \1).into()'),
    (r'&DataKey::SupplyMismatches\(([^)]+)\)', r'&format!("supply_mismatches:{}", \1).into()'),
    (r'&DataKey::RoleKey\(([^)]+)\)', r'&format!("role_key:{}", \1).into()'),
    (r'&DataKey::Signer\(([^)]+)\)', r'&format!("signer:{}", \1).into()'),
    (r'&DataKey::SignerNonce\(([^)]+)\)', r'&format!("signer_nonce:{}", \1).into()'),
    (r'&DataKey::SignatureCache\(([^)]+)\)', r'&format!("signature_cache:{}", \1).into()'),
    (r'&DataKey::LiquidityDepth\(([^)]+)\)', r'&format!("liquidity_depth:{}", \1).into()'),
    (r'&DataKey::LiquidityHistory\(([^)]+)\)', r'&format!("liquidity_history:{}", \1).into()'),
    (r'&DataKey::HealthScoreResult\(([^)]+)\)', r'&format!("health_score_result:{}", \1).into()'),
    (r'&DataKey::CheckpointSnapshot\(([^)]+)\)', r'&format!("checkpoint_snapshot:{}", \1).into()'),
    (r'&DataKey::RetentionPolicy\(([^)]+)\)', r'&format!("retention_policy:{}", \1).into()'),
    (r'&DataKey::AssetRetentionOvr\(([^)]+),\s*([^)]+)\)', r'&format!("asset_retention_ovr:{}:{}", \1, \2).into()'),
    (r'&DataKey::LastCleanupAt\(([^)]+)\)', r'&format!("last_cleanup_at:{}", \1).into()'),
    (r'&DataKey::ArchivedMismatches\(([^)]+)\)', r'&format!("archived_mismatches:{}", \1).into()'),
    (r'&DataKey::ArchivedLiquidityHistory\(([^)]+)\)', r'&format!("archived_liquidity_history:{}", \1).into()'),
    (r'&DataKey::ArchivedCheckpointSnapshot\(([^)]+)\)', r'&format!("archived_checkpoint_snapshot:{}", \1).into()'),
    (r'&DataKey::AssetPauseReason\(([^)]+)\)', r'&format!("asset_pause_reason:{}", \1).into()'),
    (r'&DataKey::ConfigEntry\(([^)]+),\s*([^)]+)\)', r'&format!("config_entry:{}:{}", \1, \2).into()'),
    (r'&DataKey::ConfigAuditLog\(([^)]+),\s*([^)]+)\)', r'&format!("config_audit_log:{}:{}", \1, \2).into()'),
    (r'&DataKey::AssetStatistics\(([^)]+)\)', r'&format!("asset_statistics:{}", \1).into()'),
]

for pattern, replacement in replace_patterns:
    content = re.sub(pattern, replacement, content)

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Applied parametrized DataKey replacements")
