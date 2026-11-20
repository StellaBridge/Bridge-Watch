import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase } from "../../../database/connection.js";
import { ParseQuarantineQueueService } from "../../../services/parseQuarantineQueue.service.js";

vi.mock("../../../database/connection.js", () => ({ getDatabase: vi.fn() }));
vi.mock("../../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const row = (status = "quarantined") => ({
  id: "q1", source: "bridge-1", data_type: "event",
  raw_payload: '{"invalid":true}', parse_error: "bad parser",
  error_code: null, status, retry_count: status === "in_review" ? 1 : 0,
  retry_history: status === "in_review" ? '[{"by":"operator"}]' : "[]",
  priority: 1, reviewed_by: null, resolution_note: null,
  quarantined_at: "2026-11-18T00:00:00Z", reviewed_at: null, resolved_at: null,
});

function queryMock(result = row()) {
  const calls: Record<string, ReturnType<typeof vi.fn>>[] = [];
  const build = () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["where", "forUpdate", "modify", "orderBy", "limit", "offset", "insert", "update"]) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }
    chain.modify = vi.fn((callback: (qb: unknown) => void) => { callback(chain); return chain; });
    chain.first = vi.fn().mockResolvedValue(result);
    chain.returning = vi.fn().mockResolvedValue([result]);
    chain.then = vi.fn((resolve: (rows: unknown[]) => void) => Promise.resolve(resolve([result])));
    calls.push(chain);
    return chain;
  };
  const db = Object.assign(vi.fn(() => build()), {
    transaction: vi.fn(async (fn: (trx: unknown) => Promise<unknown>) => fn(vi.fn(() => build()))),
  });
  vi.mocked(getDatabase).mockReturnValue(db as never);
  return { db, calls };
}

const service = new ParseQuarantineQueueService();

beforeEach(() => vi.clearAllMocks());

describe("parse quarantine records (#1672)", () => {
  it("persists malformed payloads with the exact parse error", async () => {
    const { calls } = queryMock();
    const result = await service.enqueue({
      source: "bridge-1", dataType: "event", rawPayload: { invalid: true },
      parseError: "bad parser", priority: 1,
    });
    expect(calls[0].insert).toHaveBeenCalledWith(expect.objectContaining({
      source: "bridge-1", raw_payload: '{"invalid":true}',
      parse_error: "bad parser", status: "quarantined",
    }));
    expect(result.parseError).toBe("bad parser");
  });

  it("filters records by bridge and orders by quarantine timestamp", async () => {
    const { calls } = queryMock();
    const result = await service.list({ source: "bridge-1", status: "quarantined" });
    expect(result).toHaveLength(1);
    expect(calls[0].where).toHaveBeenCalledWith("source", "bridge-1");
    expect(calls[0].orderBy).toHaveBeenCalledWith("quarantined_at", "asc");
  });

  it("replays an event after a parser fix and records the attempt", async () => {
    const { db, calls } = queryMock();
    const result = await service.retry("q1", "operator");
    expect(db.transaction).toHaveBeenCalledOnce();
    const update = calls.find((call) => call.update.mock.calls.length > 0);
    expect(update?.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "in_review", retry_count: 1,
      retry_history: expect.stringContaining('"by":"operator"'),
    }));
    expect(result?.rawPayload).toEqual({ invalid: true });
  });

  it("disposes irrecoverable events without destroying their audit record", async () => {
    const { calls } = queryMock();
    await service.dispose("q1", "operator", "unrecoverable");
    const update = calls.find((call) => call.update.mock.calls.length > 0);
    expect(update?.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "disposed", resolution_note: "unrecoverable",
    }));
  });

  it("returns null rather than replaying a disposed record", async () => {
    const { db } = queryMock(row("disposed"));
    expect(await service.retry("q1", "operator")).toBeNull();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
