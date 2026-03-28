# Bridge-Watch API Documentation

## Interactive Documentation

Start the backend and open **http://localhost:3000/docs** to access the Swagger UI.

The raw OpenAPI 3.0 JSON spec is served at:
- **http://localhost:3000/api-docs.json** (live, always in sync with code)
- **[backend/docs/openapi.json](./openapi.json)** (checked-in snapshot)

---

## Authentication

Protected endpoints (all `/api/v1/alerts/*` routes and some admin routes) require an API key:

```
x-api-key: <your-api-key>
```

The middleware in `src/api/middleware/auth.ts` validates the key. Without a valid key the server returns `401 Unauthorized`.

---

## Rate Limiting

All endpoints are rate-limited per IP address using a Redis-backed sliding-window algorithm (`src/api/middleware/rateLimit.middleware.ts`). When a limit is exceeded the server responds with:

```
HTTP 429 Too Many Requests
Retry-After: <seconds>
```

Current metrics are available at `GET /api/v1/metrics/rate-limits`.

---

## API Versioning

All REST endpoints are prefixed with `/api/v1/`. When a breaking change is introduced a new version prefix (`/api/v2/`) is added and the previous version is maintained for **at least 90 days** before deprecation.

---

## Error Format

All errors follow a consistent JSON structure:

```json
{
  "error": "Short machine-readable label",
  "message": "Human-readable description"
}
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| 400  | Bad Request — invalid parameters or body |
| 401  | Unauthorized — missing or invalid API key |
| 404  | Not Found |
| 409  | Conflict — e.g. optimistic-lock version mismatch |
| 429  | Too Many Requests |
| 500  | Internal Server Error |
| 501  | Not Implemented |

---

## Endpoint Groups

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |

### Assets `/api/v1/assets`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all monitored assets |
| GET | `/:symbol` | Asset details |
| GET | `/:symbol/health` | Current health score |
| GET | `/:symbol/health/history` | Historical health scores (`period=24h|7d|30d`) |
| GET | `/:symbol/liquidity` | Aggregated liquidity |
| GET | `/:symbol/price` | Aggregated price from all sources |

### Bridges `/api/v1/bridges`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All bridge statuses |
| GET | `/:bridge/stats` | Per-bridge statistics |

### Alerts `/api/v1/alerts` _(requires x-api-key)_
| Method | Path | Description |
|--------|------|-------------|
| GET | `/rules` | List rules for an owner |
| POST | `/rules` | Create a rule |
| GET | `/rules/:ruleId` | Get a single rule |
| PATCH | `/rules/:ruleId` | Update a rule |
| DELETE | `/rules/:ruleId` | Delete a rule |
| PATCH | `/rules/:ruleId/active` | Pause/resume a rule |
| GET | `/rules/:ruleId/events` | Events fired by rule |
| POST | `/rules/bulk` | Bulk create |
| PATCH | `/rules/bulk` | Bulk update |
| DELETE | `/rules/bulk` | Bulk delete |
| GET | `/history` | Paginated alert history |
| GET | `/history/:assetCode` | Asset-scoped history |
| GET | `/stats` | Owner alert statistics |
| GET | `/recent` | Most recent events |
| POST | `/test` | Dry-run a rule |

### Analytics `/api/v1/analytics`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/protocol` | Protocol-wide statistics |
| GET | `/bridges/comparison` | Bridge comparison metrics |
| GET | `/assets/rankings` | Asset rankings |
| GET | `/volume` | Volume aggregations |
| GET | `/trends/:metric` | Metric trend calculation |
| GET | `/top-performers` | Top assets or bridges |
| GET | `/historical/:metric` | Historical comparison |
| GET | `/summary` | Combined analytics summary |
| GET | `/custom-metrics` | List custom metrics |
| GET | `/custom-metrics/:metricId` | Execute a custom metric |
| POST | `/cache/invalidate` | Invalidate analytics cache |

