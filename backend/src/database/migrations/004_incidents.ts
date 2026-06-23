import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("incidents", (table) => {
    table.timestamp("time").notNullable().defaultTo(knex.fn.now());
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("entity_type").notNullable();
    table.string("entity_id").notNullable();
    table.string("asset_symbol").notNullable();
    table.string("severity").notNullable();
    table.string("title").notNullable();
    table.string("description").notNullable();
    table.timestamps(true, true);
    table.index(["asset_symbol", "time"]);
    table.index(["severity", "time"]);
    table.index(["entity_type", "entity_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("incidents");
}
