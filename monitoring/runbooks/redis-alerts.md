# Redis Alerts Runbook

This runbook covers alert responses for Redis cache infrastructure degradation and memory management failures.

## RedisMemoryFragmentationHigh

**Trigger Condition:** `redis_memory_fragmentation_ratio > 1.5` for 15 minutes

High memory fragmentation indicates inefficient memory allocation in Redis, where the RSS (Resident Set Size) is significantly larger than the actual data size. This leads to wasted system memory and can eventually cause out-of-memory crashes.

### Diagnostic Steps

1. **Confirm fragmentation level:**
   ```
   redis-cli INFO memory | grep mem_fragmentation_ratio
   ```
   - Healthy: < 1.3
   - Warning: 1.3 - 1.5
   - Critical: > 1.5

2. **Check peak memory usage:**
   ```
   redis-cli INFO memory | grep used_memory_peak_human
   ```

3. **Inspect evictions and eviction policies:**
   ```
   redis-cli INFO stats | grep evicted_keys
   redis-cli CONFIG GET maxmemory-policy
   ```

4. **Review active keys and data patterns:**
   ```
   redis-cli DBSIZE
   redis-cli --bigkeys
   redis-cli --memkeys
   ```

### Remediation Steps

1. **Restart Redis (preferred for persistent issues):**
   - Ensure replicas are healthy before restarting primary
   - Restart during low-traffic window if possible
   - Trigger failover to replica if available, then restart primary

2. **Adjust memory allocation (for applications):**
   - If fragmentation is temporary, monitor for 5+ minutes before restarting
   - Consider reducing data retention periods or key TTLs
   - Implement SCAN-based cleanup for stale session keys

3. **Review memory policy:**
   ```
   # For critical caches (rate-limiting, sessions):
   redis-cli CONFIG SET maxmemory-policy allkeys-lru
   
   # For less critical caches:
   redis-cli CONFIG SET maxmemory-policy volatile-ttl
   ```

4. **Monitor defragmentation:**
   - Some Redis versions support automatic fragmentation: `CONFIG SET active-defrag-threshold-lower 10`
   - Check if native defragmentation will stabilize the ratio

### Escalation

- If fragmentation persists > 2.0 or causes evictions, escalate to infrastructure team
- If memory pressure is due to stuck long-running commands or clients, review application logs
- Coordinate with on-call backend engineer if rate-limiting or session data is affected

---

## RedisKeyEvictionsOccurring

**Trigger Condition:** `rate(redis_evicted_keys_total[5m]) > 0` for 5 minutes

Key evictions indicate Redis has reached its memory limit and is removing keys to stay within the configured `maxmemory`. This immediately impacts rate-limiting, session tracking, and cache hit rates, potentially degrading service availability.

### Diagnostic Steps

1. **Check eviction rate and policy:**
   ```
   redis-cli INFO stats | grep evicted_keys_total
   redis-cli CONFIG GET maxmemory
   redis-cli CONFIG GET maxmemory-policy
   ```

2. **Identify which keys are being evicted:**
   - Monitor with `redis-cli MONITOR | grep DEL` during evictions
   - Correlate eviction timing with application events (batch imports, session storms)

3. **Measure current memory utilization:**
   ```
   redis-cli INFO memory | grep used_memory_human
   redis-cli INFO memory | grep maxmemory_human
   ```

4. **Count active keys by type:**
   ```
   redis-cli INFO keyspace
   redis-cli SCAN 0 TYPE string | wc -l  # sample scan for string keys
   ```

5. **Check for client connection leaks:**
   ```
   redis-cli INFO clients | grep connected_clients
   redis-cli CLIENT LIST | wc -l
   ```

### Remediation Steps

1. **Increase memory limit immediately (if possible):**
   ```
   redis-cli CONFIG SET maxmemory <new-size-in-bytes>
   redis-cli CONFIG REWRITE  # Persist to config file
   ```

2. **Optimize eviction policy:**
   - For rate-limiting keys: Use `volatile-ttl` to evict oldest expiring keys first
   - For session caches: Use `allkeys-lru` to evict least-recently-used regardless of TTL
   - For hybrid use cases: Monitor which types of keys are critical and configure accordingly

3. **Aggressive cleanup of non-critical data:**
   ```
   # Example: Remove keys older than 7 days (requires TTL scanning)
   redis-cli EVAL "
     local keys = redis.call('KEYS', '*')
     for i,k in ipairs(keys) do
       local ttl = redis.call('TTL', k)
       if ttl > 0 and ttl < 604800 then  -- less than 7 days
         redis.call('DEL', k)
       end
     end
     return #keys
   " 0
   ```

4. **Identify and kill long-running commands:**
   ```
   redis-cli SLOWLOG GET 10  # Check for slow operations holding memory
   redis-cli COMMAND INFO SCAN  # Review expensive operations
   ```

5. **Close idle client connections:**
   ```
   # Identify idle clients and close them
   redis-cli CLIENT LIST | grep idle
   redis-cli CLIENT KILL TYPE normal
   ```

### Application-Level Response

- **Backend**: Implement graceful cache-miss handling; alert application teams to expect higher backend latency
- **Rate-limiting**: Route-based rate-limiting may be less precise; consider fallback to per-IP limits
- **Sessions**: Session loss risk; consider triggering re-authentication wave during low-traffic window

### Escalation & Long-Term Fix

1. **Immediate (< 1 hour):**
   - Increase memory or clean non-critical keys
   - Switch to higher-retention eviction policy if data loss is unacceptable

2. **Short-term (1-24 hours):**
   - Review data retention policies; reduce TTLs for less-critical keys
   - Profile application to find memory leaks or inefficient caching patterns
   - Implement scheduled cache warming and garbage collection

3. **Long-term (1+ week):**
   - Provision larger Redis instance or add replicas for distributing cache load
   - Implement Redis Cluster for horizontal scaling
   - Migrate infrequently-accessed cache to external store (S3, DynamoDB) with async refresh

### Monitoring Recovery

After resolution, monitor for 1+ hours to confirm:
- Eviction rate returns to 0
- Memory usage stabilizes below 90% of limit
- Fragment ratio improves (may take 24+ hours for full recovery)
- Application latency and error rates return to baseline

---

## See Also

- [Redis Memory Management](https://redis.io/docs/reference/memory-optimization/)
- [Redis Eviction Policies](https://redis.io/docs/reference/eviction/)
- [Prometheus Redis Exporter Metrics](https://github.com/oliver006/redis_exporter)
