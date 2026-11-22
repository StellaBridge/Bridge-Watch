import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { contributorDiagnosticsRoutes } from "../../src/api/routes/contributorDiagnostics.routes.js";

const service = vi.hoisted(() => ({
  recordDiagnostics: vi.fn(),
  getContributorDiagnostics: vi.fn(),
  getLatestDiagnostic: vi.fn(),
  getCriticalIssues: vi.fn(),
  getDashboardOverview: vi.fn(),
  getTypeAverages: vi.fn(),
  getRecentUpdates: vi.fn(),
}));

vi.mock("../../src/services/contributorDiagnostics.service.js", () => ({
  ContributorDiagnosticsService: vi.fn(() => service),
}));

// Stand-in for the real auth middleware: requests without the header are rejected.
vi.mock("../../src/api/middleware/auth.js", () => ({
  authMiddleware: () => async (request: any, reply: any) => {
    if (request.headers["x-test-auth"] !== "ok") {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  },
}));

const AUTH = { "x-test-auth": "ok" };

const validRecord = {
  contributor_id: "c-1",
  contributor_name: "Ada",
  diagnostic_type: "performance",
  metrics: { latencyMs: 120 },
  score: 88,
  recommendations: ["cache responses"],
};

describe("Contributor diagnostics routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(contributorDiagnosticsRoutes);
    await app.ready();
  });

  describe("authentication", () => {
    it("rejects requests without credentials with 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/contributors/diagnostics/critical",
      });

      expect(res.statusCode).toBe(401);
      expect(service.getCriticalIssues).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/v1/admin/contributors/diagnostics/record", () => {
    it("records diagnostics and returns 201 with the record", async () => {
      service.recordDiagnostics.mockResolvedValue({ id: "d-1" });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/contributors/diagnostics/record",
        headers: AUTH,
        payload: validRecord,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ data: { id: "d-1" } });
      expect(service.recordDiagnostics).toHaveBeenCalledWith(
        "c-1",
        "Ada",
        "performance",
        { latencyMs: 120 },
        88,
        ["cache responses"],
      );
    });

    it("returns 400 when the body fails schema validation", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/contributors/diagnostics/record",
        headers: AUTH,
        payload: { ...validRecord, diagnostic_type: "unknown" },
      });

      expect(res.statusCode).toBe(400);
      expect(service.recordDiagnostics).not.toHaveBeenCalled();
    });

    it("returns 400 with the service error message when recording fails", async () => {
      service.recordDiagnostics.mockRejectedValue(new Error("Score out of range"));

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/contributors/diagnostics/record",
        headers: AUTH,
        payload: validRecord,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("Score out of range");
    });
  });

  describe("GET /api/v1/contributors/:contributor_id/diagnostics", () => {
    it("returns the contributor's diagnostics", async () => {
      service.getContributorDiagnostics.mockResolvedValue([{ id: "d-1" }]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/contributors/c-1/diagnostics",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [{ id: "d-1" }] });
      expect(service.getContributorDiagnostics).toHaveBeenCalledWith("c-1");
    });

    it("returns 400 when the lookup throws", async () => {
      service.getContributorDiagnostics.mockRejectedValue(new Error("bad id"));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/contributors/c-1/diagnostics",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("bad id");
    });
  });

  describe("GET /api/v1/contributors/:contributor_id/diagnostics/:type", () => {
    it("returns the latest diagnostic of the given type", async () => {
      service.getLatestDiagnostic.mockResolvedValue({ id: "d-9", diagnostic_type: "testing" });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/contributors/c-1/diagnostics/testing",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ id: "d-9" });
      expect(service.getLatestDiagnostic).toHaveBeenCalledWith("c-1", "testing");
    });

    it("returns 400 when the lookup throws", async () => {
      service.getLatestDiagnostic.mockRejectedValue(new Error("no such type"));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/contributors/c-1/diagnostics/testing",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("no such type");
    });
  });

  describe("admin overview endpoints", () => {
    it("GET critical returns critical issues", async () => {
      service.getCriticalIssues.mockResolvedValue([{ contributor_id: "c-2" }]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/contributors/diagnostics/critical",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [{ contributor_id: "c-2" }] });
    });

    it("GET dashboard returns the overview", async () => {
      service.getDashboardOverview.mockResolvedValue({ total: 5 });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/contributors/diagnostics/dashboard",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { total: 5 } });
    });

    it("GET averages returns per-type averages", async () => {
      service.getTypeAverages.mockResolvedValue({ performance: 80 });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/contributors/diagnostics/averages",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { performance: 80 } });
    });

    it("GET critical returns 400 when the service throws", async () => {
      service.getCriticalIssues.mockRejectedValue(new Error("db error"));

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/contributors/diagnostics/critical",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("db error");
    });
  });

  describe("GET /api/v1/admin/contributors/diagnostics/recent-updates", () => {
    it("defaults to a 7-day window", async () => {
      service.getRecentUpdates.mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/contributors/diagnostics/recent-updates",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(service.getRecentUpdates).toHaveBeenCalledWith(7);
    });

    it("parses the days query parameter", async () => {
      service.getRecentUpdates.mockResolvedValue([{ id: "d-3" }]);

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/contributors/diagnostics/recent-updates?days=30",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(service.getRecentUpdates).toHaveBeenCalledWith(30);
      expect(res.json()).toEqual({ data: [{ id: "d-3" }] });
    });
  });
});
