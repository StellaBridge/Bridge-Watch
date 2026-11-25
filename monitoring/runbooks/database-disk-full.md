# Database Disk Full Runbook

Alert: `DatabaseDiskFull` (critical). Use this runbook when PostgreSQL data/WAL volume free space drops below 10% or writes start failing with `No space left on device`. Related alerts: `DbPoolExhaustionWarning`.

## Immediate mitigation

1. Stop non-critical writers before attempting cleanup (batch analytics, index rebuilds, ingestion spikes):
   ```bash
   curl -fsS -X POST http://localhost:3001/api/v1/jobs/pause || true
   docker compose ps postgres
   ```
2. Confirm which filesystem is full and how much space each table uses:
   ```bash
   df -h / /var/lib/postgresql
   du -sh /var/lib/docker/volumes/*/\_data/postgres 2>/dev/null || true
   ```

## Verify the condition

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT name, setting FROM pg_settings WHERE name IN ('data_directory','wal_directory','max_wal_size');"
```

Prometheus:

```promql
node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.10
pg_stat_database_size_bytes{datname="bridge_watch"}
```

## Table bloat cleanup

Identify the largest tables and bloat ratios, then reclaim space **outside peak traffic**:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT relname, n_live_tup, n_dead_tup, round(n_dead_tup::numeric / greatest(n_live_tup,1), 2) AS dead_ratio \
   FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;"

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "VACUUM (ANALYZE, VERBOSE) public.bridge_events;"
```

For tables with > 20% dead tuples, use `VACUUM FULL` or `pg_repack` during a maintenance window; both require an exclusive lock and additional temporary disk space. Do not run them when free space is under 5%.

TimescaleDB hypertables: drop old chunks instead of deleting rows:

```sql
SELECT drop_chunks('public.bridge_events', older_than => INTERVAL '90 days');
```

## WAL pruning

Only proceed when backups are current and replication lag is zero:

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT client_addr, state, sent_lsn, write_lsn, replay_lsn FROM pg_stat_replication;"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pg_size_pretty(sum(size)) AS wal_size FROM pg_ls_waldir();"

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CHECKPOINT;"
```

`CHECKPOINT` allows recycled WAL segments to be reused. Verify the oldest replication slot is not pinning WAL:

```sql
SELECT slot_name, active, restart_lsn FROM pg_replication_slots;
```

Drop only stale (inactive) slots after confirming they are unused. Never delete files from `pg_wal` directly.

## Expand the disk

1. Raise the volume size in the platform (cloud console / `kubectl patch pvc data-postgres-0 -n bridge-watch -p '{"spec":{"resources":{"requests":{"storage":"200Gi"}}}}'`).
2. Resize the filesystem if the platform does not do it automatically (for example `resize2fs /dev/<device>` on the node).
3. Restart PostgreSQL only if the new size is not picked up online, and confirm `df -h` shows the extra capacity.

## Verification commands

```bash
df -h / /var/lib/postgresql
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_is_in_recovery(), now();"
curl -fsS http://localhost:3001/api/v1/health | jq .
curl -fsS http://localhost:3001/api/v1/analytics | jq '.success'
```

The alert is resolved when free space is above 20% for 10 minutes, writes succeed (no `53P03`/`53200` errors in logs), and `node_filesystem_avail_bytes / node_filesystem_size_bytes > 0.20`.

## Rollback criteria

Roll back or pause cleanup if VACUUM FULL/pg_repack blocks writes for more than 5 minutes, replication lag grows beyond 1 GB, or free space drops below 5% during the operation. Cancel the maintenance query (`SELECT pg_cancel_backend(<pid>);`) and expand the disk first. Re-enable paused writers only after verification passes. Escalate to the database on-call if free space continues to fall after cleanup and expansion.
