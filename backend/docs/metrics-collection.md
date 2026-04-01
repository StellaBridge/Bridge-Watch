# Metrics Collection System

## Overview

The Stellar Bridge Watch application includes a comprehensive metrics collection system built on Prometheus and Grafana. This system provides real-time monitoring, alerting, and performance analysis capabilities.

## Architecture

```
┌─────────────────┐
│   Application   │
│   (Fastify)     │
└────────┬────────┘
         │ Exposes /metrics
         ▼
┌─────────────────┐
│   Prometheus    │ ◄─── Scrapes metrics every 15s
│   (Time-series  │
│    Database)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Grafana      │ ◄─── Visualizes & alerts
│  (Dashboards)   │
└─────────────────┘
```

## Components

### 1. Metrics Service (`services/metrics.service.ts`)

The core service that defines and manages all application metrics using the `prom-client` library.

**Key Features:**

- Singleton pattern for consistent metric collection
- Automatic Node.js default metrics (CPU, memory, event loop)
- Custom business metrics for bridge monitoring
- Prometheus-compatible exposition format

**Usage Example:**

```typescript
import { getMetricsService } from "./services/metrics.service";

const metricsService = getMetricsService();

// Record HTTP request
metricsService.recordHttpRequest("GET", "/api/v1/bridges", 200, 0.045);

// Record database query
metricsService.recordDbQuery("SELECT", "bridges", 0.012);

// Record bridge verification
metricsService.recordBridgeVerification("bridge-1", "Circle", "USDC", true);

// Update gauge metrics
metricsService.bridgeHealthScore.set(
  { bridge_id: "bridge-1", bridge_name: "Circle" },
  95,
);
```

### 2. Metrics Middleware (`api/middleware/metrics.ts`)

Automatically collects HTTP request/response metrics for all API endpoints.

**Collected Metrics:**

- Request count by method, route, and status code
- Request duration (latency)
- Request and response sizes
- Active connection count

**Integration:**

```typescript
import { registerMetrics } from "./api/middleware/metrics";

await registerMetrics(server);
```

### 3. Metrics Routes (`api/routes/metrics.ts`)

Exposes metrics endpoints for Prometheus scraping and debugging.

**Endpoints:**

- `GET /metrics` - Prometheus text format
- `GET /metrics/json` - JSON format (debugging)
- `GET /metrics/health` - Health check
- `POST /metrics/reset` - Reset metrics (admin only)

## Metric Types

### Counter Metrics

Monotonically increasing values (e.g., total requests, errors).

**Examples:**

- `http_requests_total`
- `bridge_verifications_total`
- `alerts_triggered_total`

### Gauge Metrics

Values that can go up or down (e.g., active connections, health scores).

**Examples:**

- `http_active_connections`
- `bridge_health_score`
- `db_connections_active`

### Histogram Metrics

Distribution of values with configurable buckets (e.g., latencies, sizes).

**Examples:**

- `http_request_duration_seconds`
- `db_query_duration_seconds`
- `queue_job_duration_seconds`

## Metric Categories

### HTTP Metrics

Monitor API performance and usage patterns.

| Metric                          | Type      | Labels                     | Description         |
| ------------------------------- | --------- | -------------------------- | ------------------- |
| `http_requests_total`           | Counter   | method, route, status_code | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | method, route, status_code | Request latency     |
| `http_request_size_bytes`       | Histogram | method, route              | Request body size   |
| `http_response_size_bytes`      | Histogram | method, route              | Response body size  |
| `http_active_connections`       | Gauge     | -                          | Active connections  |

### Database Metrics

Track database performance and connection pool health.

| Metric                      | Type      | Labels                       | Description          |
| --------------------------- | --------- | ---------------------------- | -------------------- |
| `db_query_duration_seconds` | Histogram | operation, table             | Query execution time |
| `db_connections_active`     | Gauge     | -                            | Active connections   |
| `db_connections_idle`       | Gauge     | -                            | Idle connections     |
| `db_queries_total`          | Counter   | operation, table             | Total queries        |
| `db_query_errors_total`     | Counter   | operation, table, error_type | Query errors         |

### Queue Metrics

Monitor background job processing.

| Metric                       | Type      | Labels                           | Description    |
| ---------------------------- | --------- | -------------------------------- | -------------- |
| `queue_jobs_active`          | Gauge     | queue_name, job_type             | Active jobs    |
| `queue_jobs_waiting`         | Gauge     | queue_name, job_type             | Waiting jobs   |
| `queue_jobs_completed_total` | Counter   | queue_name, job_type             | Completed jobs |
| `queue_jobs_failed_total`    | Counter   | queue_name, job_type, error_type | Failed jobs    |
| `queue_job_duration_seconds` | Histogram | queue_name, job_type             | Job duration   |

### Business Metrics

Track domain-specific KPIs.

| Metric                              | Type    | Labels                                | Description              |
| ----------------------------------- | ------- | ------------------------------------- | ------------------------ |
| `bridge_verifications_total`        | Counter | bridge_id, bridge_name, asset         | Total verifications      |
| `bridge_verification_success_total` | Counter | bridge_id, bridge_name, asset         | Successful verifications |
| `bridge_verification_failure_total` | Counter | bridge_id, bridge_name, asset, reason | Failed verifications     |
| `bridge_health_score`               | Gauge   | bridge_id, bridge_name                | Health score (0-100)     |
| `asset_price_usd`                   | Gauge   | symbol, source                        | Asset price              |
| `liquidity_tvl_usd`                 | Gauge   | symbol, dex, chain                    | Total Value Locked       |
| `alerts_triggered_total`            | Counter | alert_type, priority, bridge_id       | Alerts triggered         |
| `circuit_breaker_trips_total`       | Counter | bridge_id, reason                     | Circuit breaker trips    |

