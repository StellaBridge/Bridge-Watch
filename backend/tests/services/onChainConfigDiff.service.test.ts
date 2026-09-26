import { describe, it, expect, vi, beforeEach } from "vitest";
import { OnChainConfigDiffService } from "../../src/services/onChainConfigDiff.service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshotRow(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: "snap-1",
    contract_id: "GABC123",
    network: "stellar:mainnet",
    ledger_sequence: 1000,
    config: JSON.stringify({ admin: "GA1", fee: 10 }),
    config_hash: "aabbcc",
    captured_by: "system",
    captured_at: new Date("2026-09-25T00:00:00Z"),
    ...overrides,
  };
}

function makeDiffRow(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: "diff-1",
    contract_id: "GABC123",
    from_snapshot_id: "snap-1",
    to_snapshot_id: "snap-2",
    from_ledger_sequence: 1000,
    to_ledger_sequence: 2000,
    field_diffs: JSON.stringify([
      { field: "fee", changeType: "modified", fromValue: 10, toValue: 20 },
    ]),
    fields_added: 0,
    fields_removed: 0,
    fields_modified: 1,
    summary: "Config changed.",
    computed_by: "admin",
    computed_at: new Date("2026-09-25T01:00:00Z"),
    ...overrides,
  };
}

/** Builds a minimal Knex-style query chain that resolves first() to `result`. */
function makeChain(firstResult: unknown, rows?: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(firstResult);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(
    rows ?? (firstResult ? [firstResult] : [])
  );
  chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
    Promise.resolve(fn(rows ?? []))
  );
  return chain;
}

function freshService(): OnChainConfigDiffService {
  (OnChainConfigDiffService as unknown as { instance: unknown }).instance =
    undefined;
  return OnChainConfigDiffService.getInstance();
}

// ---------------------------------------------------------------------------
// diffConfigs — pure unit tests (no DB)
// ---------------------------------------------------------------------------

