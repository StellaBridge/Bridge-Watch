import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  suggestForIncident: vi.fn(),
  linkIncidents: vi.fn(),
  unlinkIncidents: vi.fn(),
  approveSuggestion: vi.fn(),
  getGroupForIncident: vi.fn(),
  listGroupMembers: vi.fn(),
}));

// The route module calls getCorrelationService() when it is registered.
vi.mock("../../services/correlation.service.js", () => ({
  getCorrelationService: () => serviceMocks,
}));

// Grants the scopes listed in `x-test-scopes`; no header means unauthenticated.
// This module's protected routes require any one of the listed scopes.
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
      if (
        !granted.includes("*") &&
        required.length > 0 &&
        !required.some((scope) => granted.includes(scope))
      ) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      request.tenantContext = { tenantId: "key-1", actorId: "actor-1", actorType: "user", bypass: false };
    },
}));

import { incidentCorrelationRoutes } from "../../api/routes/incidentCorrelation.routes.js";

const PREFIX = "/api/v1/incidents";
const ADMIN_SCOPE = { "x-test-scopes": "admin" };
const OPERATOR_SCOPE = { "x-test-scopes": "operator" };
const READONLY_SCOPE = { "x-test-scopes": "incidents:read" };

const SUGGESTIONS = [
  { incidentId: "incident-2", score: 0.82, reasons: ["normalized_fingerprint", "bridge_id"] },
  { incidentId: "incident-3", score: 0.67, reasons: ["time_window_1h"] },
];

const GROUP = { id: "group-1", created_by: "actor-1" };
const MEMBERS = [{ incident_id: "incident-1" }, { incident_id: "incident-2" }];

