import type { Knex } from "knex";

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS liquidity_snapshots_symbol_time_desc_idx 
    ON liquidity_snapshots (symbol, time DESC)
  `);

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS liquidity_snapshots_dex_time_desc_idx 
    ON liquidity_snapshots (dex, time DESC)
  `);

  const bridgeVolumeStatsExists = await knex.schema.hasTable('bridge_volume_stats');
  if (bridgeVolumeStatsExists) {
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS bridge_volume_stats_bridge_date_desc_idx 
      ON bridge_volume_stats (bridge_name, stat_date DESC)
    `);
  }

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS prices_symbol_time_desc_idx 
    ON prices (symbol, time DESC)
  `);

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS health_scores_symbol_time_desc_idx 
    ON health_scores (symbol, time DESC)
  `);

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS alert_events_rule_time_desc_idx 
    ON alert_events (rule_id, time DESC)
  `);

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS verification_results_bridge_verified_desc_idx 
    ON verification_results (bridge_id, verified_at DESC)
  `);

  const poolMetricsExists = await knex.schema.hasTable('pool_metrics');
  if (poolMetricsExists) {
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS pool_metrics_pool_time_desc_idx 
      ON pool_metrics (pool_id, time DESC)
    `);
  }

  const poolEventsExists = await knex.schema.hasTable('pool_events');
  if (poolEventsExists) {
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS pool_events_pool_time_desc_idx 
      ON pool_events (pool_id, time DESC)
    `);
  }

  const reconciliationRunsExists = await knex.schema.hasTable('reconciliation_runs');
  if (reconciliationRunsExists) {
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS reconciliation_runs_bridge_started_desc_idx 
      ON reconciliation_runs (bridge_id, started_at DESC)
    `);
  }

  const dbPoolSnapshotsExists = await knex.schema.hasTable('db_pool_snapshots');
  if (dbPoolSnapshotsExists) {
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS db_pool_snapshots_pool_timestamp_desc_idx 
      ON db_pool_snapshots (pool_name, timestamp DESC)
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS liquidity_snapshots_symbol_time_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS liquidity_snapshots_dex_time_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS bridge_volume_stats_bridge_date_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS prices_symbol_time_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS health_scores_symbol_time_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS alert_events_rule_time_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS verification_results_bridge_verified_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS pool_metrics_pool_time_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS pool_events_pool_time_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS reconciliation_runs_bridge_started_desc_idx');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS db_pool_snapshots_pool_timestamp_desc_idx');
}
