import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("api_deprecation_usage", (table) => {
    table.uuid("id").primary();
    table.uuid("deprecation_id").notNullable()
      .references("id").inTable("api_deprecations").onDelete("CASCADE");
    table.string("client_id", 255).notNullable();
    table.string("client_version", 100).notNullable();
    table.timestamp("occurred_at", { useTz: true }).notNullable();
    table.index(["deprecation_id", "occurred_at"], "api_deprecation_usage_date_idx");
    table.index(["deprecation_id", "client_id"], "api_deprecation_usage_client_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("api_deprecation_usage");
}
