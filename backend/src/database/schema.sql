-- =============================================================================
-- Stellar Bridge Watch — PostgreSQL + TimescaleDB Schema Documentation
-- Generated from Knex migrations. Do NOT run this file directly in production;
-- use `npm run migrate` instead.
-- =============================================================================

-- Prerequisites
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- =============================================================================
-- REGULAR TABLES
-- =============================================================================

-- assets
-- Monitored Stellar assets (native + bridged).
CREATE TABLE assets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol        TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  issuer        TEXT,                                          -- NULL for native XLM
  asset_type    TEXT        NOT NULL,                         -- native | credit_alphanum4 | credit_alphanum12
  bridge_provider TEXT,                                       -- Circle, Wormhole, PayPal, etc.
  source_chain  TEXT,                                         -- Ethereum, etc.
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- bridges
-- Cross-chain bridge registry.
CREATE TABLE bridges (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL UNIQUE,
  source_chain        TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'unknown',  -- healthy | degraded | down | unknown
  total_value_locked  DECIMAL(20,2) NOT NULL DEFAULT 0,
  supply_on_stellar   DECIMAL(20,7) NOT NULL DEFAULT 0,
  supply_on_source    DECIMAL(20,7) NOT NULL DEFAULT 0,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- bridge_operators
-- On-chain bridge operator registry (mirrors Soroban contract state).
CREATE TABLE bridge_operators (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id         TEXT        NOT NULL UNIQUE,
  operator_address  TEXT        NOT NULL,
  provider_name     TEXT        NOT NULL,
  asset_code        TEXT        NOT NULL,
  source_chain      TEXT        NOT NULL,
  stake             BIGINT      NOT NULL DEFAULT 0,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  slash_count       INTEGER     NOT NULL DEFAULT 0,
  contract_address  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- reserve_commitments
-- Merkle-root reserve commitments submitted by bridge operators.
CREATE TABLE reserve_commitments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id         TEXT        NOT NULL REFERENCES bridge_operators(bridge_id) ON DELETE CASCADE,
  sequence          BIGINT      NOT NULL,
  merkle_root       CHAR(64)    NOT NULL,
  total_reserves    BIGINT      NOT NULL,
  committed_at      BIGINT      NOT NULL,                     -- unix ms
  committed_ledger  INTEGER     NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',   -- pending | verified | challenged | slashed | resolved
  challenger_address TEXT,
  tx_hash           TEXT,
  reserve_leaves    JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bridge_id, sequence)
);
CREATE INDEX reserve_commitments_bridge_status_idx ON reserve_commitments (bridge_id, status);
CREATE INDEX reserve_commitments_committed_at_idx  ON reserve_commitments (committed_at);

-- alert_rules
-- User-defined alert rules with configurable conditions.
CREATE TABLE alert_rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_address     TEXT        NOT NULL,
  name              TEXT        NOT NULL,
  asset_code        TEXT        NOT NULL,
  conditions        JSONB       NOT NULL,
  condition_op      TEXT        NOT NULL DEFAULT 'AND',
  priority          TEXT        NOT NULL DEFAULT 'medium',
  cooldown_seconds  INTEGER     NOT NULL DEFAULT 3600,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  webhook_url       TEXT,
  on_chain_rule_id  BIGINT,
  last_triggered_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX alert_rules_owner_idx            ON alert_rules (owner_address);
CREATE INDEX alert_rules_asset_active_idx     ON alert_rules (asset_code, is_active);

