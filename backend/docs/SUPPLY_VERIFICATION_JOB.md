# Supply Verification Job System

## Overview

The Supply Verification Job System periodically verifies the supply consistency of all supported assets across chains. It uses BullMQ for robust job queue management with automatic retry logic, comprehensive monitoring, and integrated alerting.

## Job System Design

### 1. Schedule

- **Frequency**: Every 5 minutes (cron: `*/5 * * * *`)
- **Rationale**: Balances data freshness with API rate limits
- **Configuration**: Adjustable via cron pattern in `initSupplyVerificationJob()`

### 2. Queue Configuration

| Property | Value | Description |
|----------|-------|-------------|
| Queue Name | `supply-verification` | Dedicated queue for isolation |
| Concurrency | 3 | Prevents API rate limit exhaustion |
| Max Attempts | 3 (configurable) | Retry attempts before failure |
| Backoff Type | Exponential | 1s, 2s, 4s delays |
| Priority (Normal) | 10 | Standard priority |
| Priority (High) | 5 | Elevated for manual runs |

### 3. Job Structure

- **Single Asset Job**: One job per asset (enables parallel processing)
- **Batch Job**: Verifies all assets in one scheduled run
- **Job Types**:
  - `verify-supply`: Single asset verification
  - `verify-supply-batch`: Batch verification (scheduled)

### 4. Retry Logic

```typescript
{
  attempts: 3,                    // Max retry attempts
  backoff: {
    type: "exponential",
    delay: 1000                   // Base delay in ms
  }
}
```

**Retry Behavior**:
- Attempt 1: Immediate
- Attempt 2: After 1 second
- Attempt 3: After 2 seconds
- Attempt 4: After 4 seconds (final)
- Failure alert triggered if all retries exhausted

### 5. Parallel Processing

- Assets processed in parallel up to concurrency limit (3)
- Prevents resource exhaustion via queue concurrency control
- Each asset verification is independent (no shared state)
- Safe for high-volume processing

### 6. Monitoring

**Job Status Tracking** (via BullMQ):
- `pending`: Waiting in queue
- `active`: Currently processing
- `completed`: Successfully finished
- `failed`: Exceeded max retries
- `delayed`: Waiting for retry backoff

**Metrics Collected**:
- `queue_jobs_completed_total`: Success count
- `queue_jobs_failed_total`: Failure count
- `queue_job_duration_seconds`: Execution time histogram
- Failure reasons tracked by error type

**Logging**:
- Info: Job start/completion
- Warn: Supply mismatches, retry attempts
- Error: Job failures, persistence errors

### 7. Alerting

**Trigger Conditions**:
1. **Repeated Failures**: After exhausting max retries
   - Alert type: `verification_failure`
   - Metrics: consecutive_failures count

2. **Supply Mismatch**: When mismatch exceeds threshold
   - Alert type: `supply_mismatch`
   - Threshold: Configurable (default: 0.1%)
   - Metrics: mismatch_percentage, stellar_supply, ethereum_reserves

**Alert Integration**:
- Uses existing `AlertService`
- Supports webhooks, circuit breaker triggers
- Respects cooldown periods

### 8. Result Persistence

**Database Table**: `verification_results`

**Stored Fields**:
- `verified_at`: Timestamp
- `bridge_id`: Asset/bridge identifier
- `sequence`: Monotonic sequence (timestamp-based)
- `leaf_hash`: Verification hash
- `is_valid`: Boolean success flag
- `metadata`: JSON with full details
  - assetCode
  - stellarSupply
  - ethereumReserves
  - mismatchPercentage
  - errorStatus
- `job_id`: BullMQ job reference

**Persistence Behavior**:
- Results saved on success AND failure
- Failures logged with error message
- Database errors don't fail the job (graceful degradation)

### 9. Resource Handling

**Concurrency Control**:
- Limited to 3 concurrent jobs
- Prevents API overload
- Configurable via `DEFAULT_CONCURRENCY`

**Graceful Shutdown**:
```typescript
await getSupplyVerificationQueue().stop();
```
- Stops accepting new jobs
- Waits for active jobs to complete
- Closes Redis connections

**Circuit Breaker Integration**:
- Alerts can trigger circuit breaker
- Prevents cascading failures
- Configurable severity levels

## API Usage

### Initialize Job System

