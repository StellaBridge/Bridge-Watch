# Database Connection Pool Dashboard — Issue #1182

## Overview

The Database Connection Pool Dashboard provides real-time monitoring and operational control of database connection pool metrics for Bridge Watch. It exposes connection pool telemetry through intuitive dashboards and APIs, enables operators to take corrective actions, and maintains comprehensive audit trails of all pool management activities.

## Features

### Metrics Collection

- **Real-time snapshots** collected every 5 seconds
- **Aggregated views** at multiple resolutions (1m, 5m, 1h)
- **Historical retention** of 30 days with automatic compression
- **Metrics tracked:**
  - Active connections
  - Idle connections
  - Waiting requests
  - Connection acquisition rate
  - Query latency
  - Error counts

### Event Detection

Significant pool state changes trigger events:

- **WAITING_REQUESTS**: Requests waiting for available connections
- **POOL_NEAR_EXHAUSTION**: Utilization > 90%
- **POOL_EXHAUSTED**: Utilization = 100% with waiting requests
- **POOL_RECOVERED**: Recovery from exhausted state
- **CONNECTION_TIMEOUT**: Connection acquisition timeout
- **ERROR_SPIKE**: Detected error spike
- **ACQUISITION_ERROR**: Failed connection acquisition

### Dashboard UI

A comprehensive dashboard displays:

- **Health Overview**: Current utilization, connection counts, health status
- **Metrics Charts**: 24-hour historical trends
- **Event Log**: Recent events with filtering
- **Control Panel**: Safe operator actions

### Operational Controls

Operators can safely perform:

- **Set max_connections**: Adjust pool size ceiling
- **Set min_connections**: Adjust pool size floor
- **Evict idle**: Close idle connections
- **Drain pool**: Close all connections
- **Reset stats**: Clear statistics counters

All actions require explicit confirmation and are fully audited.

### Authentication & Authorization

- **Authentication**: Required for all endpoints (JWT or API key)
- **Authorization**: Role-based access control
  - `read:pool_metrics` — view metrics
  - `read:pool_events` — view events
  - `admin:pool_control` — execute control actions
  - `read:pool_audit` — view control history

## Architecture

### Data Model

#### db_pool_snapshots

Time-series table storing periodic pool state:

```sql
CREATE TABLE db_pool_snapshots (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  pool_id TEXT NOT NULL,
  active_connections INTEGER NOT NULL,
  idle_connections INTEGER NOT NULL,
  waiting_requests INTEGER NOT NULL,
  max_connections INTEGER NOT NULL,
  min_connections INTEGER NOT NULL,
  acquired_total BIGINT,
  released_total BIGINT,
  avg_acquire_ms DOUBLE PRECISION,
  avg_query_ms DOUBLE PRECISION,
  error_count INTEGER
);
```

#### db_pool_events

Event table recording significant pool changes:

```sql
CREATE TABLE db_pool_events (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  pool_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  details JSONB,
  message TEXT
);
```

#### db_pool_controls

Audit trail of all operator actions:

```sql
CREATE TABLE db_pool_controls (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  pool_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  parameters JSONB,
  result TEXT NOT NULL,
  error_message TEXT,
  audit_id TEXT
);
```

### Service Layer

#### PoolMetricsCollector

Collects metrics from the database pool at regular intervals:

```typescript
const collector = new PoolMetricsCollector(pool, 5000);
collector.start(); // Start collection
collector.stop();  // Stop collection
const status = await collector.getHealthStatus(); // Get health
```

#### PoolControlHandler

Handles operator requests to control the pool:

```typescript
const handler = new PoolControlHandler(pool);
const result = await handler.handle(
  { pool_id: "default", action: "set_max_connections", parameters: { max: 50 } },
  "user_id"
);
```

#### PoolDataQueryService

Provides database queries for dashboard data:

```typescript
const service = getPoolDataQueryService();
const metrics = await service.getMetrics({ range: "24h" });
const events = await service.getEvents({ range: "24h", severity: "critical" });
const stats = await service.getPoolStats("default", "24h");
```

## API Endpoints

### GET /api/v1/db-pool/metrics

