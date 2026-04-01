import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("bridge_transactions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("bridge_name").notNullable().references("name").inTable("bridges").onDelete("CASCADE");
    table.string("symbol").notNullable();
    table.string("transaction_type").notNullable().defaultTo("mint");
    table.string("status").notNullable().defaultTo("pending");
    table.string("correlation_id").nullable();
    table.string("tx_hash").notNullable().unique();
    table.string("source_chain").nullable();
    table.string("source_address").nullable();
    table.string("destination_address").nullable();
    table.decimal("amount", 30, 8).notNullable().defaultTo(0);
    table.decimal("fee", 30, 8).notNullable().defaultTo(0);
    table.timestamp("submitted_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("confirmed_at", { useTz: true }).nullable();
    table.timestamp("failed_at", { useTz: true }).nullable();
    table.text("error_message").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["bridge_name", "status"]);
    table.index(["symbol", "tx_hash"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("bridge_transactions");
}
