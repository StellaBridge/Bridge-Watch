# Runtime Configuration Diff View (#1189)

Version-to-version diff for runtime configs stored in `config_versions`.

## Endpoints

- `GET /api/v1/admin/config-versions/:configKey/diff/:fromVersion/:toVersion` (new) — diff any two versions.
  Returns `{ configKey, fromVersion, toVersion, diff, impactSummary }` where each diff row is
  `{ field, currentValue, targetValue, changeType: added|removed|modified }`.
- Existing: `GET /:configKey` (history), `GET /:configKey/current`, `GET /:configKey/rollback-preview/:v`
  (current-vs-target), `POST /:configKey/rollback/:v` (apply). Unchanged.

## Behavior / compatibility

- `compareVersions` reuses the same `computeDiff` as rollback previews, so diff rows render identically.
- Equal versions return `400`; missing versions return `404`. No writes — history is append-only.
- UI: existing `Config rollback preview` page (`/admin/config-rollback`) renders the diff table;
  the new endpoint lets operators compare any pair (e.g. v3 vs v7) without designating a rollback target.

## Auth / validation / observability

- Auth: `admin:config-versions` scope; optional `REQUIRE_APPROVAL_FOR_ROLLBACK` gate still applies to apply-only.
- Validation: both versions must be positive integers; both rows must exist.
- Observability: version creation/rollback already emit structured logs; diff reads are stateless (no extra logging to avoid noise).

## Rollout / rollback / operator workflow

- Rollout: deploy backend; no migration. Verify `GET diff/1/2` on a known key.
- Rollback: revert backend; `config_versions` rows are append-only and unaffected.
- Workflow: load history for a key → pick two versions → `GET diff` → review `impactSummary` + per-field rows → apply rollback only if the diff matches intent.