Get aggregated pool metrics.

**Query Parameters:**

- `range` (default: "24h") — Time range: 1h, 24h, 7d, 30d
- `resolution` (default: "1h") — Aggregation resolution: 1m, 5m, 1h
- `pool_id` (default: "default") — Pool identifier

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "bucket": "2026-08-29T10:00:00Z",
      "avg_active": 8,
      "avg_idle": 5,
      "avg_waiting": 0,
      "max_active": 15,
      "max_waiting": 2,
      "min_active": 2
    }
  ],
  "count": 24
}
```

### GET /api/v1/db-pool/events

Get pool events.

**Query Parameters:**

- `range` (default: "24h") — Time range
- `event_type` (optional) — Filter by event type
- `severity` (optional) — Filter by severity: info, warning, critical
- `pool_id` (default: "default") — Pool identifier
- `limit` (default: 100) — Result limit
- `offset` (default: 0) — Result offset

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "timestamp": "2026-08-29T10:30:00Z",
      "pool_id": "default",
      "event_type": "POOL_NEAR_EXHAUSTION",
      "severity": "critical",
      "message": "Pool utilization at 92.5% (18/20 active)"
    }
  ],
  "count": 5
}
```

### GET /api/v1/db-pool/status

Get current pool health status.

**Response:**

```json
{
  "success": true,
  "data": {
    "pool_id": "default",
    "is_healthy": true,
    "current_utilization": 0.45,
    "active_connections": 9,
    "idle_connections": 11,
    "waiting_requests": 0,
    "max_connections": 20,
    "recent_errors": 0,
    "last_heartbeat": "2026-08-29T10:45:30Z",
    "recommended_actions": []
  }
}
```

### POST /api/v1/db-pool/control

Execute a control action. **Requires admin role.**

**Request Body:**

```json
{
  "pool_id": "default",
  "action": "set_max_connections",
  "parameters": { "max": 50 },
  "confirmation": true
}
```

**Valid Actions:**

- `set_max_connections` — Requires `parameters.max` (1-1000)
- `set_min_connections` — Requires `parameters.min` (0-100)
- `evict_idle` — No parameters
- `drain_pool` — No parameters
- `reset_stats` — No parameters

**Response:**

```json
{
  "success": true,
  "data": { "oldMax": 20, "newMax": 50 }
}
```

### GET /api/v1/db-pool/stats

Get pool statistics for a time range.

**Response:**

```json
{
  "success": true,
  "data": {
    "avg_active": 7.5,
    "max_active": 18,
    "min_active": 2,
    "avg_idle": 5.2,
    "avg_waiting": 0.1,
    "max_waiting": 3,
    "sample_count": 288,
    "total_errors": 5
  }
}
```

### GET /api/v1/db-pool/latest

Get the most recent snapshot.

### GET /api/v1/db-pool/events/summary

Get count of events by type.

### GET /api/v1/db-pool/controls/history

Get audit trail of control actions.

## Setup and Migration

### Run Migration

```bash
# Apply migration
npm run migrate:up

# Check migration status
npm run migrate:status

# Rollback if needed
npm run migrate:down
```

### Initialize Metrics Collector

In your application startup:

```typescript
import { getPoolMetricsCollector } from "./services/db-pool-monitor/metrics-collector.js";

// Get pool reference (from pg or connection library)
const collector = getPoolMetricsCollector(pool);
collector.start();

// Stop gracefully on shutdown
process.on("SIGTERM", () => {
  collector.stop();
});
```

## Operational Procedures

### Monitoring the Dashboard

1. **Access the dashboard** at `/dashboard/db-pool`
2. **Check health** status at the top
3. **Review recent events** for anomalies
4. **Monitor trends** in the metrics charts
5. **Act on recommendations** from the system

### Taking Corrective Actions

#### If pool is near exhaustion:

1. **Review dashboard recommendations**
2. **Click "Pool Controls"**
3. **Select "Set Max Connections"**
4. **Enter new maximum** (typically 50-100 for normal loads)
5. **Review audit message**
6. **Click "Execute" and confirm**

#### If errors spike:

