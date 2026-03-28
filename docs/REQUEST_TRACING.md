# Request Logging and Tracing Documentation

This document describes the comprehensive request logging and distributed tracing system implemented for Stellar Bridge Watch API.

## Overview

The tracing system provides end-to-end request visibility, structured logging, performance monitoring, and distributed tracing capabilities. It helps with debugging, performance analysis, and system monitoring.

## Features

- **Request ID Generation**: Unique identifiers for every request
- **Correlation ID Propagation**: Trace requests across service boundaries
- **Structured Logging**: JSON-formatted logs with consistent schema
- **Sensitive Data Masking**: Automatic redaction of sensitive information
- **Performance Monitoring**: Request timing and performance metrics
- **Trace Visualization**: Support for distributed tracing visualization
- **Log Aggregation Compatibility**: Compatible with ELK, Splunk, and other systems
- **Admin Management**: Complete admin interface for trace management

## Architecture

### Core Components

1. **Trace Manager** (`tracing.ts`)
   - Trace context creation and management
   - Request ID and correlation ID generation
   - Span lifecycle management

2. **Traced Logger** (`tracing.ts`)
   - Structured logging with trace context
   - Multiple log levels and components
   - Performance and error logging

3. **Middleware Integration** (`tracing.ts`)
   - Request/response lifecycle hooks
   - Automatic trace context injection
   - Performance timing

4. **Admin API** (`tracingAdmin.ts`)
   - Trace management endpoints
   - Performance metrics and visualization
   - Data export and configuration

## Request Flow

```
Incoming Request
    ↓
1. Generate Request ID
2. Extract/Generate Correlation ID
3. Create Trace Context
4. Add Trace Headers to Response
    ↓
Process Request
    ↓
5. Log Request Start
6. Execute Business Logic
7. Log Request Completion
8. Update Performance Metrics
    ↓
Response Sent
```

## Trace Context Structure

Each request has a trace context with the following fields:

```typescript
interface TraceContext {
  requestId: string;        // Unique request identifier
  correlationId: string;    // Correlation across services
  traceId: string;          // Distributed trace identifier
  spanId: string;           // Current span identifier
  parentSpanId?: string;    // Parent span for nested calls
  userId?: string;          // Authenticated user ID
  sessionId?: string;       // Session identifier
  userAgent?: string;       // Client user agent
  ip?: string;              // Client IP address
  startTime: number;        // Request start timestamp
  tags: Record<string, any>; // Custom tags and metadata
}
```

## Configuration

### Environment Variables

```bash
# Logging Configuration
LOG_LEVEL=info                          # Log level (trace, debug, info, warn, error, fatal)
LOG_FILE=/var/log/bridge-watch.log     # Log file path (optional)
LOG_MAX_FILE_SIZE=104857600            # Max file size in bytes (100MB)
LOG_MAX_FILES=10                       # Number of log files to retain
LOG_RETENTION_DAYS=30                  # Log retention period
LOG_REQUEST_BODY=false                 # Log request bodies (security risk)
LOG_RESPONSE_BODY=false                # Log response bodies (security risk)
LOG_SENSITIVE_DATA=false               # Include sensitive data in logs
REQUEST_SLOW_THRESHOLD_MS=1000         # Slow request threshold
```

### Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `trace` | Very detailed information | Request flow tracing |
| `debug` | Debug information | Development troubleshooting |
| `info` | General information | Normal operation |
| `warn` | Warning conditions | Potential issues |
| `error` | Error conditions | Failures and exceptions |
| `fatal` | Critical errors | System failures |

## API Headers

### Request Headers

Clients can send these headers to influence tracing:

```http
X-Correlation-ID: 123e4567-e89b-12d3-a456-426614174000
X-Trace-ID: 123e4567-e89b-12d3-a456-426614174001
X-Parent-Span-ID: 123e4567-e89b-12d3-a456-426614174002
X-User-ID: user123
X-Session-ID: session456
```

### Response Headers

Server includes these headers in every response:

```http
X-Request-ID: 123e4567-e89b-12d3-a456-426614174003
X-Correlation-ID: 123e4567-e89b-12d3-a456-426614174000
X-Trace-ID: 123e4567-e89b-12d3-a456-426614174001
X-Span-ID: 123e4567-e89b-12d3-a456-426614174003
```

## Log Format

### Structured Log Schema

All logs follow this structured format:

