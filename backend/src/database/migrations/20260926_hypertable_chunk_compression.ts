import type { Knex } from "knex";

/**
 * Automate TimescaleDB columnar chunk compression (issue #1273).
 *
 * Raw time-series rows accumulate gigabytes uncompressed. This enables
 * compression on the hot hypertables managed by the hot/cold migration
 * service and adds a 7-day compression policy, so chunks older than 7 days
 * are compressed automatically.
 *
 * Scope note: of the tables named in the issue, only `liquidity_snapshots`
 * is a hypertable. `bridge_transactions` (009) and `metric_data_points`
 * (20260730095417) are regular tables, so TimescaleDB columnar compression
 * does not apply to them; converting them is a separate decision and is
 * intentionally not done here. `prices`, `health_scores`, and `pool_events`
 * are hypertables and are covered alongside `liquidity_snapshots`.
 *
 * Every TimescaleDB call is guarded: without the extension the tables remain
 * regular PostgreSQL tables and the migration still succeeds.
 */
const COMPRESSION_TARGETS: Array<{ table: string; segmentby: string }> = [
  { table: "prices", segmentby: "symbol" },
  { table: "health_scores", segmentby: "symbol" },
  { table: "liquidity_snapshots", segmentby: "symbol, dex" },
  { table: "pool_events", segmentby: "pool_id" },
];

export async function up(knex: Knex): Promise<void> {
  for (const { table, segmentby } of COMPRESSION_TARGETS) {
    try {
      await knex.raw(
        `ALTER TABLE ${table} SET (timescaledb.compress = true, timescaledb.compress_segmentby = '${segmentby}');`
      );
      await knex.raw(
        `SELECT add_compression_policy('${table}', INTERVAL '7 days', if_not_exists => true);`
      );
    } catch {
      // TimescaleDB may not be installed; tables remain uncompressed.
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { table } of COMPRESSION_TARGETS) {
    try {
      await knex.raw(`SELECT remove_compression_policy('${table}', if_not_exists => true);`);
      await knex.raw(`ALTER TABLE ${table} SET (timescaledb.compress = false);`);
    } catch {
      // TimescaleDB may not be installed; nothing to undo.
    }
  }
}
