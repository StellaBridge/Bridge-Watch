import type { Knex } from "knex";

/**
 * Composite index on bridge_transactions (issue #1275).
 *
 * Deviation from the issue proposal: the table has no `bridge_id` column —
 * the bridge reference column is `bridge_name` (FK to `bridges.name`, see
 * 009_bridge_transactions.ts). The index is therefore created on
 * `(bridge_name, created_at DESC)` while keeping the proposed index name.
 *
 * This covers the common "transactions for a given bridge, most recent
 * first" access pattern, e.g.
 * `WHERE bridge_name = ? ORDER BY created_at DESC`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_bridge_transactions_bridge_created
      ON bridge_transactions (bridge_name, created_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_bridge_transactions_bridge_created");
}