```json
{
  "level": "info",
  "message": "Request started",
  "timestamp": "2023-12-31T23:59:59.000Z",
  "requestId": "123e4567e89b12d3a456426614174003",
  "correlationId": "123e4567e89b12d3a456426614174000",
  "traceId": "123e4567e89b12d3a456426614174001",
  "spanId": "123e4567e89b12d3a456426614174003",
  "parentSpanId": "123e4567e89b12d3a456426614174002",
  "userId": "user123",
  "sessionId": "session456",
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.100",
  "duration": 150,
  "component": "tracing",
  "action": "request_start",
  "tags": {
    "method": "GET",
    "url": "/api/v1/assets",
    "statusCode": 200
  },
  "metadata": {
    "responseSize": 1024
  },
  "service": "bridge-watch-api",
  "version": "0.1.0",
  "environment": "production",
  "hostname": "api-server-01",
  "pid": 12345
}
```

### Log Examples

#### Request Start
```json
{
  "level": "info",
  "message": "Request started",
  "timestamp": "2023-12-31T23:59:59.000Z",
  "requestId": "req123",
  "correlationId": "corr456",
  "traceId": "trace789",
  "spanId": "span001",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "tags": {
    "method": "GET",
    "url": "/api/v1/assets"
  }
}
```

#### Request Completion
```json
{
  "level": "info",
  "message": "Request completed",
  "timestamp": "2023-12-31T23:59:59.150Z",
  "requestId": "req123",
  "correlationId": "corr456",
  "traceId": "trace789",
  "spanId": "span001",
  "duration": 150,
  "tags": {
    "method": "GET",
    "url": "/api/v1/assets",
    "statusCode": 200,
    "responseSize": 1024
  }
}
```

#### Error Log
```json
{
  "level": "error",
  "message": "Request error",
  "timestamp": "2023-12-31T23:59:59.100Z",
  "requestId": "req123",
  "correlationId": "corr456",
  "traceId": "trace789",
  "spanId": "span001",
  "error": {
    "name": "ValidationError",
    "message": "Invalid asset symbol",
    "stack": "Error: Invalid asset symbol\n    at ..."
  },
  "tags": {
    "method": "POST",
    "url": "/api/v1/assets",
    "statusCode": 400
  }
}
```

#### Performance Log
```json
{
  "level": "info",
  "message": "Slow request detected",
  "timestamp": "2023-12-31T23:59:59.200Z",
  "requestId": "req123",
  "correlationId": "corr456",
  "traceId": "trace789",
  "spanId": "span001",
  "duration": 2500,
  "component": "performance",
  "tags": {
    "method": "GET",
    "url": "/api/v1/assets",
    "statusCode": 200,
    "threshold": 1000
  }
}
```

## Sensitive Data Masking

The system automatically masks sensitive data in logs:

### Masked Fields
- Authentication: `password`, `token`, `secret`, `key`, `auth`, `credential`
- Personal Info: `email`, `phone`, `ssn`, `creditCard`
- Financial: `account`, `routing`, `iban`, `swift`, `bic`
- API Keys: `apikey`, `api_key`, `private_key`, `public_key`, `certificate`

### Masked Patterns
- Email addresses: `user@example.com` → `***MASKED***`
- Phone numbers: `555-123-4567` → `***MASKED***`
- Credit cards: `4111-1111-1111-1111` → `***MASKED***`
- API keys: `sk-1234567890abcdef` → `***MASKED***`
- JWT tokens: `eyJ...` → `***MASKED***`

### Example
```javascript
// Input
{
  "username": "john.doe",
  "password": "secret123",
  "email": "john@example.com",
  "apiKey": "sk-1234567890abcdef"
}

// Output
{
  "username": "john.doe",
  "password": "***MASKED***",
  "email": "***MASKED***",
  "apiKey": "***MASKED***"
}
```

## Admin API Endpoints

### Authentication
All admin endpoints require an admin API key with the prefix configured in `RATE_LIMIT_ADMIN_API_KEY_PREFIX` (default: `admin_`).

```http
X-API-Key: admin_1234567890abcdef
```

### Endpoints

#### Get Active Traces
```http
GET /api/v1/admin/tracing/traces/active
Authorization: X-API-Key: admin_123
```

Response:
```json
{
  "success": true,
  "data": {
    "activeTraces": [
      {
        "requestId": "req123",
        "correlationId": "corr456",
        "traceId": "trace789",
        "spanId": "span001",
        "userId": "user123",
        "ip": "192.168.1.100",
        "startTime": 1704067199000,
        "duration": 150,
        "tags": {}
      }
    ],
    "count": 1,
    "timestamp": "2023-12-31T23:59:59.000Z"
  }
}
```

#### Get Trace by ID
```http
GET /api/v1/admin/tracing/traces/{traceId}?includeSpans=true
Authorization: X-API-Key: admin_123
```

#### Get Performance Metrics
```http
GET /api/v1/admin/tracing/metrics/performance?timeRange=3600000&route=/api/v1/assets
Authorization: X-API-Key: admin_123
```

