import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("operator_notes", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("entity_type").notNullable();
    table.string("entity_id").notNullable();
    table.string("operator_address").notNullable();
    table.text("content").notNullable();
    table.string("category").notNullable().defaultTo("general");
    table.boolean("is_internal").notNullable().defaultTo(false);
    table.timestamps(true, true);
    table.index(["entity_type", "entity_id"]);
    table.index(["operator_address"]);
    table.index(["category"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("operator_notes");
}
