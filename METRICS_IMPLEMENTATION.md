# Metrics Collection System Implementation

## Overview

This document describes the implementation of the comprehensive metrics collection system for Stellar Bridge Watch, providing Prometheus-compatible metrics for monitoring, alerting, and performance analysis.

## Implementation Summary

### Components Implemented

1. **Metrics Service** (`backend/src/services/metrics.service.ts`)
   - Singleton service managing all application metrics
   - Prometheus client library integration
   - Counter, Gauge, and Histogram metric types
   - Automatic Node.js default metrics collection

2. **Metrics Middleware** (`backend/src/api/middleware/metrics.ts`)
   - Automatic HTTP request/response metrics collection
   - Active connection tracking
   - Request/response size tracking
   - Latency measurement

3. **Metrics Routes** (`backend/src/api/routes/metrics.ts`)
   - `/metrics` - Prometheus text format endpoint
   - `/metrics/json` - JSON format for debugging
   - `/metrics/health` - Health check endpoint
   - `/metrics/reset` - Admin-only reset endpoint

4. **Grafana Dashboards**
   - `application-overview.json` - Comprehensive application metrics
   - `bridge-monitoring.json` - Bridge-specific monitoring

5. **Prometheus Configuration**
   - `prometheus.yml` - Scrape configuration
   - `prometheus-alerts.yml` - Alert rules
   - `alertmanager.yml` - Alert routing configuration

6. **Docker Compose Setup**
   - `docker-compose.monitoring.yml` - Complete monitoring stack

7. **Documentation**
   - `backend/docs/metrics-collection.md` - Detailed technical documentation
   - `backend/grafana/README.md` - Grafana setup guide

### Metrics Categories

#### HTTP Metrics

- `http_requests_total` - Total requests by method, route, status
- `http_request_duration_seconds` - Request latency histogram
- `http_request_size_bytes` - Request size histogram
- `http_response_size_bytes` - Response size histogram
- `http_active_connections` - Active connection gauge

#### Database Metrics

- `db_query_duration_seconds` - Query execution time
- `db_connections_active` - Active connections
- `db_connections_idle` - Idle connections
- `db_queries_total` - Total queries
- `db_query_errors_total` - Query errors

#### Queue Metrics

- `queue_jobs_active` - Active jobs
- `queue_jobs_waiting` - Waiting jobs
- `queue_jobs_completed_total` - Completed jobs
- `queue_jobs_failed_total` - Failed jobs
- `queue_job_duration_seconds` - Job duration

#### Business Metrics

- `bridge_verifications_total` - Total verifications
- `bridge_verification_success_total` - Successful verifications
- `bridge_verification_failure_total` - Failed verifications
- `bridge_health_score` - Health score (0-100)
- `asset_price_usd` - Asset prices
- `liquidity_tvl_usd` - Total Value Locked
- `alerts_triggered_total` - Alerts triggered
- `circuit_breaker_trips_total` - Circuit breaker trips

#### Cache Metrics

- `cache_hits_total` - Cache hits
- `cache_misses_total` - Cache misses
- `cache_size_bytes` - Cache size
- `cache_evictions_total` - Cache evictions

#### API Key Metrics

- `api_key_requests_total` - Requests per API key
- `api_key_rate_limit_hits_total` - Rate limit hits

#### WebSocket Metrics

- `websocket_connections_active` - Active connections
- `websocket_messages_total` - Messages sent/received

### Integration Points

The metrics system has been integrated into:

1. **Bridge Verification Worker** (`backend/src/workers/bridgeVerification.job.ts`)
   - Records verification attempts, successes, and failures
   - Tracks verification reasons

2. **Alert Service** (`backend/src/services/alert.service.ts`)
   - Records alert triggers by type and priority
   - Tracks alert distribution

3. **Circuit Breaker Service** (`backend/src/services/circuitBreaker.service.ts`)
   - Records circuit breaker trips
   - Tracks trip reasons

4. **HTTP Middleware** (automatic)
   - All API endpoints automatically tracked
   - Request/response metrics collected

## Setup Instructions

### 1. Install Dependencies

The `prom-client` package has been added to `package.json`:

```bash
cd backend
npm install
```

### 2. Start the Application

The metrics endpoint is automatically available when the application starts:

```bash
npm run dev
```

Access metrics at: `http://localhost:3001/metrics`

### 3. Start Monitoring Stack (Optional)

To run Prometheus and Grafana:

```bash
cd backend
docker-compose -f docker-compose.monitoring.yml up -d
```

