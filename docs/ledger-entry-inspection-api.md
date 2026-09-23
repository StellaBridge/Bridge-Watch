# Ledger Entry Inspection API (#1200)

Authenticated read-only inspection of Stellar ledger entries via Soroban RPC `getLedgerEntries`.

## Endpoints

- `POST /api/v1/ledger-entries/inspect` — body `{ keys: string[1..100], ledgerSeq?: positiveInt }`.
  `keys` are base64-encoded XDR `LedgerKey`s. Returns `{ entries, notFoundKeys, ledgerSeq?, latestLedgerSeq? }`.
  Each entry: `{ key, entryType, liveUntilLedgerSeq?, lastModifiedLedgerSeq?, entryXdrPreview }`
  (`entryXdrPreview` truncated to 512 chars).
- `GET /api/v1/ledger-entries/latest` — latest ledger passthrough (ledger pinning).

## Behavior / compatibility

- Keys are validated locally (base64 XDR decode) before any RPC call; invalid keys return `400`, never reach upstream.
- Upstream RPC failures return `502` (safe failure, no partial writes — the API is read-only).
- Response shape is additive; new optional fields may be added without breaking clients.

## Auth / validation / observability

- Auth: any valid `x-api-key` or `Authorization: Bearer` token (`authMiddleware()` with no scope gate).
- Validation: zod schema (1–100 keys, optional positive `ledgerSeq`) + XDR decode check.
- Observability: structured `logger.info` per inspection (counts only, no key material) and `logger.error` on upstream failure.

## Rollout / rollback / operator workflow

- Rollout: deploy backend; no migration required. Verify with `GET /latest` then `POST /inspect` with one known key.
- Rollback: revert backend; no data to migrate (stateless read path).
- Workflow: paste base64 ledger key(s) from explorer/RPC into `POST /inspect`; use `notFoundKeys` to distinguish absent vs. expired entries; pin `ledgerSeq` for reproducible reads.
