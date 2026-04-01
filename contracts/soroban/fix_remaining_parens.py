#!/usr/bin/env python3

with open('src/lib.rs', 'r') as f:
    lines = f.readlines()

result = []
for line in lines:
    # Fix any remaining get::<...>(...)) patterns with double ))
    line = line.replace('.get::<String, u64>(&"key"))', '.get::<String, u64>(&"key")')
    line = line.replace('.get::<String, Signer>(&"key"))', '.get::<String, Signer>(&"key")')
    line = line.replace('.get::<String, T>(&"key"))', '.get::<String, T>(&"key")')
    
    # More general: any .get::<...> with double ))
    import re
    line = re.sub(r'\.get::<([^>]+)>\([^)]*\)\)', r'.get::<\1>(&"key")', line)
    
    result.append(line)

with open('src/lib.rs', 'w') as f:
    f.writelines(result)

print("Fixed remaining double parentheses")
