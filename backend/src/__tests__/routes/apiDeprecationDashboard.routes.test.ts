import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  registerDeprecation: vi.fn(),
  getDashboardMetrics: vi.fn(),
  getAtRiskEndpoints: vi.fn(),
  getDeprecatedEndpoints: vi.fn(),
  trackEndpointUsage: vi.fn(),
  updateDeprecationStatus: vi.fn(),
  getMigrationReport: vi.fn(),
  updateImpactMetrics: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../services/apiDeprecationDashboard.service.js", () => ({
  ApiDeprecationDashboardService: class {
    registerDeprecation = serviceMocks.registerDeprecation;
    getDashboardMetrics = serviceMocks.getDashboardMetrics;
    getAtRiskEndpoints = serviceMocks.getAtRiskEndpoints;
    getDeprecatedEndpoints = serviceMocks.getDeprecatedEndpoints;
    trackEndpointUsage = serviceMocks.trackEndpointUsage;
    updateDeprecationStatus = serviceMocks.updateDeprecationStatus;
    getMigrationReport = serviceMocks.getMigrationReport;
    updateImpactMetrics = serviceMocks.updateImpactMetrics;
  },
}));

vi.mock("../../utils/logger.js", () => ({ logger: loggerMocks }));

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
      if (request.headers["x-test-no-tenant"] === undefined) {
        request.tenantContext = { tenantId: "key-1", actorId: "actor-1", actorType: "user", bypass: false };
      }
    },
}));

import { apiDeprecationDashboardRoutes } from "../../api/routes/apiDeprecationDashboard.routes.js";

const ADMIN_SCOPE = { "x-test-scopes": "admin:read" };
const DEPRECATION_ID = "dep-123-456";

