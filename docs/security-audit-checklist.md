# Bridge Reserve Verification – Security Audit Checklist

This checklist covers the `BridgeReserveVerifier` Soroban contract (Rust) and the
associated off-chain backend components introduced in issue #6.

---

## 1. Soroban Smart Contract (`bridge_reserve_verifier.rs`)

### Access Control
- [x] **Admin-only functions** – `initialize`, `update_config`, `register_bridge`,
      `resolve_challenge`, and `slash_operator` all call `admin.require_auth()`.
- [x] **Operator-only commit** – `commit_reserves` calls `op.operator.require_auth()`,
      ensuring only the registered operator can submit commitments for their bridge.
- [x] **Challenger auth** – `challenge_commitment` calls `challenger.require_auth()` to
      prevent front-running with an attacker-controlled challenger address.
- [x] **No implicit privilege escalation** – admin address is stored at initialization
      and can only be read; no setter is provided (admin transfer requires a separate
      governance mechanism outside this contract).

### Initialization
- [x] **Double-initialization guard** – `AlreadyInitialized` error prevents re-entry.
- [x] **Admin must sign initialization** – prevents griefing by a third party initializing
      the contract before the intended admin.

### Integer Arithmetic
- [x] **Overflow checks enabled** – `overflow-checks = true` in `Cargo.toml`
      `[profile.release]`.
- [x] **Stake arithmetic uses saturating subtraction** – slash logic uses explicit
      comparison before subtraction to avoid underflow; result is clamped to 0.
- [x] **`total_reserves` validated** – `commit_reserves` rejects negative values with
      `InvalidInput` error before writing to storage.
- [x] **`slash_amount` and `min_stake` validated** – `update_config` rejects negative
      values.

### Merkle Proof Verification
- [x] **Standard SHA-256 binary Merkle tree** – leaf-index parity determines left/right
      ordering, matching the off-chain TypeScript implementation.
- [x] **Empty proof path edge case** – if `proof_path` is empty, the leaf hash is
      compared directly to the root (handles single-leaf trees correctly).
- [x] **No short-circuit on first match** – the full proof path is always traversed;
      no early exit that could be exploited.
- [x] **Return value, not panic, on invalid proof** – `verify_proof` returns `false`
      rather than panicking, allowing callers to handle the result gracefully.

### Storage & TTL
- [x] **Instance storage TTL bumped on every write** – ensures admin config does not
      expire during active use (~30-day rolling window).
- [x] **Persistent storage TTL bumped on every write** – commitment and operator records
      are retained for ~4 months, providing an on-chain audit trail.
- [x] **No unbounded storage growth** – commitment history is addressed by `(bridge_id, sequence)`;
      old records naturally expire via Soroban TTL without manual cleanup.

### Challenge Mechanism
- [x] **Challenge period enforced at the ledger level** – uses `env.ledger().sequence()`
      rather than `env.ledger().timestamp()` to resist potential timestamp manipulation.
- [x] **State machine enforced** – `challenge_commitment` requires `Pending` status;
      `resolve_challenge` requires `Challenged` status; prevents double-challenge or
      double-resolution.
- [x] **Challenge evidence required** – challenger must submit a proof that fails
      verification, providing cryptographic evidence of a fraudulent commitment rather
      than allowing arbitrary challenges.

### Event Emissions
- [x] **Events emitted for all state transitions** – register, commit, verify, challenge,
      resolve, slash, and config update all emit events, enabling off-chain indexers to
      reconstruct full history without storing everything on-chain.

### Denial of Service
- [x] **Batch verification bounded by caller** – `batch_verify_proofs` processes only the
      proofs supplied; no internal loops that grow with on-chain state.
- [x] **No cross-contract calls** – contract is self-contained; no external contract
      invocations that could introduce reentrancy or unexpected gas consumption.
- [x] **Reentrancy not applicable** – Soroban's execution model does not have reentrancy
      in the EVM sense; each invocation is atomic.

### Build Hardening (`Cargo.toml`)
- [x] `opt-level = "z"` – minimizes WASM size.
- [x] `overflow-checks = true` – traps on integer overflow in release builds.
- [x] `lto = true` – link-time optimization reduces attack surface from dead code.
- [x] `panic = "abort"` – deterministic failure; no unwinding stack that could be abused.
- [x] `strip = "symbols"` – reduces information leakage in deployed WASM.

