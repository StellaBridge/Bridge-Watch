# Horizontal Scaling Guide

## Overview

This guide provides recommendations for scaling Bridge Watch horizontally to handle increased traffic and workload. It covers backend API scaling, worker scaling, database replication, Redis clustering, and frontend CDN strategies.

## Architecture Overview

Bridge Watch follows a microservices-inspired architecture with these scalable components:

```
┌─────────────────┐
│   CDN/Cache     │ ← Frontend static assets
└────────┬────────┘
         │
┌────────▼────────┐
│  Load Balancer  │ ← Distributes traffic
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼───┐
│ API  │  │ API  │ ← Stateless backend pods
│ Pod  │  │ Pod  │
└───┬──┘  └──┬───┘
    │         │
    └────┬────┘
         │
┌────────▼────────┐
│  Redis Cluster  │ ← Session cache, BullMQ
└────────┬────────┘
         │
┌────────▼────────┐
│  Primary DB     │
└────────┬────────┘
         │
    ┌────┴────┐
┌───▼──┐  ┌──▼───┐
│Read  │  │Read  │ ← Read replicas
│Rep 1 │  │Rep 2 │
└──────┘  └──────┘
```

## Backend API Horizontal Scaling

### Stateless Design

The Backend API is designed to be stateless, making it suitable for horizontal scaling:

- **No in-memory session storage** - Sessions stored in Redis
- **No local file storage** - Uses object storage (S3, etc.)
- **No in-process caching** - Uses Redis for shared cache
- **No sticky sessions required** - Any pod can serve any request

### Deployment Configuration

#### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bridge-watch-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: bridge-watch-api
  template:
    metadata:
      labels:
        app: bridge-watch-api
    spec:
      containers:
      - name: api
        image: bridge-watch/api:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: bridge-watch-secrets
              key: redis-url
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: bridge-watch-secrets
              key: database-url
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: bridge-watch-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: bridge-watch-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Scaling Thresholds

| Metric | Scale Up When | Scale Down When |
|--------|---------------|-----------------|
| CPU | > 70% for 3 min | < 30% for 10 min |
| Memory | > 80% for 3 min | < 40% for 10 min |
| Request Rate | > 1000 req/s per pod | < 200 req/s per pod |
| Response Time | p95 > 500ms | p95 < 200ms for 10 min |

### Load Balancing Strategy

Use a Layer 7 (HTTP) load balancer with these settings:

- **Algorithm:** Round robin or least connections
- **Health Checks:** HTTP GET /health every 10 seconds
- **Connection Timeout:** 60 seconds
- **Keep-Alive:** Enabled (120 seconds)
- **Session Affinity:** None (stateless)

## Worker Scaling (BullMQ)

### Worker Architecture

Bridge Watch uses BullMQ for background job processing:

```
┌──────────────┐
│ API Pods     │ ← Enqueue jobs
└───────┬──────┘
        │
┌───────▼──────────┐
│ Redis (BullMQ)   │ ← Job queue
└───────┬──────────┘
        │
   ┌────┴────┐
┌──▼───┐ ┌──▼───┐
│Worker│ │Worker│ ← Process jobs
│ Pod 1│ │ Pod 2│
└──────┘ └──────┘
```

### Job Types and Concurrency

| Job Type | Concurrency | Duration | Priority |
|----------|-------------|----------|----------|
| Price updates | 10 | ~1s | High |
| Health checks | 5 | ~5s | High |
| Analytics aggregation | 2 | ~30s | Medium |
| Report generation | 1 | ~60s | Low |
| Email notifications | 5 | ~2s | Medium |

### Worker Configuration

```typescript
// worker.ts
import { Worker } from 'bullmq';
import { redisConnection } from './config/redis.js';

const worker = new Worker(
  'price-updates',
  async (job) => {
    // Process job
    await processPriceUpdate(job.data);
  },
  {
    connection: redisConnection,
    concurrency: process.env.WORKER_CONCURRENCY || 10,
    limiter: {
      max: 100,
      duration: 1000, // 100 jobs per second max
    },
    settings: {
      backoffStrategies: {
        exponential: (attemptsMade: number) => {
          return Math.min(30000, Math.pow(2, attemptsMade) * 1000);
        },
      },
    },
  }
);
```

