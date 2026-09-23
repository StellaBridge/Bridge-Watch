# Soroban Contract Instance Discovery (#1198)

Batch discovery of Soroban contract instances via RPC `getLedgerEntries` on instance keys.

## Endpoints

- `POST /api/v1/soroban-contracts/discover` — body `{ contractIds: string[1..50], ledgerSeq? }`.
  Returns `{ discovered, instances: [{ contractId, exists, wasmHash?, lastModifiedLedgerSeq?, liveUntilLedgerSeq?, lastSeenLedgerSeq? }] }`.
- `GET /api/v1/soroban-contracts/known?limit=1..500` — known IDs from `soroban_events` + env
  (`CIRCUIT_BREAKER_CONTRACT_ID`, `LIQUIDITY_CONTRACT_ADDRESS`).
- `GET /api/v1/soroban-contracts/:contractId` — single-instance probe (`404` when absent on-chain).

## Behavior / compatibility

- Instance keys use `Contract.getFootprint()` with manual XDR fallback; addresses validated as `C...` (StrKey family).
- Partial batches are re-probed individually to avoid misattributing entries to the wrong contract.
- Persistence: `soroban_contract_instances` upserts last-seen state (best-effort — discovery still returns RPC results if the table is unavailable). New optional fields are additive.

## Auth / validation / safe failure

- Auth: any valid API key/Bearer token; per-route error envelope via `sendApiError`.
- Validation: 1–50 unique valid contract IDs; positive `ledgerSeq`; `400` on violations.
- Safe failure: upstream RPC errors → `502`; per-contract probe errors degrade to `{ exists: false }` for that contract instead of failing the batch.

## Rollout / rollback / operator workflow

- Rollout: run migration `20260829110000_soroban_contract_instances`, deploy backend.
  Verify `GET /known` then `POST /discover` with one known contract ID.
- Rollback: revert backend; drop table only if the feature is abandoned (`down` migration provided).
- Workflow: `GET /known` to seed candidates → `POST /discover` to confirm on-chain existence → use `wasmHash`/`liveUntilLedgerSeq` to prioritize storage review; re-run periodically to refresh `last_seen_ledger`.