-- bridge_volume_stats
-- Daily aggregated bridge volume (inflow/outflow per asset per bridge).
CREATE TABLE bridge_volume_stats (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date       DATE        NOT NULL,
  bridge_name     TEXT        NOT NULL REFERENCES bridges(name) ON DELETE CASCADE,
  symbol          TEXT        NOT NULL,
  inflow_amount   DECIMAL(30,8) NOT NULL DEFAULT 0,
  outflow_amount  DECIMAL(30,8) NOT NULL DEFAULT 0,
  net_flow        DECIMAL(30,8) NOT NULL DEFAULT 0,
  tx_count        INTEGER     NOT NULL DEFAULT 0,
  avg_tx_size     DECIMAL(30,8),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stat_date, bridge_name, symbol)
);
CREATE INDEX bridge_volume_stats_date_bridge_idx ON bridge_volume_stats (stat_date, bridge_name);

-- circuit_breaker_configs
-- Threshold configuration per alert type.
CREATE TABLE circuit_breaker_configs (
  id              SERIAL      PRIMARY KEY,
  alert_type      INTEGER     NOT NULL UNIQUE,
  threshold       DECIMAL(20,8) NOT NULL,
  pause_level     INTEGER     NOT NULL,
  cooldown_period BIGINT      NOT NULL,
  last_trigger    BIGINT      NOT NULL DEFAULT 0,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- circuit_breaker_pauses
-- Active and historical pause states.
CREATE TABLE circuit_breaker_pauses (
  pause_id            INTEGER     PRIMARY KEY,
  pause_scope         INTEGER     NOT NULL,
  identifier          TEXT,
  pause_level         INTEGER     NOT NULL,
  triggered_by        TEXT        NOT NULL,
  trigger_reason      TEXT        NOT NULL,
  timestamp           BIGINT      NOT NULL,
  recovery_deadline   BIGINT      NOT NULL,
  guardian_approvals  INTEGER     NOT NULL DEFAULT 0,
  guardian_threshold  INTEGER     NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX circuit_breaker_pauses_scope_id_idx ON circuit_breaker_pauses (pause_scope, identifier);
CREATE INDEX circuit_breaker_pauses_status_idx   ON circuit_breaker_pauses (status);

-- circuit_breaker_recovery_requests
CREATE TABLE circuit_breaker_recovery_requests (
  id          SERIAL      PRIMARY KEY,
  pause_id    INTEGER     NOT NULL REFERENCES circuit_breaker_pauses(pause_id),
  requested_by TEXT       NOT NULL,
  timestamp   BIGINT      NOT NULL,
  approvals   INTEGER     NOT NULL DEFAULT 0,
  threshold   INTEGER     NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- circuit_breaker_whitelist
CREATE TABLE circuit_breaker_whitelist (
  id        SERIAL  PRIMARY KEY,
  type      TEXT    NOT NULL,
  value     TEXT    NOT NULL,
  added_by  TEXT    NOT NULL,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, value)
);

-- circuit_breaker_triggers
CREATE TABLE circuit_breaker_triggers (
  id          TEXT        PRIMARY KEY,
  alert_id    TEXT        NOT NULL,
  alert_type  TEXT        NOT NULL,
  asset_code  TEXT,
  bridge_id   TEXT,
  severity    TEXT        NOT NULL,
  value       DECIMAL(20,8) NOT NULL,
  threshold   DECIMAL(20,8) NOT NULL,
  pause_scope INTEGER     NOT NULL,
  pause_level INTEGER     NOT NULL,
  reason      TEXT        NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT        NOT NULL DEFAULT 'triggered',
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX circuit_breaker_triggers_type_asset_idx ON circuit_breaker_triggers (alert_type, asset_code);
CREATE INDEX circuit_breaker_triggers_status_idx     ON circuit_breaker_triggers (status);

-- =============================================================================
-- TIMESCALEDB HYPERTABLES (time-series)
-- =============================================================================

-- prices
-- Multi-source price feed. Partitioned by time (1 day chunks).
CREATE TABLE prices (
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol      TEXT        NOT NULL,
  source      TEXT        NOT NULL,
  price       DECIMAL(20,8) NOT NULL,
  volume_24h  DECIMAL(20,2)
);
CREATE INDEX prices_symbol_time_idx ON prices (symbol, time DESC);
SELECT create_hypertable('prices', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('prices', INTERVAL '90 days', if_not_exists => TRUE);

-- health_scores
-- Composite health scores per asset over time.
CREATE TABLE health_scores (
  time                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol                  TEXT        NOT NULL,
  overall_score           SMALLINT    NOT NULL,
  liquidity_depth_score   SMALLINT    NOT NULL,
  price_stability_score   SMALLINT    NOT NULL,
  bridge_uptime_score     SMALLINT    NOT NULL,
  reserve_backing_score   SMALLINT    NOT NULL,
  volume_trend_score      SMALLINT    NOT NULL
);
CREATE INDEX health_scores_symbol_time_idx ON health_scores (symbol, time DESC);
SELECT create_hypertable('health_scores', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('health_scores', INTERVAL '90 days', if_not_exists => TRUE);

-- liquidity_snapshots
-- Per-DEX liquidity depth snapshots.
CREATE TABLE liquidity_snapshots (
  time          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol        TEXT        NOT NULL,
  dex           TEXT        NOT NULL,
  base_asset    TEXT        NOT NULL,
  quote_asset   TEXT        NOT NULL,
  tvl_usd       DECIMAL(30,8) NOT NULL DEFAULT 0,
  volume_24h_usd DECIMAL(30,8),
  bid_depth     DECIMAL(30,8),
  ask_depth     DECIMAL(30,8),
  spread_pct    DECIMAL(10,6)
);
CREATE INDEX liquidity_snapshots_symbol_time_idx ON liquidity_snapshots (symbol, time DESC);
CREATE INDEX liquidity_snapshots_dex_time_idx    ON liquidity_snapshots (dex, time DESC);
SELECT create_hypertable('liquidity_snapshots', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('liquidity_snapshots', INTERVAL '90 days', if_not_exists => TRUE);

-- alert_events
-- Triggered alert events (append-only audit log).
CREATE TABLE alert_events (
  time                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rule_id               UUID        NOT NULL REFERENCES alert_rules(id),
  asset_code            TEXT        NOT NULL,
  alert_type            TEXT        NOT NULL,
  priority              TEXT        NOT NULL,
  triggered_value       DECIMAL(30,8) NOT NULL,
  threshold             DECIMAL(30,8) NOT NULL,
  metric                TEXT        NOT NULL,
  webhook_delivered     BOOLEAN     NOT NULL DEFAULT FALSE,
  webhook_delivered_at  TIMESTAMPTZ,
  webhook_attempts      INTEGER     NOT NULL DEFAULT 0,
  on_chain_event_id     BIGINT
);
CREATE INDEX alert_events_asset_time_idx ON alert_events (asset_code, time DESC);
CREATE INDEX alert_events_rule_time_idx  ON alert_events (rule_id, time DESC);
SELECT create_hypertable('alert_events', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('alert_events', INTERVAL '90 days', if_not_exists => TRUE);

-- verification_results
-- Merkle proof verification results (append-only).
CREATE TABLE verification_results (
  verified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  bridge_id     TEXT        NOT NULL REFERENCES bridge_operators(bridge_id) ON DELETE CASCADE,
  sequence      BIGINT      NOT NULL,
  leaf_hash     CHAR(64)    NOT NULL,
  leaf_index    BIGINT      NOT NULL,
  is_valid      BOOLEAN     NOT NULL,
  proof_depth   INTEGER,
  metadata      JSONB,
  job_id        TEXT
);
CREATE INDEX verification_results_bridge_time_idx     ON verification_results (bridge_id, verified_at DESC);
CREATE INDEX verification_results_bridge_sequence_idx ON verification_results (bridge_id, sequence);
SELECT create_hypertable('verification_results', 'verified_at', if_not_exists => TRUE);
SELECT add_retention_policy('verification_results', INTERVAL '90 days', if_not_exists => TRUE);