### Kubernetes Worker Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bridge-watch-worker-price
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bridge-watch-worker
      type: price-updates
  template:
    metadata:
      labels:
        app: bridge-watch-worker
        type: price-updates
    spec:
      containers:
      - name: worker
        image: bridge-watch/worker:latest
        env:
        - name: WORKER_TYPE
          value: "price-updates"
        - name: WORKER_CONCURRENCY
          value: "10"
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: bridge-watch-secrets
              key: redis-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: bridge-watch-worker-price-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: bridge-watch-worker-price
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: External
    external:
      metric:
        name: bullmq_queue_waiting
        selector:
          matchLabels:
            queue: price-updates
      target:
        type: AverageValue
        averageValue: "100"
```

### Worker Scaling Strategy

Scale workers based on queue depth:

| Queue Waiting Jobs | Worker Replicas | Action |
|--------------------|-----------------|--------|
| 0-100 | 2 | Baseline |
| 100-500 | 4 | Scale up gradually |
| 500-1000 | 8 | Scale up aggressively |
| > 1000 | 10 | Maximum capacity |

Monitor these metrics:
- Queue waiting jobs count
- Job processing time (p50, p95, p99)
- Job failure rate
- Worker CPU and memory usage

## Database Scaling

### Primary Database

The primary database handles all writes and some reads:

- **Instance Type:** High-memory, high-IOPS (e.g., db.r6g.2xlarge)
- **Storage:** Provisioned IOPS SSD (io2)
- **Connections:** Connection pooling (see below)
- **Backups:** Automated daily snapshots

### Read Replicas

Configure read replicas for scaling read operations:

```
Primary (Write)
    ├── Replica 1 (Read) ← Analytics queries
    ├── Replica 2 (Read) ← Dashboard queries
    └── Replica 3 (Read) ← Report generation
```

#### Read Replica Configuration

```javascript
// database/connection.ts
import { Knex } from 'knex';

const primaryConfig = {
  client: 'postgresql',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 5,
    max: 20,
  },
};

const readReplicaConfig = {
  client: 'postgresql',
  connection: process.env.DATABASE_READ_REPLICA_URL,
  pool: {
    min: 10,
    max: 50,
  },
};

export const primaryDb = Knex(primaryConfig);
export const readReplicaDb = Knex(readReplicaConfig);

// Use primary for writes
export async function createAsset(data) {
  return primaryDb('assets').insert(data);
}

