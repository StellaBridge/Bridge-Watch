# Database Schema — ER Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STELLAR BRIDGE WATCH — DATABASE                      │
│                    PostgreSQL 15+ with TimescaleDB extension                │
└─────────────────────────────────────────────────────────────────────────────┘

REGULAR TABLES
══════════════

┌──────────────────┐         ┌──────────────────────┐
│     assets       │         │       bridges         │
├──────────────────┤         ├──────────────────────┤
│ id (PK, UUID)    │         │ id (PK, UUID)         │
│ symbol (UNIQUE)  │         │ name (UNIQUE)         │
│ name             │         │ source_chain          │
│ issuer           │         │ status                │
│ asset_type       │         │ total_value_locked    │
│ bridge_provider  │         │ supply_on_stellar     │
│ source_chain     │         │ supply_on_source      │
│ is_active        │         │ is_active             │
│ created_at       │         │ created_at            │
│ updated_at       │         │ updated_at            │
└──────────────────┘         └──────────┬───────────┘
                                        │ 1
                                        │
                                        │ N
                             ┌──────────▼───────────┐
                             │  bridge_volume_stats  │
                             ├──────────────────────┤
                             │ id (PK, UUID)         │
                             │ stat_date             │
                             │ bridge_name (FK)      │
                             │ symbol                │
                             │ inflow_amount         │
                             │ outflow_amount        │
                             │ net_flow              │
                             │ tx_count              │
                             │ avg_tx_size           │
                             └──────────────────────┘

┌──────────────────────┐         ┌──────────────────────────┐
│   bridge_operators   │         │    reserve_commitments   │
├──────────────────────┤         ├──────────────────────────┤
│ id (PK, UUID)        │ 1     N │ id (PK, UUID)            │
│ bridge_id (UNIQUE)   ├─────────► bridge_id (FK)           │
│ operator_address     │         │ sequence                 │
│ provider_name        │         │ merkle_root              │
│ asset_code           │         │ total_reserves           │
│ source_chain         │         │ committed_at             │
│ stake                │         │ committed_ledger         │
│ is_active            │         │ status                   │
│ slash_count          │         │ challenger_address       │
│ contract_address     │         │ tx_hash                  │
└──────────┬───────────┘         │ reserve_leaves (JSONB)   │
           │ 1                   └──────────────────────────┘
           │
           │ N
┌──────────▼───────────────────┐
│    verification_results      │  ← HYPERTABLE (partitioned by verified_at)
├──────────────────────────────┤
│ verified_at (partition key)  │
│ id (UUID)                    │
│ bridge_id (FK)               │
│ sequence                     │
│ leaf_hash                    │
│ leaf_index                   │
│ is_valid                     │
│ proof_depth                  │
│ metadata (JSONB)             │
│ job_id                       │
└──────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│     alert_rules      │         │    alert_events      │  ← HYPERTABLE
├──────────────────────┤         ├──────────────────────┤
│ id (PK, UUID)        │ 1     N │ time (partition key) │
│ owner_address        ├─────────► rule_id (FK)         │
│ name                 │         │ asset_code           │
│ asset_code           │         │ alert_type           │
│ conditions (JSONB)   │         │ priority             │
│ condition_op         │         │ triggered_value      │
│ priority             │         │ threshold            │
│ cooldown_seconds     │         │ metric               │
│ is_active            │         │ webhook_delivered    │
│ webhook_url          │         │ webhook_attempts     │
│ on_chain_rule_id     │         │ on_chain_event_id    │
│ last_triggered_at    │         └──────────────────────┘
└──────────────────────┘

CIRCUIT BREAKER SUBSYSTEM
══════════════════════════

┌──────────────────────────┐
│  circuit_breaker_configs │
├──────────────────────────┤
│ id (PK, SERIAL)          │
│ alert_type (UNIQUE)      │
│ threshold                │
│ pause_level              │
│ cooldown_period          │
│ last_trigger             │
│ enabled                  │
└──────────────────────────┘

