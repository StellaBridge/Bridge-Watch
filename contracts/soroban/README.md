# Soroban Contracts

Soroban contracts for Bridge Watch. Sources live in `src/`, integration-style
tests in `tests/`. See `ARCHITECTURE.md` for the module map and
`VERSION_MIGRATION_POLICY.md` for upgrade rules.

## Storage TTL strategy

Soroban archives ledger entries whose time-to-live (TTL) runs out. An archived
entry cannot be read or written until it is restored, so a contract whose
critical keys expire becomes unusable. Every write path must therefore extend
the TTL of the entry it touches.

| Storage type | Lifetime | Rule in this crate |
|--------------|----------|--------------------|
| Instance | Shared by every key of one contract | Call `env.storage().instance().extend_ttl(...)` after writing instance keys such as admin, config and counters. |
| Persistent | Per key | Call `env.storage().persistent().extend_ttl(&key, threshold, extend_to)` immediately after each `set` on that key. |
| Temporary | Short-lived, may be dropped | Do not hold critical state here. |

Ledger counts used in this repo (about 5 seconds per ledger, so 17,280 is one day):

- `zk_verifier.rs` and `bridge_reserve_verifier.rs` define `INSTANCE_TTL_BUMP` and `PERSISTENT_TTL_BUMP` constants and use them.
- `mmr_accumulator.rs` and `submission_replay.rs` pass literal values such as `17_280 * 30` (threshold) and `17_280 * 90` (extend to).

Target policy:

1. Every persistent `set` is followed by `extend_ttl` on the same key.
2. Every instance write is followed by an instance `extend_ttl`.
3. Read paths that load critical keys also extend the TTL, so frequently read keys do not expire when only read.

## Audit status

Audit scope: every file under `src/` that calls `storage()`, found by code search
on `StellaBridge/Bridge-Watch`. The code search index may be incomplete, so
treat this list as a starting point.

Files that call `extend_ttl` (write paths reviewed at the call-site level only):

- `zk_verifier.rs`: writes extend TTL. Read helpers (for example the verifying-key and attestation getters) do not extend TTL.
- `bridge_reserve_verifier.rs`: writes extend TTL.
- `mmr_accumulator.rs`: state and admin writes extend TTL.
- `submission_replay.rs`: nonce epoch writes extend TTL.

Files that use storage but were not audited in this pass (no `extend_ttl` found by search):

`acl.rs`, `alert_system.rs`, `analytics_aggregator.rs`, `asset_deprecation.rs`,
`asset_ranking.rs`, `asset_registry.rs`, `batch_query.rs`,
`bridge_asset_metadata.rs`, `circuit_breaker.rs`, `emergency_fund_recovery.rs`,
`emergency_multisig.rs`, `escrow_contract.rs`, `event_query.rs`,
`fee_distribution.rs`, `governance.rs`, `insurance_pool.rs`,
`liquidity_pool.rs`, `migration.rs`, `multisig_treasury.rs`,
`operator_rotation.rs`, `oracle_hub.rs`, `rate_limiter.rs`, `relay/mod.rs`,
`reputation_system.rs`, `rollup_flush.rs`, `sidecar_state.rs`,
`source_blessing.rs`, `source_priority.rs`, `source_trust.rs`,
`submission_pause.rs`, `threshold_window.rs`, `version_migration_helper.rs`.

Open follow-ups: add TTL extension to the contracts above, starting with the
critical-key contracts (`circuit_breaker.rs`, `multisig_treasury.rs`,
`emergency_multisig.rs`, `oracle_hub.rs`, `fee_distribution.rs`), and add a
test per contract that reads and writes the critical keys.

## Running the tests

```bash
cd contracts/soroban && cargo test
cd contracts/soroban && cargo test --test fee_distribution_property_test
cd contracts/soroban && cargo clippy -- -D warnings
cd contracts/soroban && cargo fmt --check
```
