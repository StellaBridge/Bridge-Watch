import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("webhook_endpoints", (table) => {
    table.float("retry_backoff_multiplier").notNullable().defaultTo(2);
    table.integer("retry_max_delay_ms").notNullable().defaultTo(3600000);
    table.float("retry_jitter_ratio").notNullable().defaultTo(0.2);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("webhook_endpoints", (table) => {
    table.dropColumn("retry_backoff_multiplier");
    table.dropColumn("retry_max_delay_ms");
    table.dropColumn("retry_jitter_ratio");
  });
}
