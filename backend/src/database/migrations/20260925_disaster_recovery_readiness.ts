import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("dr_readiness_assessments", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("bridge_id", 255).notNullable();
    table.integer("overall_score").notNullable();
    table
      .string("readiness_level", 20)
      .notNullable()
      .comment("CRITICAL | POOR | FAIR | GOOD | EXCELLENT");
    table.integer("backup_coverage_score").notNullable().defaultTo(0);
    table.integer("rto_readiness_score").notNullable().defaultTo(0);
    table.integer("rpo_readiness_score").notNullable().defaultTo(0);
    table.integer("runbook_completeness_score").notNullable().defaultTo(0);
    table.integer("failover_test_score").notNullable().defaultTo(0);
    table.jsonb("gaps").notNullable().defaultTo("[]");
    table.jsonb("recommendations").notNullable().defaultTo("[]");
    table.string("assessed_by", 255).nullable();
    table.timestamp("assessed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("bridge_id");
    table.index("readiness_level");
    table.index("assessed_at");
    table.index(["bridge_id", "assessed_at"]);
  });

  await knex.schema.createTable("dr_readiness_checks", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("assessment_id").notNullable().references("id").inTable("dr_readiness_assessments").onDelete("CASCADE");
    table.string("check_name", 100).notNullable();
    table.string("category", 50).notNullable();
    table.boolean("passed").notNullable().defaultTo(false);
    table.integer("score").notNullable().defaultTo(0);
    table.text("notes").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("assessment_id");
    table.index("category");
    table.index("passed");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("dr_readiness_checks");
  await knex.schema.dropTableIfExists("dr_readiness_assessments");
}