describe("OnChainConfigDiffService — diffConfigs", () => {
  it("detects added fields", () => {
    const service = freshService();
    const diffs = service.diffConfigs({ a: 1 }, { a: 1, b: 2 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      field: "b",
      changeType: "added",
      fromValue: undefined,
      toValue: 2,
    });
  });

  it("detects removed fields", () => {
    const service = freshService();
    const diffs = service.diffConfigs({ a: 1, b: 2 }, { a: 1 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      field: "b",
      changeType: "removed",
      fromValue: 2,
      toValue: undefined,
    });
  });

  it("detects modified fields", () => {
    const service = freshService();
    const diffs = service.diffConfigs({ fee: 10 }, { fee: 20 });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      field: "fee",
      changeType: "modified",
      fromValue: 10,
      toValue: 20,
    });
  });

  it("returns empty diff for identical configs", () => {
    const service = freshService();
    const config = { admin: "GA1", fee: 10 };
    const diffs = service.diffConfigs(config, config);
    expect(diffs).toHaveLength(0);
  });

  it("handles nested object comparison by serialization", () => {
    const service = freshService();
    const from = { settings: { timeout: 30 } };
    const to = { settings: { timeout: 60 } };
    const diffs = service.diffConfigs(from, to);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].changeType).toBe("modified");
  });

  it("produces no diff for nested objects that are equal", () => {
    const service = freshService();
    const from = { settings: { timeout: 30 } };
    const to = { settings: { timeout: 30 } };
    expect(service.diffConfigs(from, to)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// captureSnapshot
// ---------------------------------------------------------------------------

describe("OnChainConfigDiffService — captureSnapshot", () => {
  it("returns existing snapshot when already captured at same ledger", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const existingRow = makeSnapshotRow();
    const chain = makeChain(existingRow);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const snap = await service.captureSnapshot(
      "GABC123",
      "stellar:mainnet",
      1000,
      { admin: "GA1", fee: 10 },
      "system"
    );

    expect(snap.id).toBe("snap-1");
    // insert should NOT have been called
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it("inserts a new row when snapshot does not exist", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const newRow = makeSnapshotRow({ id: "snap-new", ledger_sequence: 2000 });
    let callCount = 0;
    const buildChain = (result: unknown) => {
      const c = makeChain(result);
      return c;
    };

    // first call = SELECT (returns null = not found), second = INSERT returning
    const db = (_t: string) => {
      callCount += 1;
      if (callCount === 1) return buildChain(null);
      return buildChain(newRow);
    };
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const service = freshService();
    const snap = await service.captureSnapshot(
      "GABC123",
      "stellar:mainnet",
      2000,
      { admin: "GA1", fee: 10 },
      "system"
    );

    expect(snap.id).toBe("snap-new");
  });
});

// ---------------------------------------------------------------------------
// computeDiff
// ---------------------------------------------------------------------------

describe("OnChainConfigDiffService — computeDiff", () => {
  it("throws when fromSnapshotId equals toSnapshotId", async () => {
    const service = freshService();
    await expect(
      service.computeDiff("snap-1", "snap-1", "admin")
    ).rejects.toThrow(/must be different/);
  });

  it("throws when a snapshot is not found", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    let callCount = 0;
    const db = (_t: string) => {
      callCount += 1;
      // diff cache check returns null, then from snapshot returns null
      return makeChain(null);
    };
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const service = freshService();
    await expect(
      service.computeDiff("snap-1", "snap-2", "admin")
    ).rejects.toThrow(/not found/);
  });

  it("throws when snapshots belong to different contracts", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const fromRow = makeSnapshotRow({ id: "snap-1", contract_id: "GA_A" });
    const toRow = makeSnapshotRow({ id: "snap-2", contract_id: "GA_B" });

    let callCount = 0;
    const db = (_t: string) => {
      callCount += 1;
      if (callCount === 1) return makeChain(null); // cache miss
      if (callCount === 2) return makeChain(fromRow); // from snapshot
      return makeChain(toRow); // to snapshot
    };
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const service = freshService();
    await expect(
      service.computeDiff("snap-1", "snap-2", "admin")
    ).rejects.toThrow(/different contracts/);
  });

  it("returns cached diff without recomputing", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const cachedDiff = makeDiffRow();
    const chain = makeChain(cachedDiff);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const diff = await service.computeDiff("snap-1", "snap-2", "admin");

    expect(diff.id).toBe("diff-1");
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it("inserts a new diff and returns it", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const fromRow = makeSnapshotRow({
      id: "snap-1",
      ledger_sequence: 1000,
      config: JSON.stringify({ fee: 10 }),
    });
    const toRow = makeSnapshotRow({
      id: "snap-2",
      ledger_sequence: 2000,
      config: JSON.stringify({ fee: 20 }),
    });
    const newDiff = makeDiffRow();

    let callCount = 0;
    const db = (_t: string) => {
      callCount += 1;
      if (callCount === 1) return makeChain(null); // cache miss
      if (callCount === 2) return makeChain(fromRow); // from getSnapshot
      if (callCount === 3) return makeChain(toRow);  // to getSnapshot
      return makeChain(newDiff); // insert returning
    };
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const service = freshService();
    const diff = await service.computeDiff("snap-1", "snap-2", "admin");

    expect(diff.fieldsModified).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// listSnapshots / listDiffs
// ---------------------------------------------------------------------------

describe("OnChainConfigDiffService — list operations", () => {
  it("returns snapshots ordered by descending ledger sequence", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const rows = [
      makeSnapshotRow({ id: "s3", ledger_sequence: 3000 }),
      makeSnapshotRow({ id: "s2", ledger_sequence: 2000 }),
      makeSnapshotRow({ id: "s1", ledger_sequence: 1000 }),
    ];
    const chain = makeChain(rows[0], rows);
    chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
      Promise.resolve(fn(rows))
    );
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const snapshots = await service.listSnapshots("GABC123", "stellar:mainnet");
    expect(snapshots[0].ledgerSequence).toBeGreaterThanOrEqual(
      snapshots[snapshots.length - 1].ledgerSequence
    );
  });

  it("returns diffs ordered by descending computed_at", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const rows = [makeDiffRow({ id: "d2" }), makeDiffRow({ id: "d1" })];
    const chain = makeChain(rows[0], rows);
    chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
      Promise.resolve(fn(rows))
    );
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const diffs = await service.listDiffs("GABC123");
    expect(diffs).toHaveLength(2);
  });
});
