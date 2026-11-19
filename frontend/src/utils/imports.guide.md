# Import Optimization Guide

## Tree-Shaking Best Practices

This guide documents import patterns to maximize tree-shaking effectiveness and minimize bundle size.

### ✅ DO: Named Imports (Tree-shakeable)

```typescript
// Good: Named imports allow unused code to be eliminated
import { debounce } from 'lodash-es';
import { format, parseISO } from 'date-fns';
import { useState, useEffect } from 'react';
```

### ❌ DON'T: Wildcard or Default Imports

```typescript
// Bad: Wildcard imports prevent tree-shaking
import * as lodash from 'lodash';
import * as dateFns from 'date-fns';

// Bad: Default imports of large modules
import lodash from 'lodash';
import dateFns from 'date-fns';
```

### Common Libraries - Recommended Imports

#### React
```typescript
import { useState, useEffect, useCallback, useMemo } from 'react';
```

#### React Router
```typescript
import { useNavigate, useLocation, Link } from 'react-router-dom';
```

#### React Query
```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
```

#### Recharts (Charts)
```typescript
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
```

#### Zustand (State Management)
```typescript
import { create } from 'zustand';
```

### Bundle Analysis

To verify tree-shaking is working:

```bash
# Check bundle size
npm run bundle:size

# Update baseline after improvements
npm run bundle:size:update
```

### ESLint Rule

Enable eslint rules to prevent non-tree-shakeable imports:
- `no-restricted-imports`: Configure to prevent wildcard imports from large libraries
- `import/no-named-as-default`: Avoid default imports of modules designed for named imports

### References
- [Webpack Tree-shaking](https://webpack.js.org/guides/tree-shaking/)
- [Rollup Tree-shaking](https://rollupjs.org/guide/en/#tree-shaking)
- [date-fns Docs](https://date-fns.org/docs/Getting-Started/Installation)