---

## 2. Backend – Reserve Verification Worker

### Secrets Management
- [x] **Operator signing keys loaded from environment variables**, not hard-coded.
- [ ] **TODO (production)**: Replace env-var keypair loading with a KMS-backed signing
      service (e.g., AWS KMS, HashiCorp Vault) so the raw private key is never in memory.

### External API Calls (Circle API)
- [x] **API key gated** – Circle API calls only execute when `CIRCLE_API_KEY` is set.
- [x] **Graceful fallback** – falls back to deterministic mock data when the API key is
      absent or the request fails, preventing worker crashes during development.
- [x] **No user-controlled input in API URLs** – the Circle API URL is hard-coded; no
      SSRF vector.

### Merkle Tree Integrity
- [x] **Off-chain verification runs before on-chain submission** – the worker verifies
      all sampled proofs against the locally built tree before (and after) submitting to
      Soroban. A tree construction bug is caught before it can pollute on-chain state.
- [x] **Leaf set not empty** – worker throws if `fetchCircleReserves` returns zero leaves.

### Queue & Worker Configuration
- [x] **Concurrency = 1** – prevents sequence number race conditions where two jobs
      could attempt to commit for the same bridge simultaneously.
- [x] **Retry with exponential backoff** – 3 attempts with 10 s base delay; transient
      RPC failures are handled without flooding the queue.
- [x] **Dead-letter retention** – failed jobs are retained for post-mortem analysis
      (`removeOnFail: { count: 50 }`).

### Database
- [x] **Parameterized queries via Knex** – no raw string interpolation; SQL injection
      is not possible.
- [x] **Upsert on conflict** – `saveCommitment` uses `.onConflict().merge()` to avoid
      duplicate rows without throwing on retry.
- [x] **Foreign key constraints** – `verification_results.bridge_id` references
      `bridge_operators.bridge_id`, maintaining referential integrity.

---

## 3. Gas / Compute Optimization Notes

| Technique | Location | Effect |
|-----------|----------|--------|
| `opt-level = "z"` + `lto = true` | `Cargo.toml` | Smaller WASM → lower upload fee |
| `batch_verify_proofs` | Contract | Amortizes per-invocation overhead across many proofs |
| Storage key reuse | Contract | `DataKey` enum variants reuse XDR-encoded keys; no string keys |
| Minimal on-chain data | Contract | Only the 32-byte root + scalar totals are stored; full leaf data lives off-chain |
| Persistent TTL bump on write | Contract | Avoids TTL extension as a separate transaction |
| TimescaleDB hypertable | Migration | Automatic time-based chunking for `verification_results`; keeps query times flat as data grows |

### Build Commands
```bash
# Build optimized WASM
cd contracts/soroban
cargo build --target wasm32-unknown-unknown --release

# Further size optimization with wasm-opt (install via binaryen)
wasm-opt -Oz \
  target/wasm32-unknown-unknown/release/bridge_watch_contracts.wasm \
  -o target/wasm32-unknown-unknown/release/bridge_reserve_verifier_opt.wasm

# Deploy to testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/bridge_reserve_verifier_opt.wasm \
  --source <admin-keypair> \
  --network testnet
```

---

## 4. Recommended Pre-Merge Checklist

- [ ] Run `cargo test --release` – all contract unit tests pass
- [ ] Run `npm test` (Vitest) – all worker Merkle tests pass
- [ ] Deploy contract to Soroban testnet and run `initialize` + `register_bridge`
- [ ] Submit a test commitment and verify a proof end-to-end via Soroban RPC
- [ ] Confirm `verification_results` hypertable is created by the migration
- [ ] Review operator keypair handling for production deployment
- [ ] Add `OPERATOR_SECRET_<BRIDGE_ID>` to the deployment secrets manager
- [ ] Set `CIRCLE_API_KEY` in the production environment
- [ ] Confirm challenge period (default 17 280 ledgers ≈ 24 h) is acceptable for operators
- [ ] Review slash amounts with Circle / operator SLA terms
