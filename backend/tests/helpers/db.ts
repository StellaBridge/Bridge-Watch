import "tsx/cjs";
import type { Knex } from "knex";

export async function runMigrations(db: Knex): Promise<void> {
  await db.migrate.latest({
    directory: "./src/database/migrations",
    extension: "ts",
    // Disable transaction wrapping so a failed TimescaleDB call (e.g.
    // create_hypertable inside a try/catch) cannot abort the entire batch
    // and roll back tables from earlier migrations.
    disableTransactions: true,
  });
}

export async function rollbackAll(db: Knex): Promise<void> {
  await db.migrate.rollback(
    {
      directory: "./src/database/migrations",
      extension: "ts",
      disableTransactions: true,
    },
    true
  );
}

export async function truncateTables(db: Knex, tables: string[]): Promise<void> {
  await db.raw("SET session_replication_role = replica");
  for (const table of tables) {
    await db(table).truncate();
  }
  await db.raw("SET session_replication_role = DEFAULT");
}

export async function cleanDatabase(db: Knex): Promise<void> {
  await truncateTables(db, [
    "alert_events",
    "alert_rules",
    "health_scores",
    "liquidity_snapshots",
    "prices",
    "verification_results",
    "bridge_volume_stats",
    "bridges",
    "assets",
  ]);
}
