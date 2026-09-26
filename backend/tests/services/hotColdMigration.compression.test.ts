import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HotColdMigrationService,
  type ChunkCompressionStats,
} from "../../src/services/hotColdMigration.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/utils/redis.js", () => ({
  redis: { del: vi.fn(), scan: vi.fn().mockResolvedValue([0, []]) },
}));

// Minimal knex stand-in: only raw() is exercised by the compression methods.
function makeDb(rawImpl: (sql: string, bindings?: unknown[]) => Promise<unknown>) {
  const db = vi.fn();
  (db as unknown as Record<string, unknown>).raw = vi.fn().mockImplementation(rawImpl);
  return db;
}

describe("hotColdMigration chunk compression (issue #1273)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ensureChunkCompression", () => {
    it("applies compression policy statements and reports applied", async () => {
      const seen: string[] = [];
      const db = makeDb(async (sql: string) => {
        seen.push(sql);
        return { rows: [] };
      });
      const svc = new HotColdMigrationService(db as never);

      const result = await svc.ensureChunkCompression("prices");

      expect(result).toEqual({ applied: true });
      expect(seen.some((s) => s.includes("timescaledb.compress = true"))).toBe(true);
      expect(seen.some((s) => s.includes("add_compression_policy"))).toBe(true);
      expect(seen.some((s) => s.includes("INTERVAL '7 days'"))).toBe(true);
    });

    it("rejects unknown entity types", async () => {
      const db = makeDb(async () => ({ rows: [] }));
      const svc = new HotColdMigrationService(db as never);
      await expect(svc.ensureChunkCompression("nope")).rejects.toThrow(/unknown entityType/);
    });

    it("returns applied:false when TimescaleDB is absent", async () => {
      const db = makeDb(async () => {
        throw new Error('function add_compression_policy(unknown, interval) does not exist');
      });
      const svc = new HotColdMigrationService(db as never);

      const result = await svc.ensureChunkCompression("prices");

      expect(result.applied).toBe(false);
      expect(result.reason).toMatch(/add_compression_policy/);
    });
  });

  describe("getChunkCompressionStats", () => {
    it("reports chunk counts, ratio, and read-probe latency", async () => {
      const db = makeDb(async (sql: string) => {
        if (sql.includes("timescaledb_information.chunks")) {
          return { rows: [{ total: "8", compressed: "6" }] };
        }
        return { rows: [{ time: new Date().toISOString() }] };
      });
      const svc = new HotColdMigrationService(db as never);

      const stats: ChunkCompressionStats = await svc.getChunkCompressionStats("prices");

      expect(stats.timescaledbAvailable).toBe(true);
      expect(stats.totalChunks).toBe(8);
      expect(stats.compressedChunks).toBe(6);
      expect(stats.compressionRatio).toBeCloseTo(0.75);
      expect(typeof stats.readProbeMs).toBe("number");
    });

    it("degrades gracefully when TimescaleDB is absent", async () => {
      const db = makeDb(async () => {
        throw new Error("relation \"timescaledb_information.chunks\" does not exist");
      });
      const svc = new HotColdMigrationService(db as never);

      const stats = await svc.getChunkCompressionStats("prices");

      expect(stats.timescaledbAvailable).toBe(false);
      expect(stats.compressionRatio).toBeNull();
      expect(stats.readProbeMs).toBeNull();
    });
  });
});
