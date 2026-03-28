# Health Check Endpoints Documentation

This document describes the comprehensive health check endpoints implemented for Stellar Bridge Watch, designed for monitoring, alerting, and Kubernetes orchestration.

## Overview

The health check system provides multiple levels of monitoring:

1. **Simple Health Check** - Basic application status
2. **Liveness Probe** - Kubernetes-compatible liveness check
3. **Readiness Probe** - Kubernetes-compatible readiness check
4. **Detailed Health Check** - Comprehensive system health
5. **Component Checks** - Individual component health status
6. **Metrics Endpoint** - Prometheus-compatible metrics

## Base URL

All health endpoints are prefixed with `/health`:

```
http://localhost:3001/health
```

## Endpoints

### 1. Simple Health Check

**GET `/health/`**

A simple health check for basic monitoring and backward compatibility.

#### Response

```json
{
  "status": "ok",
  "timestamp": "2026-03-28T20:55:00.000Z",
  "uptime": 3600.123,
  "version": "0.1.0"
}
```

#### Status Codes

- `200 OK` - Application is running

---

### 2. Liveness Probe (Kubernetes)

**GET `/health/live`**

Kubernetes-compatible liveness probe. Checks if the application process is running and responsive.

#### Response

```json
{
  "status": "ok",
  "timestamp": "2026-03-28T20:55:00.000Z"
}
```

#### Status Codes

- `200 OK` - Process is alive
- `503 Service Unavailable` - Process is not responding

#### Kubernetes Configuration

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

---

### 3. Readiness Probe (Kubernetes)

**GET `/health/ready`**

Kubernetes-compatible readiness probe. Checks if essential dependencies (database, Redis) are ready to serve traffic.

#### Response

```json
{
  "status": "ready",
  "timestamp": "2026-03-28T20:55:00.000Z",
  "checks": {
    "database": true,
    "redis": true
  }
}
```

#### Status Codes

- `200 OK` - Ready to serve traffic
- `503 Service Unavailable` - Not ready

#### Kubernetes Configuration

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

---

### 4. Detailed Health Check

**GET `/health/detailed`**

Comprehensive system health check for monitoring dashboards and detailed diagnostics.

#### Response

```json
{
  "status": "healthy",
  "timestamp": "2026-03-28T20:55:00.000Z",
  "uptime": 3600.123,
  "version": "0.1.0",
  "checks": {
    "database": {
      "status": "healthy",
      "timestamp": "2026-03-28T20:55:00.000Z",
      "duration": 45,
      "details": {
        "tableCount": 12,
        "connection": "postgresql"
      }
    },
    "redis": {
      "status": "healthy",
      "timestamp": "2026-03-28T20:55:00.000Z",
      "duration": 12,
      "details": {
        "usedMemory": 1048576,
        "connection": "redis"
      }
    },
    "externalApis": {
      "status": "healthy",
      "timestamp": "2026-03-28T20:55:00.000Z",
      "duration": 1234,
      "details": {
        "apis": [
          {
            "name": "Stellar Horizon",
            "status": "healthy",
            "statusCode": 200,
            "responseTime": 234
          },
          {
            "name": "Soroban RPC",
            "status": "healthy",
            "statusCode": 200,
            "responseTime": 456
          }
        ],
        "healthyCount": 2,
        "totalCount": 2
      }
    },
    "system": {
      "status": "healthy",
      "timestamp": "2026-03-28T20:55:00.000Z",
      "duration": 5,
      "details": {
        "memory": {
          "rss": 50331648,
          "heapUsed": 20971520,
          "heapTotal": 41943040,
          "external": 1048576,
          "systemUsagePercent": 65.5
        },
        "disk": {
          "path": "/app",
          "status": "accessible"
        },
        "thresholds": {
          "memoryWarning": 90
        }
      }
    }
  },
  "summary": {
    "total": 4,
    "healthy": 4,
    "unhealthy": 0,
    "degraded": 0
  }
}
```

#### Status Codes

- `200 OK` - All systems healthy or degraded
- `503 Service Unavailable` - One or more systems unhealthy

#### Status Values

- `healthy` - Component is functioning normally
- `degraded` - Component is functioning but with issues
- `unhealthy` - Component is not functioning

---

### 5. Component Health Checks

**GET `/health/components/{component}`**

Get health status for individual components.

#### Available Components

- `database` - PostgreSQL database connectivity
- `redis` - Redis cache connectivity
- `external-apis` - External API connectivity (Stellar Horizon, Soroban RPC)
- `system` - System resources (memory, disk)

#### Example Response

```json
{
  "status": "healthy",
  "timestamp": "2026-03-28T20:55:00.000Z",
  "duration": 45,
  "details": {
    "tableCount": 12,
    "connection": "postgresql"
  }
}
```

#### Status Codes

- `200 OK` - Component healthy or degraded
- `503 Service Unavailable` - Component unhealthy
- `404 Not Found` - Invalid component name

---

### 6. Metrics Endpoint

**GET `/health/metrics`**

Prometheus-compatible metrics endpoint for monitoring systems.

#### Response Format

