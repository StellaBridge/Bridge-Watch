import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  createDependency: vi.fn(),
  getDependencies: vi.fn(),
  getDependents: vi.fn(),
  validateDependencyChain: vi.fn(),
  getImpactAnalysis: vi.fn(),
  getFullGraph: vi.fn(),
  deleteDependency: vi.fn(),
}));

// The route module constructs the service when it is registered, so the mock
// must provide both the constructor and the instance methods.
vi.mock("../../services/healthCheckDependencyPolicy.service.js", () => ({
  HealthCheckDependencyPolicyService: class {
    createDependency = serviceMocks.createDependency;
    getDependencies = serviceMocks.getDependencies;
    getDependents = serviceMocks.getDependents;
    validateDependencyChain = serviceMocks.validateDependencyChain;
    getImpactAnalysis = serviceMocks.getImpactAnalysis;
    getFullGraph = serviceMocks.getFullGraph;
    deleteDependency = serviceMocks.deleteDependency;
  },
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
      request.tenantContext = { tenantId: "key-1", actorId: "actor-1", actorType: "user", bypass: false };
    },
}));

import { healthCheckDependencyPolicyRoutes } from "../../api/routes/healthCheckDependencyPolicy.routes.js";

// These routes register their full paths inside the module (no prefix).
const BASE = "/api/v1/health-checks";
const ADMIN_SCOPE = { "x-test-scopes": "admin" };
const NON_ADMIN_SCOPE = { "x-test-scopes": "reports:read" };

const DEPENDENCY = {
  id: "dep-1",
  health_check_id: "check-1",
  dependent_check_id: "check-2",
  dependency_type: "blocking",
  failure_impact: "Degraded",
};

const CREATE_BODY = {
  health_check_id: "check-1",
  dependent_check_id: "check-2",
  dependency_type: "blocking",
  failure_impact: "Degraded",
};

describe("healthCheckDependencyPolicyRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    serviceMocks.createDependency.mockResolvedValue(DEPENDENCY);
    serviceMocks.getDependencies.mockResolvedValue([DEPENDENCY]);
    serviceMocks.getDependents.mockResolvedValue([DEPENDENCY]);
    serviceMocks.validateDependencyChain.mockResolvedValue({
      valid: true,
      hasCycles: false,
      chainDepth: 2,
    });
    serviceMocks.getImpactAnalysis.mockResolvedValue({
      directDependents: ["check-2"],
      indirectDependents: ["check-3"],
      totalAffected: 2,
    });
    serviceMocks.getFullGraph.mockResolvedValue(
      new Map([
        ["check-1", ["check-2"]],
        ["check-2", ["check-3"]],
      ]),
    );
    serviceMocks.deleteDependency.mockResolvedValue(undefined);

    app = Fastify();
    await app.register(healthCheckDependencyPolicyRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /api/v1/health-checks/dependencies", () => {
    it("creates a dependency policy and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/dependencies`,
        headers: ADMIN_SCOPE,
        payload: CREATE_BODY,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ data: DEPENDENCY });
      expect(serviceMocks.createDependency).toHaveBeenCalledWith(CREATE_BODY);
    });

    it("rejects a payload that is missing required fields", async () => {
      const { failure_impact, ...missingImpact } = CREATE_BODY;
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/dependencies`,
        headers: ADMIN_SCOPE,
        payload: missingImpact,
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.createDependency).not.toHaveBeenCalled();
    });

    it("rejects a dependency_type outside the blocking/informational enum", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/dependencies`,
        headers: ADMIN_SCOPE,
        payload: { ...CREATE_BODY, dependency_type: "sometimes" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.createDependency).not.toHaveBeenCalled();
    });

    it("maps service failures to a 400 error", async () => {
      serviceMocks.createDependency.mockRejectedValue(new Error("policy write failed"));

      const res = await app.inject({
        method: "POST",
        url: `${BASE}/dependencies`,
        headers: ADMIN_SCOPE,
        payload: CREATE_BODY,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "policy write failed" });
    });
  });

  describe("GET /api/v1/health-checks/:id/dependencies", () => {
    it("returns the dependency rules for the requested health check", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BASE}/check-1/dependencies`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [DEPENDENCY] });
      expect(serviceMocks.getDependencies).toHaveBeenCalledWith("check-1");
    });

    it("maps service failures to a 400 error", async () => {
      serviceMocks.getDependencies.mockRejectedValue(new Error("read failed"));

      const res = await app.inject({
        method: "GET",
        url: `${BASE}/check-1/dependencies`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "read failed" });
    });
  });

  describe("GET /api/v1/health-checks/:id/dependents", () => {
    it("returns the dependents for the requested health check", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BASE}/check-1/dependents`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [DEPENDENCY] });
      expect(serviceMocks.getDependents).toHaveBeenCalledWith("check-1");
    });
  });

  describe("POST /api/v1/health-checks/:id/validate-chain", () => {
    it("returns cycle and depth validation results", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/check-1/validate-chain`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: { valid: true, hasCycles: false, chainDepth: 2 },
      });
      expect(serviceMocks.validateDependencyChain).toHaveBeenCalledWith("check-1");
    });
  });

  describe("POST /api/v1/health-checks/:id/impact-analysis", () => {
    it("returns direct and indirect dependents", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/check-1/impact-analysis`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: {
          directDependents: ["check-2"],
          indirectDependents: ["check-3"],
          totalAffected: 2,
        },
      });
      expect(serviceMocks.getImpactAnalysis).toHaveBeenCalledWith("check-1");
    });
  });

  describe("GET /api/v1/health-checks/dependency-graph", () => {
    it("serializes the service Map into a plain object", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BASE}/dependency-graph`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: {
          "check-1": ["check-2"],
          "check-2": ["check-3"],
        },
      });
      expect(serviceMocks.getFullGraph).toHaveBeenCalled();
    });
  });

  describe("DELETE /api/v1/health-checks/dependencies/:id", () => {
    it("deletes a dependency and returns 204", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `${BASE}/dependencies/dep-1`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      expect(serviceMocks.deleteDependency).toHaveBeenCalledWith("dep-1");
    });

    it("maps service failures to a 400 error", async () => {
      serviceMocks.deleteDependency.mockRejectedValue(new Error("delete failed"));

      const res = await app.inject({
        method: "DELETE",
        url: `${BASE}/dependencies/dep-1`,
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "delete failed" });
    });
  });

  describe("authentication and gap documentation", () => {
    it("returns 401 when no credentials are supplied", async () => {
      const res = await app.inject({ method: "GET", url: `${BASE}/check-1/dependencies` });

      expect(res.statusCode).toBe(401);
      expect(serviceMocks.getDependencies).not.toHaveBeenCalled();
    });

    // The issue asks for admin-only changes. The route installs authMiddleware()
    // with no requiredScopes, so any authenticated scope currently passes.
    it("accepts a non-admin scope (no admin scope check yet)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BASE}/check-1/dependencies`,
        headers: NON_ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [DEPENDENCY] });
    });

    // The issue's /api/v1/health-policies endpoints do not exist on this module.
    it("does not expose GET or PUT /api/v1/health-policies", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/health-policies",
        headers: ADMIN_SCOPE,
      });
      const putRes = await app.inject({
        method: "PUT",
        url: "/api/v1/health-policies/dep-1",
        headers: ADMIN_SCOPE,
        payload: { threshold: 80 },
      });

      expect(getRes.statusCode).toBe(404);
      expect(putRes.statusCode).toBe(404);
    });

    // There is no threshold field or 0-100 validation in the create schema:
    // an out-of-range value is silently stripped by the handler instead of 400.
    it("does not validate a threshold percentage in the create payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/dependencies`,
        headers: ADMIN_SCOPE,
        payload: { ...CREATE_BODY, threshold: 150 },
      });

      expect(res.statusCode).toBe(201);
      expect(serviceMocks.createDependency).toHaveBeenCalledWith(CREATE_BODY);
    });
  });
});
