# Redis Alert Runbooks

These alerts rely on [redis_exporter](https://github.com/oliver006/redis_exporter) metrics
(`redis_mem_fragmentation_ratio`, `redis_evicted_keys_total`). Redis backs sessions,
rate-limiting counters and BullMQ queues, so evictions have user-visible impact.

## RedisMemoryFragmentationHigh

Severity: `warning`. Fires when `redis_mem_fragmentation_ratio > 1.5` for 15 minutes,
meaning Redis holds noticeably more RSS than its dataset needs.

1. Confirm the ratio and memory figures:
   `redis-cli INFO memory` (check `mem_fragmentation_ratio`, `used_memory_human`,
   `used_memory_rss_human`, `maxmemory_human`).
2. If `used_memory` is very small (tens of MB), a high ratio is expected and harmless;
   silence the alert for that instance.
3. Check for a recent mass expiry or key deletion (large BullMQ cleanup, session purge),
   which commonly leaves fragmented pages behind.
4. Enable active defragmentation (Redis 4+ with jemalloc):
   `redis-cli CONFIG SET activedefrag yes`, then watch the ratio over the next hour.
5. If the ratio stays high and memory is near `maxmemory`, fail over to a replica or
   restart the instance in a low-traffic window. Expect session and rate-limit state to
   reset if there is no persistence or replica.
6. Escalate to the platform on-call if the ratio exceeds 2.0 or `RedisKeyEvictionsOccurring`
   also fires.

## RedisKeyEvictionsOccurring

Severity: `critical`. Fires when `rate(redis_evicted_keys_total[5m]) > 0` for 5 minutes,
meaning Redis has reached `maxmemory` and is dropping keys.

1. Confirm memory pressure and policy:
   `redis-cli INFO memory`, `redis-cli INFO stats | grep evicted_keys`,
   `redis-cli CONFIG GET maxmemory-policy`.
2. Find what is consuming memory: `redis-cli --bigkeys` and `redis-cli --memkeys`
   (both use `SCAN` and are safe on a live instance; avoid `KEYS *` and `MONITOR`).
3. Check BullMQ for unbounded growth of completed or failed job sets, and make sure
   `removeOnComplete` / `removeOnFail` limits are applied.
4. Mitigate:
   - Raise `maxmemory` if the host has headroom (`CONFIG SET maxmemory <bytes>`, then
     persist the change in the deployment config).
   - Prefer `volatile-lru` / `volatile-ttl` so keys without a TTL (queue state) are not
     evicted. `allkeys-*` policies can evict BullMQ data and corrupt queues.
   - Trim the oversized keys found in step 2 at the source rather than deleting them by hand.
5. Watch for side effects: users being logged out, rate limits resetting, or job failures.
   Notify the API team if sessions are affected.
6. Resolve once the eviction rate has been 0 for 15 minutes and memory sits below 90% of
   `maxmemory`. File a capacity follow-up if the instance needs to be resized.
