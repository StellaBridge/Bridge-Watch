import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SCOPE NOTE: this service stores a filtered snapshot of alert_events into an
 * alert_replay_events table and tracks export status — it does not actually
 * generate a CSV or JSON file anywhere. `processExport` never branches on
 * `format` at all, there is no CSV serialization/escaping code in this
 * codebase for this feature, and there is no "operator audit notes" field on
 * either ReplayExport or ReplayEvent. There is also no response-streaming
 * mechanism; "handling large datasets" in the real implementation means a
 * hard 10,000-row cap on the source query plus writing the captured rows to
 * `alert_replay_events` in batches of 500. Each test below is grounded in
 * that real behavior:
 *   - "CSV formatting/escaping" -> proven that `format` has zero effect on
 *     what gets processed and stored (there is nothing to escape, because
 *     there is no serialization step at all).
 *   - "JSON payload with complete event metadata" -> `getExportEvents`'s
 *     row-to-ReplayEvent mapping, which is the real place a consumer reads
 *     back fully-typed event data.
 *   - "pagination and streaming for large datasets" -> `listExports`'s
 *     limit/offset pagination, the source query's 10,000-row cap, and the
 *     500-row batched inserts into alert_replay_events.
 */

function buildPredicate(args: unknown[]): (row: Record<string, unknown>) => boolean {
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    const obj = args[0] as Record<string, unknown>;
    return (row) => Object.entries(obj).every(([k, v]) => row[k] === v);
  }
  if (args.length === 2) {
    const [key, value] = args as [string, unknown];
    return (row) => row[key] === value;
  }
  if (args.length === 3) {
    const [key, op, value] = args as [string, string, unknown];
    return (row) => {
      const toComparable = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "string" ? new Date(v).getTime() : v);
      const a = toComparable(row[key]);
      const b = toComparable(value);
      switch (op) {
        case ">=":
          return (a as number) >= (b as number);
        case "<=":
          return (a as number) <= (b as number);
        case ">":
          return (a as number) > (b as number);
        case "<":
          return (a as number) < (b as number);
        default:
          return a === b;
      }
    };
  }
  return () => true;
}

function createTableChain(
  getRows: () => Record<string, unknown>[],
  setRows: (rows: Record<string, unknown>[]) => void,
  inheritedConditions: Array<(row: Record<string, unknown>) => boolean> = []
) {
  const conditions = [...inheritedConditions];
  const matched = () => getRows().filter((row) => conditions.every((p) => p(row)));

  const chain: any = {};
  chain.where = vi.fn().mockImplementation((...args: unknown[]) => {
    conditions.push(buildPredicate(args));
    return chain;
  });
  chain.clone = vi.fn().mockImplementation(() => createTableChain(getRows, setRows, conditions));
  chain.first = vi.fn().mockImplementation(() => Promise.resolve(matched()[0] ?? null));
  chain.count = vi.fn().mockImplementation(() => Promise.resolve([{ count: matched().length }]));
  chain.update = vi.fn().mockImplementation((patch: Record<string, unknown>) => {
    const rows = matched();
    for (const row of rows) Object.assign(row, patch);
    return Promise.resolve(rows.length);
  });
  chain.del = vi.fn().mockImplementation(() => {
    const toDelete = new Set(matched());
    setRows(getRows().filter((r) => !toDelete.has(r)));
    return Promise.resolve(toDelete.size);
  });
  chain.insert = vi.fn().mockImplementation((payload: Record<string, unknown> | Record<string, unknown>[]) => {
    const payloads = Array.isArray(payload) ? payload : [payload];
    const inserted = payloads.map((p, i) => ({ id: `row-${getRows().length + i}-${Math.random().toString(36).slice(2, 8)}`, ...p }));
    setRows([...getRows(), ...inserted]);
    chain.__inserted = inserted;
    return chain;
  });
  chain.returning = vi.fn().mockImplementation(() => Promise.resolve(chain.__inserted ?? []));
  chain.select = vi.fn().mockReturnValue(chain);

  let orderCol: string | null = null;
  let orderDir: "asc" | "desc" = "asc";
  chain.orderBy = vi.fn().mockImplementation((col: string, dir: "asc" | "desc" = "asc") => {
    orderCol = col;
    orderDir = dir;
    return chain;
  });
  let limitN: number | undefined;
  chain.limit = vi.fn().mockImplementation((n: number) => {
    limitN = n;
    return chain;
  });
  let offsetN = 0;
  chain.offset = vi.fn().mockImplementation((n: number) => {
    offsetN = n;
    return chain;
  });

  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    let rows = matched();
    if (orderCol) {
      const col = orderCol;
      rows = [...rows].sort((a, b) => {
        const toComparable = (v: unknown) => (v instanceof Date ? v.getTime() : v);
        const av = toComparable(a[col]) as number;
        const bv = toComparable(b[col]) as number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return orderDir === "desc" ? -cmp : cmp;
      });
    }
    rows = rows.slice(offsetN, limitN !== undefined ? offsetN + limitN : undefined);
    return Promise.resolve(rows).then(resolve, reject);
  };

  return chain;
}

