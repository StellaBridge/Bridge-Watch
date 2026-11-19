import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  listRules: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  bulkUpdateRules: vi.fn(),
  deleteRule: vi.fn(),
  getAuditHistory: vi.fn(),
}));

vi.mock("../../services/alertRouting.service.js", () => ({
  alertRoutingService: serviceMocks,
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
      request.apiKeyAuth = { id: "key-1", name: "test-admin", scopes: granted };
      request.tenantContext = { tenantId: "key-1", actorId: "key-1", actorType: "user", bypass: false };
    },
}));

import { alertRoutingAdminRoutes } from "../../api/routes/alertRoutingAdmin.js";

const PREFIX = "/api/v1/admin/alert-routing";
const ADMIN = { "x-test-scopes": "admin:api-keys" };
const NON_ADMIN = { "x-test-scopes": "alerts:read" };
const RULE_ID = "3f1c2b9a-6d4e-4a8b-9c1d-2e3f4a5b6c7d";
const OTHER_RULE_ID = "8a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d";

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    name: "Critical USDC",
    ownerAddress: null,
    severityLevels: ["critical"],
    assetCodes: ["USDC"],
    sourceTypes: [],
    channels: ["webhook"],
    fallbackChannels: ["email"],
    suppressionWindowSeconds: 300,
    priorityOrder: 1,
    isActive: true,
    createdBy: "test-admin",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("alertRoutingAdminRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    serviceMocks.listRules.mockResolvedValue([makeRule()]);
    serviceMocks.createRule.mockImplementation(async (input) => makeRule(input));
    serviceMocks.updateRule.mockImplementation(async (id, input) => makeRule({ id, ...input }));
    serviceMocks.bulkUpdateRules.mockImplementation(async (ids: string[], isActive: boolean) =>
      ids.map((id) => makeRule({ id, isActive }))
    );
    serviceMocks.deleteRule.mockResolvedValue(true);
    serviceMocks.getAuditHistory.mockResolvedValue([]);

    app = Fastify();
    await app.register(alertRoutingAdminRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("RBAC", () => {
    const endpoints = [
      { method: "GET", url: `${PREFIX}/rules` },
      { method: "POST", url: `${PREFIX}/rules`, payload: { name: "r", channels: ["webhook"] } },
      { method: "PATCH", url: `${PREFIX}/rules/${RULE_ID}`, payload: { name: "r" } },
      { method: "PATCH", url: `${PREFIX}/rules/bulk`, payload: { ruleIds: [RULE_ID], isActive: true } },
      { method: "DELETE", url: `${PREFIX}/rules/${RULE_ID}` },
      { method: "GET", url: `${PREFIX}/audit` },
      { method: "POST", url: `${PREFIX}/simulate`, payload: { severity: "critical" } },
    ] as const;

    it.each(endpoints)("$method $url returns 401 without credentials", async (endpoint) => {
      const res = await app.inject({ ...endpoint });

      expect(res.statusCode).toBe(401);
      for (const fn of Object.values(serviceMocks)) expect(fn).not.toHaveBeenCalled();
    });

    it.each(endpoints)("$method $url returns 403 without the admin:api-keys scope", async (endpoint) => {
      const res = await app.inject({ ...endpoint, headers: NON_ADMIN });

      expect(res.statusCode).toBe(403);
      for (const fn of Object.values(serviceMocks)) expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("GET /rules", () => {
    it("lists configured channel bindings", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/rules`, headers: ADMIN });

      expect(res.statusCode).toBe(200);
      expect(res.json().rules).toEqual([makeRule()]);
      expect(serviceMocks.listRules).toHaveBeenCalledWith(undefined);
    });

    it("scopes the listing to an owner address", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/rules?ownerAddress=GOWNER`,
        headers: ADMIN,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.listRules).toHaveBeenCalledWith("GOWNER");
    });

    it("rejects an empty ownerAddress", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/rules?ownerAddress=`,
        headers: ADMIN,
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.listRules).not.toHaveBeenCalled();
    });
  });

  describe("POST /rules", () => {
    it("creates a rule and records the acting admin as creator", async () => {
      const payload = {
        name: "Sev-1 bridge compromise",
        severityLevels: ["critical"],
        assetCodes: ["USDC"],
        channels: ["webhook", "email"],
        fallbackChannels: ["in_app"],
        suppressionWindowSeconds: 60,
        priorityOrder: 1,
      };

      const res = await app.inject({ method: "POST", url: `${PREFIX}/rules`, headers: ADMIN, payload });

      expect(res.statusCode).toBe(201);
      expect(res.json().rule).toMatchObject(payload);
      expect(serviceMocks.createRule).toHaveBeenCalledWith({ ...payload, createdBy: "test-admin" });
    });

    it.each([
      ["name is missing", { channels: ["webhook"] }],
      ["channels is missing", { name: "rule" }],
      ["channels is empty", { name: "rule", channels: [] }],
      ["channel destination is unsupported", { name: "rule", channels: ["pagerduty"] }],
      ["severity level is unknown", { name: "rule", channels: ["webhook"], severityLevels: ["sev1"] }],
      ["name is blank", { name: "", channels: ["webhook"] }],
      ["suppression window exceeds 24h", { name: "rule", channels: ["webhook"], suppressionWindowSeconds: 86401 }],
      ["suppression window is negative", { name: "rule", channels: ["webhook"], suppressionWindowSeconds: -1 }],
      ["priority order is below 1", { name: "rule", channels: ["webhook"], priorityOrder: 0 }],
    ])("returns 400 when %s", async (_label, payload) => {
      const res = await app.inject({ method: "POST", url: `${PREFIX}/rules`, headers: ADMIN, payload });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBeDefined();
      expect(serviceMocks.createRule).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /rules/:id", () => {
    it("updates the escalation delay of a rule", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/rules/${RULE_ID}`,
        headers: ADMIN,
        payload: { suppressionWindowSeconds: 900 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().rule.suppressionWindowSeconds).toBe(900);
      expect(serviceMocks.updateRule).toHaveBeenCalledWith(RULE_ID, { suppressionWindowSeconds: 900 });
    });

    it("returns 404 when the rule does not exist", async () => {
      serviceMocks.updateRule.mockResolvedValue(null);

      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/rules/${RULE_ID}`,
        headers: ADMIN,
        payload: { isActive: false },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Routing rule not found" });
    });

    it("returns 400 when no fields are provided", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/rules/${RULE_ID}`,
        headers: ADMIN,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.updateRule).not.toHaveBeenCalled();
    });

    it("returns 400 when the escalation delay is out of bounds", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/rules/${RULE_ID}`,
        headers: ADMIN,
        payload: { suppressionWindowSeconds: 100000 },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.updateRule).not.toHaveBeenCalled();
    });

    it("returns 400 when the id is not a UUID", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/rules/not-a-uuid`,
        headers: ADMIN,
        payload: { name: "renamed" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.updateRule).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /rules/bulk", () => {
    it("toggles many rules without hitting the single-rule handler", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/rules/bulk`,
        headers: ADMIN,
        payload: { ruleIds: [RULE_ID, OTHER_RULE_ID], isActive: false },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().count).toBe(2);
      expect(serviceMocks.bulkUpdateRules).toHaveBeenCalledWith([RULE_ID, OTHER_RULE_ID], false);
      expect(serviceMocks.updateRule).not.toHaveBeenCalled();
    });

    it("returns 400 when isActive is missing", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/rules/bulk`,
        headers: ADMIN,
        payload: { ruleIds: [RULE_ID] },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.bulkUpdateRules).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /rules/:id", () => {
    it("deletes a rule", async () => {
      const res = await app.inject({ method: "DELETE", url: `${PREFIX}/rules/${RULE_ID}`, headers: ADMIN });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      expect(serviceMocks.deleteRule).toHaveBeenCalledWith(RULE_ID);
    });

    it("returns 404 when the rule does not exist", async () => {
      serviceMocks.deleteRule.mockResolvedValue(false);

      const res = await app.inject({ method: "DELETE", url: `${PREFIX}/rules/${RULE_ID}`, headers: ADMIN });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Routing rule not found" });
    });
  });

  describe("GET /audit", () => {
    it("forwards filters to the audit history lookup", async () => {
      const entries = [{ id: "audit-1", status: "failed", channel: "webhook" }];
      serviceMocks.getAuditHistory.mockResolvedValue(entries);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/audit?ownerAddress=GOWNER&status=failed&channel=webhook&limit=50`,
        headers: ADMIN,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().entries).toEqual(entries);
      expect(serviceMocks.getAuditHistory).toHaveBeenCalledWith({
        ownerAddress: "GOWNER",
        status: "failed",
        channel: "webhook",
        limit: 50,
      });
    });

    it.each([
      ["status is unknown", "status=bounced"],
      ["limit exceeds 500", "limit=501"],
      ["limit is below 1", "limit=0"],
    ])("returns 400 when %s", async (_label, query) => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/audit?${query}`, headers: ADMIN });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.getAuditHistory).not.toHaveBeenCalled();
    });
  });

  describe("POST /simulate", () => {
    it("picks the lowest priority-order matching rule as the effective route", async () => {
      serviceMocks.listRules.mockResolvedValue([
        makeRule({ id: RULE_ID, name: "USDC critical", priorityOrder: 5, channels: ["email"] }),
        makeRule({
          id: OTHER_RULE_ID,
          name: "Catch-all",
          priorityOrder: 1,
          severityLevels: [],
          assetCodes: [],
          channels: ["webhook"],
          fallbackChannels: ["in_app"],
          suppressionWindowSeconds: 120,
        }),
      ]);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/simulate`,
        headers: ADMIN,
        payload: { severity: "critical", assetCode: " usdc " },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.simulationId).toMatch(/^sim_\d+_[a-z0-9]+$/);
      expect(body.input).toMatchObject({ severity: "critical", assetCode: "USDC", sourceType: "" });
      expect(body.results.map((r: any) => r.ruleId)).toEqual([OTHER_RULE_ID, RULE_ID]);
      expect(body.results.every((r: any) => r.matched)).toBe(true);
      expect(body.summary).toEqual({
        totalActiveRules: 2,
        totalMatched: 2,
        firstMatchingRule: { ruleId: OTHER_RULE_ID, ruleName: "Catch-all" },
        wouldDispatch: true,
        effectiveChannels: ["webhook"],
        effectiveFallbackChannels: ["in_app"],
        suppressionWindowSeconds: 120,
      });
    });

    it("reports no dispatch and explains why when nothing matches", async () => {
      serviceMocks.listRules.mockResolvedValue([
        makeRule({ severityLevels: ["critical"], assetCodes: ["USDC"], sourceTypes: ["price-deviation"] }),
      ]);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/simulate`,
        headers: ADMIN,
        payload: { severity: "low", assetCode: "EURC" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const [result] = body.results;
      expect(result.matched).toBe(false);
      expect(result.channels).toEqual([]);
      expect(result.fallbackChannels).toEqual([]);
      expect(result.reasons).toEqual([
        'Severity: "low" not in [critical] — no match',
        'Asset: "EURC" not in [USDC] — no match',
        'Source type: "(empty)" not in [price-deviation] — no match',
      ]);
      expect(body.summary).toMatchObject({
        totalMatched: 0,
        firstMatchingRule: null,
        wouldDispatch: false,
        effectiveChannels: [],
        suppressionWindowSeconds: 0,
      });
    });

    it("explains each matching filter", async () => {
      serviceMocks.listRules.mockResolvedValue([
        makeRule({ severityLevels: ["critical", "high"], assetCodes: ["usdc"], sourceTypes: ["price-deviation"] }),
      ]);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/simulate`,
        headers: ADMIN,
        payload: { severity: "high", assetCode: "USDC", sourceType: "price-deviation" },
      });

      expect(res.json().results[0].reasons).toEqual([
        'Severity: "high" is in [critical, high]',
        'Asset: "USDC" is in [usdc]',
        'Source type: "price-deviation" is in [price-deviation]',
      ]);
    });

    it("skips inactive rules and scopes rules by owner", async () => {
      serviceMocks.listRules.mockResolvedValue([
        makeRule({ id: RULE_ID, isActive: false, name: "Disabled", priorityOrder: 3 }),
      ]);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/simulate`,
        headers: ADMIN,
        payload: { severity: "critical", ownerAddress: "GOWNER", triggeredValue: 0.97, threshold: 0.99 },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(serviceMocks.listRules).toHaveBeenCalledWith("GOWNER");
      expect(body.results).toEqual([]);
      expect(body.skippedInactive).toEqual([{ ruleId: RULE_ID, ruleName: "Disabled", priorityOrder: 3 }]);
      expect(body.summary.totalActiveRules).toBe(0);
      expect(body.input).toMatchObject({
        ownerAddress: "GOWNER",
        triggeredValue: 0.97,
        threshold: 0.99,
        label: null,
        metric: null,
      });
    });

    it("returns 400 for an unknown severity", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/simulate`,
        headers: ADMIN,
        payload: { severity: "sev1" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.listRules).not.toHaveBeenCalled();
    });
  });
});
