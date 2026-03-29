#!/usr/bin/env python3

with open('src/lib.rs', 'r') as f:
    content = f.read()

# Fix double closing parentheses in get() calls
# .get::<...>(...)) -> .get::<...>(...)
# .get(...)) -> .get(...)
import re

# Remove extra ) from .get(...))
content = re.sub(r'\.get:?<[^>]*>\(&"[^"]*"\)\)', '.get::<String, T>(&"key")', content)
content = re.sub(r'\.get\(&"[^"]*"\)\)', '.get(&"key")', content)

# More general fix for all .get calls with double ))
content = re.sub(r'\.get<([^>]*)>\(([^)]*)\)\)', r'.get<\1>(\2)', content)
content = re.sub(r'\.get\(([^)]*)\)\)', r'.get(\1)', content)

with open('src/lib.rs', 'w') as f:
    f.write(content)

print("Fixed double closing parentheses")
