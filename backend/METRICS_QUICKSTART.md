# Metrics Collection - Quick Start Guide

## Overview

This guide will help you quickly set up and start using the metrics collection system.

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose (for monitoring stack)
- Application running on port 3001 (default)

## Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
cd backend
npm install
```

The `prom-client` package is already included in `package.json`.

### 2. Start the Application

```bash
npm run dev
```

The metrics endpoint is automatically available at: `http://localhost:3001/metrics`

### 3. Verify Metrics Collection

```bash
curl http://localhost:3001/metrics
```

You should see Prometheus-formatted metrics output.

### 4. View Metrics in JSON (Optional)

For easier reading during development:

```bash
curl http://localhost:3001/metrics/json | jq
```

## Start Monitoring Stack (Optional)

To visualize metrics with Prometheus and Grafana:

### 1. Start Monitoring Services

```bash
cd backend
docker-compose -f docker-compose.monitoring.yml up -d
```

This starts:

- Prometheus on port 9090
- Grafana on port 3000
- Node Exporter on port 9100
- Alertmanager on port 9093

### 2. Access Grafana

1. Open http://localhost:3000
2. Login with: `admin` / `admin`
3. Dashboards are automatically provisioned

### 3. Access Prometheus

Open http://localhost:9090 to:

- View metrics
- Test PromQL queries
- Check scrape targets

## Available Endpoints

- `GET /metrics` - Prometheus text format
- `GET /metrics/json` - JSON format (debugging)
- `GET /metrics/health` - Health check
- `POST /metrics/reset` - Reset metrics (requires admin API key)

## Example Queries

### In Prometheus UI

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

## Grafana Dashboards

Two dashboards are automatically provisioned:

1. **Application Overview**
   - HTTP metrics
   - Database performance
   - Queue jobs
   - Cache performance
   - System resources

2. **Bridge Monitoring**
   - Bridge verifications
   - Health scores
   - Circuit breaker status
   - Asset prices
   - TVL tracking

## Recording Custom Metrics

Add to your service:

```typescript
import { getMetricsService } from "./services/metrics.service";

const metricsService = getMetricsService();

// Increment a counter
metricsService.bridgeVerificationsTotal.inc({
  bridge_id: "bridge-1",
  bridge_name: "Circle",
  asset: "USDC",
});

// Set a gauge
metricsService.bridgeHealthScore.set(
  { bridge_id: "bridge-1", bridge_name: "Circle" },
  95,
);

// Record a histogram
metricsService.dbQueryDuration.observe(
  { operation: "SELECT", table: "bridges" },
  0.045,
);
```

## Stopping the Monitoring Stack

```bash
docker-compose -f docker-compose.monitoring.yml down
```

To also remove volumes:

```bash
docker-compose -f docker-compose.monitoring.yml down -v
```

## Troubleshooting

### Metrics endpoint returns 404

- Ensure the application is running
- Check that metrics routes are registered in `src/api/routes/index.ts`

### Prometheus not scraping

- Check Prometheus targets: http://localhost:9090/targets
- Verify application is accessible from Prometheus container
- Check `prometheus.yml` configuration

### Grafana dashboards empty

- Verify Prometheus datasource is configured
- Check Prometheus is successfully scraping
- Wait 15-30 seconds for initial data

### High memory usage

- Check label cardinality (too many unique label combinations)
- Review histogram bucket configuration
- Reduce Prometheus retention period

## Next Steps

1. Review available metrics in `docs/metrics-collection.md`
2. Customize alert rules in `prometheus-alerts.yml`
3. Configure alert notifications in `alertmanager.yml`
4. Create custom Grafana dashboards
5. Integrate metrics into additional services

## Resources

- Full documentation: `docs/metrics-collection.md`
- Grafana setup: `grafana/README.md`
- Implementation details: `METRICS_IMPLEMENTATION.md`
- Prometheus docs: https://prometheus.io/docs/
- Grafana docs: https://grafana.com/docs/
