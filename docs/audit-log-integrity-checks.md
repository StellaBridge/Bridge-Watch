# Audit Log Integrity Checks (#1181)

Chain + checksum verification over `audit_logs` to detect tampering or corruption.

## Endpoints

- `GET /api/v1/admin/audit/integrity?limit=1..5000&from=ISO&to=ISO` — verifies an ordered window (oldest first).
  Returns `{ checked, intact, failures[0..100], firstCheckedAt, lastCheckedAt }`.
  Failure reasons: `checksum_mismatch` (stored checksum ≠ recomputed) or `chain_break`
  (`previous_checksum` ≠ predecessor checksum, window-scoped).
- `GET /api/v1/admin/audit/:id/verify` (existing) — single-entry checksum check.

## Behavior / compatibility

- Legacy rows without `previous_checksum` get per-entry checksum verification only; chained rows additionally get continuity checks.
- Chain linkage is window-scoped: the first row in a window has no predecessor to compare, so it is not flagged.
- Response is additive; existing audit list/get/stats/export endpoints unchanged.

## Auth / validation / safe failure

- Auth: `admin:audit` scope (same as other audit reads); rate-limited to 10 req/min.
- Validation: `limit` clamped to 1–5000 (`400` otherwise); `from`/`to` parsed as dates.
- Safe failure: read-only; verification never mutates logs; errors return `500` with no partial state.

## Rollout / rollback / operator workflow

- Rollout: deploy backend; no migration. Run `GET /integrity?limit=100` to baseline; schedule periodic checks (e.g. hourly full-window) and alert on `intact: false`.
- Rollback: revert backend; no data change.
- Workflow: on `intact: false`, inspect `failures[].id` via `GET /:id`, compare `checksum_mismatch` (row edited) vs `chain_break` (row inserted/deleted/reordered), then follow incident response.
