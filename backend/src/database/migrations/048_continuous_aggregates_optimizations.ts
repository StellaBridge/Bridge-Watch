import type { Knex } from "knex";

/**
 * TimescaleDB continuous aggregates optimization for high-volume hypertables.
 * Sets up 1-hour and 1-day continuous aggregate materialized views with refresh policies
 * on prices, health_scores, and liquidity_snapshots for fast long-range (> 7d) analytics queries.
 *
 * Note: CREATE MATERIALIZED VIEW WITH (timescaledb.continuous) must execute outside
 * a transaction block. Setting transaction: false prevents Knex from wrapping this in a transaction.
 */
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  try {
    // 1-hour prices continuous aggregate
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
        start_offset => INTERVAL '7 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      );
    `);

    // 1-day prices continuous aggregate
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
        start_offset => INTERVAL '30 days',
        end_offset => INTERVAL '1 day',
        schedule_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      );
    `);

    // 1-hour health scores continuous aggregate
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
        start_offset => INTERVAL '7 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      );
    `);

    // 1-day health scores continuous aggregate
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
        start_offset => INTERVAL '30 days',
        end_offset => INTERVAL '1 day',
        schedule_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      );
    `);

    // 1-hour liquidity continuous aggregate
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
        start_offset => INTERVAL '7 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      );
    `);

    // 1-day liquidity continuous aggregate
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
        start_offset => INTERVAL '30 days',
        end_offset => INTERVAL '1 day',
        schedule_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      );
    `);

    // 1-hour bridge volume continuous aggregate
    await knex.raw(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS bridge_hourly_volume_rollup
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 hour', created_at) AS bucket,
        bridge_name AS bridge_id,
        SUM(amount) AS total_volume,
        COUNT(*) AS transaction_count,
        AVG(amount) AS avg_amount,
        MIN(amount) AS min_amount,
        MAX(amount) AS max_amount
      FROM bridge_transactions
      GROUP BY bucket, bridge_id
      WITH NO DATA;
    `);

    await knex.raw(`
      SELECT add_continuous_aggregate_policy('bridge_hourly_volume_rollup',
        start_offset => INTERVAL '7 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '30 minutes',
        if_not_exists => TRUE
      );
    `);

    // Create performance indexes on materialized views
    await knex.raw(`CREATE INDEX IF NOT EXISTS prices_hourly_symbol_bucket_idx ON prices_hourly (symbol, bucket DESC);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS prices_daily_symbol_bucket_idx ON prices_daily (symbol, bucket DESC);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS health_scores_hourly_symbol_bucket_idx ON health_scores_hourly (symbol, bucket DESC);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS health_scores_daily_symbol_bucket_idx ON health_scores_daily (symbol, bucket DESC);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS liquidity_hourly_symbol_bucket_idx ON liquidity_hourly (symbol, bucket DESC);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS liquidity_daily_symbol_bucket_idx ON liquidity_daily (symbol, bucket DESC);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS bridge_hourly_volume_rollup_idx ON bridge_hourly_volume_rollup (bridge_id, bucket DESC);`);
  } catch {
    // Continuous aggregates require TimescaleDB 2.x extension.
    // In environments without TimescaleDB, migration proceeds gracefully without failing.
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS bridge_hourly_volume_rollup CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS liquidity_daily CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS liquidity_hourly CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS health_scores_daily CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS health_scores_hourly CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS prices_daily CASCADE;`);
  await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS prices_hourly CASCADE;`);
}
