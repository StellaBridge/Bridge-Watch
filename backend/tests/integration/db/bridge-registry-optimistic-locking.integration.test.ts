import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getDatabase, closeDatabase } from "../../../src/database/connection.js";
import { up as up001 } from "../../../src/database/migrations/001_initial_schema.js";
import { up as up015 } from "../../../src/database/migrations/015_bridge_registry.js";
import { up as upVersion } from "../../../src/database/migrations/20260926_optimistic_locking_version.js";
import {
  BridgeRegistryService,
  OptimisticLockConflictError,
} from "../../../src/services/bridge-registry.service.js";

/**
 * Optimistic locking for bridge configuration writes (issue #1279).
 *
 * Applies the real 001 + 015 + version migrations, then proves through the
 * real service that a stale `version` rejects the second writer with a 409
 * conflict instead of silently losing the first writer's update.
 *
 * Self-contained: manages only its own tables with the shared test
 * connection, so it does not depend on the full migration chain or
 * TimescaleDB.
 */
describe("bridge registry optimistic locking (integration)", () => {
  const service = new BridgeRegistryService();

  beforeEach(async () => {
    const db = getDatabase();
    await db.raw(`DROP TABLE IF EXISTS "bridge_registry_history"`);
    await db.raw(`DROP TABLE IF EXISTS "bridge_registry"`);
    await db.raw(`DROP TABLE IF EXISTS "health_scores"`);
    await db.raw(`DROP TABLE IF EXISTS "prices"`);
    await db.raw(`DROP TABLE IF EXISTS "bridges"`);
    await db.raw(`DROP TABLE IF EXISTS "assets"`);
    await up001(db);
    await up015(db);
    await upVersion(db);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function seedBridge(bridgeId: string): Promise<void> {
    await service.create({
      bridge_id: bridgeId,
      name: bridgeId,
      display_name: `${bridgeId} display`,
      supported_chains: ["ethereum", "stellar"],
    });
  }

  it("starts new rows at version 1", async () => {
    await seedBridge("v1probe");
    const entry = await service.getById("v1probe");
    expect(entry?.version).toBe(1);
  });

  it("bumps the version on update", async () => {
    await seedBridge("bump");
    const before = await service.getById("bump");
    const updated = await service.update("bump", { display_name: "New" }, before?.version);
    expect(updated?.version).toBe((before?.version ?? 1) + 1);
  });

  it("rejects a stale version with a 409 conflict", async () => {
    await seedBridge("race");
    const first = await service.getById("race");

    // First writer wins and moves the revision forward.
    await service.update("race", { display_name: "First" }, first?.version);

    // Second writer still holds the old revision: must fail, not overwrite.
    await expect(
      service.update("race", { display_name: "Second" }, first?.version)
    ).rejects.toBeInstanceOf(OptimisticLockConflictError);

    const current = await service.getById("race");
    expect(current?.display_name).toBe("First");

    try {
      await service.update("race", { display_name: "Second" }, first?.version);
      expect.unreachable("stale write should have thrown");
    } catch (err) {
      expect((err as OptimisticLockConflictError).statusCode).toBe(409);
    }
  });

  it("keeps legacy behavior when no version is supplied", async () => {
    await seedBridge("legacy");
    const updated = await service.update("legacy", { display_name: "Legacy" });
    expect(updated?.display_name).toBe("Legacy");
    expect(updated?.version).toBe(2);
  });

  it("adds a version column to the bridges table with default 1", async () => {
    const db = getDatabase();
    await db("bridges").insert({ name: "probe-bridge", source_chain: "ethereum" });
    const row = await db("bridges").where({ name: "probe-bridge" }).first();
    expect(Number(row.version)).toBe(1);
  });
});