1. **Check recent events** for details
2. **Review application logs**
3. **If needed, drain pool** via controls
4. **Wait for automatic reconnection**
5. **Monitor recovery in dashboard**

### Operator Roles

Ensure operators have appropriate scopes in their API keys:

```bash
# For read-only monitoring
scopes: ["read:pool_metrics", "read:pool_events"]

# For control actions
scopes: ["read:pool_metrics", "read:pool_events", "admin:pool_control"]

# For auditing
scopes: ["read:pool_audit"]
```

## Rollout Strategy

### Phase 1: Soft Launch (Feature Flagged)

```bash
# Enable for internal testing only
FEATURE_DB_POOL_DASHBOARD=internal
```

- Monitor for errors
- Verify metrics accuracy
- Test control actions in non-production

### Phase 2: Gradual Rollout

```bash
# Enable for 10% of operators
FEATURE_DB_POOL_DASHBOARD=gradual
GRADUAL_ROLLOUT_PERCENTAGE=10
```

- Monitor performance impact
- Collect operator feedback
- Increase percentage incrementally

### Phase 3: Full Rollout

```bash
# Enable for all
FEATURE_DB_POOL_DASHBOARD=enabled
```

### Phase 4: GA

- Feature becomes standard
- Remove feature flag
- Include in SLOs

## Rollback Procedure

If issues occur:

```bash
# Disable immediately
FEATURE_DB_POOL_DASHBOARD=disabled

# Stop metrics collection
collector.stop()

# Data remains queryable
```

**No data loss occurs** — all snapshots and events are retained.

## Monitoring and Alerts

### Prometheus Metrics

The dashboard exports metrics to Prometheus:

- `db_connections_active` — Active connections
- `db_connections_idle` — Idle connections
- `db_pool_utilization` — Utilization percentage

### Alert Rules

Recommended alert rules in `prometheus-alerts.yml`:

```yaml
groups:
  - name: database_pool
    rules:
      - alert: PoolExhausted
        expr: >
          db_pool_active / db_pool_max >= 1.0
          and db_pool_waiting > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Database pool exhausted"

      - alert: PoolNearExhaustion
        expr: >
          db_pool_active / db_pool_max >= 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database pool near exhaustion"

      - alert: PoolErrorSpike
        expr: >
          rate(db_pool_errors[5m]) > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Database pool error spike detected"
```

## Testing

### Unit Tests

```bash
npm run test:unit
```

Covers:
- Metrics collection
- Event emission
- Control action handling
- Query service logic

### Integration Tests

```bash
npm run test:integration
```

Covers:
- API endpoint behavior
- Database interactions
- Authentication/authorization

### E2E Tests

```bash
npm run test:e2e
```

Covers:
- Dashboard UI
- Complete workflows
- Error handling

## Troubleshooting

### No metrics appear

1. **Check collector is running**: `collector.isActive()`
2. **Verify migration ran**: `npm run migrate:status`
3. **Check pool reference**: Ensure pool passed to collector
4. **Review logs** for collection errors

### Events not detected

1. **Check event thresholds** in metrics-collector.ts
2. **Verify pool state**: Active/waiting counts
3. **Review event insertion** logs

### Control actions fail

1. **Verify authorization scope**: `admin:pool_control`
2. **Check parameter validation**: Review error message
3. **Confirm pool is healthy**: Can accept connections

### Performance impact

1. **Reduce collection interval**:
   ```typescript
   new PoolMetricsCollector(pool, 10000); // 10s instead of 5s
   ```

2. **Reduce retention**:
   ```sql
   SELECT add_retention_policy('db_pool_snapshots', INTERVAL '7 days');
   ```

3. **Increase snapshot aggregation**:
   ```typescript
   { range: "24h", resolution: "5m" }
   ```

## Future Enhancements

- [ ] Multi-pool support
- [ ] Machine learning-based recommendations
- [ ] Automatic recovery actions
- [ ] Integration with incident management
- [ ] Cost optimization suggestions
- [ ] Performance baselines

## Support

For issues or questions:

1. Check this documentation
2. Review application logs
3. Check GitHub issues (#1182)
4. Contact platform team
