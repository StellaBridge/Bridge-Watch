#!/usr/bin/env python3

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Fix malformed set() calls:
# .set(&"key"), &value); -> .set(&"key", &value);
content = content.replace('set(&"key"), &', 'set(&"key", &')

# Fix any other malformed patterns that might have been created
import re
# .set(...), &X); -> .set(..., &X);
content = re.sub(r'\.set\(([^)]+)\),\s*&', r'.set(\1, &', content)
# .get(...), \); -> .get(...);  (if this happened)
content = re.sub(r'\.get\(([^)]+)\),\s*\)', r'.get(\1)', content)

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Fixed malformed set/get calls")