interface FakeDbOptions {
  alert_replay_exports?: Record<string, unknown>[];
  alert_replay_events?: Record<string, unknown>[];
  alert_events?: Record<string, unknown>[];
  throwForTable?: Record<string, Error>;
}

function createFakeDb(options: FakeDbOptions = {}) {
  const state: Record<string, Record<string, unknown>[]> = {
    alert_replay_exports: [...(options.alert_replay_exports ?? [])],
    alert_replay_events: [...(options.alert_replay_events ?? [])],
    alert_events: [...(options.alert_events ?? [])],
  };
  const chainsByTable: Record<string, any[]> = {};

  const db: any = vi.fn((table: string) => {
    if (options.throwForTable?.[table]) {
      throw options.throwForTable[table];
    }
    state[table] ??= [];
    const chain = createTableChain(
      () => state[table],
      (rows) => {
        state[table] = rows;
      }
    );
    (chainsByTable[table] ??= []).push(chain);
    return chain;
  });
  db.fn = { now: () => new Date() };

  return { db, state, chainsByTable };
}

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({ db: undefined as any }));
vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mocks.db,
}));

import { AlertReplayExportService } from "../../src/services/alertReplayExport.service.js";
import type { ReplayEvent } from "../../src/services/alertReplayExport.service.js";

function makeAlertEventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "evt-row-1",
    event_id: "evt-1",
    rule_id: "rule-1",
    asset_code: "USDC",
    alert_type: "price_deviation",
    priority: "high",
    triggered_value: 0.97,
    threshold: 0.99,
    metric: "price",
    context: JSON.stringify({ exchange: "sdex" }),
    time: new Date("2026-06-01T12:00:00Z"),
    ...overrides,
  };
}

describe("AlertReplayExportService.createExport", () => {
  let service: AlertReplayExportService;

  beforeEach(() => {
    service = new AlertReplayExportService();
    vi.spyOn(service as any, "processExport").mockResolvedValue(undefined);
  });

  it("stores the export with its filter criteria and format, returning the mapped record", async () => {
    const { db } = createFakeDb();
    mocks.db = db;

    const result = await service.createExport("GABC", { assetCode: "USDC", startDate: "2026-01-01" }, "json");

    expect(result.ownerAddress).toBe("GABC");
    expect(result.format).toBe("json");
    expect(result.filterCriteria).toEqual({ assetCode: "USDC", startDate: "2026-01-01" });
    expect(result.id).toBeDefined();
  });

  it("kicks off processing in the background without waiting for it to finish", async () => {
    const { db } = createFakeDb();
    mocks.db = db;
    let resolveProcessing!: () => void;
    (service as any).processExport.mockImplementation(
      () => new Promise<void>((resolve) => (resolveProcessing = resolve))
    );

    const result = await service.createExport("GABC", {});

    // createExport already resolved even though processExport's own promise
    // is still pending — confirming it is genuinely fire-and-forget.
    expect((service as any).processExport).toHaveBeenCalledWith(result.id);
    resolveProcessing();
  });
});

describe("AlertReplayExportService.getExport / deleteExport", () => {
  let service: AlertReplayExportService;

  beforeEach(() => {
    service = new AlertReplayExportService();
  });

  it("returns the mapped export for an existing id and null for an unknown one", async () => {
    const { db } = createFakeDb({
      alert_replay_exports: [
        { id: "exp-1", owner_address: "GABC", status: "completed", filter_criteria: "{}", format: "csv", requested_at: new Date(), completed_at: new Date() },
      ],
    });
    mocks.db = db;

    const found = await service.getExport("exp-1");
    const missing = await service.getExport("exp-404");

    expect(found?.status).toBe("completed");
    expect(missing).toBeNull();
  });

  it("deletes an existing export and reports false for one that doesn't exist", async () => {
    const { db, state } = createFakeDb({
      alert_replay_exports: [{ id: "exp-1", owner_address: "GABC", filter_criteria: "{}", format: "csv" }],
    });
    mocks.db = db;

    expect(await service.deleteExport("exp-1")).toBe(true);
    expect(state.alert_replay_exports).toHaveLength(0);
    expect(await service.deleteExport("exp-1")).toBe(false);
  });
});

