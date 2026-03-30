import type { Knex } from "knex";

// TimescaleDB operations (CREATE EXTENSION, create_hypertable) must run outside
// of transaction blocks in some environments. Setting transaction: false ensures
// Knex does not wrap this migration in an automatic transaction.
export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
  // Enable TimescaleDB extension (gracefully skip if unavailable)
  try {
    await knex.raw("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE");
  } catch {
    // TimescaleDB may not be installed; tables will be created as regular tables
  }

  // Monitored assets table
  await knex.schema.createTable("assets", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("symbol").notNullable().unique();
    table.string("name").notNullable();
    table.string("issuer").nullable();
    table.string("asset_type").notNullable(); // native, credit_alphanum4, credit_alphanum12
    table.string("bridge_provider").nullable(); // Circle, Wormhole, etc.
    table.string("source_chain").nullable(); // Ethereum, etc.
    table.boolean("is_active").defaultTo(true);
    table.timestamps(true, true);
  });

  // Bridge status table
  await knex.schema.createTable("bridges", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name").notNullable().unique();
    table.string("source_chain").notNullable();
    table.string("status").notNullable().defaultTo("unknown");
    table.decimal("total_value_locked", 20, 2).defaultTo(0);
    table.decimal("supply_on_stellar", 20, 7).defaultTo(0);
    table.decimal("supply_on_source", 20, 7).defaultTo(0);
    table.boolean("is_active").defaultTo(true);
    table.timestamps(true, true);
  });

  // Price time-series table (hypertable)
  await knex.schema.createTable("prices", (table) => {
    table.timestamp("time").notNullable().defaultTo(knex.fn.now());
    table.string("symbol").notNullable();
    table.string("source").notNullable();
    table.decimal("price", 20, 8).notNullable();
    table.decimal("volume_24h", 20, 2).nullable();
    table.index(["symbol", "time"]);
  });

  // Convert prices to TimescaleDB hypertable (gracefully skip if TimescaleDB unavailable)
  try {
    await knex.raw(
      "SELECT create_hypertable('prices', 'time', if_not_exists => TRUE)"
    );
  } catch {
    // Table remains as a regular PostgreSQL table
  }

  // Health scores time-series table (hypertable)
  await knex.schema.createTable("health_scores", (table) => {
    table.timestamp("time").notNullable().defaultTo(knex.fn.now());
    table.string("symbol").notNullable();
    table.integer("overall_score").notNullable();
    table.integer("liquidity_depth_score").notNullable();
    table.integer("price_stability_score").notNullable();
    table.integer("bridge_uptime_score").notNullable();
    table.integer("reserve_backing_score").notNullable();
    table.integer("volume_trend_score").notNullable();
    table.index(["symbol", "time"]);
  });

  // Convert health_scores to TimescaleDB hypertable (gracefully skip if TimescaleDB unavailable)
  try {
    await knex.raw(
      "SELECT create_hypertable('health_scores', 'time', if_not_exists => TRUE)"
    );
  } catch {
    // Table remains as a regular PostgreSQL table
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("health_scores");
  await knex.schema.dropTableIfExists("prices");
  await knex.schema.dropTableIfExists("bridges");
  await knex.schema.dropTableIfExists("assets");
}
