import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("incident_timeline_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("incident_id").notNullable().index();
    table
      .uuid("deployment_id")
      .nullable()
      .references("id")
      .inTable("contract_deployments")
      .onDelete("SET NULL")
      .index();
    table.string("type").notNullable().index();
    table.string("actor").nullable();
    table.jsonb("metadata").defaultTo("{}");
    table.timestamp("occurred_at").notNullable().defaultTo(knex.fn.now()).index();
    table.timestamp("created_at").defaultTo(knex.fn.now()).index();
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index(["incident_id", "occurred_at"]);
    table.index(["deployment_id", "occurred_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("incident_timeline_events");
}
