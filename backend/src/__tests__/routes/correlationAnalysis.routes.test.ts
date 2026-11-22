import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  computeCorrelation: vi.fn(),
  getLatestCorrelation: vi.fn(),
  getCorrelationMatrix: vi.fn(),
  createAlert: vi.fn(),
  listAlerts: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../services/correlationAnalysis.service.js", () => ({
  correlationAnalysisService: serviceMocks,
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

import { correlationAnalysisRoutes } from "../../api/routes/correlationAnalysis.routes.js";

const PREFIX = "/api/v1/analytics/correlation";
const ANALYTICS_SCOPE = { "x-test-scopes": "analytics:read" };

describe("correlationAnalysisRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Reset mocks BEFORE creating app
    vi.resetAllMocks();

    app = Fastify();
    await app.register(correlationAnalysisRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("authorization", () => {
    it("returns 401 without credentials", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/matrix?assets=XLM,USD&period=7d` });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /matrix", () => {
    it("returns 200 and calls the service", async () => {
      serviceMocks.getCorrelationMatrix.mockResolvedValue({
        XLM: { XLM: 1, USD: 0.45 },
        USD: { XLM: 0.45, USD: 1 },
      });

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM,USD&period=7d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getCorrelationMatrix).toHaveBeenCalledWith(["XLM", "USD"], "7d");
    });

    it("accepts 24h window", async () => {
      const mockMatrix = {
        XLM: { XLM: 1 },
      };
      serviceMocks.getCorrelationMatrix.mockResolvedValue(mockMatrix);

      await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM&period=24h`,
        headers: ANALYTICS_SCOPE,
      });

      expect(serviceMocks.getCorrelationMatrix).toHaveBeenCalledWith(["XLM"], "24h");
    });

    it("accepts 30d window", async () => {
      const mockMatrix = {
        XLM: { XLM: 1 },
      };
      serviceMocks.getCorrelationMatrix.mockResolvedValue(mockMatrix);

      await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM&period=30d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(serviceMocks.getCorrelationMatrix).toHaveBeenCalledWith(["XLM"], "30d");
    });

    it("accepts 90d window", async () => {
      const mockMatrix = {
        XLM: { XLM: 1 },
      };
      serviceMocks.getCorrelationMatrix.mockResolvedValue(mockMatrix);

      await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM&period=90d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(serviceMocks.getCorrelationMatrix).toHaveBeenCalledWith(["XLM"], "90d");
    });

    it("trims whitespace from asset names", async () => {
      const mockMatrix = {
        XLM: { XLM: 1, USD: 0.5 },
        USD: { XLM: 0.5, USD: 1 },
      };
      serviceMocks.getCorrelationMatrix.mockResolvedValue(mockMatrix);

      await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM%20,%20USD&period=7d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(serviceMocks.getCorrelationMatrix).toHaveBeenCalledWith(["XLM", "USD"], "7d");
    });

    it("returns 400 when required parameters are missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when assets parameter is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?period=7d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns symmetric matrix structure when service returns proper data", async () => {
      const mockMatrix = {
        XLM: { XLM: 1, USDC: 0.62, EUR: 0.55 },
        USDC: { XLM: 0.62, USDC: 1, EUR: 0.78 },
        EUR: { XLM: 0.55, USDC: 0.78, EUR: 1 },
      };
      serviceMocks.getCorrelationMatrix.mockResolvedValue(mockMatrix);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM,USDC,EUR&period=30d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getCorrelationMatrix).toHaveBeenCalledWith(["XLM", "USDC", "EUR"], "30d");
    });

    it("handles insufficient data by accepting zero correlations", async () => {
      const degradedMatrix = {
        XLM: { XLM: 1, USD: 0 },
        USD: { XLM: 0, USD: 1 },
      };
      serviceMocks.getCorrelationMatrix.mockResolvedValue(degradedMatrix);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM,USD&period=24h`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getCorrelationMatrix).toHaveBeenCalledWith(["XLM", "USD"], "24h");
    });

    it("handles service errors", async () => {
      serviceMocks.getCorrelationMatrix.mockRejectedValueOnce(new Error("Database unavailable"));

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/matrix?assets=XLM,USD&period=7d`,
        headers: ANALYTICS_SCOPE,
      });

      // Fastify returns 500 for unhandled errors
      expect(res.statusCode).toBe(500);
    });
  });

  describe("POST /compute", () => {
    it("computes correlation for two assets with default period", async () => {
      const mockSnapshot = {
        id: "corr-1",
        assetA: "XLM",
        assetB: "USD",
        period: "1d",
        correlationCoefficient: 0.65,
        sampleCount: 100,
        pValue: 0.001,
        strength: "moderate",
        metadata: null,
        computedAt: new Date(),
      };
      serviceMocks.computeCorrelation.mockResolvedValue(mockSnapshot);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/compute`,
        headers: ANALYTICS_SCOPE,
        payload: { assetA: "XLM", assetB: "USD" },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.computeCorrelation).toHaveBeenCalledWith("XLM", "USD", "1d");
    });

    it("accepts custom periods: 1h, 4h, 1d, 7d", async () => {
      const mockSnapshot = {
        id: "corr-1",
        assetA: "XLM",
        assetB: "USD",
        period: "4h",
        correlationCoefficient: 0.45,
        sampleCount: 50,
        pValue: 0.05,
        strength: "weak",
        metadata: null,
        computedAt: new Date(),
      };
      serviceMocks.computeCorrelation.mockResolvedValue(mockSnapshot);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/compute`,
        headers: ANALYTICS_SCOPE,
        payload: { assetA: "XLM", assetB: "USD", period: "4h" },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.computeCorrelation).toHaveBeenCalledWith("XLM", "USD", "4h");
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/compute`,
        headers: ANALYTICS_SCOPE,
        payload: { assetA: "XLM" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when body is empty", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/compute`,
        headers: ANALYTICS_SCOPE,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /latest", () => {
    it("returns latest correlation for given assets and period", async () => {
      const mockSnapshot = {
        id: "corr-123",
        assetA: "XLM",
        assetB: "USD",
        period: "7d",
        correlationCoefficient: 0.72,
        sampleCount: 168,
        pValue: 0.0001,
        strength: "strong",
        metadata: null,
        computedAt: new Date(),
      };
      serviceMocks.getLatestCorrelation.mockResolvedValue(mockSnapshot);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/latest?assetA=XLM&assetB=USD&period=7d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().correlation).toBeDefined();
      expect(serviceMocks.getLatestCorrelation).toHaveBeenCalledWith("XLM", "USD", "7d");
    });

    it("returns null when no correlation data exists", async () => {
      serviceMocks.getLatestCorrelation.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/latest?assetA=XLM&assetB=UNKNOWN&period=7d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().correlation).toBeNull();
    });

    it("returns 400 when required parameters are missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/latest?assetA=XLM&period=7d`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /alerts", () => {
    it("creates a correlation alert with required fields", async () => {
      const mockAlert = {
        id: "alert-1",
        ownerAddress: "GADDR1234567890",
        assetA: "XLM",
        assetB: "USD",
        condition: "above",
        threshold: 0.8,
        isActive: true,
        lastTriggeredAt: null,
        createdAt: new Date(),
      };
      serviceMocks.createAlert.mockResolvedValue(mockAlert);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/alerts`,
        headers: ANALYTICS_SCOPE,
        payload: {
          ownerAddress: "GADDR1234567890",
          assetA: "XLM",
          assetB: "USD",
          condition: "above",
          threshold: 0.8,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(serviceMocks.createAlert).toHaveBeenCalledWith(
        "GADDR1234567890",
        "XLM",
        "USD",
        "above",
        0.8,
      );
    });

    it("accepts both above and below conditions", async () => {
      const mockAlert = {
        id: "alert-2",
        ownerAddress: "GADDR1234567890",
        assetA: "XLM",
        assetB: "USD",
        condition: "below",
        threshold: 0.3,
        isActive: true,
        lastTriggeredAt: null,
        createdAt: new Date(),
      };
      serviceMocks.createAlert.mockResolvedValue(mockAlert);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/alerts`,
        headers: ANALYTICS_SCOPE,
        payload: {
          ownerAddress: "GADDR1234567890",
          assetA: "XLM",
          assetB: "USD",
          condition: "below",
          threshold: 0.3,
        },
      });

      expect(res.statusCode).toBe(201);
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/alerts`,
        headers: ANALYTICS_SCOPE,
        payload: {
          ownerAddress: "GADDR1234567890",
          assetA: "XLM",
          condition: "above",
          threshold: 0.8,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /alerts", () => {
    it("lists alerts for a given owner address", async () => {
      const mockAlerts = [
        {
          id: "alert-1",
          ownerAddress: "GADDR1234567890",
          assetA: "XLM",
          assetB: "USD",
          condition: "above",
          threshold: 0.8,
          isActive: true,
          lastTriggeredAt: null,
          createdAt: "2026-11-21T00:16:21.516Z",
        },
      ];
      serviceMocks.listAlerts.mockResolvedValue(mockAlerts);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/alerts?owner=GADDR1234567890`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.listAlerts).toHaveBeenCalledWith("GADDR1234567890");
    });

    it("returns empty array when no alerts exist for owner", async () => {
      serviceMocks.listAlerts.mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/alerts?owner=GNOALERTS`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().alerts).toEqual([]);
    });

    it("returns 400 when owner parameter is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/alerts`,
        headers: ANALYTICS_SCOPE,
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
