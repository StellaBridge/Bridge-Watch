# Deployment Incident Timeline

> Issue #1192 — Implement Deployment Incident Timeline for Bridge-Watch.

## Overview

The Deployment Incident Timeline feature records, persists, and queries chronological events during an incident lifecycle, associating timeline entries directly with smart contract deployments (`contract_deployments`).

This provides operational visibility when a contract deployment triggers an incident, or when a rollback/mitigation action is executed against a specific deployment.

---

## Architecture & Integration

```
   ┌─────────────────────────┐               ┌─────────────────────────────┐
   │   contract_deployments  │               │   incident_timeline_events  │
   ├─────────────────────────┤ 1           * ├─────────────────────────────┤
   │ id (uuid PK)            │◄──────────────┤ deployment_id (uuid FK, NULL) │
   │ contract_address        │               │ id (uuid PK)                │
   │ contract_name           │               │ incident_id (varchar)       │
   │ deployment_version      │               │ type (varchar)              │
   └─────────────────────────┘               │ actor (varchar, NULL)       │
                                             │ metadata (jsonb)            │
                                             │ occurred_at (timestamp)     │
                                             └─────────────────────────────┘
```

---

## Database Schema

### `incident_timeline_events`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | Unique event identifier |
| `incident_id` | varchar | NOT NULL, INDEX | Associated incident ID |
| `deployment_id` | uuid | NULL, FK → `contract_deployments(id)` ON DELETE SET NULL, INDEX | Optional contract deployment reference |
| `type` | varchar | NOT NULL, INDEX | Event type label (e.g. `deployment_triggered`, `status_changed`, `rollback_initiated`, `resolved`) |
| `actor` | varchar | NULL | Operator or service identifier |
| `metadata` | jsonb | DEFAULT `{}` | Structured event details |
| `occurred_at` | timestamp | NOT NULL, DEFAULT `now()`, INDEX | Event occurrence timestamp |
| `created_at` | timestamp | DEFAULT `now()` | Record creation timestamp |
| `updated_at` | timestamp | DEFAULT `now()` | Record last updated timestamp |

**Indexes:**
- `(incident_id, occurred_at)`
- `(deployment_id, occurred_at)`

---

## API Surface

All write operations (`POST`, `DELETE`) require `admin` or `operator` authentication scopes.

### Endpoints

| Method | Endpoint | Scopes | Description |
|---|---|---|---|
| `GET` | `/api/v1/incidents/:id/timeline` | Public / Read | Retrieve chronological timeline events for an incident |
| `POST` | `/api/v1/incidents/:id/timeline` | `admin`, `operator` | Append a timeline event (optionally linked to a `deploymentId`) |
| `GET` | `/api/v1/incidents/deployments/:deploymentId/timeline` | Public / Read | Retrieve incident timeline events linked to a specific contract deployment |
| `DELETE` | `/api/v1/incidents/events/:eventId` | `admin`, `operator` | Remove a timeline event by ID |

---

## Authentication & Authorization

Write routes use `authMiddleware({ requiredScopes: ["admin", "operator"] })`. Request payloads are validated with Zod schemas.

---

## Operational Workflows

### Rollout

1. Run database migration:
   ```bash
   npm --workspace=backend run migrate:up
   ```
2. Deploy backend service. New routes will automatically register under `/api/v1/incidents`.

### Rollback

1. Revert backend application deployment.
2. Rollback database migration:
   ```bash
   npm --workspace=backend run migrate:down
   ```
