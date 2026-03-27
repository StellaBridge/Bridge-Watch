import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("verification_results", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.string("asset_code").notNullable();
        table.decimal("stellar_supply", 20, 7).notNullable().defaultTo(0);
        table.decimal("ethereum_reserves", 20, 7).notNullable().defaultTo(0);
        table.decimal("mismatch_percentage", 10, 4).notNullable().defaultTo(0);
        table.boolean("is_flagged").notNullable().defaultTo(false);
        table.text("error_status").nullable();
        table.timestamp("verified_at").notNullable().defaultTo(knex.fn.now());

        table.index(["asset_code", "verified_at"]);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("verification_results");
}