Access:

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000` (admin/admin)

### 4. Configure Prometheus

Update `backend/prometheus.yml` with your application's host/port if different from defaults.

### 5. Import Grafana Dashboards

Dashboards are automatically provisioned if using the Docker Compose setup. Otherwise:

1. Open Grafana at `http://localhost:3000`
2. Go to Dashboards → Import
3. Upload `backend/grafana/dashboards/application-overview.json`
4. Upload `backend/grafana/dashboards/bridge-monitoring.json`

## Usage Examples

### Recording Custom Metrics

```typescript
import { getMetricsService } from "./services/metrics.service";

const metricsService = getMetricsService();

// Record a bridge verification
metricsService.recordBridgeVerification("bridge-1", "Circle", "USDC", true);

// Update a gauge
metricsService.bridgeHealthScore.set(
  { bridge_id: "bridge-1", bridge_name: "Circle" },
  95,
);

// Increment a counter
metricsService.alertsTriggered.inc({
  alert_type: "supply_mismatch",
  priority: "critical",
  bridge_id: "bridge-1",
});
```

### Querying Metrics (PromQL)

```promql
# Request rate
rate(http_requests_total[5m])

# 95th percentile latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Bridge verification success rate
rate(bridge_verification_success_total[5m]) / rate(bridge_verifications_total[5m]) * 100

# Cache hit rate
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) * 100
```

## Alert Rules

The system includes 20+ pre-configured alert rules covering:

- HTTP error rates and latency
- Database performance and connection pool
- Bridge health and verification failures
- Queue job failures and delays
- Cache performance
- System resources (CPU, memory, event loop)
- Circuit breaker trips
- Service availability

See `backend/prometheus-alerts.yml` for complete list.

## Grafana Dashboards

### Application Overview Dashboard

- HTTP request metrics
- Database performance
- Queue job status
- Cache hit rates
- Memory and CPU usage
- WebSocket connections
- API key usage

### Bridge Monitoring Dashboard

- Bridge verification rates
- Success vs failure rates
- Health scores over time
- Failure reason breakdown
- Circuit breaker status
- Asset price tracking
- TVL monitoring

## Performance Considerations

- Metrics collection adds ~1-2ms overhead per request
- Prometheus stores ~1-2 bytes per sample
- Estimated storage: ~100MB per day for typical workload
- Default retention: 15 days
- Label cardinality is kept low to avoid performance issues

## Testing

### Manual Testing

1. Start the application
2. Access metrics endpoint: `curl http://localhost:3001/metrics`
3. Verify metrics are being collected
4. Make API requests and observe metric changes

### Prometheus Testing

1. Start Prometheus
2. Check targets: `http://localhost:9090/targets`
3. Verify scraping is successful
4. Query metrics in Prometheus UI

### Grafana Testing

1. Open Grafana dashboards
2. Verify data is displayed
3. Test time range selection
4. Verify alerts are configured

## Troubleshooting

### Metrics not appearing

- Check that metrics service is initialized
- Verify middleware is registered in `src/index.ts`
- Check application logs for errors

### Prometheus not scraping

- Verify Prometheus configuration
- Check network connectivity
- Verify metrics endpoint is accessible

### Grafana dashboards empty

- Verify Prometheus datasource is configured
- Check Prometheus is scraping successfully
- Verify metric names in queries match

## Files Created/Modified

### New Files

- `backend/src/services/metrics.service.ts`
- `backend/src/api/middleware/metrics.ts`
- `backend/src/api/routes/metrics.ts`
- `backend/docs/metrics-collection.md`
- `backend/grafana/README.md`
- `backend/grafana/dashboards/application-overview.json`
- `backend/grafana/dashboards/bridge-monitoring.json`
- `backend/grafana/provisioning/datasources/prometheus.yml`
- `backend/grafana/provisioning/dashboards/dashboards.yml`
- `backend/prometheus.yml`
- `backend/prometheus-alerts.yml`
- `backend/alertmanager.yml`
- `backend/docker-compose.monitoring.yml`

### Modified Files

- `backend/package.json` - Added `prom-client` dependency
- `backend/src/index.ts` - Registered metrics middleware
- `backend/src/api/routes/index.ts` - Registered metrics routes
- `backend/src/workers/bridgeVerification.job.ts` - Added metrics recording
- `backend/src/services/alert.service.ts` - Added metrics recording
- `backend/src/services/circuitBreaker.service.ts` - Added metrics recording

## Next Steps

1. **Add more integrations**: Integrate metrics into additional services as needed
2. **Tune alert thresholds**: Adjust alert thresholds based on production data
3. **Add custom dashboards**: Create team-specific or feature-specific dashboards
4. **Configure alerting**: Set up Slack/PagerDuty/email notifications
5. **Add recording rules**: Create Prometheus recording rules for complex queries
6. **Monitor performance**: Track metrics collection overhead and optimize if needed

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client Library](https://github.com/siimon/prom-client)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)

## Closes

Closes #124
