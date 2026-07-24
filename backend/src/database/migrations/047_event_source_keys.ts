import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("event_source_keys", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("source_name").notNullable().unique();
    table.text("public_key").notNullable();
    table.string("algorithm").notNullable().defaultTo("ed25519");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("rotated_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_event_source_keys_source_name
      ON event_source_keys (source_name)
      WHERE is_active = true
  `);

  await knex.schema.createTable("event_federation_audit", (table) => {
    table.uuid("id").primary().defaultTo(knex.fn.uuid());
    table.string("source_name").notNullable();
    table.string("event_id").notNullable();
    table.string("status").notNullable();
    table.text("error_message").nullable();
    table.bigInteger("timestamp_age_ms").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE INDEX idx_event_federation_audit_source
      ON event_federation_audit (source_name, created_at DESC)
  `);

  await knex.raw(`
    CREATE INDEX idx_event_federation_audit_status
      ON event_federation_audit (status, created_at DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_event_federation_audit_status");
  await knex.raw("DROP INDEX IF EXISTS idx_event_federation_audit_source");
  await knex.schema.dropTableIfExists("event_federation_audit");
  await knex.raw("DROP INDEX IF EXISTS idx_event_source_keys_source_name");
  await knex.schema.dropTableIfExists("event_source_keys");
}
