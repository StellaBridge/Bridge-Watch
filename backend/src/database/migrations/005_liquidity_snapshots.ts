import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Liquidity snapshots time-series table (hypertable)
  await knex.schema.createTable("liquidity_snapshots", (table) => {
    table.timestamp("time").notNullable().defaultTo(knex.fn.now());
    table.string("symbol").notNullable();
    table.string("dex").notNullable(); // stellarx, phoenix, lumenswap, sdex, soroswap
    table.string("base_asset").notNullable();
    table.string("quote_asset").notNullable();
    table.decimal("tvl_usd", 30, 8).notNullable().defaultTo(0);
    table.decimal("volume_24h_usd", 30, 8).nullable();
    table.decimal("bid_depth", 30, 8).nullable();
    table.decimal("ask_depth", 30, 8).nullable();
    table.decimal("spread_pct", 10, 6).nullable();
    table.index(["symbol", "time"]);
    table.index(["dex", "time"]);
  });

  await knex.raw(
    "SELECT create_hypertable('liquidity_snapshots', 'time', if_not_exists => TRUE)"
  );

  // Bridge volume statistics (daily aggregates)
  await knex.schema.createTable("bridge_volume_stats", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.date("stat_date").notNullable();
    table.string("bridge_name").notNullable().references("name").inTable("bridges").onDelete("CASCADE");
    table.string("symbol").notNullable();
    table.decimal("inflow_amount", 30, 8).notNullable().defaultTo(0);
    table.decimal("outflow_amount", 30, 8).notNullable().defaultTo(0);
    table.decimal("net_flow", 30, 8).notNullable().defaultTo(0);
    table.integer("tx_count").notNullable().defaultTo(0);
    table.decimal("avg_tx_size", 30, 8).nullable();
    table.timestamps(true, true);
    table.unique(["stat_date", "bridge_name", "symbol"]);
    table.index(["stat_date", "bridge_name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("bridge_volume_stats");
  await knex.schema.dropTableIfExists("liquidity_snapshots");
}
