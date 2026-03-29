#!/usr/bin/env python3

import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

# For parametrized DataKey variants, we need to handle them specially
# These need to create composite keys with the parameter value

# Pattern: &DataKey::Variant(param) -> create dynamic key like "variant_key_<param>"
# For now, let's replace with a function call that builds the key

 # Add a helper function impl at the end of the keys mod
helper_code = '''
    // Helper function to build composite storage keys
    pub fn build_key(base: &str, param: &str) -> String {
        let mut result = base.to_string();
        result.push_str(":");
        result.push_str(param);
        result
    }
}

// Implement helper functions for common parametrized keys
impl BridgeWatchContract {
    fn asset_health_key(asset_code: &str) -> String {
        format!("asset_health:{}", asset_code)
    }
    
    fn price_record_key(asset_code: &str) -> String {
        format!("price_record:{}", asset_code)
    }
    
    fn price_history_key(asset_code: &str) -> String {
        format!("price_history:{}", asset_code)
    }
    
    fn deviation_alert_key(asset_code: &str) -> String {
        format!("deviation_alert:{}", asset_code)
    }
    
    fn deviation_threshold_key(asset_code: &str) -> String {
        format!("deviation_threshold:{}", asset_code)
    }
    
    fn supply_mismatches_key(bridge_id: &str) -> String {
        format!("supply_mismatches:{}", bridge_id)
    }
    
    fn liquidity_depth_key(asset_pair: &str) -> String {
        format!("liquidity_depth:{}", asset_pair)
    }
    
    fn liquidity_history_key(asset_pair: &str) -> String {
        format!("liquidity_history:{}", asset_pair)
    }
    
    fn health_score_result_key(asset_code: &str) -> String {
        format!("health_score:{}", asset_code)
    }
    
    fn role_key_by_address(address: &Address) -> String {
        format!("role_key:{}", address)
    }
    
    fn signer_key(signer_id: &str) -> String {
        format!("signer:{}", signer_id)
    }
    
    fn signer_nonce_key(signer_id: &str) -> String {
        format!("signer_nonce:{}", signer_id)
    }
    
    fn checkpoint_snapshot_key(id: u64) -> String {
        format!("checkpoint_snapshot:{}", id)
    }
    
    fn archived_mismatches_key(bridge_id: &str) -> String {
        format!("archived_mismatches:{}", bridge_id)
    }
    
    fn archived_liquidity_history_key(asset_pair: &str) -> String {
        format!("archived_liquidity_history:{}", asset_pair)
    }
    
    fn archived_checkpoint_snapshot_key(id: u64) -> String {
        format!("archived_checkpoint_snapshot:{}", id)
    }
    
    fn retention_policy_key(data_type: &str) -> String {
        format!("retention_policy:{}", data_type)
    }
    
    fn asset_retention_ovr_key(asset: &str, data_type: &str) -> String {
        format!("asset_retention_ovr:{}:{}", asset, data_type)
    }
    
    fn last_cleanup_at_key(data_type: &str) -> String {
        format!("last_cleanup_at:{}", data_type)
    }
    
    fn config_entry_key(category: &str, name: &str) -> String {
        format!("config_entry:{}:{}", category, name)
    }
    
    fn config_audit_log_key(category: &str, name: &str) -> String {
        format!("config_audit_log:{}:{}", category, name)
    }
    
    fn asset_statistics_key(asset_code: &str) -> String {
        format!("asset_statistics:{}", asset_code)
    }
    
    fn asset_pause_reason_key(asset_code: &str) -> String {
        format!("asset_pause_reason:{}", asset_code)
    }
    
    fn last_cleanup_at_retention_key(data_type_str: &str) -> String {
        format!("last_cleanup_at:{}", data_type_str)
    }
'''

# Find the closing brace of the keys module and insert helper functions there
keys_module_end = content.find('}\n\n#[contracttype]')
if keys_module_end > 0:
    # Insert the helper functions after the keys module closing brace
    content = content[:keys_module_end+1] + helper_code + '\n' + content[keys_module_end+1:]
    with open('src/lib.rs', 'w') as f:
        f.write(content)
    print("Helper functions added")
else:
    print("Could not find keys module end")
