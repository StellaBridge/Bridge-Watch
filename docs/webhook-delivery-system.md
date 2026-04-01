# Webhook Delivery System

A comprehensive webhook delivery system for real-time notifications when alerts trigger or significant events occur.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Event Types](#event-types)
- [API Endpoints](#api-endpoints)
- [Webhook Payload Structure](#webhook-payload-structure)
- [Security](#security)
- [Signature Verification](#signature-verification)
- [Retry Logic](#retry-logic)
- [Rate Limiting](#rate-limiting)
- [Batch Delivery](#batch-delivery)
- [Testing](#testing)

---

## Overview

The webhook delivery system enables external services to receive real-time notifications about BridgeWatch events. When an alert triggers, a bridge status changes, or significant events occur, registered webhook endpoints receive a signed HTTP POST request with the event data.

---

## Features

- **Webhook endpoint registration** - Register multiple endpoints with unique URLs
- **Event type subscriptions** - Subscribe to specific event types or receive all
- **Payload signing (HMAC)** - All payloads are signed using HMAC-SHA256
- **Retry logic with backoff** - Exponential backoff for failed deliveries (up to 1 hour)
- **Delivery status tracking** - Track pending, success, failed, and retrying states
- **Failed delivery notifications** - Alert when deliveries permanently fail
- **Webhook testing endpoint** - Send test payloads to verify configuration
- **Rate limiting per endpoint** - Configurable rate limits per endpoint
- **Payload customization** - Custom headers and payload filtering
- **Webhook logs and history** - Complete audit trail of all delivery attempts
- **Secret rotation support** - Rotate secrets without disrupting deliveries
- **Batch delivery option** - Group multiple events into a single delivery

---

## Event Types

| Event Type | Description |
|------------|-------------|
| `alert.triggered` | An alert rule was triggered |
| `alert.resolved` | An alert condition cleared |
| `bridge.status_changed` | Bridge status changed (healthy/degraded/down) |
| `health.score_changed` | Health score crossed a threshold |
| `reserve.commitment_submitted` | New reserve commitment submitted |
| `reserve.challenge_raised` | Reserve commitment challenged |
| `circuit_breaker.tripped` | Circuit breaker was tripped |
| `circuit_breaker.reset` | Circuit breaker was reset |
| `price.deviation_detected` | Price deviation threshold exceeded |
| `liquidity.threshold_breached` | Liquidity threshold breached |

---

## API Endpoints

All webhook endpoints are prefixed with `/api/v1/webhooks`.

### Endpoint Management

#### Create Endpoint
```
POST /api/v1/webhooks/endpoints
```

**Request Body:**
```json
{
  "ownerAddress": "GABC...123",
  "url": "https://your-server.com/webhooks",
  "name": "Production Alerts",
  "description": "Receive all alert notifications",
  "rateLimitPerMinute": 60,
  "customHeaders": {
    "X-API-Key": "your-api-key"
  },
  "eventTypes": ["alert.triggered", "bridge.status_changed"],
  "isBatchDeliveryEnabled": false,
  "batchWindowMs": 5000
}
```

#### List Endpoints
```
GET /api/v1/webhooks/endpoints?ownerAddress=GABC...123
```

#### Get Endpoint
```
GET /api/v1/webhooks/endpoints/:id
```

#### Update Endpoint
```
PATCH /api/v1/webhooks/endpoints/:id
```

#### Delete Endpoint
```
DELETE /api/v1/webhooks/endpoints/:id
```

### Secret Rotation

#### Rotate Secret
```
POST /api/v1/webhooks/endpoints/:id/rotate-secret
```

Returns a new secret for the endpoint. The old secret is invalidated immediately.

### Delivery Management

#### Queue Delivery
```
POST /api/v1/webhooks/deliver
```

**Request Body:**
```json
{
  "webhookEndpointId": "uuid",
  "eventType": "alert.triggered",
  "payload": {
    "alertId": "uuid",
    "assetCode": "USDC",
    "value": 1000000
  }
}
```

#### Queue Batch Delivery
```
POST /api/v1/webhooks/deliver/batch
```

**Request Body:**
```json
{
  "webhookEndpointId": "uuid",
  "eventType": "alert.triggered",
  "events": [
    { "alertId": "uuid1", "assetCode": "USDC" },
    { "alertId": "uuid2", "assetCode": "EURC" }
  ]
}
```

#### Get Delivery Status
```
GET /api/v1/webhooks/deliveries/:deliveryId
```

#### List Deliveries
```
GET /api/v1/webhooks/endpoints/:endpointId/deliveries?status=failed&limit=100
```

#### Get Delivery Logs
```
GET /api/v1/webhooks/deliveries/:deliveryId/logs?limit=50
```

#### Get Webhook History
```
GET /api/v1/webhooks/endpoints/:endpointId/history?limit=100
```

### Testing

#### Test Endpoint
```
POST /api/v1/webhooks/endpoints/:id/test
```

Sends a test payload to verify the endpoint is reachable and correctly configured.

### Utilities

#### Verify Signature
```
POST /api/v1/webhooks/verify
```

**Request Body:**
```json
{
  "payload": "{\"test\":true}",
  "signature": "abc123...",
  "timestamp": "1711651200000",
  "secret": "your-webhook-secret"
}
```

---

## Webhook Payload Structure

### Standard Delivery
```json
{
  "id": "delivery-uuid",
  "eventType": "alert.triggered",
  "timestamp": "2026-03-28T12:00:00.000Z",
  "data": {
    "alertId": "alert-uuid",
    "ruleName": "USDC Price Deviation",
    "assetCode": "USDC",
    "triggeredValue": 1.05,
    "threshold": 1.02,
    "priority": "high"
  },
  "webhookUrl": "https://your-server.com/webhooks"
}
```

### Batch Delivery
```json
{
  "batch": true,
  "eventType": "alert.triggered",
  "count": 2,
  "events": [
    { "alertId": "uuid1", "assetCode": "USDC", ... },
    { "alertId": "uuid2", "assetCode": "EURC", ... }
  ],
  "timestamp": "2026-03-28T12:00:00.000Z"
}
```

---

## Security

### HMAC Signing

All webhook payloads are signed using HMAC-SHA256. Each endpoint has a unique secret that is used to generate the signature.

### Signature Headers

Every webhook request includes these headers:

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Webhook-Signature` | HMAC-SHA256 signature |
| `X-Webhook-Timestamp` | Unix timestamp (ms) |
| `X-Webhook-Event-Id` | Unique event identifier |
| `User-Agent` | `BridgeWatch-Webhook/1.0` |

### Signature Generation

The signature is computed as:
```
signature = HMAC-SHA256(secret, "{timestamp}.{payload}")
```

### Verification Example (Node.js)

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, timestamp, secret, toleranceMs = 300000) {
  const ts = parseInt(timestamp, 10);
  const now = Date.now();

  // Check timestamp tolerance (5 minutes)
  if (Math.abs(now - ts) > toleranceMs) {
    return false; // Replay attack prevention
  }

  const signaturePayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

---

## Signature Verification

### Verification Steps

1. Extract headers: `X-Webhook-Signature`, `X-Webhook-Timestamp`
2. Reject if timestamp is older than 5 minutes (replay protection)
3. Compute expected signature using your stored secret
4. Use constant-time comparison to verify signatures match

### Secret Rotation

Secrets should be rotated periodically. When rotating:

1. Call `POST /api/v1/webhooks/endpoints/:id/rotate-secret`
2. Update your secret storage
3. The old secret is invalidated immediately
4. New webhooks will use the new secret

---

## Retry Logic

Failed deliveries are retried using exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 5 seconds |
| 3 | 15 seconds |
| 4 | 1 minute |
| 5 | 5 minutes |
| 6 | 15 minutes |
| 7 | 1 hour |

After 7 failed attempts, the delivery is marked as permanently failed.

### HTTP Status Code Handling

- **2xx**: Success, no retry
- **4xx** (except 429): Permanent failure, no retry
- **429**: Rate limited, retry with backoff
- **5xx**: Temporary failure, retry with backoff

---

## Rate Limiting

Each endpoint has a configurable rate limit (default: 60 requests/minute). Rate limits are enforced at the queue level to prevent overwhelming your endpoint.

If a delivery is rate limited, it will be retried after the rate limit window resets.

---

## Batch Delivery

Enable batch delivery on an endpoint to group multiple events into a single HTTP request:

```json
{
  "isBatchDeliveryEnabled": true,
  "batchWindowMs": 5000
}
```

Events arriving within the batch window (default: 5 seconds) are grouped into a single payload with a `batch: true` flag.

---

## Testing

### Test Endpoint

Send a test webhook to verify your endpoint configuration:

```bash
curl -X POST http://localhost:3001/api/v1/webhooks/endpoints/{id}/test
```

Response (success):
```json
{
  "success": true,
  "status": 200,
  "durationMs": 142,
  "message": "Test webhook delivered successfully"
}
```

Response (failure):
```json
{
  "success": false,
  "durationMs": 5000,
  "error": "Connection timeout",
  "message": "Test webhook delivery failed"
}
```

### Test Payload Structure

Test webhooks have a special `test` event type:
```json
{
  "eventType": "test",
  "timestamp": "2026-03-28T12:00:00.000Z",
  "data": {
    "message": "This is a test webhook delivery from BridgeWatch",
    "webhookEndpointId": "uuid",
    "test": true
  }
}
```

---

## Database Schema

### Tables

- `webhook_endpoints` - Registered webhook endpoints
- `webhook_deliveries` - Individual delivery attempts
- `webhook_delivery_logs` - Detailed logs for each attempt

### Indexes

```sql
CREATE INDEX webhook_endpoints_owner_idx ON webhook_endpoints (owner_address);
CREATE INDEX webhook_endpoints_active_idx ON webhook_endpoints (is_active);
CREATE INDEX webhook_deliveries_endpoint_idx ON webhook_deliveries (webhook_endpoint_id);
CREATE INDEX webhook_deliveries_status_idx ON webhook_deliveries (status);
CREATE INDEX webhook_deliveries_created_idx ON webhook_deliveries (created_at DESC);
CREATE INDEX webhook_delivery_logs_delivery_idx ON webhook_delivery_logs (webhook_delivery_id);
CREATE INDEX webhook_delivery_logs_endpoint_idx ON webhook_delivery_logs (webhook_endpoint_id);
```

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `Endpoint not found` | Invalid endpoint ID | Check the endpoint ID |
| `Rate limit exceeded` | Too many requests | Wait and retry |
| `Signature verification failed` | Invalid secret | Rotate secret |
| `Connection timeout` | Endpoint unreachable | Check endpoint URL and network |
| `HTTP 401 Unauthorized` | Endpoint requires auth | Add auth headers in customHeaders |

### Best Practices

1. **Respond quickly**: Return 2xx immediately and process asynchronously
2. **Verify signatures**: Always verify the signature before processing
3. **Handle duplicates**: Use `X-Webhook-Event-Id` to deduplicate
4. **Log everything**: Use delivery logs for debugging
5. **Monitor failures**: Track failed deliveries for issues
6. **Rotate secrets**: Rotate secrets periodically for security
