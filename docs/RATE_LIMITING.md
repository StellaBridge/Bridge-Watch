# Rate Limiting and Throttling Documentation

This document describes the comprehensive rate limiting and throttling system implemented for Stellar Bridge Watch API endpoints.

## Overview

The rate limiting system provides multiple layers of protection against abuse while ensuring fair resource allocation for all users. It supports IP-based limiting, API key-based limiting, user tiers, and per-endpoint configurations.

## Features

- **Multi-dimensional Rate Limiting**: IP address + API key combination
- **User Tiers**: Free, Basic, Premium, and Trusted (admin) tiers
- **Per-endpoint Limits**: Different limits for different API endpoints
- **Redis-backed Sliding Window**: Efficient and scalable rate limiting
- **Graceful Degradation**: Fails open when Redis is unavailable
- **Admin Bypass**: Whitelist IPs and API keys for unlimited access
- **Comprehensive Monitoring**: Real-time metrics and statistics
- **Configurable Limits**: Environment-based configuration
- **Standard Headers**: RFC-compliant rate limit headers

## Architecture

### Rate Limiting Components

1. **Middleware Layer** (`rateLimit.middleware.ts`)
   - Request classification and tier detection
   - Sliding window algorithm implementation
   - Response headers and error handling

2. **Service Layer** (`rateLimit.service.ts`)
   - Statistics and monitoring
   - Admin management functions
   - Data export and alerting

3. **Admin API** (`rateLimitAdmin.ts`)
   - Management endpoints for rate limits
   - Statistics and monitoring APIs
   - Configuration management

## Rate Limiting Algorithm

The system uses a **sliding window algorithm** implemented in Redis Lua script for atomicity:

```
Window: 60 seconds (configurable)
Request: Timestamped and stored in Redis sorted set
Cleanup: Old entries automatically evicted
Limit: Based on tier and endpoint
Burst: Additional allowance for traffic spikes
```

## User Tiers and Limits

### Tier Structure

| Tier | API Key Prefix | Requests/Window | Burst Allowance | Use Case |
|------|----------------|-----------------|-----------------|----------|
| Free | (none) | 100 | 10 | Public access, basic usage |
| Basic | `basic_` | 300 | 30 | Registered users |
| Premium | `premium_` | 1000 | 100 | Paid subscribers |
| Trusted | `admin_` | Unlimited | Unlimited | Admin systems |

### Per-Endpoint Limits

| Endpoint Category | Multiplier | Examples |
|-------------------|------------|----------|
| Health | 10x | `/health/*` - 1000 req/window |
| Read | 1.0x | `/api/v1/assets` - 200 req/window |
| Write | 0.3x | `/api/v1/alerts` - 50 req/window |
| Admin | 0.1x | `/api/v1/config` - 30 req/window |
| WebSocket | 0.5x | `/api/v1/ws` - 100 req/window |

## Configuration

### Environment Variables

```bash
# Basic Rate Limiting
RATE_LIMIT_MAX=100                          # Base requests per window
RATE_LIMIT_WINDOW_MS=60000                   # Window size in milliseconds
RATE_LIMIT_BURST_MULTIPLIER=0.1              # Burst allowance (10% of limit)

# Enhanced Configuration
RATE_LIMIT_ENABLE_DYNAMIC=true               # Enable dynamic adjustments
RATE_LIMIT_GLOBAL_ALERT_THRESHOLD=0.9        # Global utilization alert threshold
RATE_LIMIT_BURST_ALERT_THRESHOLD=0.8         # Burst traffic alert threshold
RATE_LIMIT_SUSTAINED_ALERT_THRESHOLD=0.7    # Sustained traffic alert threshold
RATE_LIMIT_STATS_RETENTION_HOURS=168         # Stats retention (7 days)
RATE_LIMIT_ENABLE_MONITORING=true            # Enable monitoring
RATE_LIMIT_ADMIN_API_KEY_PREFIX=admin_       # Admin API key prefix

# Per-endpoint Limits
RATE_LIMIT_ENDPOINT_ASSETS=200
RATE_LIMIT_ENDPOINT_BRIDGES=150
RATE_LIMIT_ENDPOINT_ALERTS=50
RATE_LIMIT_ENDPOINT_ANALYTICS=100
RATE_LIMIT_ENDPOINT_CONFIG=30
RATE_LIMIT_ENDPOINT_HEALTH=1000

# Whitelists
RATE_LIMIT_WHITELIST_IPS=192.168.1.100,10.0.0.50
RATE_LIMIT_WHITELIST_KEYS=admin_master,key_trusted_123
```

