import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("webhook_endpoints", (table) => {
    table.integer("retry_max_attempts").notNullable().defaultTo(7);
    table.integer("retry_base_delay_ms").notNullable().defaultTo(1000);
    table.integer("retry_max_delay_ms").notNullable().defaultTo(3600000);
    table.decimal("retry_backoff_multiplier", 4, 2).notNullable().defaultTo(2.0);
    table.decimal("retry_jitter_ratio", 4, 2).notNullable().defaultTo(0.2);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("webhook_endpoints", (table) => {
    table.dropColumn("retry_max_attempts");
    table.dropColumn("retry_base_delay_ms");
    table.dropColumn("retry_max_delay_ms");
    table.dropColumn("retry_backoff_multiplier");
    table.dropColumn("retry_jitter_ratio");
  });
}
