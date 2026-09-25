# OpenAPI Client Generation Workflow

> Issue #1207 — Implement automated generation of typed API client SDKs from the Bridge-Watch OpenAPI spec.

## Overview

The OpenAPI Client Generation Workflow automates the production of typed client
SDKs (TypeScript, Python, Go, and more) directly from the live OpenAPI 3.x
specification served by the Bridge-Watch backend.

**Key capabilities:**

| Capability | Detail |
|---|---|
| Automated generation | Triggered on spec changes, weekly schedule, or manually |
| Admin API | Full CRUD for generation configs + job lifecycle management |
| Audit trail | Immutable event log per generation job |
| Observability | Stats dashboard + recent-failure visibility |
| Pull-request automation | Generated files automatically proposed via PR |
| Multi-language matrix | TypeScript, Python, Go (extensible) |

---

## Architecture

```
                 ┌─────────────────────────────┐
                 │  GitHub Actions Workflow     │
                 │  openapi-client-generation  │
                 └─────────┬───────────────────┘
                            │ triggers
                 ┌──────────▼───────────┐
                 │  openapi-generator   │  (openapi-generator-cli 7.x)
                 │  per language/target │
                 └──────────┬───────────┘
                            │ writes
         ┌──────────────────▼──────────────────────┐
         │  sdk/generated/<language>/              │
         │  (committed via auto PR)                │
         └─────────────────────────────────────────┘

Admin API (backend)
 /api/v1/admin/openapi-client-gen/*
   configs   → CRUD for generation targets
   jobs      → enqueue / track / cancel generation jobs
   stats     → observability summary
```

---

## Data Model

### `openapi_client_configs`

Stores a generation target per language/framework.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `name` | varchar | Human-readable label |
| `language` | varchar | typescript / python / go / … |
| `generator` | varchar | Generator tool (default: openapi-generator-cli) |
| `generator_version` | varchar? | Pinned version, or null for latest |
| `generator_options` | jsonb | Extra CLI flags / properties |
| `output_path` | varchar | Relative path, e.g. `sdk/generated/typescript` |
| `openapi_source` | varchar | Source spec path (default: `backend/docs/openapi.json`) |
| `enabled` | boolean | |
| `auto_commit` | boolean | Auto-commit generated files to the branch |
| `auto_publish` | boolean | Publish package artifact on success |
| `publish_registry` | varchar? | npm / PyPI registry URL |
| `publish_package_name` | varchar? | |
| `created_by` | uuid? | Operator who created this config |
| `created_at / updated_at` | timestamptz | |
| `deleted_at` | timestamptz? | Soft-delete |

### `openapi_generation_jobs`

One row per generation run.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `config_id` | uuid FK | References `openapi_client_configs` |
| `status` | enum | pending / running / succeeded / failed / cancelled |
| `trigger` | varchar | manual / ci / schedule / webhook |
| `triggered_by` | varchar? | User ID or CI actor |
| `git_ref` | varchar? | Branch or SHA |
| `openapi_spec_sha` | varchar? | SHA-256 of the spec at enqueue time |
| `generator_version_resolved` | varchar? | Actual version used |
| `output_log` | text? | Appended streamed generator output |
| `error_message` | text? | |
| `artifact_urls` | jsonb | Array of artifact download URLs |
| `diff_summary` | jsonb | `{added, modified, deleted}` file counts |
| `committed` | boolean | Whether generated files were auto-committed |
| `published` | boolean | Whether package was published |
| `started_at / completed_at` | timestamptz? | |
| `created_at` | timestamptz | |

### `openapi_generation_events`

Append-only audit trail — one row per state transition or log emission.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `job_id` | uuid FK | References `openapi_generation_jobs` |
| `event_type` | varchar | queued / started / log_line / generated / committed / published / failed / cancelled |
| `payload` | jsonb | Event-specific context |
| `occurred_at` | timestamptz | |

---

## API Surface

All endpoints require the `admin:openapi-client-gen` scope (API key or Bearer token).