describe("incidentCorrelationRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    serviceMocks.suggestForIncident.mockResolvedValue(SUGGESTIONS);
    serviceMocks.linkIncidents.mockResolvedValue({ groupId: "group-1" });
    serviceMocks.unlinkIncidents.mockResolvedValue({ ok: true });
    serviceMocks.approveSuggestion.mockResolvedValue({ approved: true });
    serviceMocks.getGroupForIncident.mockResolvedValue(GROUP);
    serviceMocks.listGroupMembers.mockResolvedValue(MEMBERS);

    app = Fastify();
    await app.register(incidentCorrelationRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /:id/correlations/suggestions", () => {
    // The handler returns { suggestions }, but the route declares an array
    // response schema. Fastify's serializer rejects that payload with a 500.
    it("documents the response schema mismatch with the default lookback", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/incident-1/correlations/suggestions`,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({
        statusCode: 500,
        error: "Internal Server Error",
        message: expect.stringContaining("does not match schema definition"),
      });
      expect(serviceMocks.suggestForIncident).toHaveBeenCalledWith("incident-1", 24);
    });

    it("forwards an explicit lookbackHours value before the serializer fails", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/incident-1/correlations/suggestions?lookbackHours=6`,
      });

      expect(res.statusCode).toBe(500);
      expect(serviceMocks.suggestForIncident).toHaveBeenCalledWith("incident-1", 6);
    });
  });

  describe("POST /:id/correlations/link", () => {
    const payload = { targetIncidentId: "incident-2", actor: "actor-1" };

    it("links two incidents with the admin scope", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/link`,
        headers: ADMIN_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ groupId: "group-1" });
      expect(serviceMocks.linkIncidents).toHaveBeenCalledWith("incident-1", "incident-2", "actor-1");
    });

    it("also allows the operator scope", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/link`,
        headers: OPERATOR_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.linkIncidents).toHaveBeenCalled();
    });

    it("returns 401 without credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/link`,
        payload,
      });

      expect(res.statusCode).toBe(401);
      expect(serviceMocks.linkIncidents).not.toHaveBeenCalled();
    });

    it("returns 403 for a scope other than admin or operator", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/link`,
        headers: READONLY_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(403);
      expect(serviceMocks.linkIncidents).not.toHaveBeenCalled();
    });

    it("rejects a request without targetIncidentId", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/link`,
        headers: ADMIN_SCOPE,
        payload: { actor: "actor-1" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.linkIncidents).not.toHaveBeenCalled();
    });

    // AJV coercion is enabled, so a numeric incident id becomes a string
    // instead of being rejected by the schema.
    it("coerces a numeric targetIncidentId to a string instead of rejecting it", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/link`,
        headers: ADMIN_SCOPE,
        payload: { targetIncidentId: 42 },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.linkIncidents).toHaveBeenCalledWith("incident-1", "42", undefined);
    });

    it("maps service failures to a 500 error", async () => {
      serviceMocks.linkIncidents.mockRejectedValue(new Error("db down"));

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/link`,
        headers: ADMIN_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Failed to link incidents" });
    });
  });

  describe("POST /:id/correlations/unlink", () => {
    const payload = { targetIncidentId: "incident-2", actor: "actor-1" };

    it("unlinks two incidents", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/unlink`,
        headers: OPERATOR_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(serviceMocks.unlinkIncidents).toHaveBeenCalledWith("incident-1", "incident-2", "actor-1");
    });

    it("requires admin or operator scope", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/unlink`,
        headers: READONLY_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(403);
      expect(serviceMocks.unlinkIncidents).not.toHaveBeenCalled();
    });

    it("maps service failures to a 500 error", async () => {
      serviceMocks.unlinkIncidents.mockRejectedValue(new Error("db down"));

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/unlink`,
        headers: ADMIN_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Failed to unlink incidents" });
    });
  });

  describe("POST /:id/correlations/approve", () => {
    const payload = { targetIncidentId: "incident-2", actor: "actor-1" };

    it("approves a merge suggestion", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/approve`,
        headers: ADMIN_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ approved: true });
      expect(serviceMocks.approveSuggestion).toHaveBeenCalledWith("incident-1", "incident-2", "actor-1");
    });

    it("requires admin or operator scope", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/approve`,
        headers: READONLY_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(403);
      expect(serviceMocks.approveSuggestion).not.toHaveBeenCalled();
    });

    it("maps service failures to a 500 error", async () => {
      serviceMocks.approveSuggestion.mockRejectedValue(new Error("db down"));

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/correlations/approve`,
        headers: ADMIN_SCOPE,
        payload,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Failed to approve suggestion" });
    });
  });

  describe("GET /:id/correlations/group", () => {
    it("returns the group and its members", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/incident-1/correlations/group`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ group: GROUP, members: MEMBERS });
      expect(serviceMocks.getGroupForIncident).toHaveBeenCalledWith("incident-1");
      expect(serviceMocks.listGroupMembers).toHaveBeenCalledWith("group-1");
    });

    it("returns 404 when the incident has no correlation group", async () => {
      serviceMocks.getGroupForIncident.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/incident-1/correlations/group`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "No correlation group found" });
      expect(serviceMocks.listGroupMembers).not.toHaveBeenCalled();
    });

    it("maps service failures to a 500 error", async () => {
      serviceMocks.getGroupForIncident.mockRejectedValue(new Error("db down"));

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/incident-1/correlations/group`,
      });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Failed to fetch correlation group" });
    });
  });

  describe("schema and gap documentation", () => {
    // The params schema only requires `type: string`; there is no UUID/ID format.
    it("accepts a non-UUID incident id instead of validating its format", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/not-a-uuid/correlations/group`,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getGroupForIncident).toHaveBeenCalledWith("not-a-uuid");
    });

    // The issue asks for correlated-alerts, merge, and split endpoints.
    it("does not expose correlated-alerts, merge, or split routes", async () => {
      const alertsRes = await app.inject({
        method: "GET",
        url: `${PREFIX}/incident-1/correlated-alerts`,
      });
      const mergeRes = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/merge`,
        headers: ADMIN_SCOPE,
        payload: { targetIncidentId: "incident-2" },
      });
      const splitRes = await app.inject({
        method: "POST",
        url: `${PREFIX}/incident-1/split`,
        headers: ADMIN_SCOPE,
        payload: { alertIds: ["alert-1"] },
      });

      expect(alertsRes.statusCode).toBe(404);
      expect(mergeRes.statusCode).toBe(404);
      expect(splitRes.statusCode).toBe(404);
    });
  });
});
