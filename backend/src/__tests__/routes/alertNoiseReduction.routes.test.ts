import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  analyzeAlertNoise: vi.fn(),
  getAnalysis: vi.fn(),
  listAnalyses: vi.fn(),
  applyRecommendation: vi.fn(),
}));

vi.mock("../../services/alertNoiseReduction.service.js", () => ({
  alertNoiseReductionService: serviceMocks,
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

import { alertNoiseReductionRoutes } from "../../api/routes/alertNoiseReduction.routes.js";

const PREFIX = "/api/v1/alert-noise-reduction";
const AUTH = { "x-test-scopes": "alerts:read" };
const ACCOUNT_ID = "1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const ANALYSIS_ID = "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d";
const RECOMMENDATION_ID = "0f1e2d3c-4b5a-4968-8776-655443322110";

const validAnalysisBody = {
  accountId: ACCOUNT_ID,
  alertRuleId: "rule-price-deviation",
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2026-01-08T00:00:00.000Z",
};

const analysisResult = {
  analysis: { id: ANALYSIS_ID, accountId: ACCOUNT_ID, status: "completed" },
  metrics: { totalAlerts: 120, duplicateRate: 0.4, flappingScore: 0.2 },
  recommendations: [
    {
      id: RECOMMENDATION_ID,
      analysisId: ANALYSIS_ID,
      recommendationType: "alert_suppression",
      description: "Suppress duplicate alerts within 5 minutes",
      confidenceScore: 0.8,
      expectedReductionPercent: 35,
      parameters: { windowSeconds: 300 },
      status: "pending",
    },
  ],
};

describe("alertNoiseReductionRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    serviceMocks.analyzeAlertNoise.mockResolvedValue(analysisResult);
    serviceMocks.getAnalysis.mockResolvedValue({ ...analysisResult.analysis, recommendations: [] });
    serviceMocks.listAnalyses.mockResolvedValue({
      analyses: [{ id: ANALYSIS_ID }, { id: "7b6c5d4e-3f2a-4b1c-8d0e-9f8a7b6c5d4e" }],
      pagination: { total: "2", limit: 20, offset: 0 },
    });
    serviceMocks.applyRecommendation.mockResolvedValue({ id: RECOMMENDATION_ID, status: "applied" });

    app = Fastify();
    await app.register(alertNoiseReductionRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    { method: "POST", url: `${PREFIX}/analyses`, payload: validAnalysisBody },
    { method: "GET", url: `${PREFIX}/analyses/${ANALYSIS_ID}` },
    { method: "GET", url: `${PREFIX}/accounts/${ACCOUNT_ID}/analyses` },
    { method: "POST", url: `${PREFIX}/recommendations/${RECOMMENDATION_ID}/apply` },
  ] as const)("$method $url returns 401 without credentials", async (endpoint) => {
    const res = await app.inject({ ...endpoint });

    expect(res.statusCode).toBe(401);
    for (const fn of Object.values(serviceMocks)) expect(fn).not.toHaveBeenCalled();
  });

  describe("POST /analyses", () => {
    it("runs an analysis over the requested window", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/analyses`,
        headers: AUTH,
        payload: { ...validAnalysisBody, sampleSize: 250 },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(analysisResult);

      const [params] = serviceMocks.analyzeAlertNoise.mock.calls[0];
      expect(params.accountId).toBe(ACCOUNT_ID);
      expect(params.alertRuleId).toBe("rule-price-deviation");
      expect(params.windowStart).toBeInstanceOf(Date);
      expect(params.windowStart.toISOString()).toBe(validAnalysisBody.windowStart);
      expect(params.windowEnd.toISOString()).toBe(validAnalysisBody.windowEnd);
      expect(params.sampleSize).toBe(250);
    });

    it("defaults the sample size to 100", async () => {
      await app.inject({ method: "POST", url: `${PREFIX}/analyses`, headers: AUTH, payload: validAnalysisBody });

      expect(serviceMocks.analyzeAlertNoise).toHaveBeenCalledWith(expect.objectContaining({ sampleSize: 100 }));
    });

    it.each([
      ["accountId is missing", { ...validAnalysisBody, accountId: undefined }],
      ["alertRuleId is missing", { ...validAnalysisBody, alertRuleId: undefined }],
      ["windowStart is missing", { ...validAnalysisBody, windowStart: undefined }],
      ["windowEnd is missing", { ...validAnalysisBody, windowEnd: undefined }],
      ["accountId is not a UUID", { ...validAnalysisBody, accountId: "acct-1" }],
      ["windowStart is not a date-time", { ...validAnalysisBody, windowStart: "yesterday" }],
      ["windowEnd is not a date-time", { ...validAnalysisBody, windowEnd: "2026-01-08" }],
      ["sampleSize is not an integer", { ...validAnalysisBody, sampleSize: 1.5 }],
    ])("returns 400 when %s", async (_label, payload) => {
      const res = await app.inject({ method: "POST", url: `${PREFIX}/analyses`, headers: AUTH, payload });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.analyzeAlertNoise).not.toHaveBeenCalled();
    });

    it("surfaces service failures as 500", async () => {
      serviceMocks.analyzeAlertNoise.mockRejectedValue(new Error("database unavailable"));

      const res = await app.inject({ method: "POST", url: `${PREFIX}/analyses`, headers: AUTH, payload: validAnalysisBody });

      expect(res.statusCode).toBe(500);
    });
  });

  describe("GET /analyses/:analysisId", () => {
    it("returns the analysis", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/analyses/${ANALYSIS_ID}`, headers: AUTH });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ...analysisResult.analysis, recommendations: [] });
      expect(serviceMocks.getAnalysis).toHaveBeenCalledWith(ANALYSIS_ID);
    });

    it("returns 400 when the id is not a UUID", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/analyses/latest`, headers: AUTH });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.getAnalysis).not.toHaveBeenCalled();
    });

    it("surfaces a missing analysis as a server error", async () => {
      serviceMocks.getAnalysis.mockRejectedValue(new Error(`Analysis not found: ${ANALYSIS_ID}`));

      const res = await app.inject({ method: "GET", url: `${PREFIX}/analyses/${ANALYSIS_ID}`, headers: AUTH });

      expect(res.statusCode).toBe(500);
    });
  });

  describe("GET /accounts/:accountId/analyses", () => {
    it("returns a paginated list with default paging", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/accounts/${ACCOUNT_ID}/analyses`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
      expect(serviceMocks.listAnalyses).toHaveBeenCalledWith(ACCOUNT_ID, 20, 0);
    });

    it("honours a custom limit", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/accounts/${ACCOUNT_ID}/analyses?limit=1`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().meta).toMatchObject({ limit: 1, totalPages: 2, hasNext: true });
      expect(serviceMocks.listAnalyses).toHaveBeenCalledWith(ACCOUNT_ID, 1, 0);
    });

    it("clamps the limit to the maximum page size", async () => {
      await app.inject({
        method: "GET",
        url: `${PREFIX}/accounts/${ACCOUNT_ID}/analyses?limit=1000`,
        headers: AUTH,
      });

      expect(serviceMocks.listAnalyses).toHaveBeenCalledWith(ACCOUNT_ID, 100, 0);
    });

    it("returns 400 when the account id is not a UUID", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/accounts/acct-1/analyses`, headers: AUTH });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.listAnalyses).not.toHaveBeenCalled();
    });
  });

  describe("POST /recommendations/:recommendationId/apply", () => {
    it("applies the recommendation", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/recommendations/${RECOMMENDATION_ID}/apply`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: RECOMMENDATION_ID, status: "applied" });
      expect(serviceMocks.applyRecommendation).toHaveBeenCalledWith(RECOMMENDATION_ID);
    });

    it("returns 400 when the id is not a UUID", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/recommendations/rec-1/apply`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.applyRecommendation).not.toHaveBeenCalled();
    });

    it("surfaces a missing recommendation as a server error", async () => {
      serviceMocks.applyRecommendation.mockRejectedValue(new Error(`Recommendation not found: ${RECOMMENDATION_ID}`));

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/recommendations/${RECOMMENDATION_ID}/apply`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(500);
    });
  });
});