### Configs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/openapi-client-gen/` | List configs (optional `?includeDisabled=true`) |
| `GET` | `/api/v1/admin/openapi-client-gen/configs/:id` | Get a single config |
| `POST` | `/api/v1/admin/openapi-client-gen/configs` | Create config |
| `PATCH` | `/api/v1/admin/openapi-client-gen/configs/:id` | Update config |
| `DELETE` | `/api/v1/admin/openapi-client-gen/configs/:id` | Soft-delete config |

### Jobs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/openapi-client-gen/jobs` | List jobs (`?configId=`, `?status=`, `?limit=`, `?offset=`) |
| `GET` | `/api/v1/admin/openapi-client-gen/jobs/:id` | Get job + audit events |
| `POST` | `/api/v1/admin/openapi-client-gen/jobs` | Enqueue a generation job |
| `POST` | `/api/v1/admin/openapi-client-gen/jobs/:id/cancel` | Cancel a pending/running job |

### Observability

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/admin/openapi-client-gen/stats` | Summary statistics |
| `GET` | `/api/v1/admin/openapi-client-gen/supported-languages` | Supported languages & generators |

---

## GitHub Actions Workflow

**File:** `.github/workflows/openapi-client-generation.yml`

### Triggers

| Trigger | When |
|---|---|
| `push` to `main` | Changes to `backend/docs/openapi.json` or the workflow file |
| `schedule` | Every Monday at 03:00 UTC |
| `workflow_dispatch` | On-demand with optional `target_language`, `generator_version`, `dry_run`, `open_pr` inputs |

### Jobs

| Job | Description |
|---|---|
| `validate-spec` | Checks spec exists, is valid JSON, and computes SHA-256 |
| `generate-clients` | Matrix job — one runner per language target |
| `open-pr` | Commits changes and opens a PR if files changed |
| `notify-failure` | Appends failure summary to Actions run summary |

### Generated targets (default matrix)

| Language | Generator | Output path |
|---|---|---|
| TypeScript | typescript-axios | `sdk/generated/typescript/` |
| Python | python | `sdk/generated/python/` |
| Go | go | `sdk/generated/go/` |

---

## Authentication & Authorization

- **Required scope:** `admin:openapi-client-gen`
- Supports both `x-api-key` header and `Authorization: Bearer <token>`
- All write operations are logged in `openapi_generation_events`

---

## Rollout

1. Apply the migration:
   ```bash
   npm --workspace=backend run migrate:up
   ```
2. Deploy the backend (new routes auto-register).
3. Navigate to `/admin/openapi-client-gen` in the admin UI.
4. Create at least one generation config.
5. Click **▶ Generate** or push a spec change to trigger automatic generation.

---

## Rollback

1. To disable a config without deleting it, use `PATCH /configs/:id` with `enabled: false` or the toggle button in the UI.
2. To remove the migration tables:
   ```bash
   npm --workspace=backend run migrate:down
   ```
   The migration rolls back by dropping `openapi_generation_events`, `openapi_generation_jobs`, and `openapi_client_configs` in that order.
3. The GitHub Actions workflow can be disabled via the Actions UI (workflow → "Disable workflow").

---

## Supported Languages & Generators

**Languages:** typescript, javascript, python, go, java, kotlin, ruby, rust, csharp, php, swift

**Generators:** openapi-generator-cli, swagger-codegen, oapi-codegen, openapi-typescript

---

## Observability

- **Metrics:** Generation job counts by status are available via `GET /stats`
- **Audit log:** Every state transition is stored in `openapi_generation_events`
- **GitHub Actions summary:** Each run writes a Markdown table to the step summary
- **Logs:** Appended per-job in `openapi_generation_jobs.output_log`

---

## Testing

```bash
# Run unit tests (no database required)
npm --workspace=backend run test -- tests/services/openApiClientGeneration.service.test.ts

# Run full test suite
npm --workspace=backend run test
```

The unit test suite covers:
- Config row mapping (including JSON parsing from DB)
- `listConfigs` / `getConfig` with empty / populated results
- `enqueueJob` validation (missing config, disabled config)
- `cancelJob` returning null for non-cancellable jobs
- `deleteConfig` soft-delete (returns true/false)
- `getStats` with empty tables
