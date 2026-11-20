import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "../../../database/connection.js";
import {
  ConcurrencyConflictError,
  OptimisticLockingVersionService,
} from "../../../services/optimisticLockingVersion.service.js";

vi.mock("../../../database/connection.js", () => ({ getDatabase: vi.fn() }));

const service = new OptimisticLockingVersionService();
let current: { id: string; version: number; value: string } | null;
let conflicts: number;
let reads: number;

beforeEach(() => {
  vi.clearAllMocks();
  current = { id: "item-1", version: 2, value: "old" };
  conflicts = 0;
  reads = 0;
  const db = vi.fn((_table: string) => {
    let filter: Record<string, unknown> = {};
    const chain = {
      where: vi.fn((where: Record<string, unknown>) => { filter = where; return chain; }),
      update: vi.fn((changes: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          if (conflicts > 0) {
            conflicts--;
            if (current) current = { ...current, version: current.version + 1 };
            return [];
          }
          if (!current || filter.id !== current.id || filter.version !== current.version) return [];
          current = { ...current, ...changes };
          return [{ ...current }];
        }),
      })),
      first: vi.fn(async () => { reads++; return current ? { ...current } : undefined; }),
    };
    return chain;
  });
  vi.mocked(getDatabase).mockReturnValue(db as never);
});

describe("OptimisticLockingVersionService (#1671)", () => {
  it("updates only when the expected version matches and increments atomically", async () => {
    const saved = await service.update("bridge_records", "item-1", 2, { value: "new" });
    expect(saved).toMatchObject({ version: 3, value: "new" });
    expect(current?.version).toBe(3);
  });

  it("throws ConcurrencyConflictError containing the current record", async () => {
    await expect(service.update("bridge_records", "item-1", 1, { value: "new" }))
      .rejects.toMatchObject({
        name: "ConcurrencyConflictError",
        expectedVersion: 1,
        currentRecord: { id: "item-1", version: 2, value: "old" },
      });
  });

  it("rejects updates to protected version and identity fields", async () => {
    await expect(service.update("bridge_records", "item-1", 2, { version: 999 })).rejects.toThrow("Cannot directly modify");
    await expect(service.update("bridge_records", "item-1", 2, { id: "other" })).rejects.toThrow("Cannot directly modify");
  });

  it("retries conflicts using refreshed state and exponential backoff", async () => {
    vi.useFakeTimers();
    try {
      conflicts = 2;
      const result = service.updateWithRetry("bridge_records", "item-1",
        (record) => ({ value: `v${record.version}` }), { maxRetries: 2, baseDelayMs: 10 });
      await vi.runAllTimersAsync();
      await expect(result).resolves.toMatchObject({ version: 5, value: "v4" });
      expect(reads).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying when the conflict budget is exhausted", async () => {
    conflicts = 2;
    await expect(service.updateWithRetry("bridge_records", "item-1",
      () => ({ value: "x" }), { maxRetries: 0, baseDelayMs: 0 }))
      .rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it("rejects missing records", async () => {
    current = null;
    await expect(service.update("bridge_records", "item-1", 0, { value: "x" }))
      .rejects.toMatchObject({ currentRecord: null });
  });
});