// Use replica for reads
export async function getAssets() {
  return readReplicaDb('assets').select('*');
}
```

### Connection Pooling

Optimize connection pool sizes based on replica count:

| Component | Primary Connections | Replica Connections |
|-----------|---------------------|---------------------|
| API Pod | 5-10 | 10-20 |
| Worker Pod | 2-5 | 5-10 |
| Analytics Service | 2-5 | 20-40 |

**Formula:**
```
Total Connections = (API Pods × API Connections) + (Worker Pods × Worker Connections)
```

Ensure total connections < database max_connections (typically 500-1000).

### Query Optimization for Scaling

1. **Use appropriate indexes**
   ```sql
   CREATE INDEX idx_assets_health_score ON assets(health_score);
   CREATE INDEX idx_bridges_status ON bridges(status, updated_at);
   ```

2. **Partition large tables**
   ```sql
   -- Partition transactions by month
   CREATE TABLE transactions (
     id UUID,
     created_at TIMESTAMP,
     ...
   ) PARTITION BY RANGE (created_at);
   ```

3. **Use materialized views for heavy aggregations**
   ```sql
   CREATE MATERIALIZED VIEW asset_daily_stats AS
   SELECT
     asset_code,
     DATE(created_at) as date,
     COUNT(*) as transaction_count,
     SUM(amount) as total_volume
   FROM transactions
   GROUP BY asset_code, DATE(created_at);
   ```

## Redis Cluster Setup

### Architecture

Use Redis Cluster for high availability and horizontal scaling:

```
┌─────────────────────────────────┐
│        Redis Cluster            │
│                                 │
│  ┌────────┐  ┌────────┐        │
│  │Master 1│  │Master 2│  ...   │
│  └───┬────┘  └───┬────┘        │
│      │           │              │
│  ┌───▼────┐  ┌──▼─────┐       │
│  │Replica │  │Replica │  ...   │
│  └────────┘  └────────┘        │
└─────────────────────────────────┘
```

### Configuration

```yaml
# redis-cluster.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-cluster-config
data:
  redis.conf: |
    cluster-enabled yes
    cluster-config-file nodes.conf
    cluster-node-timeout 5000
    appendonly yes
    maxmemory 2gb
    maxmemory-policy allkeys-lru
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis-cluster
spec:
  serviceName: redis-cluster
  replicas: 6
  selector:
    matchLabels:
      app: redis-cluster
  template:
    metadata:
      labels:
        app: redis-cluster
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
          name: client
        - containerPort: 16379
          name: gossip
        command:
        - redis-server
        - /conf/redis.conf
        volumeMounts:
        - name: conf
          mountPath: /conf
        - name: data
          mountPath: /data
        resources:
          requests:
            memory: "2Gi"
            cpu: "500m"
          limits:
            memory: "4Gi"
            cpu: "1000m"
      volumes:
      - name: conf
        configMap:
          name: redis-cluster-config
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi
```

### BullMQ with Redis Cluster

```typescript
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const clusterNodes = [
  { host: 'redis-cluster-0', port: 6379 },
  { host: 'redis-cluster-1', port: 6379 },
  { host: 'redis-cluster-2', port: 6379 },
  { host: 'redis-cluster-3', port: 6379 },
  { host: 'redis-cluster-4', port: 6379 },
  { host: 'redis-cluster-5', port: 6379 },
];

const connection = new Redis.Cluster(clusterNodes);

const queue = new Queue('my-queue', { connection });
const worker = new Worker('my-queue', processJob, { connection });
```

## Frontend CDN Caching Strategy

### Static Assets

Serve static assets (JS, CSS, images) from CDN with aggressive caching:

```nginx
# nginx.conf for CDN origin
location /static/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header X-Content-Type-Options "nosniff";
    add_header X-Frame-Options "SAMEORIGIN";
}
```

**CDN Configuration:**
- **TTL:** 1 year for versioned assets
- **Invalidation:** Automatic on new deployment (versioned URLs)
- **Compression:** Gzip and Brotli enabled
- **HTTP/2:** Enabled

### API Response Caching

Cache API responses at CDN edge:

```javascript
// Add cache headers to responses
app.get('/api/v1/assets', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60'); // 1 minute
  res.set('CDN-Cache-Control', 'max-age=300'); // 5 minutes at CDN
  res.json(assets);
});
```

**Caching Strategy by Endpoint:**

| Endpoint | Cache Duration | Reason |
|----------|----------------|--------|
| `/api/v1/assets` | 60s | Frequently updated |
| `/api/v1/bridges` | 120s | Moderate update frequency |
| `/api/v1/transactions/:id` | 3600s | Immutable after confirmation |
| `/api/v1/analytics/summary` | 300s | Aggregated data |

### Cache Invalidation

Implement cache invalidation for critical updates:

```typescript
import { invalidateCDN } from './cdn-client.js';

async function updateAssetHealth(assetId, newScore) {
  await db('assets').where('id', assetId).update({ health_score: newScore });
  
  // Invalidate CDN cache
  await invalidateCDN([
    `/api/v1/assets/${assetId}`,
    `/api/v1/assets`,
  ]);
}
```

## Capacity Planning

### Resource Formulas

**API Pods:**
```
Required Pods = (Peak RPS × Avg Response Time) / (1000 × CPU Cores per Pod × CPU Efficiency)
```

Example: 10,000 RPS, 100ms response time, 2 CPU cores, 70% efficiency
```
= (10000 × 0.1) / (1000 × 2 × 0.7) = 1000 / 1400 ≈ 0.71

