import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { eventFederationRoutes } from "../../src/api/routes/eventFederation.routes.js";

const federation = vi.hoisted(() => ({
  health: vi.fn(),
  replay: vi.fn(),
  _ingest: vi.fn(),
}));

const keyRepo = vi.hoisted(() => ({ findActiveKey: vi.fn() }));
const validateSignedPayload = vi.hoisted(() => vi.fn());
const auditInsert = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("../../src/services/eventFederation/index.js", () => ({
  getEventFederationService: () => federation,
}));

vi.mock("../../src/api/middleware/signatureValidation.js", () => ({
  signatureValidationMiddleware: () => async () => {},
}));

vi.mock("../../src/services/signatureValidation.service.js", () => ({
  validateSignedPayload,
}));

vi.mock("../../src/services/eventSourceKey.service.js", () => ({
  EventSourceKeyService: vi.fn(() => keyRepo),
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => (_table: string) => ({ insert: auditInsert }),
}));

const PREFIX = "/api/v1/event-federation";

const validEvent = {
  id: "evt-1",
  chain: "stellar",
  type: "payment",
  blockNumber: 100,
  timestamp: "2026-03-01T00:00:00.000Z",
  sourceId: "src-7",
};

function submitPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: validEvent,
    payload: JSON.stringify({ amount: "10" }),
    signature: "sig",
    signedAt: "2026-03-01T00:00:00.000Z",
    sourceName: "horizon-feed",
    ...overrides,
  };
}

describe("Event federation routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(eventFederationRoutes, { prefix: PREFIX });
    await app.ready();
  });

  describe("GET /health", () => {
    it("returns the federation health snapshot", async () => {
      federation.health.mockReturnValue({
        status: "healthy",
        sources: [],
        totalEventsProcessed: 3,
        dedupRejectedCount: 0,
        replayBufferSize: 3,
        uptimeMs: 1000,
        checkedAt: "2026-03-01T00:00:00.000Z",
      });

      const res = await app.inject({ method: "GET", url: `${PREFIX}/health` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "healthy", totalEventsProcessed: 3 });
    });
  });

  describe("GET /sources", () => {
    it("returns per-source liveness with checkedAt", async () => {
      const sources = [{ chain: "stellar", status: "live" }];
      federation.health.mockReturnValue({
        sources,
        checkedAt: "2026-03-01T00:00:00.000Z",
      });

      const res = await app.inject({ method: "GET", url: `${PREFIX}/sources` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        sources,
        checkedAt: "2026-03-01T00:00:00.000Z",
      });
    });
  });

  describe("GET /replay", () => {
    it("replays with default limit 200 and returns the last sourceId as cursor", async () => {
      federation.replay.mockReturnValue([
        { id: "a", sourceId: "src-1" },
        { id: "b", sourceId: "src-2" },
      ]);

      const res = await app.inject({ method: "GET", url: `${PREFIX}/replay` });

      expect(res.statusCode).toBe(200);
      expect(federation.replay).toHaveBeenCalledWith({
        chain: undefined,
        since: undefined,
        fromBlock: undefined,
        limit: 200,
      });
      const body = res.json();
      expect(body.count).toBe(2);
      expect(body.cursor).toBe("src-2");
      expect(typeof body.timestamp).toBe("string");
    });

    it("forwards chain, since, fromBlock and limit filters", async () => {
      federation.replay.mockReturnValue([]);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/replay?chain=stellar&since=2026-03-01T00:00:00.000Z&fromBlock=50&limit=10`,
      });

      expect(res.statusCode).toBe(200);
      expect(federation.replay).toHaveBeenCalledWith({
        chain: "stellar",
        since: "2026-03-01T00:00:00.000Z",
        fromBlock: 50,
        limit: 10,
      });
    });

    it("returns a null cursor when nothing matches", async () => {
      federation.replay.mockReturnValue([]);

      const res = await app.inject({ method: "GET", url: `${PREFIX}/replay` });

      expect(res.json()).toMatchObject({ count: 0, cursor: null, events: [] });
    });

    it("returns 400 when limit exceeds the maximum of 1000", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/replay?limit=5000`,
      });

      expect(res.statusCode).toBe(400);
      expect(federation.replay).not.toHaveBeenCalled();
    });
  });

  describe("POST /events", () => {
    it("returns 403 when the source is unknown or inactive", async () => {
      keyRepo.findActiveKey.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/events`,
        payload: submitPayload(),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("Forbidden");
      expect(federation._ingest).not.toHaveBeenCalled();
    });

    it("returns 401 and audits rejected_signature for an invalid signature", async () => {
      keyRepo.findActiveKey.mockResolvedValue({ public_key: "PEM", algorithm: "ed25519" });
      validateSignedPayload.mockReturnValue({ valid: false, error: "Signature mismatch" });

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/events`,
        payload: submitPayload(),
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe("Signature mismatch");
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "rejected_signature", event_id: "evt-1" }),
      );
      expect(federation._ingest).not.toHaveBeenCalled();
    });

    it("audits rejected_timestamp when the signature is expired", async () => {
      keyRepo.findActiveKey.mockResolvedValue({ public_key: "PEM", algorithm: "ed25519" });
      validateSignedPayload.mockReturnValue({ valid: false, error: "Signature expired", ageMs: 900000 });

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/events`,
        payload: submitPayload(),
      });

      expect(res.statusCode).toBe(401);
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "rejected_timestamp", timestamp_age_ms: 900000 }),
      );
    });

    it("returns 400 when the signed payload is not valid JSON", async () => {
      keyRepo.findActiveKey.mockResolvedValue({ public_key: "PEM", algorithm: "ed25519" });
      validateSignedPayload.mockReturnValue({ valid: true, ageMs: 10 });

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/events`,
        payload: submitPayload({ payload: "not-json{" }),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe("Invalid payload JSON");
      expect(federation._ingest).not.toHaveBeenCalled();
    });

    it("accepts a valid signed event, audits it and ingests it", async () => {
      keyRepo.findActiveKey.mockResolvedValue({ public_key: "PEM", algorithm: "ed25519" });
      validateSignedPayload.mockReturnValue({ valid: true, ageMs: 42 });

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/events`,
        payload: submitPayload(),
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        accepted: true,
        eventId: "stellar:payment:src-7",
        timestampAgeMs: 42,
      });
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "accepted", event_id: "stellar:payment:src-7" }),
      );
      expect(federation._ingest).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "stellar:payment:src-7",
          chain: "stellar",
          raw: { amount: "10" },
        }),
      );
    });
  });
});
