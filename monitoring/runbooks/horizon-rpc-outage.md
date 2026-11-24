# Horizon RPC Outage Runbook

Alert: `HorizonRpcOutage` (critical). Use this runbook when Stellar Horizon stops serving requests, returns sustained 5xx responses, or breaches its latency budget. Related alerts: `HorizonCursorLagHigh`.

## Symptoms

- `probe_success{job="horizon-rpc"} == 0` for more than 2 minutes.
- Ingestion cursors stop advancing; `GET /api/v1/horizon-cursor-audit` reports stale positions.
- Bridge verification and price feeds log Horizon timeout errors.

## Verify the outage

```bash
PRIMARY="${STELLAR_HORIZON_URL:-https://horizon.stellar.org}"
FALLBACK="${STELLAR_HORIZON_FALLBACK_URL:-https://horizon-testnet.stellar.org}"

curl -fsS --max-time 10 "$PRIMARY/health" && echo "primary healthy"
curl -fsS --max-time 10 "$FALLBACK/health" && echo "fallback healthy"

curl -fsS http://localhost:3001/api/v1/health | jq '.dependencies.horizon_rpc // .horizon'
curl -fsS http://localhost:3001/api/v1/horizon-streams/checkpoints | jq .
```

Check upstream status before changing configuration; a provider-wide outage makes all nodes equally unavailable.

## Switch to a fallback RPC node

1. Confirm the fallback passes `/health`, `/ledgers?limit=1`, and `/network` checks from the same host as the backend.
2. Record the current value for rollback:
   ```bash
   echo "Previous PRIMARY=$PRIMARY"
   kubectl -n bridge-watch get configmap backend-config -o jsonpath='{.data.STELLAR_HORIZON_URL}' > /tmp/horizon-url.backup
   ```
   For local Docker deployments, back up the values in `.env` / `docker-compose.dev.yml` instead.
3. Point the backend at the fallback:
   ```bash
   kubectl -n bridge-watch set env deployment/bridge-watch-backend STELLAR_HORIZON_URL="$FALLBACK"
   kubectl -n bridge-watch rollout status deployment/bridge-watch-backend --timeout=5m
   ```
   Docker Compose: set `STELLAR_HORIZON_URL=$FALLBACK` in the environment file and `docker compose up -d --force-recreate backend`.
4. Restart stalled Horizon workers/streams if their cursors did not resume:
   ```bash
   kubectl -n bridge-watch rollout restart deployment/bridge-watch-horizon-worker
   curl -fsS -X POST http://localhost:3001/api/v1/horizon-streams/<streamId>/resume
   ```
5. Re-sync from the last audited cursor with `POST /api/v1/horizon-cursor-audit/:cursorKey/reconcile` if discrepancies are reported. Do not advance cursors past the last verified ledger.

## Verification commands

```bash
curl -fsS --max-time 10 "$FALLBACK/ledgers?limit=1" | jq '._embedded.records[0].sequence'
curl -fsS http://localhost:3001/api/v1/health | jq '.status'
curl -fsS http://localhost:3001/api/v1/horizon-cursor-audit/discrepancies | jq '.data | length'
```

Prometheus (`http://localhost:9090/graph`):

```promql
probe_success{job="horizon-rpc"} == 1
time() - horizon_cursor_last_sync_timestamp < 300
rate(horizon_rpc_errors_total[5m]) == 0
```

## Rollback criteria

Roll back to the previous node when the original provider recovers (`/health` and `/ledgers` succeed for 5 consecutive minutes), **or** when the fallback returns a different network passphrase (check `/network`), a higher error rate, or stale ledger heights. Restore with:

```bash
PREVIOUS="$(cat /tmp/horizon-url.backup)"
kubectl -n bridge-watch set env deployment/bridge-watch-backend STELLAR_HORIZON_URL="$PREVIOUS"
kubectl -n bridge-watch rollout status deployment/bridge-watch-backend --timeout=5m
```

Page the bridge on-call if ingestion remains stalled for 15 minutes after switching, or if cursor reconciliation reports data loss.
