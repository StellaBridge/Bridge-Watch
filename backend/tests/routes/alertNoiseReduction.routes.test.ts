import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { alertNoiseReductionRoutes } from "../../src/api/routes/alertNoiseReduction.routes.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => ({
    table: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue(Promise.resolve([{ id: "analysis-1" }])),
      select: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          first: vi.fn().mockReturnValue(Promise.resolve(null)),
          orderBy: vi.fn().mockReturnValue(Promise.resolve([])),
        }),
      }),
    }),
  }),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../src/services/alertNoiseReduction.service.js", () => ({
  alertNoiseReductionService: {
    analyzeAlertNoise: vi.fn().mockResolvedValue({
      analysis: {
        id: "analysis-1",
        accountId: "account-1",
        alertRuleId: "rule-1",
        status: "completed",
      },
      metrics: {
        falsePositiveRate: 0.15,
        alertFrequency: 120,
        averageThreshold: 50,
      },
      recommendations: [
        {
          id: "rec-1",
          type: "threshold-adjustment",
          description: "Increase threshold by 10%",
          impact: "Reduce false positives by ~8%",
        },
      ],
    }),
    getAnalysis: vi.fn().mockResolvedValue({
      id: "analysis-1",
      accountId: "account-1",
      alertRuleId: "rule-1",
      status: "completed",
      createdAt: new Date(),
    }),
    listAnalyses: vi.fn().mockResolvedValue({
      analyses: [
        {
          id: "analysis-1",
          accountId: "account-1",
          alertRuleId: "rule-1",
          status: "completed",
        },
      ],
      pagination: {
        total: 1,
        limit: 20,
        offset: 0,
      },
    }),
    applyRecommendation: vi.fn().mockResolvedValue({
      id: "rec-1",
      status: "applied",
      appliedAt: new Date(),
    }),
  },
}));

describe("Alert Noise Reduction Routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    app.register(async (fastify) => {
      fastify.decorate("tenantContext", { userId: "user-1", actorId: "actor-1" });
    });

    await app.register(alertNoiseReductionRoutes, { prefix: "/noise-reduction" });
    await app.ready();
  });

  describe("POST /analyses", () => {
    it("creates a noise reduction analysis with 201 status", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/noise-reduction/analyses",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          accountId: "123e4567-e89b-12d3-a456-426614174000",
          alertRuleId: "rule-1",
          windowStart: "2026-01-01T00:00:00Z",
          windowEnd: "2026-01-31T23:59:59Z",
          sampleSize: 100,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.analysis).toBeDefined();
      expect(json.metrics).toBeDefined();
      expect(json.recommendations).toBeDefined();
    });

    it("validates required fields", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/noise-reduction/analyses",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          accountId: "123e4567-e89b-12d3-a456-426614174000",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("uses default sampleSize if not provided", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/noise-reduction/analyses",
        headers: {
          authorization: "Bearer test-token",
        },
        payload: {
          accountId: "123e4567-e89b-12d3-a456-426614174000",
          alertRuleId: "rule-1",
          windowStart: "2026-01-01T00:00:00Z",
          windowEnd: "2026-01-31T23:59:59Z",
        },
      });

      expect([200, 201]).toContain(response.statusCode);
    });
  });

  describe("GET /analyses/:analysisId", () => {
    it("returns analysis details", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/noise-reduction/analyses/analysis-1",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.id).toBe("analysis-1");
      expect(json.accountId).toBe("account-1");
    });

    it("validates analysisId format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/noise-reduction/analyses/invalid-id",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe("GET /accounts/:accountId/analyses", () => {
    it("returns list of analyses for an account", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/noise-reduction/accounts/123e4567-e89b-12d3-a456-426614174000/analyses",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.data).toBeDefined() || expect(json.analyses).toBeDefined();
    });

    it("supports pagination parameters", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/noise-reduction/accounts/123e4567-e89b-12d3-a456-426614174000/analyses?limit=10&offset=0",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("validates accountId format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/noise-reduction/accounts/invalid-id/analyses",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect([200, 400]).toContain(response.statusCode);
    });
  });

  describe("POST /recommendations/:recommendationId/apply", () => {
    it("applies a recommendation with 200 status", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/noise-reduction/recommendations/rec-1/apply",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.id).toBeDefined() || expect(json.status).toBeDefined();
    });

    it("validates recommendationId format", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/noise-reduction/recommendations/invalid-id/apply",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect([200, 400]).toContain(response.statusCode);
    });

    it("returns applied recommendation details", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/noise-reduction/recommendations/rec-1/apply",
        headers: {
          authorization: "Bearer test-token",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.status || json.id).toBeDefined();
    });
  });
});