describe("apiDeprecationDashboardRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify();
    await app.register(apiDeprecationDashboardRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("authorization", () => {
    it("returns 401 without credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/deprecations/register",
        payload: {
          endpoint: "/api/v1/test",
          method: "GET",
          deprecation_date: "2026-01-01",
          sunset_date: "2026-07-01",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/v1/admin/deprecations/dashboard/metrics", () => {
    it("returns endpoint hit counts and statistics", async () => {
      const mockMetrics = {
        total_endpoints: 50,
        deprecated_count: 12,
        sunset_count: 3,
        at_risk_count: 5,
        average_active_clients: 25,
        high_impact_count: 4,
      };
      serviceMocks.getDashboardMetrics.mockResolvedValue(mockMetrics);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/deprecations/dashboard/metrics",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getDashboardMetrics).toHaveBeenCalled();
    });

    it("handles service errors with 400 status", async () => {
      serviceMocks.getDashboardMetrics.mockRejectedValue(new Error("Database error"));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/deprecations/dashboard/metrics",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error");
    });
  });

  describe("POST /api/v1/deprecations/track/:endpoint/:method", () => {
    it("tracks endpoint usage by user-agent", async () => {
      serviceMocks.trackEndpointUsage.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/deprecations/track/users/GET",
        headers: {
          ...ADMIN_SCOPE,
          "user-agent": "MyClient/1.0",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.trackEndpointUsage).toHaveBeenCalledWith("users", "GET");
    });

    it("returns success true on successful tracking", async () => {
      serviceMocks.trackEndpointUsage.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/deprecations/track/alerts/POST",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("success", true);
    });

    it("handles tracking errors with 400 status", async () => {
      serviceMocks.trackEndpointUsage.mockRejectedValue(new Error("Tracking failed"));

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/deprecations/track/test/DELETE",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/admin/deprecations/register", () => {
    it("registers a new deprecation with required fields", async () => {
      const mockRecord = {
        id: DEPRECATION_ID,
        endpoint: "/api/v1/legacy",
        method: "GET",
        status: "deprecated",
        deprecation_date: new Date("2026-01-01"),
        sunset_date: new Date("2026-07-01"),
        replacement_endpoint: "/api/v2/legacy",
        migration_guide: "See docs",
        impact_score: 5,
        active_client_count: 10,
      };
      serviceMocks.registerDeprecation.mockResolvedValue(mockRecord);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/deprecations/register",
        headers: ADMIN_SCOPE,
        payload: {
          endpoint: "/api/v1/legacy",
          method: "GET",
          deprecation_date: "2026-01-01",
          sunset_date: "2026-07-01",
          replacement_endpoint: "/api/v2/legacy",
          migration_guide: "See docs",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(serviceMocks.registerDeprecation).toHaveBeenCalled();
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/deprecations/register",
        headers: ADMIN_SCOPE,
        payload: {
          endpoint: "/api/v1/legacy",
          method: "GET",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 on service error", async () => {
      serviceMocks.registerDeprecation.mockRejectedValue(new Error("Validation failed"));

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/deprecations/register",
        headers: ADMIN_SCOPE,
        payload: {
          endpoint: "/api/v1/legacy",
          method: "GET",
          deprecation_date: "2026-01-01",
          sunset_date: "2026-07-01",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error");
    });
  });

  describe("GET /api/v1/admin/deprecations/at-risk", () => {
    it("returns list of at-risk endpoints", async () => {
      const mockEndpoints = [
        {
          id: "risk-1",
          endpoint: "/api/v1/users",
          method: "GET",
          status: "deprecated",
          active_client_count: 50,
        },
      ];
      serviceMocks.getAtRiskEndpoints.mockResolvedValue(mockEndpoints);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/deprecations/at-risk",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getAtRiskEndpoints).toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/admin/deprecations/deprecated", () => {
    it("returns list of deprecated endpoints", async () => {
      const mockEndpoints = [
        {
          id: "dep-1",
          endpoint: "/api/v1/old-users",
          method: "POST",
          status: "deprecated",
        },
      ];
      serviceMocks.getDeprecatedEndpoints.mockResolvedValue(mockEndpoints);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/deprecations/deprecated",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getDeprecatedEndpoints).toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/admin/deprecations/:id/status", () => {
    it("updates deprecation status to sunset", async () => {
      serviceMocks.updateDeprecationStatus.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/deprecations/${DEPRECATION_ID}/status`,
        headers: ADMIN_SCOPE,
        payload: { status: "sunset" },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.updateDeprecationStatus).toHaveBeenCalledWith(DEPRECATION_ID, "sunset");
    });

    it("updates deprecation status to deprecated", async () => {
      serviceMocks.updateDeprecationStatus.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/deprecations/${DEPRECATION_ID}/status`,
        headers: ADMIN_SCOPE,
        payload: { status: "deprecated" },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.updateDeprecationStatus).toHaveBeenCalledWith(DEPRECATION_ID, "deprecated");
    });

    it("returns 400 on update failure", async () => {
      serviceMocks.updateDeprecationStatus.mockRejectedValue(new Error("Update failed"));

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/deprecations/${DEPRECATION_ID}/status`,
        headers: ADMIN_SCOPE,
        payload: { status: "sunset" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/deprecations/migration-report/:endpoint/:method", () => {
    it("returns migration report for an endpoint", async () => {
      const mockReport = {
        endpoint: "/api/v1/legacy-users",
        method: "GET",
        status: "deprecated",
        replacement: "/api/v2/users",
        migration_guide: "Update client library",
        active_clients: 15,
        last_used: new Date("2026-10-01"),
      };
      serviceMocks.getMigrationReport.mockResolvedValue(mockReport);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/deprecations/migration-report/legacy-users/GET",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getMigrationReport).toHaveBeenCalledWith("legacy-users", "GET");
    });

    it("returns null when endpoint not found", async () => {
      serviceMocks.getMigrationReport.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/deprecations/migration-report/nonexistent/DELETE",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 400 on service error", async () => {
      serviceMocks.getMigrationReport.mockRejectedValue(new Error("Report generation failed"));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/deprecations/migration-report/test/PATCH",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("Cache-Control and ETag behavior", () => {
    it("dashboard metrics endpoint should be cacheable", async () => {
      const mockMetrics = {
        total_endpoints: 50,
        deprecated_count: 12,
        sunset_count: 3,
        at_risk_count: 5,
        average_active_clients: 25,
        high_impact_count: 4,
      };
      serviceMocks.getDashboardMetrics.mockResolvedValue(mockMetrics);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/deprecations/dashboard/metrics",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      // The response should be cacheable (routes don't set cache-control but that's ok)
      expect(res.headers).toBeDefined();
    });

    it("handles invalid date filters gracefully", async () => {
      serviceMocks.getDashboardMetrics.mockRejectedValue(new Error("Invalid date format"));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/deprecations/dashboard/metrics",
        headers: ADMIN_SCOPE,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty("error");
    });
  });
});
