import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("api_keys", (table) => {
    table.string("id").primary();
    table.string("name").notNullable();
    table.string("key_prefix").notNullable().index();
    table.string("key_hash").notNullable();
    table.string("key_salt").notNullable();
    table.jsonb("scopes").notNullable().defaultTo("[]");
    table.integer("rate_limit_per_minute").notNullable().defaultTo(120);
    table.integer("usage_count").notNullable().defaultTo(0);
    table.timestamp("expires_at").nullable();
    table.timestamp("revoked_at").nullable();
    table.timestamp("last_used_at").nullable();
    table.string("last_used_ip").nullable();
    table.string("created_by").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("api_key_audit_logs", (table) => {
    table.string("id").primary();
    table.string("api_key_id").notNullable().references("id").inTable("api_keys").onDelete("CASCADE");
    table.string("action").notNullable();
    table.string("actor").notNullable();
    table.text("detail").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["api_key_id", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("api_key_audit_logs");
  await knex.schema.dropTableIfExists("api_keys");
}
