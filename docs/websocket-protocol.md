# WebSocket Protocol Specification

## Overview

The Bridge Watch WebSocket server provides real-time updates for asset health, bridge status, transaction events, and alerts. This document specifies the protocol for connecting, authenticating, subscribing to channels, and handling messages.

## Connection

### Endpoint

```
wss://api.bridge-watch.example.com/ws
```

For local development:
```
ws://localhost:3000/ws
```

### Handshake

Standard WebSocket handshake per RFC 6455. Clients initiate connection upgrade:

```http
GET /ws HTTP/1.1
Host: api.bridge-watch.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

Server response:
```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

### Protocol Version

Specify protocol version via query parameter:

```
wss://api.bridge-watch.example.com/ws?version=1
```

If omitted, defaults to latest stable version.

## Authentication

### Initial Authentication

After connection is established, client must send an authentication message within 30 seconds:

```json
{
  "type": "auth",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Server responds with authentication result:

**Success:**
```json
{
  "type": "auth_success",
  "user_id": "usr_1234567890",
  "session_id": "sess_abc123",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

**Failure:**
```json
{
  "type": "auth_error",
  "error": "invalid_token",
  "message": "Authentication token is invalid or expired"
}
```

### Token Refresh

Tokens expire after 1 hour. Server sends warning 5 minutes before expiration:

```json
{
  "type": "token_expiring",
  "expires_in": 300,
  "message": "Token expires in 5 minutes. Please refresh."
}
```

Client can refresh token without reconnecting:

```json
{
  "type": "refresh_token",
  "refresh_token": "ref_xyz789..."
}
```

Server responds:
```json
{
  "type": "token_refreshed",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2024-12-31T23:59:59Z"
}
```

### Anonymous Connections

Public read-only channels can be accessed without authentication. Send:

```json
{
  "type": "auth",
  "token": null
}
```

Server responds with limited permissions.

## Subscription Channels

### Available Channels

| Channel | Description | Auth Required | Rate Limit |
|---------|-------------|---------------|------------|
| `asset.health` | Asset health score updates | No | 100/min |
| `asset.price` | Asset price updates | No | 200/min |
| `bridge.status` | Bridge status changes | No | 50/min |
| `bridge.transactions` | Transaction events | Yes | 500/min |
| `alerts` | System alerts and notifications | Yes | 100/min |
| `analytics.live` | Live analytics data | Yes | 50/min |
| `system.status` | System health and uptime | No | 20/min |

### Subscribing to a Channel

```json
{
  "type": "subscribe",
  "channel": "asset.health",
  "filters": {
    "asset_codes": ["USDC", "USDT"],
    "min_score": 70
  }
}
```

**Filters** (optional):
- `asset_codes`: Array of asset symbols to filter
- `bridge_ids`: Array of bridge IDs to filter
- `min_score`: Minimum health score threshold
- `max_score`: Maximum health score threshold
- `severity`: Alert severity levels

Server confirms subscription:

```json
{
  "type": "subscribed",
  "channel": "asset.health",
  "subscription_id": "sub_xyz123"
}
```

Or rejects:

```json
{
  "type": "subscription_error",
  "channel": "asset.health",
  "error": "unauthorized",
  "message": "Authentication required for this channel"
}
```

### Unsubscribing

```json
{
  "type": "unsubscribe",
  "subscription_id": "sub_xyz123"
}
```

Server confirms:

```json
{
  "type": "unsubscribed",
  "subscription_id": "sub_xyz123"
}
```

## Message Format

All messages are JSON objects with a `type` field indicating the message type.

### Client to Server Message Types

| Type | Description |
|------|-------------|
| `auth` | Authenticate connection |
| `refresh_token` | Refresh authentication token |
| `subscribe` | Subscribe to a channel |
| `unsubscribe` | Unsubscribe from a channel |
| `ping` | Keep-alive ping |

### Server to Client Message Types

| Type | Description |
|------|-------------|
| `auth_success` | Authentication successful |
| `auth_error` | Authentication failed |
| `token_expiring` | Token expiring soon |
| `token_refreshed` | Token refreshed successfully |
| `subscribed` | Subscription confirmed |
| `subscription_error` | Subscription failed |
| `unsubscribed` | Unsubscription confirmed |
| `data` | Channel data update |
| `error` | General error message |
| `pong` | Keep-alive pong response |
| `control` | Control message (deprecation, etc.) |

## Channel Data Messages

### Asset Health Updates

Channel: `asset.health`

```json
{
  "type": "data",
  "channel": "asset.health",
  "subscription_id": "sub_xyz123",
  "timestamp": "2024-12-15T10:30:45Z",
  "data": {
    "asset_code": "USDC",
    "health_score": 85.5,
    "previous_score": 84.2,
    "factors": {
      "liquidity": 90,
      "bridge_reliability": 88,
      "price_stability": 95,
      "transaction_volume": 75
    },
    "status": "healthy",
    "last_updated": "2024-12-15T10:30:45Z"
  }
}
```

### Asset Price Updates

Channel: `asset.price`

```json
{
  "type": "data",
  "channel": "asset.price",
  "subscription_id": "sub_abc456",
  "timestamp": "2024-12-15T10:30:45Z",
  "data": {
    "asset_code": "USDC",
    "price_usd": 1.0001,
    "change_24h": 0.0002,
    "change_percent_24h": 0.02,
    "volume_24h": 125000000,
    "source": "aggregate",
    "last_updated": "2024-12-15T10:30:45Z"
  }
}
```

### Bridge Status Updates

Channel: `bridge.status`

```json
{
  "type": "data",
  "channel": "bridge.status",
  "subscription_id": "sub_def789",
  "timestamp": "2024-12-15T10:30:45Z",
  "data": {
    "bridge_id": "bridge_stellar_ethereum",
    "name": "Stellar-Ethereum Bridge",
    "status": "operational",
    "previous_status": "degraded",
    "uptime_percent": 99.85,
    "avg_confirmation_time": 45,
    "pending_transactions": 12,
    "last_transaction": "2024-12-15T10:28:30Z"
  }
}
```

### Transaction Events

Channel: `bridge.transactions`

```json
{
  "type": "data",
  "channel": "bridge.transactions",
  "subscription_id": "sub_ghi012",
  "timestamp": "2024-12-15T10:30:45Z",
  "data": {
    "transaction_id": "txn_xyz789",
    "bridge_id": "bridge_stellar_ethereum",
    "asset_code": "USDC",
    "amount": "1000.00",
    "source_chain": "stellar",
    "destination_chain": "ethereum",
    "status": "confirmed",
    "confirmations": 12,
    "fee": "0.50",
    "sender": "GABC...XYZ",
    "receiver": "0x1234...5678",
    "created_at": "2024-12-15T10:28:30Z",
    "confirmed_at": "2024-12-15T10:30:45Z"
  }
}
```

### Alert Notifications

Channel: `alerts`

```json
{
  "type": "data",
  "channel": "alerts",
  "subscription_id": "sub_jkl345",
  "timestamp": "2024-12-15T10:30:45Z",
  "data": {
    "alert_id": "alert_critical_001",
    "severity": "critical",
    "title": "Bridge Degradation Detected",
    "message": "Stellar-Ethereum bridge experiencing high latency",
    "affected_bridges": ["bridge_stellar_ethereum"],
    "affected_assets": ["USDC", "USDT"],
    "created_at": "2024-12-15T10:30:00Z",
    "acknowledged": false,
    "action_required": true
  }
}
```

### Live Analytics

Channel: `analytics.live`

```json
{
  "type": "data",
  "channel": "analytics.live",
  "subscription_id": "sub_mno678",
  "timestamp": "2024-12-15T10:30:45Z",
  "data": {
    "metric": "total_volume_24h",
    "value": 450000000,
    "change": 12500000,
    "change_percent": 2.85,
    "breakdown": {
      "USDC": 280000000,
      "USDT": 120000000,
      "BTC": 50000000
    }
  }
}
```

### System Status

Channel: `system.status`

```json
{
  "type": "data",
  "channel": "system.status",
  "subscription_id": "sub_pqr901",
  "timestamp": "2024-12-15T10:30:45Z",
  "data": {
    "status": "operational",
    "uptime": "99.98%",
    "active_connections": 1247,
    "api_response_time_ms": 45,
    "database_status": "healthy",
    "redis_status": "healthy",
    "blockchain_sync_status": "synced"
  }
}
```

## Keep-Alive / Heartbeat

### Client Ping

Client should send periodic pings to maintain connection (recommended every 30 seconds):

```json
{
  "type": "ping",
  "timestamp": "2024-12-15T10:30:45Z"
}
```

Server responds:
```json
{
  "type": "pong",
  "timestamp": "2024-12-15T10:30:45Z"
}
```

### Server Timeout

If no messages are received from client for 90 seconds, server closes the connection with code 1000 (normal closure).

## Error Handling

### Error Message Format

```json
{
  "type": "error",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded for channel asset.health",
  "details": {
    "channel": "asset.health",
    "limit": 100,
    "window": "1 minute",
    "retry_after": 45
  },
  "timestamp": "2024-12-15T10:30:45Z"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Authentication required for this operation |
| `AUTH_FAILED` | Authentication credentials invalid |
| `TOKEN_EXPIRED` | Authentication token has expired |
| `INVALID_MESSAGE` | Message format is invalid |
| `CHANNEL_NOT_FOUND` | Requested channel does not exist |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| `SUBSCRIPTION_LIMIT` | Maximum subscriptions reached |
| `INTERNAL_ERROR` | Internal server error |

## Rate Limits

### Per-Channel Limits

Rate limits are enforced per channel per connection. Limits are specified in messages per minute.

### Global Connection Limit

Maximum of 20 concurrent subscriptions per connection.

### Exceeding Rate Limits

When rate limit is exceeded, server sends error message and may temporarily suspend the subscription. After the rate limit window expires, subscription automatically resumes.

## Reconnection Strategy

### Recommended Client Behavior

1. **Immediate Reconnect** (codes 1006, 1011, 1012, 1013)
   - Network error or server restart
   - Attempt reconnect immediately with exponential backoff

2. **Delayed Reconnect** (code 1008)
   - Policy violation
   - Wait 60 seconds before reconnecting

3. **Do Not Reconnect** (code 1003, 1007)
   - Protocol error or invalid data
   - Fix client implementation before reconnecting

### Exponential Backoff

```
Attempt 1: 1 second
Attempt 2: 2 seconds
Attempt 3: 4 seconds
Attempt 4: 8 seconds
Attempt 5+: 16 seconds (max)
```

### Session Restoration

After reconnection, client must re-authenticate and re-subscribe to channels. Server does not automatically restore subscriptions.

## WebSocket Close Codes

| Code | Reason | Reconnect |
|------|--------|-----------|
| 1000 | Normal closure | No |
| 1001 | Going away | Yes, after delay |
| 1003 | Unsupported data | No |
| 1006 | Abnormal closure | Yes, immediately |
| 1007 | Invalid frame payload | No |
| 1008 | Policy violation | Yes, after 60s |
| 1011 | Internal error | Yes, with backoff |
| 1012 | Service restart | Yes, immediately |
| 1013 | Try again later | Yes, with backoff |

## Security Considerations

### Token Storage

- Store authentication tokens securely
- Never log or expose tokens in client-side code
- Use secure WebSocket (wss://) in production

### Origin Validation

Server validates WebSocket Origin header to prevent CSRF attacks. Ensure your application's origin is whitelisted.

### Rate Limiting

Aggressive rate limiting violations may result in temporary or permanent IP bans.

## Connection Limits

- Maximum 100 concurrent connections per IP address
- Maximum 1000 concurrent connections per user account
- Maximum 20 subscriptions per connection

## Example Client Implementation

### JavaScript

```javascript
class BridgeWatchWebSocket {
  constructor(token) {
    this.token = token;
    this.ws = null;
    this.subscriptions = new Map();
  }

  connect() {
    this.ws = new WebSocket('wss://api.bridge-watch.example.com/ws?version=1');
    
    this.ws.onopen = () => {
      this.authenticate();
      this.startHeartbeat();
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      if (event.code !== 1000) {
        this.reconnect();
      }
    };
  }

  authenticate() {
    this.send({ type: 'auth', token: this.token });
  }

  subscribe(channel, filters = {}, callback) {
    const subId = `sub_${Date.now()}`;
    this.subscriptions.set(subId, callback);
    this.send({ type: 'subscribe', channel, filters });
    return subId;
  }

  unsubscribe(subId) {
    this.subscriptions.delete(subId);
    this.send({ type: 'unsubscribe', subscription_id: subId });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  handleMessage(message) {
    if (message.type === 'data') {
      const callback = this.subscriptions.get(message.subscription_id);
      if (callback) callback(message.data);
    }
  }

  startHeartbeat() {
    this.heartbeat = setInterval(() => {
      this.send({ type: 'ping', timestamp: new Date().toISOString() });
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  reconnect() {
    setTimeout(() => this.connect(), 1000);
  }
}

// Usage
const ws = new BridgeWatchWebSocket('your-token-here');
ws.connect();

ws.subscribe('asset.health', { asset_codes: ['USDC'] }, (data) => {
  console.log('Health update:', data);
});
```

## Testing

### Local Testing

Start the WebSocket server in development mode:
```bash
npm run dev
```

Connect using a WebSocket client tool or browser console.

### Mock Server

A mock WebSocket server is available for testing:
```
ws://localhost:3001/ws
```

## Support

For questions about the WebSocket protocol:
- Documentation: https://docs.bridge-watch.example.com/websocket
- GitHub Issues: https://github.com/StellaBridge/Bridge-Watch/issues
- Support Email: websocket-support@bridge-watch.example.com

## Version History

| Version | Release Date | Changes |
|---------|--------------|---------|
| 1.0 | 2024-01-15 | Initial release |

For API versioning policy, see [api-versioning.md](./api-versioning.md).
