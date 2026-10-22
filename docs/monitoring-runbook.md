# Monitoring and Alerting Runbook

## Overview

This runbook provides operational guidance for using the monitoring stack, including Prometheus, Grafana, and Alertmanager.

## Table of Contents

- [Prometheus Metrics](#prometheus-metrics)
- [Alert Severity Levels](#alert-severity-levels)
- [Grafana Dashboards](#grafana-dashboards)
- [Silencing Alerts](#silencing-alerts)
- [Adding Custom Metrics](#adding-custom-metrics)

## Prometheus Metrics

### Naming Conventions

All metrics follow the Prometheus naming best practices:

- **Format**: `<namespace>_<subsystem>_<name>_<unit>`
- **Namespace**: `bridge_watch`
- **Units**: Use base units (seconds, bytes, etc.)

#### Example Metrics

```
bridge_watch_http_requests_total
bridge_watch_http_request_duration_seconds
bridge_watch_bridge_health_score
bridge_watch_asset_price_deviation_ratio
bridge_watch_transaction_processing_duration_seconds
```

### Metric Types

- **Counter**: Monotonically increasing value (e.g., total requests)
- **Gauge**: Value that can go up or down (e.g., current connections)
- **Histogram**: Observations bucketed by value (e.g., request duration)
- **Summary**: Similar to histogram with quantiles

## Alert Severity Levels

### Severity Classifications

| Level | Description | Response SLA | Example |
|-------|-------------|--------------|---------|
| **Critical** | Service down or data loss imminent | Immediate (< 5 min) | Database unavailable, API completely down |
| **High** | Severe degradation affecting users | 15 minutes | High error rate, significant latency increase |
| **Medium** | Performance issues or partial degradation | 1 hour | Moderate latency, single bridge health degradation |
| **Low** | Minor issues or warnings | 4 hours | Approaching threshold, disk space warnings |
| **Info** | Informational alerts | Best effort | Successful deployments, scheduled maintenance |

### Response Guidelines

#### Critical Alerts
1. Acknowledge immediately
2. Check service status dashboards
3. Review recent deployments or changes
4. Escalate to on-call engineer if not resolved in 10 minutes
5. Open incident ticket

#### High Alerts
1. Acknowledge within 15 minutes
2. Investigate root cause
3. Apply mitigation if available
4. Monitor for resolution
5. Document findings

#### Medium/Low Alerts
1. Review during business hours
2. Plan remediation
3. Update runbooks if needed

## Grafana Dashboards

### Available Dashboards

#### 1. System Overview Dashboard
- **URL**: `/d/system-overview`
- **Purpose**: High-level system health and performance metrics
- **Key Panels**:
  - Request rate and error rate
  - Response time percentiles
  - Active connections
  - CPU and memory usage

#### 2. Bridge Health Dashboard
- **URL**: `/d/bridge-health`
- **Purpose**: Monitor bridge status and health scores
- **Key Panels**:
  - Bridge health score timeline
  - Transaction volume by bridge
  - Bridge status distribution
  - Alert frequency by bridge

#### 3. Asset Monitoring Dashboard
- **URL**: `/d/asset-monitoring`
- **Purpose**: Track asset metrics and price deviations
- **Key Panels**:
  - Price deviation alerts
  - Asset health scores
  - Liquidity metrics
  - Volume trends

#### 4. Database Performance Dashboard
- **URL**: `/d/database-performance`
- **Purpose**: Database connection pool and query performance
- **Key Panels**:
  - Connection pool utilization
  - Query execution time
  - Slow query log
  - Transaction throughput

#### 5. Alert Overview Dashboard
- **URL**: `/d/alert-overview`
- **Purpose**: Central view of all active alerts
- **Key Panels**:
  - Active alerts by severity
  - Alert frequency trends
  - Mean time to resolution
  - Silenced alerts

### Navigation Tips

- Use the time picker in the top-right to adjust the time range
- Click on any graph to zoom in on a specific time period
- Use dashboard variables (dropdowns at the top) to filter by environment, bridge, or asset
- Hover over panels to see detailed tooltips
- Click the share icon to create a snapshot or embed a panel

### Dashboard Screenshots

#### System Overview
![System Overview Dashboard](../screenshots/grafana-system-overview.png)

#### Bridge Health
![Bridge Health Dashboard](../screenshots/grafana-bridge-health.png)

## Silencing Alerts

### When to Silence Alerts

- Planned maintenance windows
- Known issues being actively worked on
- Non-actionable alerts pending configuration updates
- Testing or development activities

### How to Silence Alerts

#### Via Alertmanager UI

1. Navigate to Alertmanager UI (typically `http://alertmanager:9093`)
2. Find the alert you want to silence
3. Click "Silence" button
4. Fill in the silence form:
   - **Duration**: How long to silence (e.g., 2h, 1d)
   - **Creator**: Your name or email
   - **Comment**: Reason for silencing (required)
5. Click "Create"

#### Via Grafana

1. Open the alert in Grafana
2. Click "Silence" in the alert details
3. Specify duration and reason
4. Confirm

#### Via CLI (amtool)

```bash
# Silence an alert by label matcher
amtool silence add alertname="HighLatency" --duration=2h --comment="Investigating" --author="ops@example.com"

# View active silences
amtool silence query

# Expire a silence
amtool silence expire <silence-id>
```

### Best Practices

- Always add a meaningful comment explaining why the alert is silenced
- Use the shortest reasonable duration
- Document silences in incident tickets
- Review active silences regularly

## Adding Custom Metrics

### Step 1: Define the Metric

Decide on the metric type and naming:

```javascript
// Example: Counter for custom events
const customEventCounter = new Counter({
  name: 'bridge_watch_custom_events_total',
  help: 'Total number of custom events processed',
  labelNames: ['event_type', 'status']
});
```

### Step 2: Instrument Your Code

```javascript
// Increment the counter
customEventCounter.inc({ event_type: 'bridge_sync', status: 'success' });
```

### Step 3: Expose the Metric

Ensure your metrics endpoint includes the new metric:

```javascript
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Step 4: Configure Prometheus

Add a scrape configuration if needed:

```yaml
scrape_configs:
  - job_name: 'bridge-watch'
    static_configs:
      - targets: ['localhost:3000']
    scrape_interval: 15s
```

### Step 5: Create Grafana Visualization

1. Create or open a dashboard
2. Add a new panel
3. Write a PromQL query:
   ```promql
   rate(bridge_watch_custom_events_total[5m])
   ```
4. Configure visualization type and options
5. Save the panel

### Step 6: Add Alerting Rules (Optional)

Create an alert rule in Prometheus or Grafana:

```yaml
groups:
  - name: custom_alerts
    rules:
      - alert: HighCustomEventFailureRate
        expr: |
          rate(bridge_watch_custom_events_total{status="failure"}[5m]) > 0.1
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "High failure rate for custom events"
          description: "{{ $value }} failures per second"
```

## Troubleshooting

### Prometheus Not Scraping Targets

1. Check target status: `http://prometheus:9090/targets`
2. Verify network connectivity
3. Check firewall rules
4. Verify metrics endpoint is accessible

### Grafana Dashboard Not Loading Data

1. Check data source configuration
2. Verify Prometheus is reachable from Grafana
3. Check query syntax in panel
4. Review browser console for errors

### Alerts Not Firing

1. Verify alert rules are loaded in Prometheus
2. Check expression evaluation in Prometheus UI
3. Ensure Alertmanager is configured correctly
4. Review notification channel configuration

## Maintenance Tasks

### Weekly
- Review active silences
- Check for stale dashboards
- Verify backup processes

### Monthly
- Review and update alert thresholds
- Cleanup old metrics and dashboards
- Update documentation as needed

### Quarterly
- Capacity planning review
- Performance optimization
- Security audit

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)

## Contact

For questions or issues with monitoring:
- Slack: #monitoring-alerts
- Email: ops@example.com
- On-call: PagerDuty escalation policy