```typescript
import { initSupplyVerificationJob } from './jobs/supplyVerification.job.js';

// Called during application startup
await initSupplyVerificationJob();
```

### Add Single Verification Job

```typescript
import { getSupplyVerificationQueue } from './jobs/supplyVerification.job.js';

const queue = getSupplyVerificationQueue();

// Normal priority
await queue.addVerificationJob('USDC', 'normal');

// High priority (manual run)
await queue.addVerificationJob('USDC', 'high');
```

### Add Batch Verification

```typescript
// Queue verification for all supported assets
await queue.addBatchVerificationJobs();
```

### Get Queue Statistics

```typescript
const stats = await queue.getQueueStats();
// Returns: { waiting, active, completed, failed, delayed }

const failedJobs = await queue.getFailedJobs(100);
// Returns array of failed jobs for debugging
```

## File Structure

```
backend/src/
├── jobs/
│   └── supplyVerification.job.ts    # Main job implementation
├── workers/
│   └── index.ts                      # Job system registration
└── index.ts                          # Graceful shutdown integration

backend/tests/
└── jobs/
    └── supplyVerification.job.test.ts  # Comprehensive tests
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | localhost | Redis server host |
| `REDIS_PORT` | 6379 | Redis server port |
| `REDIS_PASSWORD` | (empty) | Redis authentication |
| `RETRY_MAX` | 3 | Maximum retry attempts |

### Supported Assets

Automatically verifies all non-native assets from `SUPPORTED_ASSETS`:
- USDC
- EURC
- PYUSD
- FOBXX

Skips: XLM, native (no cross-chain supply)

## Testing

Run the test suite:

```bash
npm run test:unit -- tests/jobs/supplyVerification.job.test.ts
```

**Test Coverage**:
- ✅ Singleton pattern
- ✅ Queue initialization
- ✅ Job addition (single/batch)
- ✅ Scheduling
- ✅ Job processing (success/failure)
- ✅ Retry logic
- ✅ Alert triggering
- ✅ Result persistence
- ✅ Metrics collection
- ✅ Graceful shutdown

## Monitoring & Observability

### Prometheus Metrics

```promql
# Job success rate
rate(queue_jobs_completed_total{queue_name="supply-verification"}[5m])

# Job failure rate
rate(queue_jobs_failed_total{queue_name="supply-verification"}[5m])

# Average job duration
histogram_quantile(0.95, queue_job_duration_seconds_bucket{queue_name="supply-verification"})

# Current queue depth
queue_jobs_waiting{queue_name="supply-verification"}
```

### Logging Examples

**Successful Verification**:
```json
{
  "level": "info",
  "jobId": "abc123",
  "assetCode": "USDC",
  "duration": "1.2s",
  "msg": "Supply verification job completed"
}
```

**Supply Mismatch**:
```json
{
  "level": "warn",
  "assetCode": "USDC",
  "mismatch": 5.0,
  "msg": "Triggering supply mismatch alert"
}
```

**Job Failure**:
```json
{
  "level": "error",
  "jobId": "def456",
  "assetCode": "EURC",
  "error": "API timeout",
  "attempts": 3,
  "msg": "Supply verification job failed"
}
```

## Troubleshooting

### Jobs Stuck in "waiting" State

**Cause**: Redis connection issue or worker not running

**Solution**:
1. Check Redis connectivity: `redis-cli ping`
2. Verify worker initialization in logs
3. Restart application

### High Failure Rate

**Cause**: External API issues or rate limiting

**Solution**:
1. Check failed jobs: `queue.getFailedJobs()`
2. Review error messages in logs
3. Consider reducing concurrency
4. Verify API credentials/timeouts

### Database Persistence Failures

**Cause**: Database connection issues

**Solution**:
1. Check database connectivity
2. Verify `bridge_operators` table has entries
3. Jobs continue even if persistence fails (by design)

## Future Enhancements

- [ ] Configurable schedule via environment variables
- [ ] Per-asset concurrency limits
- [ ] Priority queue for critical assets
- [ ] Historical trend analysis
- [ ] Automated supply anomaly detection
- [ ] Multi-chain expansion (Polygon, Base, etc.)

## Related Documentation

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Bridge Verification Job](./src/workers/bridgeVerification.job.ts)
- [Alert Service](./src/services/alert.service.ts)
- [Metrics Service](./src/services/metrics.service.ts)
