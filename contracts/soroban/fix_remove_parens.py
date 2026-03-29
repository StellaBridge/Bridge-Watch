#!/usr/bin/env python3

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Fix .remove(...)) calls with double parentheses
# .remove(&"key")); -> .remove(&"key");
import re
content = re.sub(r'\.remove\(&"[^"]*"\)\);', '.remove(&"key");', content)
content = re.sub(r'\.remove\(([^)]*)\)\);', r'.remove(\1);', content)

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Fixed double parentheses in remove() calls")
