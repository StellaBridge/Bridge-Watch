import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("bridge_operators", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("bridge_id").notNullable().unique();
    table.string("operator_address").notNullable();
    table.string("provider_name").notNullable();
    table.string("asset_code").notNullable();
    table.string("source_chain").notNullable();
    table.bigInteger("stake").notNullable().defaultTo(0);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.integer("slash_count").notNullable().defaultTo(0);
    table.string("contract_address").nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable("reserve_commitments", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .string("bridge_id")
      .notNullable()
      .references("bridge_id")
      .inTable("bridge_operators")
      .onDelete("CASCADE");
    table.bigInteger("sequence").notNullable();
    table.string("merkle_root", 64).notNullable();
    table.bigInteger("total_reserves").notNullable();
    table.bigInteger("committed_at").notNullable();
    table.integer("committed_ledger").notNullable();
    table
      .string("status")
      .notNullable()
      .defaultTo("pending")
      .checkIn(["pending", "verified", "challenged", "slashed", "resolved"]);
    table.string("challenger_address").nullable();
    table.string("tx_hash").nullable();
    table.jsonb("reserve_leaves").nullable();
    table.timestamps(true, true);

    table.unique(["bridge_id", "sequence"]);
    table.index(["bridge_id", "status"]);
    table.index(["committed_at"]);
  });

  await knex.schema.createTable("verification_results", (table) => {
    table.timestamp("verified_at").notNullable().defaultTo(knex.fn.now());
    table.uuid("id").notNullable().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .string("bridge_id")
      .notNullable()
      .references("bridge_id")
      .inTable("bridge_operators")
      .onDelete("CASCADE");
    table.bigInteger("sequence").notNullable();
    table.string("leaf_hash", 64).notNullable();
    table.bigInteger("leaf_index").notNullable();
    table.boolean("is_valid").notNullable();
    table.integer("proof_depth").nullable();
    table.jsonb("metadata").nullable();
    table.string("job_id").nullable();

    table.index(["bridge_id", "verified_at"]);
    table.index(["bridge_id", "sequence"]);
  });

  await knex.raw(
    "SELECT create_hypertable('verification_results', 'verified_at', if_not_exists => TRUE)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("verification_results");
  await knex.schema.dropTableIfExists("reserve_commitments");
  await knex.schema.dropTableIfExists("bridge_operators");
}