#### Get Trace Visualization
```http
GET /api/v1/admin/tracing/traces/{traceId}/visualization
Authorization: X-API-Key: admin_123
```

#### Export Trace Data
```http
GET /api/v1/admin/tracing/traces/export?format=json&timeRange=86400000
Authorization: X-API-Key: admin_123
```

#### Get Logging Configuration
```http
GET /api/v1/admin/tracing/config/logging
Authorization: X-API-Key: admin_123
```

#### Health Check
```http
GET /api/v1/admin/tracing/health
Authorization: X-API-Key: admin_123
```

## Integration Guide

### Client Integration

#### JavaScript/TypeScript
```javascript
class TracedAPIClient {
  constructor(baseURL, apiKey) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.correlationId = this.generateCorrelationId();
  }

  generateCorrelationId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async request(endpoint, options = {}) {
    const headers = {
      'X-Correlation-ID': this.correlationId,
      'X-API-Key': this.apiKey,
      ...options.headers,
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    // Extract trace information from response
    const traceInfo = {
      requestId: response.headers.get('X-Request-ID'),
      correlationId: response.headers.get('X-Correlation-ID'),
      traceId: response.headers.get('X-Trace-ID'),
      spanId: response.headers.get('X-Span-ID'),
    };

    console.log('Trace info:', traceInfo);
    return response;
  }
}
```

#### Python
```python
import requests
import uuid
from typing import Dict, Any, Optional

class TracedAPIClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.api_key = api_key
        self.correlation_id = str(uuid.uuid4())

    def request(self, endpoint: str, **kwargs) -> requests.Response:
        headers = kwargs.get('headers', {})
        headers.update({
            'X-Correlation-ID': self.correlation_id,
            'X-API-Key': self.api_key,
        })
        kwargs['headers'] = headers

        response = requests.post(f"{self.base_url}{endpoint}", **kwargs)
        
        # Extract trace information
        trace_info = {
            'request_id': response.headers.get('X-Request-ID'),
            'correlation_id': response.headers.get('X-Correlation-ID'),
            'trace_id': response.headers.get('X-Trace-ID'),
            'span_id': response.headers.get('X-Span-ID'),
        }
        
        print(f"Trace info: {trace_info}")
        return response
```

### Microservice Integration

#### Service-to-Service Communication
```javascript
// Service A
async function callServiceB(data) {
  const traceHeaders = {
    'X-Correlation-ID': request.traceContext.correlationId,
    'X-Trace-ID': request.traceContext.traceId,
    'X-Parent-Span-ID': request.traceContext.spanId,
    'X-User-ID': request.traceContext.userId,
  };

  return await fetch('http://service-b/api/data', {
    method: 'POST',
    headers: traceHeaders,
    body: JSON.stringify(data),
  });
}

// Service B
// The tracing middleware will automatically pick up the headers
// and continue the trace
```

## Log Aggregation Setup

### ELK Stack (Elasticsearch, Logstash, Kibana)

#### Logstash Configuration
```ruby
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] == "bridge-watch-api" {
    json {
      source => "message"
    }
    
    # Parse trace information
    if [requestId] {
      mutate {
        add_field => { "trace_id" => "%{traceId}" }
        add_field => { "correlation_id" => "%{correlationId}" }
      }
    }
    
    # Parse duration
    if [duration] {
      mutate {
        convert => { "duration" => "integer" }
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "bridge-watch-logs-%{+YYYY.MM.dd}"
  }
}
```

#### Kibana Index Pattern
- Index pattern: `bridge-watch-logs-*`
- Time field: `timestamp`
- Fields to include: `level`, `message`, `requestId`, `correlationId`, `traceId`, `duration`, `userId`, `ip`

### Splunk Configuration

#### Props Configuration
```ini
[bridge_watch_logs]
TIMESTAMP_FORMAT = %Y-%m-%dT%H:%M:%S.%LZ
TIME_PREFIX = ^.*
TIME_FORMAT = %Y-%m-%dT%H:%M:%S.%LZ
MAX_TIMESTAMP_LOOKAHEAD = 30
SHOULD_LINEMERGE = false
KV_MODE = json
```

#### Field Extractions
```regex
"requestId":"(?<requestId>[^"]+)"
"correlationId":"(?<correlationId>[^"]+)"
"traceId":"(?<traceId>[^"]+)"
"duration":(?<duration>\d+)
```

### Datadog Integration

#### Log Forwarding
```yaml
# datadog.yaml
logs:
  enabled: true
  config_container_collect_all: true
  open_file_descriptor_limit: 5000

logs_config:
  container_collect_all: true
  auto_multi_line_detection: true

processors:
  - name: trace_id_processor
    type: trace_id_processor
```

## Performance Monitoring