describe("AlertReplayExportService.listExports — pagination", () => {
  let service: AlertReplayExportService;

  function seedExports(owner: string, count: number, baseTime: Date) {
    return Array.from({ length: count }, (_, i) => ({
      id: `exp-${owner}-${i}`,
      owner_address: owner,
      status: "completed",
      filter_criteria: "{}",
      format: "csv",
      requested_at: new Date(baseTime.getTime() + i * 1000),
      completed_at: null,
    }));
  }

  beforeEach(() => {
    service = new AlertReplayExportService();
  });

  it("returns the requested page in newest-first order along with the total unpaginated count", async () => {
    const base = new Date("2026-06-01T00:00:00Z");
    const { db } = createFakeDb({ alert_replay_exports: seedExports("GABC", 5, base) });
    mocks.db = db;

    const page = await service.listExports("GABC", 2, 2);

    expect(page.total).toBe(5);
    expect(page.exports).toHaveLength(2);
    // Newest-first: index 4 (latest) and 3 come first; offset 2 skips those two.
    expect(page.exports.map((e) => e.id)).toEqual(["exp-GABC-2", "exp-GABC-1"]);
  });

  it("scopes results to the requested owner only", async () => {
    const base = new Date("2026-06-01T00:00:00Z");
    const { db } = createFakeDb({
      alert_replay_exports: [...seedExports("GABC", 3, base), ...seedExports("GXYZ", 4, base)],
    });
    mocks.db = db;

    const page = await service.listExports("GABC");

    expect(page.total).toBe(3);
    expect(page.exports.every((e) => e.ownerAddress === "GABC")).toBe(true);
  });
});

describe("AlertReplayExportService.getExportEvents — complete event metadata", () => {
  let service: AlertReplayExportService;

  beforeEach(() => {
    service = new AlertReplayExportService();
  });

  it("maps every stored field, coercing numeric strings and parsing context JSON", async () => {
    const { db } = createFakeDb({
      alert_replay_events: [
        {
          id: "rev-1",
          export_id: "exp-1",
          event_id: "evt-1",
          rule_id: "rule-1",
          asset_code: "USDC",
          alert_type: "price_deviation",
          priority: "high",
          triggered_value: "0.97", // numeric columns often round-trip as strings
          threshold: "0.99",
          metric: "price",
          context: JSON.stringify({ exchange: "sdex" }),
          triggered_at: new Date("2026-06-01T12:05:00Z"),
        },
        {
          id: "rev-2",
          export_id: "exp-1",
          event_id: "evt-2",
          rule_id: "rule-1",
          asset_code: "USDC",
          alert_type: "price_deviation",
          priority: "critical",
          triggered_value: 0.5,
          threshold: 0.99,
          metric: "price",
          context: null,
          triggered_at: new Date("2026-06-01T12:00:00Z"), // earlier than rev-1
        },
      ],
    });
    mocks.db = db;

    const events: ReplayEvent[] = await service.getExportEvents("exp-1");

    // Ordered ascending by triggeredAt regardless of storage order.
    expect(events.map((e) => e.eventId)).toEqual(["evt-2", "evt-1"]);

    const [first] = events;
    expect(first.triggeredValue).toBe(0.5);
    expect(typeof first.triggeredValue).toBe("number");
    expect(first.context).toBeNull();

    const second = events[1];
    expect(second.triggeredValue).toBe(0.97);
    expect(second.threshold).toBe(0.99);
    expect(second.context).toEqual({ exchange: "sdex" });
    expect(second.triggeredAt).toEqual(new Date("2026-06-01T12:05:00Z"));
  });
});

