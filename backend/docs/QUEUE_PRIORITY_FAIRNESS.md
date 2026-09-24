# Queue Priority Fairness

## Overview

Queue Priority Fairness implements Deficit Round Robin (DRR) scheduling with minimum share guarantees across the four priority lanes (critical, high, medium, low). This prevents lower-priority lanes from starving under sustained high-priority load while still preferentially serving higher-priority work.

## The Problem

The existing BullMQ implementation created four separate queues but only a single worker listening on the **critical** lane. This meant:
- High/medium/low priority jobs were never processed
- No observability into per-lane backlog or service rates
- Operators couldn't tune fairness without code changes

## Solution

### 1. Fairness Engine (Pure Functions)
Core DRR algorithm with minimum share guarantees:
- **Weights**: critical=8, high=4, medium=2, low=1 (configurable)
- **Minimum shares**: critical=10%, high=5%, medium=5%, low=10% (configurable)
- **DRR quantum**: 1 job per selection
- Pure functions in `queueFairness.service.ts` — fully unit-testable

### 2. Persistence
- `queue_fairness_policies` — per-lane weight, min_share_pct, enabled
- `queue_fairness_samples` — per-lane depth/served per observation window
- `queue_fairness_assessments` — derived fairness status per lane

### 3. Integration Points

**PostgreSQL Ingestion Queue** (`ingestionQueueManager.service.ts`):
- New `processPendingJobsFair()` method replaces strict priority ordering
- Uses DRR to plan which lane to serve next
- Records fairness samples for observability

**BullMQ Queues** (`queue.ts`):
- Worker per lane with concurrency proportional to weight (critical=5, high=4, medium=3, low=2)
- `FairnessGovernor` — periodically assesses fairness and boosts concurrency for starved lanes
- Rate limiters adjusted dynamically

### 4. Admin API
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/admin/queue-fairness/policies` | Get all lane policies |
| `PUT` | `/api/v1/admin/queue-fairness/policies/:lane` | Update lane policy |
| `GET` | `/api/v1/admin/queue-fairness/status` | Current fairness assessment |
| `POST` | `/api/v1/admin/queue-fairness/sample` | Record manual sample |
| `GET` | `/api/v1/admin/queue-fairness/bullmq-counts` | BullMQ job counts per lane |
| `POST` | `/api/v1/admin/queue-fairness/governor/run` | Trigger governor manually |

## Data Model

### `queue_fairness_policies`
| Column | Type | Description |
|--------|------|-------------|
| `lane_name` | varchar(32) | Primary key: critical/high/medium/low |
| `weight` | int | DRR weight (1-100) |
| `min_share_pct` | int | Minimum guaranteed share (0-100) |
| `enabled` | boolean | Lane enabled |
| `created_at/updated_at` | timestamptz | Timestamps |

### `queue_fairness_samples`
| Column | Type | Description |
|--------|------|-------------|
| `id` | bigserial | Primary key |
| `lane_name` | varchar(32) | Lane name |
| `depth` | bigint | Jobs waiting |
| `served_count` | bigint | Jobs completed in window |
| `served_bytes` | bigint | Optional work volume |
| `sampled_at` | timestamptz | Sample timestamp |

### `queue_fairness_assessments`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `lane_name` | varchar(32) | Lane name |
| `status` | varchar(16) | healthy/degraded/unfair/starved |
| `reason` | varchar(500) | Assessment reason |
| `consecutive_unfair` | int | Consecutive unfair samples |
| `assessed_at` | timestamptz | Assessment timestamp |

## Behavior

### Fairness Assessment
For each lane, given a sample (depth, served) and policy (minSharePct, idealShare):
- **healthy**: no backlog, or share ≥ minSharePct and ≥ 50% of ideal
- **degraded**: share between minSharePct and 50% of ideal
- **unfair**: backlog present, share < minSharePct
- **starved**: backlog present, served = 0

Overall status = worst lane status.

### Fairness Governor
Runs periodically (e.g., every 30s via cron):
1. Gets current fairness assessment
2. For starved/unfair lanes: boosts concurrency (max 2× base)
3. For healthy lanes above base: gradually reduces concurrency
4. Adjusts BullMQ rate limiters accordingly

### Ingestion Queue Fair Scheduling
`processPendingJobsFair()`:
1. Counts pending jobs per lane (maps JobPriority 1-4 to lanes)
2. Runs DRR to plan next N lanes to serve
3. Fetches and processes one job from each planned lane

## Observability

### Metrics
- `queue_fairness_share_pct` (gauge per lane) — actual share of capacity
- `queue_fairness_status` (gauge per lane) — 0=healthy, 1=degraded, 2=unfair, 3=starved
- `queue_fairness_lane_depth` (gauge per lane) — current backlog
- `queue_fairness_served_total` (counter per lane) — jobs served

### Logging
Structured logs at INFO for governor actions, WARN for unfair/starved detection.

## Rollout Plan

1. **Migration**: Apply `20260924130000_queue_priority_fairness.ts` — creates tables with seed policies.
2. **Deploy backend**: 
   - `JobQueue.initWorker` now creates 4 workers (fixes starvation bug)
   - `ingestionQueueManager` gains `processPendingJobsFair()` (opt-in via config)
   - Fairness governor scheduled in `workers/index.ts`
3. **Configure**: Set `QUEUE_RATE_MAX_*` / `QUEUE_RATE_DURATION_MS_*` env vars for rate limiting.
4. **Monitor**: Watch `queue_fairness_status` — alert on `starved` or `unfair`.
5. **Tune**: Adjust weights/min_shares via admin API based on production behavior.

## Rollback Plan

1. Revert code deployment.
2. Run `npm run migrate:down` to drop three tables.
3. `JobQueue.initWorker` reverts to single-worker behavior (critical only).
4. `processPendingJobsFair()` unused — no impact.

## Operator Workflows

### Check fairness status
```bash
curl /api/v1/admin/queue-fairness/status -H "x-api-key: <admin-key>"
```

### Adjust low lane minimum share
```bash
curl -X PUT /api/v1/admin/queue-fairness/policies/low \
  -H "x-api-key: <admin-key>" \
  -H "Content-Type: application/json" \
  -d '{"minSharePct": 15}'
```

### View BullMQ queue depths
```bash
curl /api/v1/admin/queue-fairness/bullmq-counts -H "x-api-key: <admin-key>"
```

### Manual governor run
```bash
curl -X POST /api/v1/admin/queue-fairness/governor/run -H "x-api-key: <admin-key>"
```

### SQL: Fairness history
```sql
SELECT lane_name, status, reason, assessed_at
FROM queue_fairness_assessments
WHERE assessed_at > NOW() - INTERVAL '1 hour'
ORDER BY assessed_at DESC;
```

## Compatibility

- **Backward compatible**: Existing `processPendingJobs()` unchanged; `processPendingJobsFair()` is additive.
- **BullMQ**: Requires Redis; no breaking changes to job format.
- **Ingestion queue**: Opt-in; existing callers of `processPendingJobs()` unaffected.
- **Config**: All tuning via database (admin API) — no code changes needed.