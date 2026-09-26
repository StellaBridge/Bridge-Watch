import type { Knex } from "knex";

/**
 * Optimistic locking version columns (issue #1279).
 *
 * Concurrent operator updates to bridge configurations (e.g. pause
 * thresholds vs RPC URLs) otherwise overwrite each other silently.
 * Writers read `version`, send it back with the update, and the update
 * applies only when the row still carries that version (`WHERE id = ? AND
 * version = ?`, then `version = version + 1`). A version change underneath
 * surfaces as a 409 Conflict instead of a lost update.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bridges", (table) => {
    table.integer("version").notNullable().defaultTo(1);
  });
  await knex.schema.alterTable("bridge_registry", (table) => {
    table.integer("version").notNullable().defaultTo(1);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("bridge_registry", (table) => {
    table.dropColumn("version");
  });
  await knex.schema.alterTable("bridges", (table) => {
    table.dropColumn("version");
  });
}