### Cache Metrics

Monitor caching effectiveness.

| Metric                  | Type    | Labels             | Description     |
| ----------------------- | ------- | ------------------ | --------------- |
| `cache_hits_total`      | Counter | cache_key          | Cache hits      |
| `cache_misses_total`    | Counter | cache_key          | Cache misses    |
| `cache_size_bytes`      | Gauge   | cache_name         | Cache size      |
| `cache_evictions_total` | Counter | cache_name, reason | Cache evictions |

### API Key Metrics

Track API key usage and rate limiting.

| Metric                          | Type    | Labels           | Description      |
| ------------------------------- | ------- | ---------------- | ---------------- |
| `api_key_requests_total`        | Counter | api_key_id, tier | Requests per key |
| `api_key_rate_limit_hits_total` | Counter | api_key_id, tier | Rate limit hits  |

### WebSocket Metrics

Monitor real-time connections.

| Metric                         | Type    | Labels          | Description            |
| ------------------------------ | ------- | --------------- | ---------------------- |
| `websocket_connections_active` | Gauge   | -               | Active connections     |
| `websocket_messages_total`     | Counter | type, direction | Messages sent/received |

## Integration Examples

### Recording Metrics in Services

```typescript
// In bridge verification service
import { getMetricsService } from "../services/metrics.service";

export class BridgeVerificationService {
  private metrics = getMetricsService();

  async verifyBridge(bridgeId: string, asset: string) {
    const startTime = Date.now();

    try {
      const result = await this.performVerification(bridgeId, asset);

      // Record success
      this.metrics.recordBridgeVerification(
        bridgeId,
        result.bridgeName,
        asset,
        true,
      );

      // Update health score
      this.metrics.bridgeHealthScore.set(
        { bridge_id: bridgeId, bridge_name: result.bridgeName },
        result.healthScore,
      );

      return result;
    } catch (error) {
      // Record failure
      this.metrics.recordBridgeVerification(
        bridgeId,
        "unknown",
        asset,
        false,
        error.message,
      );

      throw error;
    }
  }
}
```

### Recording Database Metrics

```typescript
// Wrap database queries with metrics
import { getMetricsService } from "../services/metrics.service";

export async function queryWithMetrics<T>(
  operation: string,
  table: string,
  queryFn: () => Promise<T>,
): Promise<T> {
  const metrics = getMetricsService();
  const startTime = Date.now();

  try {
    const result = await queryFn();
    const duration = (Date.now() - startTime) / 1000;

    metrics.recordDbQuery(operation, table, duration);

    return result;
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;

    metrics.recordDbQuery(operation, table, duration, {
      type: error.code || "unknown",
    });

    throw error;
  }
}
```

### Recording Queue Job Metrics

```typescript
// In worker/job handler
import { getMetricsService } from "../services/metrics.service";

export async function processJob(job: Job) {
  const metrics = getMetricsService();
  const startTime = Date.now();

  // Update active jobs
  metrics.queueJobsActive.inc({
    queue_name: job.queueName,
    job_type: job.name,
  });

  try {
    await job.process();

    const duration = (Date.now() - startTime) / 1000;
    metrics.recordQueueJob(job.queueName, job.name, duration, true);
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    metrics.recordQueueJob(
      job.queueName,
      job.name,
      duration,
      false,
      error.name,
    );

    throw error;
  } finally {
    metrics.queueJobsActive.dec({
      queue_name: job.queueName,
      job_type: job.name,
    });
  }
}
```

## Querying Metrics

### PromQL Examples

**Request rate by endpoint:**

```promql
rate(http_requests_total[5m])
```

**95th percentile latency:**

```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Error rate:**

```promql
rate(http_requests_total{status_code=~"5.."}[5m])
```

**Bridge verification success rate:**

```promql
rate(bridge_verification_success_total[5m]) /
rate(bridge_verifications_total[5m]) * 100
```

**Cache hit rate:**

```promql
rate(cache_hits_total[5m]) /
(rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) * 100
```

**Database connection pool utilization:**

```promql
db_connections_active / (db_connections_active + db_connections_idle) * 100
```

## Performance Considerations

### Label Cardinality

- Keep the number of unique label combinations low
- Avoid using user IDs or timestamps as labels
- Use aggregation for high-cardinality data

**Bad:**

```typescript
metrics.counter.inc({ user_id: userId }); // High cardinality!
```

**Good:**

```typescript
metrics.counter.inc({ user_tier: "premium" }); // Low cardinality
```

### Metric Collection Overhead

- Metrics collection adds minimal overhead (~1-2ms per request)
- Histograms are more expensive than counters/gauges
- Use appropriate bucket sizes for histograms

### Storage Requirements

- Prometheus stores ~1-2 bytes per sample
- Default retention: 15 days
- Estimate: ~100MB per day for typical workload

## Alerting

See `grafana/README.md` for recommended alert rules and configuration.

## Troubleshooting

### Metrics not updating

1. Check that metrics service is initialized
2. Verify middleware is registered
3. Check for errors in application logs

### High memory usage

1. Review label cardinality
2. Check histogram bucket configuration
3. Reduce Prometheus retention period

### Missing metrics in Grafana

1. Verify Prometheus is scraping the endpoint
2. Check Prometheus targets page
3. Verify metric names in queries

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [prom-client Library](https://github.com/siimon/prom-client)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Grafana Dashboards](../grafana/README.md)