## API Endpoints

### Public Rate Limit Headers

All API responses include rate limit headers:

```http
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 199
X-RateLimit-Reset: 1640995200
X-RateLimit-Policy: 200;w=60
X-RateLimit-Tier: free
```

### Rate Limit Exceeded Response

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please slow down your requests.",
  "retryAfter": 45,
  "limit": 200,
  "remaining": 0,
  "resetAt": "2023-12-31T23:59:59.000Z"
}
```

### Admin Management Endpoints

#### Get Statistics
```http
GET /api/v1/admin/rate-limit/stats?timeRange=24h
Authorization: X-API-Key: admin_123
```

#### Get Status for IP/API Key
```http
GET /api/v1/admin/rate-limit/status/ip/192.168.1.100
GET /api/v1/admin/rate-limit/status/api/basic_123
Authorization: X-API-Key: admin_123
```

#### Reset Rate Limit
```http
DELETE /api/v1/admin/rate-limit/reset/ip/192.168.1.100
DELETE /api/v1/admin/rate-limit/reset/api/basic_123?endpoint=assets
Authorization: X-API-Key: admin_123
```

#### Update Tier Limits
```http
PUT /api/v1/admin/rate-limit/tiers/premium
Authorization: X-API-Key: admin_123
Content-Type: application/json

