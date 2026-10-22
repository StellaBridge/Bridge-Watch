import { describe, it, expect, vi } from "vitest";
import {
  canonicalEventIdentity,
  CanonicalEventIdentityService,
  type CanonicalEventInput,
} from "../../src/services/canonicalEventIdentity.service.js";

function input(overrides: Partial<CanonicalEventInput> = {}): CanonicalEventInput {
  return {
    chain: "ethereum",
    contract: "0xabc",
    transactionHash: "0xdef",
    eventIndex: 2,
    eventType: "Transfer",
    decoderVersion: "v1",
    provider: "evm-rpc",
    providerEventId: "evt-1",
    rawPayload: { amount: 100 },
    decodedPayload: { amount: 100 },
    validAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function txBuilder(options: {
  firstValue?: unknown;
  returningValue?: unknown[];
} = {}) {
  const { firstValue = null, returningValue = [] } = options;
  const builder: Record<string, unknown> = {};
  builder.where = vi.fn().mockReturnValue(builder);
  builder.forUpdate = vi.fn().mockReturnValue(builder);
  builder.first = vi.fn().mockResolvedValue(firstValue);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockResolvedValue(returningValue);
  builder.onConflict = vi.fn().mockReturnValue(builder);
  builder.ignore = vi.fn().mockResolvedValue([]);
  builder.update = vi.fn().mockResolvedValue(1);
  return builder;
}

function mockDbWithTx(tables: Record<string, Record<string, unknown>>) {
  const tx = vi.fn((table: string) => {
    const builder = tables[table];
    if (!builder) throw new Error(`unexpected table: ${table}`);
    return builder;
  });
  return {
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
    tx,
  };
}

describe("canonicalEventIdentity", () => {
  it("is deterministic for identical inputs", () => {
    expect(canonicalEventIdentity(input())).toBe(canonicalEventIdentity(input()));
  });

  it("is case-insensitive across chain, contract and transaction hash", () => {
    const lower = input({ chain: "ethereum", contract: "0xabc", transactionHash: "0xdef" });
    const upper = input({ chain: "Ethereum", contract: "0xABC", transactionHash: "0xDEF" });
    expect(canonicalEventIdentity(upper)).toBe(canonicalEventIdentity(lower));
  });

  it("changes when eventIndex or eventType change", () => {
    const base = canonicalEventIdentity(input());
    expect(canonicalEventIdentity(input({ eventIndex: 3 }))).not.toBe(base);
    expect(canonicalEventIdentity(input({ eventType: "Approval" }))).not.toBe(base);
  });

  it("returns a 64-char sha256 hex digest", () => {
    expect(canonicalEventIdentity(input())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("CanonicalEventIdentityService.ingest", () => {
    it("creates a new accepted event on first sight", async () => {
      const created = {
        id: 7,
        identity: canonicalEventIdentity(input()),
        status: "accepted",
        decoder_version: "v1",
      };
      const db = mockDbWithTx({
        canonical_event_aliases: txBuilder({ firstValue: null }),
        canonical_chain_events: txBuilder({ firstValue: null, returningValue: [created] }),
        canonical_event_raw_payloads: txBuilder(),
      });
      const service = new CanonicalEventIdentityService(db as never);
      const result = await service.ingest(input());
      expect(result).toEqual({
        id: "7",
        identity: created.identity,
        status: "accepted",
        duplicate: false,
      });
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("treats a known provider alias as a duplicate", async () => {
      const existing = {
        id: 9,
        identity: canonicalEventIdentity(input()),
        status: "accepted",
        decoder_version: "v1",
      };
      const events = txBuilder({ firstValue: existing });
      const db = mockDbWithTx({
        canonical_event_aliases: txBuilder({ firstValue: { canonical_event_id: 9 } }),
        canonical_chain_events: events,
        canonical_event_raw_payloads: txBuilder(),
      });
      const service = new CanonicalEventIdentityService(db as never);
      const result = await service.ingest(input());
      expect(result).toEqual({
        id: "9",
        identity: existing.identity,
        status: "accepted",
        duplicate: true,
      });
      expect(events.insert).not.toHaveBeenCalled();
    });

    it("flags a decoder upgrade as a duplicate of the same identity", async () => {
      const existing = {
        id: 11,
        identity: canonicalEventIdentity(input()),
        status: "accepted",
        decoder_version: "v1",
      };
      const db = mockDbWithTx({
        canonical_event_aliases: txBuilder({ firstValue: null }),
        canonical_chain_events: txBuilder({ firstValue: existing }),
        canonical_event_raw_payloads: txBuilder(),
      });
      const service = new CanonicalEventIdentityService(db as never);
      const result = await service.ingest(input({ decoderVersion: "v2" }));
      expect(result.duplicate).toBe(true);
      expect(result.status).toBe("accepted");
    });

    it("quarantines when a provider alias resolves to a different identity", async () => {
      const collisions = txBuilder();
      const db = mockDbWithTx({
        canonical_event_aliases: txBuilder({ firstValue: { canonical_event_id: 42 } }),
        canonical_chain_events: txBuilder({
          firstValue: { id: 42, identity: "different-identity", status: "accepted" },
        }),
        canonical_event_collisions: collisions,
      });
      const service = new CanonicalEventIdentityService(db as never);
      const result = await service.ingest(input({ providerEventId: "evt-collision" }));
      expect(result.status).toBe("quarantined");
      expect(result.id).toBe("42");
      expect(collisions.insert).toHaveBeenCalledWith(
        expect.objectContaining({ canonical_event_id: 42 }),
      );
    });
  });
