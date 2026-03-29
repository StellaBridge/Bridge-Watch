#!/usr/bin/env python3

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Replace incorrect enum variants with correct ones
content = content.replace('DataKey::LiquidityDepthCurrent', 'DataKey::LiquidityDepth')
content = content.replace('DataKey::LiquidityDepthHistory', 'DataKey::LiquidityHistory')
content = content.replace('DataKey::AssetRetentionOverride', 'DataKey::AssetRetentionOvr')
content = content.replace('DataKey::ArchivedSupplyMismatches', 'DataKey::ArchivedMismatches')
content = content.replace('DataKey::ArchivedLiquidityDepthHistory', 'DataKey::ArchivedLiquidityHistory')
content = content.replace('DataKey::AssetExpirationTtl', 'DataKey::AssetRetentionOvr')

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Fixed incorrect enum variant references")
