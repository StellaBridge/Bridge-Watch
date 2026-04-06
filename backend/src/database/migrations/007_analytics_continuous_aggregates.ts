import type { Knex } from "knex";

/**
 * Create TimescaleDB continuous aggregates for analytics
 * These materialized views automatically maintain pre-aggregated data
 *
 * Note: CREATE MATERIALIZED VIEW WITH (timescaledb.continuous) must run outside
 * a transaction block. Setting transaction: false prevents Knex from wrapping
 * this migration in an automatic transaction.
 */
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  try {
  // Hourly price aggregates
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS prices_hourly
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', time) AS bucket,
      symbol,
      AVG(price) AS avg_price,
      MIN(price) AS min_price,
      MAX(price) AS max_price,
      STDDEV(price) AS price_stddev,
      COUNT(*) AS sample_count,
      SUM(volume_24h) AS total_volume
    FROM prices
    GROUP BY bucket, symbol
    WITH NO DATA;
  `);

  await knex.raw(`
    SELECT add_continuous_aggregate_policy('prices_hourly',
      start_offset => INTERVAL '3 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
    );
  `);

  // Daily price aggregates
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS prices_daily
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 day', time) AS bucket,
      symbol,
      AVG(price) AS avg_price,
      MIN(price) AS min_price,
      MAX(price) AS max_price,
      FIRST(price, time) AS open_price,
      LAST(price, time) AS close_price,
      STDDEV(price) AS price_stddev,
      COUNT(*) AS sample_count,
      SUM(volume_24h) AS total_volume
    FROM prices
    GROUP BY bucket, symbol
    WITH NO DATA;
  `);

  await knex.raw(`
    SELECT add_continuous_aggregate_policy('prices_daily',
      start_offset => INTERVAL '3 days',
      end_offset => INTERVAL '1 day',
      schedule_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  `);

  // Hourly health score aggregates
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS health_scores_hourly
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', time) AS bucket,
      symbol,
      AVG(overall_score) AS avg_overall_score,
      MIN(overall_score) AS min_overall_score,
      MAX(overall_score) AS max_overall_score,
      AVG(liquidity_depth_score) AS avg_liquidity_score,
      AVG(price_stability_score) AS avg_price_stability_score,
      AVG(bridge_uptime_score) AS avg_bridge_uptime_score,
      AVG(reserve_backing_score) AS avg_reserve_backing_score,
      AVG(volume_trend_score) AS avg_volume_trend_score,
      COUNT(*) AS sample_count
    FROM health_scores
    GROUP BY bucket, symbol
    WITH NO DATA;
  `);

  await knex.raw(`
    SELECT add_continuous_aggregate_policy('health_scores_hourly',
      start_offset => INTERVAL '3 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
    );
  `);

  // Daily health score aggregates
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS health_scores_daily
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 day', time) AS bucket,
      symbol,
      AVG(overall_score) AS avg_overall_score,
      MIN(overall_score) AS min_overall_score,
      MAX(overall_score) AS max_overall_score,
      FIRST(overall_score, time) AS open_score,
      LAST(overall_score, time) AS close_score,
      AVG(liquidity_depth_score) AS avg_liquidity_score,
      AVG(price_stability_score) AS avg_price_stability_score,
      AVG(bridge_uptime_score) AS avg_bridge_uptime_score,
      AVG(reserve_backing_score) AS avg_reserve_backing_score,
      AVG(volume_trend_score) AS avg_volume_trend_score,
      COUNT(*) AS sample_count
    FROM health_scores
    GROUP BY bucket, symbol
    WITH NO DATA;
  `);

  await knex.raw(`
    SELECT add_continuous_aggregate_policy('health_scores_daily',
      start_offset => INTERVAL '3 days',
      end_offset => INTERVAL '1 day',
      schedule_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  `);

  // Hourly liquidity aggregates
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS liquidity_hourly
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', time) AS bucket,
      symbol,
      dex,
      AVG(tvl_usd) AS avg_tvl,
      MIN(tvl_usd) AS min_tvl,
      MAX(tvl_usd) AS max_tvl,
      SUM(volume_24h_usd) AS total_volume,
      AVG(bid_depth) AS avg_bid_depth,
      AVG(ask_depth) AS avg_ask_depth,
      AVG(spread_pct) AS avg_spread,
      COUNT(*) AS sample_count
    FROM liquidity_snapshots
    GROUP BY bucket, symbol, dex
    WITH NO DATA;
  `);

  await knex.raw(`
    SELECT add_continuous_aggregate_policy('liquidity_hourly',
      start_offset => INTERVAL '3 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
    );
  `);

  // Daily liquidity aggregates (cross-DEX)
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS liquidity_daily
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 day', time) AS bucket,
      symbol,
      SUM(tvl_usd) AS total_tvl,
      AVG(tvl_usd) AS avg_tvl_per_dex,
      SUM(volume_24h_usd) AS total_volume,
      AVG(bid_depth) AS avg_bid_depth,
      AVG(ask_depth) AS avg_ask_depth,
      AVG(spread_pct) AS avg_spread,
      COUNT(DISTINCT dex) AS dex_count,
      COUNT(*) AS sample_count
    FROM liquidity_snapshots
    GROUP BY bucket, symbol
    WITH NO DATA;
  `);

  await knex.raw(`
    SELECT add_continuous_aggregate_policy('liquidity_daily',
      start_offset => INTERVAL '3 days',
      end_offset => INTERVAL '1 day',
      schedule_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    );
  `);

  // Hourly alert aggregates
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS alert_events_hourly
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', time) AS bucket,
      asset_code,
      alert_type,
      priority,
      COUNT(*) AS alert_count,
      AVG(triggered_value) AS avg_triggered_value,
      MAX(triggered_value) AS max_triggered_value,
      SUM(CASE WHEN webhook_delivered THEN 1 ELSE 0 END) AS delivered_count,
      AVG(webhook_attempts) AS avg_webhook_attempts
    FROM alert_events
    GROUP BY bucket, asset_code, alert_type, priority
    WITH NO DATA;
  `);

  await knex.raw(`
    SELECT add_continuous_aggregate_policy('alert_events_hourly',
      start_offset => INTERVAL '3 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
    );
  `);

  // Hourly verification aggregates
  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS verification_results_hourly
    WITH (timescaledb.continuous) AS
    SELECT
      time_bucket('1 hour', verified_at) AS bucket,
      bridge_id,
      COUNT(*) AS total_verifications,
      SUM(CASE WHEN is_valid THEN 1 ELSE 0 END) AS valid_count,
      SUM(CASE WHEN NOT is_valid THEN 1 ELSE 0 END) AS invalid_count,
      AVG(proof_depth) AS avg_proof_depth,
      (SUM(CASE WHEN is_valid THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) * 100) AS success_rate
    FROM verification_results
    GROUP BY bucket, bridge_id
    WITH NO DATA;
  `);

  await knex.raw(`
    SELECT add_continuous_aggregate_policy('verification_results_hourly',
      start_offset => INTERVAL '3 hours',
      end_offset => INTERVAL '1 hour',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
    );
  `);

  // Create indexes on continuous aggregates for faster queries
  await knex.raw(`CREATE INDEX IF NOT EXISTS prices_hourly_symbol_bucket_idx ON prices_hourly (symbol, bucket DESC);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS prices_daily_symbol_bucket_idx ON prices_daily (symbol, bucket DESC);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS health_scores_hourly_symbol_bucket_idx ON health_scores_hourly (symbol, bucket DESC);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS health_scores_daily_symbol_bucket_idx ON health_scores_daily (symbol, bucket DESC);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS liquidity_hourly_symbol_bucket_idx ON liquidity_hourly (symbol, bucket DESC);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS liquidity_daily_symbol_bucket_idx ON liquidity_daily (symbol, bucket DESC);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS alert_events_hourly_asset_bucket_idx ON alert_events_hourly (asset_code, bucket DESC);`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS verification_results_hourly_bridge_bucket_idx ON verification_results_hourly (bridge_id, bucket DESC);`);
  } catch {
    // Continuous aggregates require TimescaleDB 2.x and cannot run inside transactions.
    // In environments without TimescaleDB or with an incompatible version, this migration
    // is a graceful no-op — core tables created in earlier migrations are unaffected.
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop continuous aggregates (this also removes their policies)
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS verification_results_hourly CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS alert_events_hourly CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS liquidity_daily CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS liquidity_hourly CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS health_scores_daily CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS health_scores_hourly CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS prices_daily CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS prices_hourly CASCADE;`);
}
