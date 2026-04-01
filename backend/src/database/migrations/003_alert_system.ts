import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("alert_rules", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("owner_address").notNullable();
    table.string("name").notNullable();
    table.string("asset_code").notNullable();
    table.jsonb("conditions").notNullable();
    table.string("condition_op").notNullable().defaultTo("AND");
    table.string("priority").notNullable().defaultTo("medium");
    table.integer("cooldown_seconds").notNullable().defaultTo(3600);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.string("webhook_url").nullable();
    table.bigInteger("on_chain_rule_id").nullable();
    table.timestamp("last_triggered_at").nullable();
    table.timestamps(true, true);
    table.index(["owner_address"]);
    table.index(["asset_code", "is_active"]);
  });

  await knex.schema.createTable("alert_events", (table) => {
    table.timestamp("time").notNullable().defaultTo(knex.fn.now());
    // rule_id intentionally has no FK constraint: TimescaleDB hypertables do not
    // support foreign-key constraints in all versions, so we track the relationship
    // by convention rather than a DB-level constraint.
    table.uuid("rule_id").notNullable();
    table.string("asset_code").notNullable();
    table.string("alert_type").notNullable();
    table.string("priority").notNullable();
    table.decimal("triggered_value", 30, 8).notNullable();
    table.decimal("threshold", 30, 8).notNullable();
    table.string("metric").notNullable();
    table.boolean("webhook_delivered").notNullable().defaultTo(false);
    table.timestamp("webhook_delivered_at").nullable();
    table.integer("webhook_attempts").notNullable().defaultTo(0);
    table.bigInteger("on_chain_event_id").nullable();
    table.index(["asset_code", "time"]);
    table.index(["rule_id", "time"]);
  });

  try {
    await knex.raw(
      "SELECT create_hypertable('alert_events', 'time', if_not_exists => TRUE)"
    );
  } catch {
    // create_hypertable is a TimescaleDB extension function; if it is unavailable
    // the table still exists as a regular PostgreSQL table, which is acceptable.
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("alert_events");
  await knex.schema.dropTableIfExists("alert_rules");
}
