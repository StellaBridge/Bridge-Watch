import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  createExport: vi.fn(),
  listExports: vi.fn(),
  getExport: vi.fn(),
  getExportEvents: vi.fn(),
  deleteExport: vi.fn(),
}));

vi.mock("../../services/alertReplayExport.service.js", () => ({
  alertReplayExportService: serviceMocks,
}));

// Grants the scopes listed in `x-test-scopes`; no header means unauthenticated.
vi.mock("../../api/middleware/auth.js", () => ({
  authMiddleware:
    (options: { requiredScopes?: string[] } = {}) =>
    async (request: any, reply: any) => {
      const header = request.headers["x-test-scopes"];
      if (typeof header !== "string") {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const granted = header.split(",").map((s: string) => s.trim()).filter(Boolean);
      const required = options.requiredScopes ?? [];
      if (!granted.includes("*") && !required.every((scope) => granted.includes(scope))) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      request.tenantContext = { tenantId: "key-1", actorId: "key-1", actorType: "user", bypass: false };
    },
}));

import { alertReplayExportRoutes } from "../../api/routes/alertReplayExport.routes.js";

const PREFIX = "/api/v1/alerts/replay-export";
const AUTH = { "x-test-scopes": "alerts:read" };
const OWNER = "GBRIDGEWATCHOWNERADDRESS";
const EXPORT_ID = "5b2f8c1e-3a4d-4e6f-9b7a-1c2d3e4f5a6b";
const RULE_ID = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

function makeExport(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPORT_ID,
    ownerAddress: OWNER,
    status: "pending",
    filterCriteria: {},
    format: "csv",
    filePath: null,
    recordCount: null,
    fileSizeBytes: null,
    errorMessage: null,
    requestedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function makeEvent(id: string) {
  return {
    id,
    exportId: EXPORT_ID,
    eventId: `evt-${id}`,
    ruleId: RULE_ID,
    assetCode: "USDC",
    alertType: "price_deviation",
    priority: "high",
    triggeredValue: 0.97,
    threshold: 0.99,
    metric: "price",
    context: null,
    triggeredAt: "2026-01-02T00:00:00.000Z",
  };
}

describe("alertReplayExportRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    serviceMocks.createExport.mockResolvedValue(makeExport());
    serviceMocks.listExports.mockResolvedValue({ exports: [makeExport()], total: 1 });
    serviceMocks.getExport.mockResolvedValue(makeExport({ status: "completed" }));
    serviceMocks.getExportEvents.mockResolvedValue([makeEvent("1"), makeEvent("2")]);
    serviceMocks.deleteExport.mockResolvedValue(true);

    app = Fastify();
    await app.register(alertReplayExportRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    { method: "POST", url: PREFIX, payload: { ownerAddress: OWNER } },
    { method: "GET", url: `${PREFIX}?owner=${OWNER}` },
    { method: "GET", url: `${PREFIX}/${EXPORT_ID}` },
    { method: "GET", url: `${PREFIX}/${EXPORT_ID}/events` },
    { method: "DELETE", url: `${PREFIX}/${EXPORT_ID}` },
  ] as const)("$method $url returns 401 without credentials", async (endpoint) => {
    const res = await app.inject({ ...endpoint });

    expect(res.statusCode).toBe(401);
    for (const fn of Object.values(serviceMocks)) expect(fn).not.toHaveBeenCalled();
  });

  describe("POST /", () => {
    it("creates an export for a valid startDate/endDate window", async () => {
      const filter = {
        assetCode: "USDC",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.000Z",
        ruleId: RULE_ID,
      };

      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        headers: AUTH,
        payload: { ownerAddress: OWNER, filter, format: "json" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.json()).toHaveProperty("export");
      expect(serviceMocks.createExport).toHaveBeenCalledWith(OWNER, filter, "json");
    });

    it("defaults to CSV format and an empty filter", async () => {
      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        headers: AUTH,
        payload: { ownerAddress: OWNER },
      });

      expect(res.statusCode).toBe(201);
      expect(serviceMocks.createExport).toHaveBeenCalledWith(OWNER, {}, "csv");
    });

    it.each([
      ["ownerAddress is missing", { format: "csv" }],
      ["format is not csv or json", { ownerAddress: OWNER, format: "xml" }],
      ["startDate is not an ISO date-time", { ownerAddress: OWNER, filter: { startDate: "last week" } }],
      ["endDate is not an ISO date-time", { ownerAddress: OWNER, filter: { endDate: "2026-02-30" } }],
      ["ruleId is not a UUID", { ownerAddress: OWNER, filter: { ruleId: "rule-1" } }],
    ])("returns 400 when %s", async (_label, payload) => {
      const res = await app.inject({ method: "POST", url: PREFIX, headers: AUTH, payload });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.createExport).not.toHaveBeenCalled();
    });
  });

  describe("GET /", () => {
    it("lists exports for an owner with pagination", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}?owner=${OWNER}&limit=10&offset=20`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.exports).toHaveLength(1);
      expect(serviceMocks.listExports).toHaveBeenCalledWith(OWNER, 10, 20);
    });

    it("applies default limit and offset", async () => {
      await app.inject({ method: "GET", url: `${PREFIX}?owner=${OWNER}`, headers: AUTH });

      expect(serviceMocks.listExports).toHaveBeenCalledWith(OWNER, 20, 0);
    });

    it("returns an empty JSON array when the owner has no exports", async () => {
      serviceMocks.listExports.mockResolvedValue({ exports: [], total: 0 });

      const res = await app.inject({ method: "GET", url: `${PREFIX}?owner=${OWNER}`, headers: AUTH });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ exports: [], total: 0 });
    });

    it("returns 400 when owner is missing", async () => {
      const res = await app.inject({ method: "GET", url: PREFIX, headers: AUTH });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.listExports).not.toHaveBeenCalled();
    });

    it("returns 400 when limit is not an integer", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}?owner=${OWNER}&limit=ten`, headers: AUTH });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.listExports).not.toHaveBeenCalled();
    });
  });

  describe("GET /:id", () => {
    it("returns a single export", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/${EXPORT_ID}`, headers: AUTH });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty("export");
      expect(serviceMocks.getExport).toHaveBeenCalledWith(EXPORT_ID);
    });

    it("returns 404 when the export does not exist", async () => {
      serviceMocks.getExport.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: `${PREFIX}/${EXPORT_ID}`, headers: AUTH });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when the id is not a UUID", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/not-a-uuid`, headers: AUTH });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.getExport).not.toHaveBeenCalled();
    });
  });

  describe("GET /:id/events", () => {
    it("returns the replayed events as JSON", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/${EXPORT_ID}/events`, headers: AUTH });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.json().events).toHaveLength(2);
      expect(serviceMocks.getExportEvents).toHaveBeenCalledWith(EXPORT_ID);
    });

    it("returns an empty events array for an empty dataset", async () => {
      serviceMocks.getExportEvents.mockResolvedValue([]);

      const res = await app.inject({ method: "GET", url: `${PREFIX}/${EXPORT_ID}/events`, headers: AUTH });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ events: [] });
    });

    it("returns 400 when the id is not a UUID", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/not-a-uuid/events`, headers: AUTH });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.getExportEvents).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /:id", () => {
    it("deletes an export", async () => {
      const res = await app.inject({ method: "DELETE", url: `${PREFIX}/${EXPORT_ID}`, headers: AUTH });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      expect(serviceMocks.deleteExport).toHaveBeenCalledWith(EXPORT_ID);
    });

    it("returns 400 when the id is not a UUID", async () => {
      const res = await app.inject({ method: "DELETE", url: `${PREFIX}/not-a-uuid`, headers: AUTH });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.deleteExport).not.toHaveBeenCalled();
    });
  });
});
