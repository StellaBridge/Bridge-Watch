import type { Knex } from "knex";

/**
 * #1184 — Queue Priority Fairness.
 *
 * Deficit Round Robin (DRR) scheduler for fair lane servicing across
 * priority queues. Each lane (critical/high/medium/low) gets a weight
 * and a minimum share guarantee to prevent starvation.
 *
 * Configuration is persisted so operators can tune without code changes.
 * Samples are stored for observability and historical fairness analysis.
 */
export async function up(knex: Knex): Promise<void> {
  // Lane policies: weight + minimum share + enable/disable
  await knex.schema.createTable("queue_fairness_policies", (t) => {
    t.string("lane_name", 32).primary(); // 'critical' | 'high' | 'medium' | 'low'
    t.integer("weight").notNullable().defaultTo(1); // DRR weight
    t.integer("min_share_pct").notNullable().defaultTo(0); // 0-100 minimum guaranteed share
    t.boolean("enabled").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.check("weight >= 1 AND weight <= 100", [], "chk_fairness_weight");
    t.check("min_share_pct >= 0 AND min_share_pct <= 100", [], "chk_fairness_min_share");
  });

  // Per-lane samples for fairness assessment
  await knex.schema.createTable("queue_fairness_samples", (t) => {
    t.bigIncrements("id").primary();
    t.string("lane_name", 32).notNullable();
    t.bigInteger("depth").notNullable(); // jobs waiting
    t.bigInteger("served_count").notNullable(); // jobs completed in window
    t.bigInteger("served_bytes").nullable(); // optional: work volume
    t.timestamp("sampled_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["lane_name", "sampled_at"], "idx_fairness_sample_lane_time");
    t.index(["sampled_at"], "idx_fairness_sample_time");
  });

  // Fairness assessments (derived from samples)
  await knex.schema.createTable("queue_fairness_assessments", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("lane_name", 32).notNullable();
    t.string("status", 16).notNullable(); // 'healthy' | 'degraded' | 'unfair' | 'starved'
    t.string("reason", 500).notNullable();
    t.integer("consecutive_unfair").notNullable().defaultTo(0);
    t.timestamp("assessed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["lane_name", "assessed_at"], "idx_fairness_assessment_lane_time");
    t.index(["status", "assessed_at"], "idx_fairness_assessment_status_time");
  });

  // Seed default policies
  await knex("queue_fairness_policies").insert([
    { lane_name: "critical", weight: 8, min_share_pct: 10, enabled: true },
    { lane_name: "high", weight: 4, min_share_pct: 5, enabled: true },
    { lane_name: "medium", weight: 2, min_share_pct: 5, enabled: true },
    { lane_name: "low", weight: 1, min_share_pct: 10, enabled: true }, // guaranteed minimum to prevent starvation
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("queue_fairness_assessments");
  await knex.schema.dropTableIfExists("queue_fairness_samples");
  await knex.schema.dropTableIfExists("queue_fairness_policies");
}