### Aggregation `/api/v1/aggregation`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:symbol/prices` | OHLCV price aggregation |
| GET | `/:symbol/health` | Health score aggregation |
| GET | `/:symbol/volume` | Volume aggregation |
| GET | `/stats` | Aggregation statistics |
| POST | `/precompute` | Pre-compute for an interval |
| POST | `/rebuild` | Rebuild historical data |
| POST | `/multi-asset` | Multi-asset aggregation |
| POST | `/cache/cleanup` | Remove old cache entries |

### Metadata `/api/v1/metadata`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All asset metadata |
| GET | `/search` | Search metadata |
| GET | `/symbol/:symbol` | By symbol |
| GET | `/category/:category` | By category |
| GET | `/:assetId` | By asset ID |
| GET | `/:assetId/history` | Version history |
| POST | `/` | Create or update |
| PATCH | `/:assetId/logo` | Update logo |
| DELETE | `/:assetId` | Delete |

### Watchlists `/api/v1/watchlists`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:userId` | User's watchlists |
| POST | `/:userId` | Create watchlist |
| PATCH | `/:userId/:id` | Update watchlist |
| DELETE | `/:userId/:id` | Delete watchlist |

### Preferences `/api/v1/preferences`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/:userId` | All preferences |
| GET | `/:userId/:category/:key` | Single value |
| PUT | `/:userId/:category/:key` | Set single value |
| PATCH | `/:userId/bulk` | Bulk update (optimistic lock) |
| DELETE | `/:userId/:category/:key` | Reset key |
| GET | `/:userId/export` | Export preferences |
| POST | `/:userId/import` | Import preferences |
| GET | `/:userId/stream` | SSE change stream |

### Jobs `/api/v1/jobs`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/monitor` | Queue status and failed jobs |
| POST | `/:jobName/trigger` | Manually enqueue a job |

### Config `/api/v1/config`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All config entries |
| GET | `/:key` | Single entry |
| POST | `/` | Set value |
| DELETE | `/:key` | Delete entry |
| GET | `/features/:name` | Feature flag status |
| POST | `/features` | Set feature flag |
| GET | `/export` | Export config |
| POST | `/import` | Import config |
| GET | `/audit` | Audit trail |
| POST | `/cache/clear` | Clear config cache |

### Cache `/api/v1/cache`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Redis cache statistics |
| POST | `/invalidate` | Invalidate by key or tag |
| GET | `/metrics/rate-limits` | Rate-limit metrics |

### Circuit Breaker `/api/v1/circuit-breaker`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Pause status for a scope |
| GET | `/whitelist` | Whitelist check |
| POST | `/pause` | Pause a scope _(not yet implemented)_ |
| POST | `/recovery` | Recover from pause _(not yet implemented)_ |

---

## Maintenance Guide

### Adding a new endpoint

1. Add the route to the relevant file in `backend/src/api/routes/`.
2. Include a `schema` block with `tags`, `summary`, `params`/`querystring`/`body`, and `response`.
3. If this is a new route file, register it in `backend/src/api/routes/index.ts`.
4. Regenerate the static spec:
   ```bash
   npm run docs:generate
   ```
5. Commit both the route file and the updated `backend/docs/openapi.json`.

### Updating an existing endpoint

1. Edit the route handler and its inline `schema`.
2. Run `npm run docs:generate` to refresh the static spec.

### Adding a reusable schema component

Add it to the `components.schemas` map in `backend/src/config/openapi.ts`. Reference it in route schemas using `$ref: "SchemaName#"`.

### Validating the spec

Paste `backend/docs/openapi.json` into [https://editor.swagger.io](https://editor.swagger.io) or run:
```bash
npx @stoplight/spectral-cli lint backend/docs/openapi.json
```

### CI integration

The GitHub Actions workflow validates TypeScript compilation (`npm run build`) on every PR. Add a spec-lint step by including:
```yaml
- run: npx @stoplight/spectral-cli lint backend/docs/openapi.json
```
