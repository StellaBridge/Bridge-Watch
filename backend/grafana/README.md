# Grafana Dashboards for Stellar Bridge Watch

This directory contains Grafana dashboard templates and provisioning configurations for monitoring the Stellar Bridge Watch application.

## Overview

The monitoring stack includes:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and alerting
- **Application Metrics**: Exposed via `/metrics` endpoint

## Dashboards

### 1. Application Overview (`application-overview.json`)

Comprehensive dashboard showing:

- HTTP request rates and latencies
- Database query performance
- Queue job status and processing
- Cache hit rates
- Memory and CPU usage
- WebSocket connections
- API key usage and rate limiting

### 2. Bridge Monitoring (`bridge-monitoring.json`)

Bridge-specific metrics:

- Bridge verification rates and success rates
- Bridge health scores over time
- Verification failure reasons
- Circuit breaker status
- Asset price tracking
- Total Value Locked (TVL) across DEXes

## Setup

### Prerequisites

- Docker and Docker Compose
- Prometheus server
- Grafana server

### Quick Start with Docker Compose

1. Add Prometheus and Grafana to your `docker-compose.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.console.libraries=/usr/share/prometheus/console_libraries"
      - "--web.console.templates=/usr/share/prometheus/consoles"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    depends_on:
      - prometheus

volumes:
  prometheus-data:
  grafana-data:
```

2. Create `prometheus.yml` configuration:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "stellar-bridge-watch"
    static_configs:
      - targets: ["backend:3001"]
    metrics_path: "/metrics"
```

3. Start the monitoring stack:

```bash
docker-compose up -d prometheus grafana
```

4. Access Grafana at `http://localhost:3000` (default credentials: admin/admin)

## Metrics Endpoint

The application exposes metrics at:

- **Prometheus format**: `GET /metrics`
- **JSON format**: `GET /metrics/json` (for debugging)
- **Health check**: `GET /metrics/health`

## Available Metrics

### HTTP Metrics

- `http_requests_total` - Total HTTP requests (counter)
- `http_request_duration_seconds` - Request duration histogram
- `http_request_size_bytes` - Request size histogram
- `http_response_size_bytes` - Response size histogram
- `http_active_connections` - Active HTTP connections (gauge)

### Database Metrics

- `db_query_duration_seconds` - Query duration histogram
- `db_connections_active` - Active database connections (gauge)
- `db_connections_idle` - Idle database connections (gauge)
- `db_queries_total` - Total database queries (counter)
- `db_query_errors_total` - Database query errors (counter)

### Queue Metrics

- `queue_jobs_active` - Active queue jobs (gauge)
- `queue_jobs_waiting` - Waiting queue jobs (gauge)
- `queue_jobs_completed_total` - Completed jobs (counter)
- `queue_jobs_failed_total` - Failed jobs (counter)
- `queue_job_duration_seconds` - Job processing duration histogram

### Business Metrics

- `bridge_verifications_total` - Total bridge verifications (counter)
- `bridge_verification_success_total` - Successful verifications (counter)
- `bridge_verification_failure_total` - Failed verifications (counter)
- `bridge_health_score` - Bridge health score 0-100 (gauge)
- `asset_price_usd` - Asset prices in USD (gauge)
- `liquidity_tvl_usd` - Total Value Locked (gauge)
- `alerts_triggered_total` - Alerts triggered (counter)
- `circuit_breaker_trips_total` - Circuit breaker trips (counter)

### Cache Metrics

- `cache_hits_total` - Cache hits (counter)
- `cache_misses_total` - Cache misses (counter)
- `cache_size_bytes` - Cache size (gauge)
- `cache_evictions_total` - Cache evictions (counter)

### API Key Metrics

- `api_key_requests_total` - API key requests (counter)
- `api_key_rate_limit_hits_total` - Rate limit hits (counter)

### WebSocket Metrics

- `websocket_connections_active` - Active WebSocket connections (gauge)
- `websocket_messages_total` - WebSocket messages (counter)

### Node.js Metrics (Default)

- `process_cpu_seconds_total` - CPU usage
- `process_resident_memory_bytes` - Memory usage
- `nodejs_heap_size_used_bytes` - Heap usage
- `nodejs_eventloop_lag_seconds` - Event loop lag
- And many more...

## Alerting

### Recommended Alerts

1. **High Error Rate**

```yaml
- alert: HighHTTPErrorRate
  expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
  for: 5m
  annotations:
    summary: "High HTTP error rate detected"
```

2. **Low Bridge Health**

```yaml
- alert: LowBridgeHealth
  expr: bridge_health_score < 80
  for: 10m
  annotations:
    summary: "Bridge {{ $labels.bridge_name }} health score below 80"
```

3. **High Database Latency**

```yaml
- alert: HighDatabaseLatency
  expr: histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m])) > 1
  for: 5m
  annotations:
    summary: "Database queries are slow (p95 > 1s)"
```

4. **Queue Job Failures**

```yaml
- alert: HighQueueJobFailureRate
  expr: rate(queue_jobs_failed_total[5m]) / rate(queue_jobs_completed_total[5m]) > 0.1
  for: 5m
  annotations:
    summary: "High queue job failure rate (>10%)"
```

## Customization

### Adding Custom Metrics

1. Import the metrics service:

```typescript
import { getMetricsService } from "./services/metrics.service";
```

2. Record custom metrics:

```typescript
const metricsService = getMetricsService();
metricsService.bridgeHealthScore.set(
  { bridge_id: "bridge-1", bridge_name: "Circle" },
  95,
);
```

### Creating Custom Dashboards

1. Create a new JSON file in `grafana/dashboards/`
2. Use the existing dashboards as templates
3. Restart Grafana or wait for auto-reload

## Troubleshooting

### Metrics not appearing in Prometheus

- Check that the `/metrics` endpoint is accessible
- Verify Prometheus scrape configuration
- Check Prometheus targets page: `http://localhost:9090/targets`

### Dashboards not loading in Grafana

- Verify provisioning configuration in `grafana/provisioning/`
- Check Grafana logs: `docker-compose logs grafana`
- Ensure dashboard JSON files are valid

### High cardinality warnings

- Review metric labels to avoid high cardinality
- Consider aggregating labels or using recording rules
- Monitor Prometheus memory usage

## Best Practices

1. **Label Cardinality**: Keep label cardinality low to avoid performance issues
2. **Metric Naming**: Follow Prometheus naming conventions (e.g., `_total` for counters)
3. **Scrape Interval**: Balance between data granularity and storage requirements
4. **Retention**: Configure appropriate retention periods for your use case
5. **Alerting**: Set up alerts for critical metrics with appropriate thresholds

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [prom-client Library](https://github.com/siimon/prom-client)
