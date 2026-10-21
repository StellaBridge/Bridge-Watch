import { describe, it, expect, vi } from "vitest";
import type { Knex } from "knex";
import {
  BitemporalObservationService,
  type BitemporalObservation,
} from "../../src/services/bitemporalObservation.service.js";

/**
 * Builds a fake knex-like query builder shared across every `db(table)` call
 * within a single test, plus a `db.transaction` that hands the callback this
 * same builder as `tx`. Each chain method returns itself so call order in
 * the service (where/whereNull/whereRaw/forUpdate, whereIn/update,
 * insert/returning) doesn't matter, only the terminal result does.
 */
function createFakeDb(options: {
  currentRows?: Array<{ id: string }>;
  insertedRows?: Array<{ id: string }>;
  firstResult?: unknown;
} = {}) {
  const chain: any = {};
  chain.where = vi.fn().mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === "function") {
      (args[0] as (q: unknown) => void)(chain);
    }
    return chain;
  });
  chain.whereNull = vi.fn().mockReturnValue(chain);
  chain.orWhere = vi.fn().mockReturnValue(chain);
  chain.whereRaw = vi.fn().mockReturnValue(chain);
  chain.whereIn = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.forUpdate = vi.fn().mockResolvedValue(options.currentRows ?? []);
  chain.update = vi.fn().mockResolvedValue(options.currentRows?.length ?? 0);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(options.insertedRows ?? [{ id: "new-id" }]);
  chain.first = vi.fn().mockResolvedValue(options.firstResult);

  const table = vi.fn().mockReturnValue(chain);
  const db: any = table;
  db.transaction = vi.fn().mockImplementation(async (fn: (trx: unknown) => Promise<unknown>) => fn(table));

  return { db: db as Knex, chain, table };
}

function observation(overrides: Partial<BitemporalObservation> = {}): BitemporalObservation {
  return {
    kind: "bridge_state",
    subject: "usdc-ethereum",
    validFrom: new Date("2026-01-01T00:00:00Z"),
    validTo: undefined,
    payload: { status: "healthy" },
    ...overrides,
  };
}

describe("BitemporalObservationService.asKnownAt", () => {
  it("queries state as known at a specific past system time and valid time", async () => {
    const asOfRow = { id: "row-1", payload: JSON.stringify({ status: "degraded" }) };
    const { db, chain, table } = createFakeDb({ firstResult: asOfRow });
    const service = new BitemporalObservationService(db);

    const systemTime = new Date("2026-02-01T00:00:00Z");
    const validTime = new Date("2026-01-15T00:00:00Z");

    const result = await service.asKnownAt("bridge_state", "usdc-ethereum", systemTime, validTime);

    expect(result).toBe(asOfRow);
    expect(table).toHaveBeenCalledWith("bitemporal_observations");
    expect(chain.where).toHaveBeenCalledWith({ kind: "bridge_state", subject: "usdc-ethereum" });
    expect(chain.where).toHaveBeenCalledWith("transaction_from", "<=", systemTime);
    expect(chain.where).toHaveBeenCalledWith("valid_from", "<=", validTime);
    expect(chain.orderBy).toHaveBeenCalledWith("transaction_from", "desc");
  });

  it("includes the open-ended branches for rows with no transaction_to or valid_to yet", async () => {
    const { db, chain } = createFakeDb({ firstResult: undefined });
    const service = new BitemporalObservationService(db);

    await service.asKnownAt("bridge_state", "usdc-ethereum", new Date(), new Date());

    // Both "still open" predicates (transaction_to IS NULL, valid_to IS NULL)
    // are exercised via the sub-query callbacks passed to .where().
    expect(chain.whereNull).toHaveBeenCalledWith("transaction_to");
    expect(chain.whereNull).toHaveBeenCalledWith("valid_to");
    expect(chain.orWhere).toHaveBeenCalledWith("transaction_to", ">", expect.any(Date));
    expect(chain.orWhere).toHaveBeenCalledWith("valid_to", ">", expect.any(Date));
  });

  it("returns undefined when nothing was known at that point in time", async () => {
    const { db } = createFakeDb({ firstResult: undefined });
    const service = new BitemporalObservationService(db);

    const result = await service.asKnownAt("bridge_state", "usdc-ethereum", new Date(), new Date());

    expect(result).toBeUndefined();
  });

  it("issues a single query rather than fetching and filtering client-side", async () => {
    const { db, table } = createFakeDb({ firstResult: undefined });
    const service = new BitemporalObservationService(db);

    await service.asKnownAt("bridge_state", "usdc-ethereum", new Date(), new Date());

    // One combined predicate on (kind, subject, transaction_from, valid_from)
    // keeps this eligible for a single indexed lookup instead of N round trips.
    expect(table).toHaveBeenCalledTimes(1);
  });
});

