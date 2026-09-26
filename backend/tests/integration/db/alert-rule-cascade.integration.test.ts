import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "crypto";
import knex, { type Knex } from "knex";
import { up, down } from "../../../src/database/migrations/014_alert_rules_engine.js";

/**
 * Regression test for issue #1277.
 *
 * Applies the real 014_alert_rules_engine migration and proves that deleting
 * a row from `alert_rules_v2` cascades to `alert_rule_versions` (FK declared
 * with ON DELETE CASCADE). Before the cascade existed, the delete threw
 * `update or delete on table violates foreign key constraint`.
 *
 * Self-contained: manages only its own two tables with a dedicated
 * connection, so it does not depend on the full migration chain or
 * TimescaleDB.
 */
describe("alert rule version cascade (integration)", () => {
  let db: Knex;

  beforeEach(async () => {
    db = knex({
      client: "pg",
      connection: {
        host: process.env.POSTGRES_HOST ?? "localhost",
        port: Number(process.env.POSTGRES_PORT ?? "5432"),
        database: process.env.POSTGRES_DB ?? "bridge_watch_test",
        user: process.env.POSTGRES_USER ?? "bridge_watch",
        password: process.env.POSTGRES_PASSWORD ?? "test_password",
      },
    });
    await db.raw(`DROP TABLE IF EXISTS "alert_rule_versions"`);
    await db.raw(`DROP TABLE IF EXISTS "alert_rules_v2"`);
    await up(db);
  });

  afterAll(async () => {
    if (db) {
      await down(db).catch(() => undefined);
      await db.destroy();
    }
  });

  async function seedRule(name: string): Promise<string> {
    const id = randomUUID();
    await db("alert_rules_v2").insert({
      id,
      owner_address: "GTEST123456789",
      name,
      asset_code: "USDC",
      conditions: JSON.stringify([{ metric: "price", operator: "gt", threshold: 1 }]),
    });
    return id;
  }

  async function seedVersion(ruleId: string, version: number): Promise<void> {
    await db("alert_rule_versions").insert({
      id: randomUUID(),
      rule_id: ruleId,
      version,
      snapshot: JSON.stringify({ name: `v${version}` }),
      changed_by: "tester",
    });
  }

  it("deletes versions when their rule is deleted", async () => {
    const ruleId = await seedRule("Cascade Probe");
    await seedVersion(ruleId, 1);
    await seedVersion(ruleId, 2);

    expect(await db("alert_rule_versions").where({ rule_id: ruleId })).toHaveLength(2);

    await db("alert_rules_v2").where({ id: ruleId }).delete();

    expect(await db("alert_rule_versions").where({ rule_id: ruleId })).toHaveLength(0);
  });

  it("leaves versions of other rules untouched", async () => {
    const doomedId = await seedRule("Doomed");
    const keptId = await seedRule("Kept");
    await seedVersion(doomedId, 1);
    await seedVersion(keptId, 1);

    await db("alert_rules_v2").where({ id: doomedId }).delete();

    expect(await db("alert_rule_versions").where({ rule_id: doomedId })).toHaveLength(0);
    expect(await db("alert_rule_versions").where({ rule_id: keptId })).toHaveLength(1);
  });
});
