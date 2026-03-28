# Bridge Watch Redis Caching Strategy

This document outlines the caching strategy implemented across the Bridge Watch backend to enhance performance, ensure graceful degradation during failures, and handle cache invalidate correctly.

## 1. Objectives

- **Performance**: Reduce latency for high-traffic endpoints (e.g. Analytics and Prices).
- **Graceful Degradation**: Continue serving data from primary sources (DB/APIs) if Redis is unavailable.
- **Cache Cluster Support**: Enable `ioredis` to operate in a clustered environment for production reliability.
- **Intelligent Invalidation**: Automatically purge outdated data using tags.

## 2. Architecture & Components

### `CacheService` (`backend/src/utils/cache.ts`)
A centralized wrapper (`CacheService.getOrSet`) handles:
- Fetching data from Redis or executing a fetcher fallback.
- Auto-serialization/deserialization.
- Gracefully handling exceptions if a Redis `GET` or `SET` operation fails.
- Tracking analytics (Hits, Misses, Errors, Invalidations, Bypassed).
- Binding logical **tags** to Redis keys (using Redis sets).

### `config/redis.ts`
Manages the cluster configuration. Activates `Cluster` mode when `NODE_ENV === "production"` and `REDIS_CLUSTER === "true"`. Uses `maxRetriesPerRequest` and custom retry strategies to prevent blocking.

## 3. TTL Configuration

Different models require different durations (defined in `CacheTTL` enum):

| Domain | TTL (Seconds) | Rationale |
|---|---|---|
| **Analytics/Stats** | 300 (5 mins) | Time-series aggregations update slowly; near-real-time is sufficient. |
| **Prices** | 60 (1 min) | Price volatility requires frequent refreshes to maintain accuracy. |
| **Asset Metadata** | 3600 (1 hr) | Asset metadata changes very infrequently. |
| **Health Scores** | 600 (10 mins) | Health scores are generated periodically. |

## 4. Key Naming Conventions

Keys are generated consistently via `CacheService.generateKey(namespace, id)`:
- Pattern: `cache:<namespace>:<identifier>`
- Examples: 
  - `cache:analytics:protocol:stats`
  - `cache:price:aggregated:USDC`

Tag sets are stored internally as: `cache:tag:<tag_name>`

## 5. Cache Invalidation and Bypass

### Tag-based Invalidation
When modifying underlying database records (e.g., a new bridge transaction occurs), the caching layer provides `.invalidateByTag("analytics")` to bust all related cached content rather than individually tracing strings.

### Bypass (Force Refresh)
Administrative requests and backend jobs can inject `?forceRefresh=true` into API endpoints. This triggers `CacheService` to completely ignore Redis, query the database or external APIs, and subsequently update the Redis payload with fresh data.

## 6. Cache Warming Strategy

To prevent a sudden thundering herd of queries on cold starts, the `backend/src/jobs/cacheWarming.ts` script fetches heavily queried calculations:
- Protocol-wide analytics
- Asset Rankings
- Bridge Comparisons
- Aggregated Prices

We recommend running this via a scheduler (e.g., Cron or k8s Job) periodically or strictly as part of the build/deployment pipeline initiation.

## 7. Metrics & Monitoring
A local memory collector inside `CacheService` watches cache performance.
The `/api/v1/cache/stats` endpoint exposes:
- **Hits/Misses**: Validating cache efficiency.
- **Errors**: Spotting connectivity issues.
- **Bypassed**: Track forceful refresh volume.
- **Invalidations**: Keep track of cache clearing activities.