{
  "requestsPerWindow": 1500,
  "windowMs": 60000,
  "burstAllowance": 150
}
```

#### Export Data
```http
GET /api/v1/admin/rate-limit/export?format=csv&timeRange=7d
Authorization: X-API-Key: admin_123
```

## Integration Guide

### Client Implementation

```javascript
class RateLimitedAPIClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.bridge-watch.com';
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'X-API-Key': this.apiKey,
        ...options.headers,
      },
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const waitTime = (parseInt(retryAfter) || 60) * 1000;
      
      console.log(`Rate limited. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      return this.request(endpoint, options); // Retry
    }

    // Update rate limit info
    this.rateLimitInfo = {
      limit: response.headers.get('x-ratelimit-limit'),
      remaining: response.headers.get('x-ratelimit-remaining'),
      reset: response.headers.get('x-ratelimit-reset'),
      tier: response.headers.get('x-ratelimit-tier'),
    };

    return response;
  }
}
```

### Backoff Strategy

```javascript
class ExponentialBackoff {
  constructor(maxRetries = 5, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async executeWithBackoff(operation) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (error.status !== 429 || attempt === this.maxRetries) {
          throw error;
        }
        
        const delay = this.baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}
```

## Monitoring and Alerting

### Metrics Available

- **Request Volume**: Total requests per time window
- **Block Rate**: Percentage of requests blocked
- **Tier Distribution**: Requests by user tier
- **Endpoint Usage**: Most/least used endpoints
- **Top Consumers**: IPs and API keys with highest usage
- **Burst Detection**: Sudden traffic spikes
- **System Health**: Redis connectivity and performance

### Prometheus Integration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'bridge-watch-rate-limits'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/v1/admin/rate-limit/metrics'
    scrape_interval: 30s
```

### Alert Rules

```yaml
groups:
  - name: rate-limiting
    rules:
      - alert: HighRateLimitBlockRate
        expr: bridge_watch_rate_limit_block_rate > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High rate limit block rate detected"
          
      - alert: RateLimitBurstTraffic
        expr: bridge_watch_rate_limit_burst_ratio > 0.8
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Burst traffic exceeding threshold"
```

## Best Practices

### For API Consumers

1. **Respect Rate Limit Headers**: Always check `X-RateLimit-Remaining`
2. **Implement Backoff**: Use exponential backoff for 429 responses
3. **Cache Responses**: Reduce unnecessary requests
4. **Use Appropriate Tiers**: Upgrade API key for higher limits
5. **Monitor Usage**: Track your API consumption

### For System Administrators

1. **Monitor Redis Health**: Rate limiting fails open if Redis is down
2. **Adjust Limits**: Configure based on system capacity
3. **Set Up Alerts**: Monitor for abuse and system overload
4. **Regular Cleanup**: Manage old rate limit data
5. **Document Policies**: Clear rate limit policies for users

### For Developers

1. **Test Rate Limiting**: Include in integration tests
2. **Handle 429 Responses**: Graceful error handling
3. **Use Headers**: Display rate limit info in UI
4. **Batch Requests**: Reduce API call frequency
5. **Choose Right Endpoints**: Use appropriate endpoints for data needs

## Troubleshooting

### Common Issues

1. **Unexpected Rate Limits**
   - Check API key prefix and tier
   - Verify IP address detection
   - Review endpoint-specific limits

2. **Redis Connection Issues**
   - Monitor Redis connectivity
   - Check Redis memory usage
   - Verify Redis configuration

3. **High Block Rates**
   - Review rate limit configuration
   - Check for abusive traffic patterns
   - Consider adjusting limits

4. **Performance Issues**
   - Monitor Redis response times
   - Check Lua script performance
   - Review key expiration policies

### Debug Commands

```bash
# Check Redis rate limit keys
redis-cli keys "bw:rl:*"

# Monitor rate limit requests
redis-cli monitor | grep "bw:rl"

# Check Redis memory usage
redis-cli info memory

# Test rate limiting
curl -H "X-Forwarded-For: 192.168.1.100" \
     http://localhost:3001/api/v1/assets
```

## Security Considerations

### API Key Management

- Use secure API key generation
- Implement key rotation policies
- Monitor API key usage
- Revoke compromised keys immediately

### Rate Limit Bypass Prevention

- Validate IP address headers
- Use multiple identification methods
- Monitor for bypass attempts
- Implement IP reputation checks

### Data Privacy

- Don't store sensitive data in rate limit keys
- Regular cleanup of old data
- Comply with data retention policies
- Monitor for data leakage

## Performance Optimization

### Redis Optimization

```bash
# Redis configuration for rate limiting
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Lua Script Optimization

- Keep scripts simple and fast
- Use atomic operations
- Minimize data transfer
- Profile script performance

### Monitoring Performance

- Track Redis response times
- Monitor memory usage
- Check key expiration rates
- Profile slow operations

## Future Enhancements

Planned improvements for the rate limiting system:

1. **Machine Learning**: Dynamic limit adjustment based on usage patterns
2. **Geographic Limiting**: Region-specific rate limits
3. **Time-based Limits**: Different limits for peak/off-peak hours
4. **Advanced Analytics**: More sophisticated usage analysis
5. **Distributed Rate Limiting**: Multi-instance coordination
6. **Custom Policies**: User-defined rate limit rules
7. **Webhook Integration**: Real-time rate limit notifications
8. **GraphQL Support**: Rate limiting for GraphQL queries

## Support

For rate limiting issues:

1. Check the health endpoint: `/health/`
2. Review admin statistics: `/api/v1/admin/rate-limit/stats`
3. Monitor Redis status
4. Check configuration values
5. Review application logs

For additional support, create an issue in the repository with:
- API endpoint being accessed
- API key tier (if applicable)
- Rate limit headers from response
- Timestamp of the issue
- Expected vs actual behavior
