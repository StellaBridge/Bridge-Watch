#!/usr/bin/env python3

import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Fix .get::<DataKey, V>() calls - change DataKey to String as the key type parameter
# Pattern: .get::<DataKey, (.*?)> -> .get::<String, $1>
content = re.sub(r'\.get::<DataKey,\s*', '.get::<String, ', content)

# Also fix &DataKey:: calls still remaining that weren't caught
# These are the ones that didn't match our patterns

remaining_fixes = [
    (r'&DataKey::SignatureThreshold\b', '&keys::SIGNATURE_THRESHOLD'),
    (r'(&DataKey::Signer\()', r'&format!("signer:{}", '),  # This needs special handling
]

for pattern, replacement in remaining_fixes:
    content = re.sub(pattern, replacement, content)

# Now we need to fix the Signer variant calls which are more complex
# Replace DataKey::Signer(...) with proper format strings but not breaking the logic

# Find and replace any remaining DataKey:: references that we might have missed
content = re.sub(r'&DataKey::([A-Z][a-zA-Z]*)\b(?!\()', lambda m: f'&keys::{m.group(1).upper()}', content)

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Fixed .get() type parameters and remaining DataKey references")
