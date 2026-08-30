import type { Knex } from "knex";

/**
 * Redaction pipeline audit + versioning.
 *
 * Records a redaction decision for post-hoc review. Every decision captures
 * which sink applied it, under which policy/rule version, and which fields
 * were acted on — the events hold rule fingerprints and field paths only, so
 * no original secret value is ever persisted here.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("redaction_decisions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("sink", 30).notNullable();
    table.integer("policy_version").notNullable();
    table.boolean("modified").notNullable().defaultTo(false);
    table.boolean("secret_detected").notNullable().defaultTo(false);
    table.boolean("blocked").notNullable().defaultTo(false);
    table.string("policy_fingerprint", 80).notNullable();
    table.jsonb("events").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.jsonb("correlation").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["sink"]);
    table.index(["created_at"]);
    table.index(["policy_version"]);
    table.index(["blocked"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("redaction_decisions");
}