┌──────────────────────────┐         ┌──────────────────────────────────┐
│  circuit_breaker_pauses  │         │  circuit_breaker_recovery_reqs   │
├──────────────────────────┤         ├──────────────────────────────────┤
│ pause_id (PK)            │ 1     N │ id (PK, SERIAL)                  │
│ pause_scope              ├─────────► pause_id (FK)                    │
│ identifier               │         │ requested_by                     │
│ pause_level              │         │ timestamp                        │
│ triggered_by             │         │ approvals                        │
│ trigger_reason           │         │ threshold                        │
│ timestamp                │         │ status                           │
│ recovery_deadline        │         └──────────────────────────────────┘
│ guardian_approvals       │
│ guardian_threshold       │
│ status                   │
└──────────────────────────┘

┌──────────────────────────┐         ┌──────────────────────────┐
│ circuit_breaker_triggers │         │ circuit_breaker_whitelist│
├──────────────────────────┤         ├──────────────────────────┤
│ id (PK, TEXT)            │         │ id (PK, SERIAL)          │
│ alert_id                 │         │ type                     │
│ alert_type               │         │ value                    │
│ asset_code               │         │ added_by                 │
│ bridge_id                │         │ added_at                 │
│ severity                 │         └──────────────────────────┘
│ value / threshold        │
│ pause_scope / level      │
│ reason                   │
│ triggered_at             │
│ status                   │
│ resolved_at              │
└──────────────────────────┘

TIMESCALEDB HYPERTABLES (time-series)
══════════════════════════════════════

┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│       prices         │   │    health_scores      │   │ liquidity_snapshots  │
├──────────────────────┤   ├──────────────────────┤   ├──────────────────────┤
│ time ◄── partition   │   │ time ◄── partition    │   │ time ◄── partition   │
│ symbol               │   │ symbol                │   │ symbol               │
│ source               │   │ overall_score         │   │ dex                  │
│ price (DECIMAL 20,8) │   │ liquidity_depth_score │   │ base_asset           │
│ volume_24h           │   │ price_stability_score │   │ quote_asset          │
└──────────────────────┘   │ bridge_uptime_score   │   │ tvl_usd              │
  Retention: 90 days       │ reserve_backing_score │   │ volume_24h_usd       │
                           │ volume_trend_score    │   │ bid_depth / ask_depth│
                           └──────────────────────┘   │ spread_pct           │
                             Retention: 90 days        └──────────────────────┘
                                                         Retention: 90 days
```

## Migration Order

| File | Description |
|------|-------------|
| `001_initial_schema.ts` | Core tables: assets, bridges, prices, health_scores (hypertables) |
| `002_reserve_verification.ts` | bridge_operators, reserve_commitments, verification_results (hypertable) |
| `003_alert_system.ts` | alert_rules, alert_events (hypertable) |
| `004_circuit_breaker.ts` | Circuit breaker triggers, pauses, recovery, whitelist, configs |
| `005_liquidity_snapshots.ts` | liquidity_snapshots (hypertable), bridge_volume_stats |
| `006_retention_policies.ts` | TimescaleDB 90-day retention policies on all hypertables |

## Key Design Decisions

- **TimescaleDB hypertables** for all time-series data (prices, health_scores, liquidity_snapshots, alert_events, verification_results) — enables efficient time-range queries and automatic data lifecycle management.
- **DECIMAL precision**: prices use `DECIMAL(20,8)`, TVL/volume use `DECIMAL(30,8)` to handle large supply values without floating-point errors.
- **JSONB** for flexible fields: alert conditions, reserve leaves, verification metadata.
- **Soft delete** via `is_active` on assets, bridges, bridge_operators, alert_rules.
- **Audit fields** (`created_at`, `updated_at`) on all regular tables.
- **Retention policies** keep 90 days of raw time-series data; aggregated stats (bridge_volume_stats) are retained indefinitely.
- **ON CONFLICT DO NOTHING** in seeds makes them idempotent and safe to re-run.