```
# HELP bridge_watch_health_status Health check status (1=healthy, 0.5=degraded, 0=unhealthy)
# TYPE bridge_watch_health_status gauge
bridge_watch_health_status{component="database"} 1
bridge_watch_health_status{component="redis"} 1
bridge_watch_health_status{component="external_apis"} 1
bridge_watch_health_status{component="system"} 1
bridge_watch_health_status{component="overall"} 1

# HELP bridge_watch_uptime_seconds Application uptime in seconds
# TYPE bridge_watch_uptime_seconds counter
bridge_watch_uptime_seconds 3600.123

# HELP bridge_watch_health_check_duration_seconds Health check duration in seconds
# TYPE bridge_watch_health_check_duration_seconds gauge
bridge_watch_health_check_duration_seconds{component="database"} 0.045
bridge_watch_health_check_duration_seconds{component="redis"} 0.012
bridge_watch_health_check_duration_seconds{component="external_apis"} 1.234
bridge_watch_health_check_duration_seconds{component="system"} 0.005
```

#### Status Codes

- `200 OK` - Metrics generated successfully
- `503 Service Unavailable` - Health check failed

---

## Configuration

Health check behavior can be configured via environment variables:

```bash
# Health Check Configuration
HEALTH_CHECK_TIMEOUT_MS=5000              # Timeout for health check operations
HEALTH_CHECK_INTERVAL_MS=30000             # Interval for periodic health checks
HEALTH_CHECK_MEMORY_THRESHOLD=90          # Memory usage warning threshold (%)
HEALTH_CHECK_DISK_THRESHOLD=80            # Disk usage warning threshold (%)
HEALTH_CHECK_EXTERNAL_APIS=true            # Enable external API checks
```

## Monitoring Integration

### Prometheus

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'bridge-watch'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/health/metrics'
    scrape_interval: 30s
```

### Grafana Dashboard

Key metrics to monitor:

- `bridge_watch_health_status` - Overall system health
- `bridge_watch_uptime_seconds` - Application uptime
- `bridge_watch_health_check_duration_seconds` - Health check performance

### Alerting Rules

Example Prometheus alerting rules:

```yaml
groups:
  - name: bridge-watch
    rules:
      - alert: BridgeWatchUnhealthy
        expr: bridge_watch_health_status{component="overall"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Stellar Bridge Watch is unhealthy"
          
      - alert: BridgeWatchDegraded
        expr: bridge_watch_health_status{component="overall"} == 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Stellar Bridge Watch is degraded"
          
      - alert: DatabaseDown
        expr: bridge_watch_health_status{component="database"} == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Database connection failed"
          
      - alert: RedisDown
        expr: bridge_watch_health_status{component="redis"} == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Redis connection failed"
```

## Kubernetes Deployment

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bridge-watch
spec:
  replicas: 3
  selector:
    matchLabels:
      app: bridge-watch
  template:
    metadata:
      labels:
        app: bridge-watch
    spec:
      containers:
      - name: bridge-watch
        image: bridge-watch:latest
        ports:
        - containerPort: 3001
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        env:
        - name: HEALTH_CHECK_TIMEOUT_MS
          value: "5000"
        - name: HEALTH_CHECK_MEMORY_THRESHOLD
          value: "85"
```

### Service Monitor (for Prometheus Operator)

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: bridge-watch
spec:
  selector:
    matchLabels:
      app: bridge-watch
  endpoints:
  - port: http
    path: /health/metrics
    interval: 30s
```

## Troubleshooting

### Common Issues

1. **Readiness Probe Failing**
   - Check database and Redis connectivity
   - Verify environment variables
   - Review service logs

2. **External API Checks Failing**
   - Check network connectivity
   - Verify API URLs are accessible
   - Consider disabling with `HEALTH_CHECK_EXTERNAL_APIS=false`

3. **High Memory Usage**
   - Monitor `bridge_watch_health_check_duration_seconds`
   - Check for memory leaks
   - Adjust `HEALTH_CHECK_MEMORY_THRESHOLD`

### Debug Commands

```bash
# Check simple health
curl http://localhost:3001/health/

# Check readiness
curl http://localhost:3001/health/ready

# Check detailed health
curl http://localhost:3001/health/detailed | jq

# Check specific component
curl http://localhost:3001/health/components/database

# Get metrics
curl http://localhost:3001/health/metrics
```

## Security Considerations

- Health endpoints return sensitive system information
- Consider restricting access in production environments
- Use network policies to limit who can access health endpoints
- Don't expose detailed health endpoints publicly

## Performance Impact

- Health checks are designed to be lightweight
- Database and Redis checks use simple queries
- External API checks have 5-second timeouts
- System resource checks are minimal
- Metrics endpoint is efficient for scraping

## Future Enhancements

Potential improvements for future versions:

1. **Custom Health Checks** - Allow application-specific health checks
2. **Historical Health Data** - Track health trends over time
3. **Health Check Dependencies** - Configure component dependencies
4. **Circuit Breaker Integration** - Automatically fail unhealthy components
5. **Health Check Scheduling** - Configurable check intervals per component
6. **Advanced Metrics** - More detailed performance metrics
