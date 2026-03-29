#!/usr/bin/env python3
import re

with open('src/lib.rs', 'r') as f:
    lines = f.readlines()

result = []
in_datakey_impl = False
storage_depth = 0

for line in lines:
    # Track if we're inside the DataKey impl block
    if 'impl DataKey {' in line:
        in_datakey_impl = True
    elif in_datakey_impl and line.strip().startswith('}') and not line.strip().startswith('} '):
        in_datakey_impl = False
    
    if in_datakey_impl or 'to_string_key' in line:
        result.append(line)
        continue
    
    # Skip if line is inside a comment or already has to_string_key()
    if 'to_string_key()' in line or line.strip().startswith('//'):
        result.append(line)
        continue
    
    # Replace &DataKey::<Variant> with &DataKey::<Variant>.to_string_key()
    # Only in storage() contexts
    if 'storage' in line and 'DataKey::' in line:
        # Replace pattern: &DataKey::<NAME> or &DataKey::<NAME>(...) 
        # with: &DataKey::<NAME>.to_string_key() or &DataKey::<NAME>(...).to_string_key()
        
        # Find all DataKey:: references that aren't already calling to_string_key()
        new_line = ""
        i = 0
        while i < len(line):
            if line[i:].startswith('&DataKey::') and 'to_string_key()' not in line[i:i+100]:
                # Found a DataKey reference
                new_line += '&DataKey::'
                i += len('&DataKey::')
                
                # Extract variant name and any parameters
                variant_match = re.match(r'([a-zA-Z_]+)', line[i:])
                if variant_match:
                    variant = variant_match.group(1)
                    new_line += variant
                    i += len(variant)
                    
                    # Check if there are parameters
                    if i < len(line) and line[i] == '(':
                        # Extract balanced parentheses
                        paren_count = 1
                        i += 1
                        new_line += '('
                        while i < len(line) and paren_count > 0:
                            if line[i] == '(':
                                paren_count += 1
                            elif line[i] == ')':
                                paren_count -= 1
                            new_line += line[i]
                            i += 1
                    
                    # Add the .to_string_key() call
                    new_line += '.to_string_key()'
            else:
                new_line += line[i]
                i += 1
        
        result.append(new_line)
    else:
        result.append(line)

with open('src/lib.rs', 'w') as f:
    f.writelines(result)

print("Storage fix applied successfully")
