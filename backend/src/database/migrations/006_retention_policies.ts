import type { Knex } from "knex";

/**
 * Retention policies for TimescaleDB hypertables.
 * Raw tick data is kept for 90 days; aggregated data is kept indefinitely.
 */
export async function up(knex: Knex): Promise<void> {
  // Drop old policies first (idempotent)
  const hypertables = [
    "prices",
    "health_scores",
    "alert_events",
    "verification_results",
    "liquidity_snapshots",
  ];

  for (const table of hypertables) {
    await knex.raw(
      `SELECT remove_retention_policy(?, if_not_exists => TRUE)`,
      [table]
    );
  }

  // 90-day retention on raw time-series tables
  await knex.raw(
    `SELECT add_retention_policy('prices', INTERVAL '90 days', if_not_exists => TRUE)`
  );
  await knex.raw(
    `SELECT add_retention_policy('health_scores', INTERVAL '90 days', if_not_exists => TRUE)`
  );
  await knex.raw(
    `SELECT add_retention_policy('alert_events', INTERVAL '90 days', if_not_exists => TRUE)`
  );
  await knex.raw(
    `SELECT add_retention_policy('verification_results', INTERVAL '90 days', if_not_exists => TRUE)`
  );
  await knex.raw(
    `SELECT add_retention_policy('liquidity_snapshots', INTERVAL '90 days', if_not_exists => TRUE)`
  );
}

export async function down(knex: Knex): Promise<void> {
  const hypertables = [
    "prices",
    "health_scores",
    "alert_events",
    "verification_results",
    "liquidity_snapshots",
  ];

  for (const table of hypertables) {
    await knex.raw(
      `SELECT remove_retention_policy(?, if_not_exists => TRUE)`,
      [table]
    );
  }
}
