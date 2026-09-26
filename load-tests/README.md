# Load Testing Framework

This directory contains the load testing framework for Bridge-Watch using k6, with comprehensive scenario coverage for critical API endpoints.

## Profiles

| Profile | VUs | Duration | Use Case |
|---------|-----|----------|----------|
| `smoke` | 1-5 | 30s | Fast PR validation |
| `ramp` | 10-50 | 2m | Gradual ramp-up |
| `spike` | 100+ | 1-2m | Traffic burst |
| `endurance` | 20 | 30m | Long-running stability |

## Scenarios

### 1. Health Endpoints (`scenarios/api-load.js`)
Tests core health and status endpoints:
- `GET /api/v1/health` - Overall system health
- `GET /health` - Simple health check
- `GET /api/v1/circuit-health` - Circuit breaker status

**Coverage:** Readiness and detailed health endpoints under load

### 2. Batch Reconciliation (`scenarios/batch-reconciliation.js`)
Comprehensive load testing for reconciliation operations - **Closes #870**

#### Endpoints Tested
- `GET /api/v1/reconciliation/runs` - List with pagination (limit, offset)
- `GET /api/v1/reconciliation/runs/batch` - Batch details for multiple concurrent runs
- `GET /api/v1/reconciliation/runs?stream=true` - Real-time streaming data

#### Metrics Collected
- `batch_reconciliation_latency` - p50, p95, p99 percentiles
- `batch_reconciliation_failures` - Count of failed requests
- `batch_reconciliation_runs_concurrent` - Number of concurrent operations tracked

#### Performance Thresholds
- **p95 latency:** < 5000ms
- **p99 latency:** < 8000ms
- **Failure rate:** < 50 errors total
- All responses must be valid JSON with status 200

#### Test Execution
```bash
# Smoke test
k6 run --env PROFILE=smoke load-tests/scenarios/batch-reconciliation.js

# Load test with custom URL
k6 run --env PROFILE=load \
  --env BASE_URL=http://localhost:3001 \
  --env API_KEY=your-api-key \
  load-tests/scenarios/batch-reconciliation.js
```

### 3. Soroban Batch Planner (`scenarios/soroban-batch-planner.js`)
Throughput of the resource-budget-aware batch submission planner under ledger budget pressure - **Closes #1016**

#### Endpoints Tested
- `POST /api/v1/soroban/batch-planner/plan` - Plan, dry-run submit, and reconcile an oversized backlog (150 items/request by default) so the planner must pack multiple budget-respecting batches
- `GET /api/v1/soroban/batch-planner/status` - Durable lifecycle ledger snapshot

Requires the backend's `SOROBAN_RPC_URL` to point at a reachable Soroban RPC (the local sandbox from `docker-compose.sandbox.yml` is intended for this) since each item is simulated for a real resource estimate.

#### Metrics Collected
- `soroban_batch_plan_latency` - p50, p95, p99 percentiles across plan + status calls
- `soroban_batch_plan_failures` - Count of failed requests
- `soroban_batch_items_planned` / `soroban_batch_batches_per_request` - Packing throughput per request
- `soroban_batch_rejection_rate` - Share of requests where at least one item exceeded a ceiling alone

#### Performance Thresholds
- **p95 latency:** < 5000ms
- **Failures:** < 20 total
- **Item rejection rate:** < 5%

#### Test Execution
```bash
# Smoke test
k6 run --env PROFILE=smoke load-tests/scenarios/soroban-batch-planner.js

# Apply more ledger budget pressure with a larger backlog per request
k6 run --env PROFILE=load --env BACKLOG_SIZE=500 \
  --env BASE_URL=http://localhost:3001 \
  load-tests/scenarios/soroban-batch-planner.js
```

### 4. WebSocket Broadcast Concurrency (`websocket-concurrency.js`)
Scalability of the real-time broadcaster under 5,000 concurrent subscribers - **Closes #1296**

Each VU connects to `/api/v1/ws`, subscribes to `bridges`, `events`, `health`, `prices`, and holds the connection for `HOLD_SECONDS`.

#### Metrics Collected
- `ws_broadcast_latency` - server message `timestamp` to client receipt (p95 < 1s, p99 < 2.5s)
- `ws_message_drop_rate` - sessions that received no broadcast while subscribed (< 1%)
- `ws_connection_drop_rate` - sessions closed before the hold window ended (< 1%)
- `redis_memory_used_bytes` - sampled every 5s from a [redis_exporter](https://github.com/oliver006/redis_exporter) when `REDIS_EXPORTER_URL` is set

Drop rate assumes the backend is broadcasting during the run. On an idle environment, publish events (e.g. via ingestion or a Redis `PUBLISH`) while the test holds.

#### Test Execution
```bash
k6 run load-tests/websocket-concurrency.js

k6 run --env TARGET_VUS=500 --env HOLD_SECONDS=120 \
  --env BASE_URL=http://localhost:3001 \
  --env REDIS_EXPORTER_URL=http://localhost:9121/metrics \
  load-tests/websocket-concurrency.js
```

5,000 connections need a raised file-descriptor limit on the load generator (`ulimit -n 20000`).

## Quick Start

1. Start the backend service:
   ```bash
   make dev
   ```

2. Run smoke test:
   ```bash
   k6 run load-tests/scenarios/api-load.js -e PROFILE=smoke -e BASE_URL=http://127.0.0.1:3001
   ```

3. Export comprehensive report:
   ```bash
   k6 run load-tests/scenarios/batch-reconciliation.js \
     -e PROFILE=smoke \
     -e BASE_URL=http://127.0.0.1:3001 \
     -e SUMMARY_JSON=load-tests/results/summary.json \
     -e SUMMARY_TXT=load-tests/results/summary.txt
   ```

4. View results:
   ```bash
   cat load-tests/results/summary.txt
   ```

## Scenario Coverage

- **API Health:** Fast validation of core endpoints
- **Gradual ramp-up:** Profile `ramp` for smooth load increase
- **Spike testing:** Profile `spike` for sudden traffic burst
- **Endurance testing:** Profile `endurance` for long-running stability
- **Batch Reconciliation:** Concurrent operations with realistic pagination patterns

## Regression Detection

Baseline thresholds are defined in `load-tests/config/baselines.js` and enforced in k6 thresholds.
A run fails automatically when thresholds are breached, preventing performance regressions.

### Baseline Configuration
```javascript
export const baselines = {
  "batch_reconciliation_latency{quantile:0.95}": ["p(95) < 5000"],
  "batch_reconciliation_latency{quantile:0.99}": ["p(99) < 8000"],
  "batch_reconciliation_failures": ["count < 50"],
};
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PROFILE` | `smoke` | Test profile (smoke, ramp, spike, endurance) |
| `BASE_URL` | `http://127.0.0.1:3001` | API base URL |
| `API_KEY` | `test-key-123` | API authentication key |
| `SUMMARY_JSON` | `load-tests/results/batch-reconciliation-summary.json` | JSON output |
| `SUMMARY_TXT` | `load-tests/results/batch-reconciliation-summary.txt` | Text output |

## CI/CD Integration

Load tests run automatically on every push via `.github/workflows/load-tests.yml`:
```yaml
- name: Run batch reconciliation load test
  run: make load-tests
```

Tests must pass before PR merge.