describe("AlertReplayExportService.processExport — time-range filtering and status transitions", () => {
  let service: AlertReplayExportService;

  beforeEach(() => {
    service = new AlertReplayExportService();
  });

  it("filters the source events by the export's date range and other criteria, in chronological order", async () => {
    const inRange = makeAlertEventRow({ event_id: "in-range", time: new Date("2026-06-15T00:00:00Z") });
    const beforeRange = makeAlertEventRow({ event_id: "before-range", time: new Date("2026-05-01T00:00:00Z") });
    const afterRange = makeAlertEventRow({ event_id: "after-range", time: new Date("2026-07-01T00:00:00Z") });
    const wrongAsset = makeAlertEventRow({ event_id: "wrong-asset", asset_code: "EURC", time: new Date("2026-06-15T00:00:00Z") });

    const filter = { assetCode: "USDC", startDate: "2026-06-01T00:00:00Z", endDate: "2026-06-30T00:00:00Z" };
    const { db, state } = createFakeDb({
      alert_replay_exports: [
        { id: "exp-1", owner_address: "GABC", status: "pending", filter_criteria: JSON.stringify(filter), format: "csv" },
      ],
      alert_events: [afterRange, inRange, beforeRange, wrongAsset],
    });
    mocks.db = db;

    await (service as any).processExport("exp-1");

    const stored = state.alert_replay_events;
    expect(stored.map((e) => e.event_id)).toEqual(["in-range"]);

    const exportRow = state.alert_replay_exports[0];
    expect(exportRow.status).toBe("completed");
    expect(exportRow.record_count).toBe(1);
  });

  it("produces identical processing results for 'csv' and 'json' formats — format has no effect on what is captured", async () => {
    const events = [
      makeAlertEventRow({ event_id: "e1", time: new Date("2026-06-01T00:00:00Z") }),
      makeAlertEventRow({ event_id: "e2", time: new Date("2026-06-02T00:00:00Z") }),
    ];
    const filter = {};
    const { db, state } = createFakeDb({
      alert_replay_exports: [
        { id: "exp-csv", owner_address: "GABC", status: "pending", filter_criteria: JSON.stringify(filter), format: "csv" },
        { id: "exp-json", owner_address: "GABC", status: "pending", filter_criteria: JSON.stringify(filter), format: "json" },
      ],
      alert_events: events,
    });
    mocks.db = db;

    await (service as any).processExport("exp-csv");
    await (service as any).processExport("exp-json");

    const csvExport = state.alert_replay_exports.find((e) => e.id === "exp-csv")!;
    const jsonExport = state.alert_replay_exports.find((e) => e.id === "exp-json")!;
    expect(csvExport.record_count).toBe(jsonExport.record_count);

    const csvEvents = state.alert_replay_events.filter((e) => e.export_id === "exp-csv").map((e) => e.event_id);
    const jsonEvents = state.alert_replay_events.filter((e) => e.export_id === "exp-json").map((e) => e.event_id);
    expect(csvEvents.sort()).toEqual(jsonEvents.sort());
  });

  it("caps the source query at 10,000 rows regardless of how much matches", async () => {
    const { db, chainsByTable } = createFakeDb({
      alert_replay_exports: [{ id: "exp-1", owner_address: "GABC", status: "pending", filter_criteria: "{}", format: "csv" }],
      alert_events: [],
    });
    mocks.db = db;

    await (service as any).processExport("exp-1");

    const eventsChain = chainsByTable["alert_events"][0];
    expect(eventsChain.limit).toHaveBeenCalledWith(10000);
  });

  it("writes a large matching dataset to alert_replay_events in batches of 500", async () => {
    const bigDataset = Array.from({ length: 1200 }, (_, i) =>
      makeAlertEventRow({ event_id: `evt-${i}`, time: new Date(Date.UTC(2026, 5, 1, 0, 0, i)) })
    );
    const { db, chainsByTable, state } = createFakeDb({
      alert_replay_exports: [{ id: "exp-1", owner_address: "GABC", status: "pending", filter_criteria: "{}", format: "csv" }],
      alert_events: bigDataset,
    });
    mocks.db = db;

    await (service as any).processExport("exp-1");

    const insertChains = (chainsByTable["alert_replay_events"] ?? []).filter((c) => c.insert.mock.calls.length > 0);
    const batchSizes = insertChains.map((c) => c.insert.mock.calls[0][0].length);

    expect(batchSizes).toEqual([500, 500, 200]);
    expect(state.alert_replay_events).toHaveLength(1200);
  });

  it("marks the export failed and records the error message when writing the replay events fails", async () => {
    const { db, state } = createFakeDb({
      alert_replay_exports: [{ id: "exp-1", owner_address: "GABC", status: "pending", filter_criteria: "{}", format: "csv" }],
      alert_events: [makeAlertEventRow()],
      throwForTable: { alert_replay_events: new Error("connection terminated") },
    });
    mocks.db = db;

    await expect((service as any).processExport("exp-1")).rejects.toThrow("connection terminated");

    const exportRow = state.alert_replay_exports[0];
    expect(exportRow.status).toBe("failed");
    expect(exportRow.error_message).toBe("connection terminated");
  });
});