### Metrics Available

- **Request Duration**: Response time for each request
- **Error Rate**: Percentage of requests resulting in errors
- **Throughput**: Requests per second/minute
- **Slow Requests**: Requests exceeding threshold
- **Active Traces**: Currently in-flight requests

### Performance Thresholds

```javascript
// Slow request detection
if (duration > config.REQUEST_SLOW_THRESHOLD_MS) {
  tracedLogger.performance('Slow request detected', requestId, duration, {
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    threshold: config.REQUEST_SLOW_THRESHOLD_MS,
  });
}
```

### Monitoring Dashboards

#### Key Metrics to Track
1. **Response Time Trends**: P50, P90, P95, P99 percentiles
2. **Error Rate by Endpoint**: Most error-prone endpoints
3. **Throughput by Time**: Request volume over time
4. **Active Users**: Unique users making requests
5. **Geographic Distribution**: Requests by region/IP

## Troubleshooting

### Common Issues

1. **Missing Trace Context**
   - Check if tracing middleware is registered first
   - Verify middleware order in server setup
   - Check for middleware conflicts

2. **Duplicate Request IDs**
   - Ensure UUID generation is working
   - Check for middleware registration multiple times
   - Verify no ID collisions in concurrent requests

3. **Performance Impact**
   - Monitor memory usage of trace manager
   - Check log file sizes and rotation
   - Review sensitive data masking performance

4. **Log Aggregation Issues**
   - Verify log format compatibility
   - Check structured logging configuration
   - Ensure proper field mapping

### Debug Commands

```bash
# Check active traces
curl -H "X-API-Key: admin_123" \
     http://localhost:3001/api/v1/admin/tracing/traces/active

# Get performance metrics
curl -H "X-API-Key: admin_123" \
     http://localhost:3001/api/v1/admin/tracing/metrics/performance

# Check trace health
curl -H "X-API-Key: admin_123" \
     http://localhost:3001/api/v1/admin/tracing/health

# Export traces for analysis
curl -H "X-API-Key: admin_123" \
     "http://localhost:3001/api/v1/admin/tracing/traces/export?format=json" \
     -o traces.json
```

## Best Practices

### For Developers

1. **Use Traced Logger**: Always use the traced logger from request context
2. **Add Context**: Include relevant metadata in log entries
3. **Mask Sensitive Data**: Never log passwords, tokens, or PII
4. **Use Appropriate Levels**: Choose correct log levels for messages
5. **Performance Awareness**: Avoid excessive logging in hot paths

### For Operations

1. **Monitor Log Volume**: Watch for log storms and excessive output
2. **Set Up Alerts**: Configure alerts for error rates and slow requests
3. **Regular Cleanup**: Manage log retention and disk space
4. **Security Review**: Regularly audit what data is being logged
5. **Performance Monitoring**: Track logging overhead

### For Security

1. **Review Masking Rules**: Ensure all sensitive data is masked
2. **Access Control**: Restrict access to admin tracing endpoints
3. **Audit Logs**: Monitor who accesses trace data
4. **Data Retention**: Comply with data retention policies
5. **Encryption**: Encrypt logs at rest and in transit

## Security Considerations

### Data Protection

- **Automatic Masking**: Sensitive data is automatically masked
- **Configurable Logging**: Control what data gets logged
- **Access Controls**: Admin endpoints require authentication
- **Audit Trail**: All trace access is logged

### Privacy Compliance

- **PII Protection**: Personal information is masked by default
- **Data Minimization**: Only log necessary information
- **Retention Policies**: Automatic cleanup of old trace data
- **Consent Management**: User consent for logging can be respected

## Future Enhancements

Planned improvements for the tracing system:

1. **Distributed Tracing**: Integration with Jaeger/Zipkin
2. **Machine Learning**: Anomaly detection in request patterns
3. **Real-time Alerts**: WebSocket-based trace notifications
4. **Advanced Filtering**: More sophisticated trace search
5. **Custom Metrics**: User-defined performance metrics
6. **Trace Sampling**: Intelligent trace sampling for high traffic
7. **Service Mesh Integration**: Istio/Linkerd compatibility
8. **OpenTelemetry**: Standard tracing protocol support

## Support

For tracing issues:

1. Check the tracing health endpoint: `/api/v1/admin/tracing/health`
2. Review active traces: `/api/v1/admin/tracing/traces/active`
3. Monitor performance metrics: `/api/v1/admin/tracing/metrics/performance`
4. Check configuration: `/api/v1/admin/tracing/config/logging`
5. Review application logs for trace-related errors

For additional support, create an issue in the repository with:
- Request ID and correlation ID from affected requests
- Timestamp of the issue
- Expected vs actual behavior
- Any error messages or stack traces
