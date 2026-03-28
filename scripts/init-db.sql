-- =============================================================================
-- Bridge Watch — PostgreSQL initialisation
-- Runs once when the postgres container is first created.
-- Migrations (via Knex) handle the actual schema; this script only enables
-- extensions that must exist before migrations run.
-- =============================================================================

-- TimescaleDB — required for hypertables and continuous aggregates
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Useful for query performance analysis
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
