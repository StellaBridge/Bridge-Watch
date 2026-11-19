# Deployment Guide

This document covers deployment of Stellar Bridge Watch to production environments, including Railway.app configuration and cold-start optimization.

## Table of Contents

1. [Railway.app Deployment](#railwayapp-deployment)
2. [Cold-Start Parameters](#cold-start-parameters)
3. [Health Checks](#health-checks)
4. [Restart Policies](#restart-policies)
5. [Database Migrations](#database-migrations)
6. [Environment Configuration](#environment-configuration)
7. [Monitoring and Logs](#monitoring-and-logs)

---

## Railway.app Deployment

Stellar Bridge Watch uses [Railway.app](https://railway.app) for production deployment. Configuration is managed through `railway.toml` in the project root.

### Quick start

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link your project
railway link

# Deploy
railway up
```

### Configuration file

The `railway.toml` file defines:
- **Build configuration**: Dockerfile location and build command
- **Health checks**: Endpoint, timeout, and retry settings
- **Restart policy**: Behavior on container failure
- **Environment variables**: Production settings
- **Network configuration**: Exposed ports

See `railway.toml` for the complete configuration.

---

## Cold-Start Parameters

A "cold start" occurs when a container first launches or restarts. During this time:

1. **Node.js runtime** loads and initializes
2. **Dependencies** are loaded into memory
3. **Database migrations** run (if applicable)
4. **Connection pools** initialize
5. **Caches** warm up

**Without proper timeouts**, the health check can fail during migrations, causing crash-loop restarts.

### Configured timeouts

```toml
healthcheckStartPeriod = 90  # 90 seconds grace period before health checks start
healthcheckTimeout = 30      # 30 seconds to respond to health check request
healthcheckInterval = 10     # Health check every 10 seconds (after start period)
```

### What happens

1. **0–90 seconds**: Health checks are disabled (start period)
   - Migrations run safely without interruption
   - Dependencies load without timeout pressure

2. **90+ seconds**: Health checks begin
   - Application must respond to `GET /health` within 30 seconds
   - If unhealthy, next check runs in 10 seconds
   - After 3 consecutive failures, container restarts

3. **On restart**: The 90-second grace period resets

### Tuning cold-start parameters

Adjust these values if:

- **Migrations take >90 seconds**: Increase `healthcheckStartPeriod`
  ```toml
  healthcheckStartPeriod = 180  # 3 minutes for large migrations
  ```

- **Health check endpoint is slow**: Increase `healthcheckTimeout`
  ```toml
  healthcheckTimeout = 60  # 60 seconds if checking external services
  ```

- **Frequent false-positive failures**: Increase `healthcheckInterval`
  ```toml
  healthcheckInterval = 15  # Check every 15 seconds instead of 10
  ```

---

## Health Checks

The application exposes a health check endpoint at `GET /health`.

### Expected response

```json
{
  "status": "healthy",
  "uptime": 1234567,
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Implementation

Health check should verify:
- ✅ Database connectivity
- ✅ Redis/cache connectivity (if used)
- ✅ External service dependencies
- ⚠️ **But keep it fast**: Target <5 seconds for lightweight health checks

---

## Restart Policies

The `restartPolicyType` determines behavior when a container exits:

### Available policies

| Policy | Behavior |
|--------|----------|
| `always` | Always restart, regardless of exit code |
| `on-failure` | Restart only on non-zero exit code |
| `no` | Never restart automatically |

### Current configuration

```toml
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 5
```

This restarts the container up to 5 times on failure, with exponential backoff:
1. First restart: immediate
2. Second: ~1 second delay
3. Third: ~2 second delay
4. And so on...

### When to use each

- **`always`**: Stateless services (API, frontend)
- **`on-failure`**: Services that should crash on bad config (backend with migrations)
- **`no`**: Manual management (debugging, one-off tasks)

---

## Database Migrations

Migrations run during application startup in the `entrypoint.sh` script. 

### Example flow

```bash
#!/bin/bash
# entrypoint.sh

# Source secrets from mounted volume
source /run/secrets/.env 2>/dev/null || true

# Run pending migrations
npm run migrate

# Start application
exec "$@"
```

### Ensuring migrations complete before health checks

The `healthcheckStartPeriod = 90` setting **must** be greater than your longest migration time.

To measure:

```bash
# Locally
time npm run migrate
# Output: "real 0m45.123s"

# Then set: healthcheckStartPeriod = 60 (at least)
```

---

## Environment Configuration

### Required environment variables

```bash
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=postgresql://user:pass@db:5432/bridge_watch
REDIS_URL=redis://cache:6379
JWT_SECRET=<32+ random characters>
API_KEY=<secure API key>
```

### Setting variables on Railway

1. **Via CLI**:
   ```bash
   railway variable set NODE_ENV production
   railway variable set DATABASE_URL postgresql://...
   ```

2. **Via Railway dashboard**:
   - Navigate to your project
   - Click the service
   - Go to "Variables" tab
   - Add key-value pairs

3. **Via `.env.local`** (for local testing only, never commit):
   ```bash
   # .env.local (not in git)
   NODE_ENV=development
   DATABASE_URL=postgresql://localhost/bridge_watch
   ```

### Secrets vault

For sensitive values (API keys, tokens):

1. Use Railway's **Secrets** tab (encrypted at rest)
2. Or use a mounted secrets volume via `/run/secrets`

**Never commit secrets to git.** Gitleaks will catch them, but prevention is better.

---

## Monitoring and Logs

### View logs

```bash
# Stream logs from Railway CLI
railway logs --follow

# Or via Railway dashboard:
# - Navigate to service
# - Click "Logs" tab
# - Filter by severity or component
```

### Recommended logging levels

| Level | Use case |
|-------|----------|
| `error` | Production errors that need immediate attention |
| `warn` | Unexpected conditions (e.g., slow query) |
| `info` | Normal operations (startup, deployments) |
| `debug` | Detailed developer information (not in prod) |

### Monitoring integrations

Configure alerts for:
- ⚠️ **Health check failures**: 3+ consecutive failures = restart
- ⚠️ **High error rate**: >1% of requests returning 5xx
- ⚠️ **Slow endpoints**: p99 latency >2 seconds
- ⚠️ **Database issues**: Connection pool exhaustion

---

## Troubleshooting

### "Crash-loop restarts"

**Symptom**: Container restarts every few seconds.

**Check**:
1. View logs: `railway logs --follow`
2. Look for errors in startup or migrations
3. If migration hangs, increase `healthcheckStartPeriod`
4. If health endpoint is slow, increase `healthcheckTimeout`

### "Health check timeouts"

**Symptom**: Health checks fail but application seems running.

**Check**:
1. Verify `GET /health` endpoint responds: `curl http://localhost:3001/health`
2. Check database connectivity from container
3. Increase `healthcheckTimeout` if external services are slow
4. Add caching to health check endpoint

### "Deployment stuck on 'waiting for health check'"

**Check**:
1. Application is fully started: `railway logs`
2. Health endpoint is responding
3. `healthcheckPath` matches your actual endpoint (`/health`)

---

## Production checklist

Before deploying to production:

- [ ] Database migrations have been tested locally
- [ ] Health check endpoint responds within timeout
- [ ] Environment variables are set in Railway dashboard
- [ ] Secrets are stored in Railway's encrypted secrets vault
- [ ] Cold-start parameters are tuned for your database size
- [ ] Monitoring and alerts are configured
- [ ] Logs are being collected and reviewed
- [ ] Backup strategy is in place (automated snapshots)
- [ ] Zero-downtime deployment strategy is documented

---

## See also

- [Railway.app documentation](https://docs.railway.app)
- [Docker health checks](https://docs.docker.com/engine/reference/builder/#healthcheck)
- [Node.js environment variables](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Database migration best practices](docs/database.md)
