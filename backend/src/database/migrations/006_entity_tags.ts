import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("tags", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("entity_type").notNullable();
    table.string("entity_id").notNullable();
    table.string("tag").notNullable();
    table.string("source").notNullable().defaultTo("manual");
    table.timestamps(true, true);
    table.unique(["entity_type", "entity_id", "tag"]);
    table.index(["entity_type", "entity_id"]);
    table.index(["tag"]);
  });

  await knex.schema.createTable("tag_audit_log", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.timestamp("time").notNullable().defaultTo(knex.fn.now());
    table.string("entity_type").notNullable();
    table.string("entity_id").notNullable();
    table.string("tag").notNullable();
    table.string("action").notNullable();
    table.string("source").notNullable();
    table.jsonb("metadata").nullable();
    table.index(["entity_type", "entity_id"]);
    table.index(["time"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("tag_audit_log");
  await knex.schema.dropTableIfExists("tags");
}
