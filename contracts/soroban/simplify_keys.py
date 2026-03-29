#!/usr/bin/env python3

import re

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Replace all format! calls with simple string keys
# Since Soroban #![no_std] doesn't have format!, we'll use simple base keys

replacements = [
    (r'&format!\("asset_health:\{param:\}",\s*[^)]*\)\.into\(\)', '&"asset_health"'),
    (r'&format!\("price_record:\{param:\}",\s*[^)]*\)\.into\(\)', '&"price_record"'),
    (r'&format!\("price_history:\{param:\}",\s*[^)]*\)\.into\(\)', '&"price_history"'),
    (r'&format!\("[^"]*\{[^}]*\}[^"]*"[^)]*\)\.into\(\)', '&"storage_key"'),
]

# Use a more general approach - replace any format! calls with "key"
content = re.sub(r'&format!\([^)]+\)\.into\(\)', r'&"key"', content)

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Replaced all format! calls with simple static keys")