Round up with buffer: 3 pods minimum
```

**Worker Pods:**
```
Required Workers = Peak Queue Depth / (Concurrency × Processing Rate)
```

Example: 1000 jobs queued, concurrency 10, 2 jobs/second
```
= 1000 / (10 × 2) = 50 workers

Or scale based on acceptable queue time
```

**Database Connections:**
```
Required Connections = (API Pods + Worker Pods) × Connections per Pod
```

Example: 5 API pods, 3 worker pods, 10 connections each
```
= (5 + 3) × 10 = 80 connections
```

### Monitoring Thresholds

Set alerts for these metrics:

| Metric | Warning | Critical |
|--------|---------|----------|
| API CPU | > 70% | > 85% |
| API Memory | > 75% | > 90% |
| DB Connections | > 70% | > 85% |
| Redis Memory | > 75% | > 90% |
| Queue Depth | > 500 | > 1000 |
| Response Time p95 | > 500ms | > 1000ms |

## Scaling Checklist

### Before Scaling Up

- [ ] Review current resource utilization
- [ ] Identify bottlenecks (CPU, memory, I/O, network)
- [ ] Check for N+1 queries or inefficient code
- [ ] Verify database indexes are optimal
- [ ] Review slow query logs
- [ ] Check connection pool sizes
- [ ] Validate cache hit rates

### During Scale-Up

- [ ] Scale gradually (add 20-50% capacity at a time)
- [ ] Monitor health checks
- [ ] Watch error rates and latency
- [ ] Verify load distribution is even
- [ ] Check database connection count
- [ ] Monitor queue processing rates

### After Scale-Up

- [ ] Validate performance improvement
- [ ] Review cost increase
- [ ] Document new baseline metrics
- [ ] Adjust alert thresholds if needed
- [ ] Schedule capacity planning review

## Common Pitfalls

1. **Database Connection Exhaustion**
   - Symptom: Timeouts, connection errors
   - Fix: Reduce pool sizes per pod, add connection pooler (PgBouncer)

2. **Redis Memory Pressure**
   - Symptom: Evictions, slow responses
   - Fix: Increase memory, adjust eviction policy, add cluster nodes

3. **Uneven Load Distribution**
   - Symptom: Some pods overloaded, others idle
   - Fix: Check health checks, review load balancer algorithm

4. **Session Affinity Leak**
   - Symptom: Pods not scaling down, uneven load
   - Fix: Ensure stateless design, remove sticky sessions

5. **Cascade Failures**
   - Symptom: One service failure causes others to fail
   - Fix: Implement circuit breakers, timeouts, bulkheads

## Testing Scaling

### Load Testing

Use tools like k6 or Artillery to simulate load:

```javascript
// load-test.js (k6)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 200 },   // Ramp up to 200 users
    { duration: '5m', target: 200 },   // Stay at 200 users
    { duration: '2m', target: 0 },     // Ramp down to 0 users
  ],
};

export default function () {
  const res = http.get('https://api.bridge-watch.example.com/api/v1/assets');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

Run: `k6 run load-test.js`

### Chaos Engineering

Test resilience by introducing failures:

```bash
# Kill random API pod
kubectl delete pod -l app=bridge-watch-api --field-selector=status.phase=Running --randomize

# Introduce network latency
kubectl exec -it redis-cluster-0 -- tc qdisc add dev eth0 root netem delay 100ms

# Simulate database connection issues
kubectl exec -it postgres-primary -- pg_ctl stop -m fast
```

## Additional Resources

- Kubernetes documentation: https://kubernetes.io/docs
- BullMQ documentation: https://docs.bullmq.io
- Redis Cluster tutorial: https://redis.io/docs/manual/scaling
- PostgreSQL replication: https://www.postgresql.org/docs/current/runtime-config-replication.html

## Support

For scaling assistance:
- Architecture review: architecture@bridge-watch.example.com
- DevOps support: devops@bridge-watch.example.com
- GitHub Discussions: https://github.com/StellaBridge/Bridge-Watch/discussions