describe("BitemporalObservationService valid-time interval containment", () => {
  it("checks for overlap with the new interval via a single tstzrange predicate", async () => {
    const { db, chain } = createFakeDb({ currentRows: [] });
    const service = new BitemporalObservationService(db);
    const obs = observation({
      validFrom: new Date("2026-03-01T00:00:00Z"),
      validTo: new Date("2026-04-01T00:00:00Z"),
    });

    await service.correct(obs);

    expect(chain.whereRaw).toHaveBeenCalledWith(
      expect.stringContaining("tstzrange"),
      [obs.validFrom, obs.validTo]
    );
  });

  it("treats an open-ended valid_to as infinity when checking containment", async () => {
    const { db, chain } = createFakeDb({ currentRows: [] });
    const service = new BitemporalObservationService(db);
    const obs = observation({ validTo: undefined });

    await service.correct(obs);

    expect(chain.whereRaw).toHaveBeenCalledWith(expect.any(String), [obs.validFrom, null]);
  });

  it("locks the overlapping row with FOR UPDATE so concurrent corrections serialize", async () => {
    const { db, chain } = createFakeDb({ currentRows: [{ id: "existing" }] });
    const service = new BitemporalObservationService(db);

    await service.correct(observation());

    expect(chain.forUpdate).toHaveBeenCalled();
  });
});

describe("BitemporalObservationService.correct retrofitting", () => {
  it("inserts a brand-new observation when nothing overlaps yet", async () => {
    const { db, chain } = createFakeDb({ currentRows: [], insertedRows: [{ id: "first-id" }] });
    const service = new BitemporalObservationService(db);

    const id = await service.correct(observation());

    expect(id).toBe("first-id");
    expect(chain.update).not.toHaveBeenCalled();
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ supersedes_id: null })
    );
  });

  it("closes the superseded row's transaction time without touching its valid time or payload", async () => {
    const { db, chain } = createFakeDb({
      currentRows: [{ id: "old-id" }],
      insertedRows: [{ id: "new-id" }],
    });
    const service = new BitemporalObservationService(db);

    await service.correct(observation({ payload: { status: "degraded" } }));

    expect(chain.whereIn).toHaveBeenCalledWith("id", ["old-id"]);
    // Only transaction_to is stamped closed — valid_from/valid_to/payload on
    // the prior row are never rewritten, so a correction can't corrupt what
    // was known as-of any earlier transaction time.
    expect(chain.update).toHaveBeenCalledWith({ transaction_to: expect.any(Date) });
    expect(chain.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ valid_from: expect.anything() })
    );
  });

  it("links the new row to the superseded row via supersedes_id", async () => {
    const { db, chain } = createFakeDb({
      currentRows: [{ id: "old-id" }],
      insertedRows: [{ id: "new-id" }],
    });
    const service = new BitemporalObservationService(db);

    const id = await service.correct(observation());

    expect(id).toBe("new-id");
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ supersedes_id: "old-id" })
    );
  });

  it("stamps the new row's transaction_from with the correction time and preserves valid time", async () => {
    const { db, chain } = createFakeDb({ currentRows: [] });
    const service = new BitemporalObservationService(db);
    const obs = observation({
      validFrom: new Date("2026-05-01T00:00:00Z"),
      validTo: new Date("2026-06-01T00:00:00Z"),
      payload: { status: "down" },
    });

    await service.correct(obs);

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: obs.kind,
        subject: obs.subject,
        valid_from: obs.validFrom,
        valid_to: obs.validTo,
        transaction_from: expect.any(Date),
        payload: JSON.stringify(obs.payload),
      })
    );
  });

  it("performs the read-lock, supersede, and insert inside a single transaction", async () => {
    const { db } = createFakeDb({ currentRows: [{ id: "old-id" }] });
    const service = new BitemporalObservationService(db);

    await service.correct(observation());

    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
