import type { Knex } from "knex";

/**
 * Migration: On-Chain Configuration Diffing
 * Issue: #1202
 *
 * Creates two tables:
 *   - on_chain_config_snapshots  Immutable snapshots of on-chain configuration
 *     state captured at a given ledger sequence. Each snapshot belongs to a
 *     named contract/bridge identified by contract_id.
 *
 *   - on_chain_config_diffs  Computed field-level diff between any two
 *     snapshots for the same contract_id. Diffs are persisted so callers
 *     can retrieve them without re-fetching chain state.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("on_chain_config_snapshots", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Identifies the on-chain contract or bridge configuration being tracked
    table.string("contract_id", 255).notNullable();

    // Network/chain identifier, e.g. "stellar:mainnet", "stellar:testnet"
    table.string("network", 128).notNullable();

    // Stellar ledger sequence at which this snapshot was captured
    table.bigInteger("ledger_sequence").notNullable();

    // Full configuration payload read from chain at this snapshot
    table.jsonb("config").notNullable().defaultTo("{}");

    // SHA-256 hex digest of the JSON-serialized config, for quick equality checks
    table.string("config_hash", 64).notNullable();

    // Identity of the process or operator that captured this snapshot
    table.string("captured_by", 255).notNullable();

    table
      .timestamp("captured_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // One snapshot per contract per ledger
    table.unique(
      ["contract_id", "network", "ledger_sequence"],
      { indexName: "on_chain_config_snapshots_contract_ledger_uniq" }
    );

    // Timeline queries per contract
    table.index(
      ["contract_id", "network", "ledger_sequence"],
      "on_chain_config_snapshots_contract_ledger_idx"
    );

    // Fast hash-based equality lookups
    table.index(
      ["contract_id", "config_hash"],
      "on_chain_config_snapshots_contract_hash_idx"
    );
  });

  await knex.schema.createTable("on_chain_config_diffs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Both snapshots must belong to the same contract_id
    table.string("contract_id", 255).notNullable();

    table
      .uuid("from_snapshot_id")
      .notNullable()
      .references("id")
      .inTable("on_chain_config_snapshots")
      .onDelete("CASCADE");

    table
      .uuid("to_snapshot_id")
      .notNullable()
      .references("id")
      .inTable("on_chain_config_snapshots")
      .onDelete("CASCADE");

    // Ledger sequences duplicated for fast range queries without joins
    table.bigInteger("from_ledger_sequence").notNullable();
    table.bigInteger("to_ledger_sequence").notNullable();

    // Field-level diff array: [{field, changeType, fromValue, toValue}]
    table.jsonb("field_diffs").notNullable().defaultTo("[]");

    // Counts for quick summaries
    table.integer("fields_added").notNullable().defaultTo(0);
    table.integer("fields_removed").notNullable().defaultTo(0);
    table.integer("fields_modified").notNullable().defaultTo(0);

    // Human-readable summary generated at diff time
    table.text("summary").nullable();

    // Identity of the operator or process that triggered this diff
    table.string("computed_by", 255).notNullable();

    table
      .timestamp("computed_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Prevent duplicate diff records for the same ordered snapshot pair
    table.unique(
      ["from_snapshot_id", "to_snapshot_id"],
      { indexName: "on_chain_config_diffs_snapshot_pair_uniq" }
    );

    // Timeline queries per contract
    table.index(
      ["contract_id", "computed_at"],
      "on_chain_config_diffs_contract_time_idx"
    );

    // Ledger range queries
    table.index(
      ["contract_id", "from_ledger_sequence", "to_ledger_sequence"],
      "on_chain_config_diffs_contract_ledger_range_idx"
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("on_chain_config_diffs");
  await knex.schema.dropTableIfExists("on_chain_config_snapshots");
}
