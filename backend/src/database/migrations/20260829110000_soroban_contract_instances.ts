import type { Knex } from "knex";

/**
 * Migration: Soroban contract instance discovery (#1198)
 *
 * Persists the last-known on-chain state for discovered Soroban contract
 * instances so discovery results are queryable without re-hitting RPC and
 * operators can track first/last seen ledgers per contract.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("soroban_contract_instances", (table) => {
    table.string("contract_id", 56).primary();
    table.string("wasm_hash", 128).nullable();
    table.integer("first_seen_ledger").nullable();
    table.integer("last_seen_ledger").nullable();
    table.integer("live_until_ledger").nullable();
    table.jsonb("metadata").notNullable().defaultTo("{}");
    table.timestamp("last_synced_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    "CREATE INDEX IF NOT EXISTS soroban_contract_instances_seen_idx ON soroban_contract_instances(last_seen_ledger DESC);"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("soroban_contract_instances");
}
