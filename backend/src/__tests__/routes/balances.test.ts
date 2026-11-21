import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  listBalances: vi.fn(),
  syncTrackedBalances: vi.fn(),
  startRealTimeTracking: vi.fn(),
  stopRealTimeTracking: vi.fn(),
  getBalanceHistory: vi.fn(),
  getCrossChainComparison: vi.fn(),
  reconcileBalances: vi.fn(),
}));

vi.mock("../../services/balance.service.js", () => ({
  BalanceService: vi.fn().mockImplementation(() => serviceMocks),
}));

import { balanceRoutes } from "../../api/routes/balances.js";

const PREFIX = "/api/v1/balances";
const ASSET_CODE = "USDC";

function makeBalance(overrides: Record<string, unknown> = {}) {
  return {
    id: "bal-1",
    assetCode: ASSET_CODE,
    balance: "1000000.0000000",
    chain: "stellar",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("balanceRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();

    serviceMocks.listBalances.mockResolvedValue([makeBalance()]);
    serviceMocks.syncTrackedBalances.mockResolvedValue({ synced: 1, errors: 0 });
    serviceMocks.startRealTimeTracking.mockResolvedValue(undefined);
    serviceMocks.stopRealTimeTracking.mockResolvedValue(undefined);
    serviceMocks.getBalanceHistory.mockResolvedValue([
      { balance: "1000000.0000000", recordedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    serviceMocks.getCrossChainComparison.mockResolvedValue({
      assetCode: ASSET_CODE,
      chains: [{ chain: "stellar", balance: "1000000.0000000" }],
    });
    serviceMocks.reconcileBalances.mockResolvedValue({
      assetCode: ASSET_CODE,
      issuer: "1000000.0000000",
      reserve: "999000.0000000",
      custody: "1000.0000000",
      discrepancy: "0.0000000",
    });

    app = Fastify();
    await app.register(balanceRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /", () => {
    it("returns all tracked balances", async () => {
      const res = await app.inject({ method: "GET", url: PREFIX });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      const body = res.json();
      expect(body.balances).toHaveLength(1);
      expect(serviceMocks.listBalances).toHaveBeenCalledWith(undefined);
    });

    it("filters balances by asset code", async () => {
      await app.inject({ method: "GET", url: `${PREFIX}?asset=${ASSET_CODE}` });

      expect(serviceMocks.listBalances).toHaveBeenCalledWith(ASSET_CODE);
    });

    it("returns empty array when no balances tracked", async () => {
      serviceMocks.listBalances.mockResolvedValue([]);

      const res = await app.inject({ method: "GET", url: PREFIX });

      expect(res.statusCode).toBe(200);
      expect(res.json().balances).toHaveLength(0);
    });
  });

  describe("POST /sync", () => {
    it("syncs tracked balances across configured chains", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/sync`,
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ success: true });
      expect(serviceMocks.syncTrackedBalances).toHaveBeenCalled();
    });

    it("passes significantChangeThresholdPct to service", async () => {
      await app.inject({
        method: "POST",
        url: `${PREFIX}/sync`,
        payload: { significantChangeThresholdPct: 5 },
      });

      expect(serviceMocks.syncTrackedBalances).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ significantChangeThresholdPct: 5 })
      );
    });

    it("accepts empty body", async () => {
      const res = await app.inject({ method: "POST", url: `${PREFIX}/sync` });

      expect(res.statusCode).toBe(200);
    });
  });

  describe("POST /stream/start", () => {
    it("starts real-time balance tracking", async () => {
      const res = await app.inject({ method: "POST", url: `${PREFIX}/stream/start` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(serviceMocks.startRealTimeTracking).toHaveBeenCalled();
    });
  });

  describe("POST /stream/stop", () => {
    it("stops real-time balance tracking", async () => {
      const res = await app.inject({ method: "POST", url: `${PREFIX}/stream/stop` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(serviceMocks.stopRealTimeTracking).toHaveBeenCalled();
    });
  });

  describe("GET /history/:assetCode", () => {
    it("returns balance history for an asset with default limit 100", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/history/${ASSET_CODE}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().history).toHaveLength(1);
      expect(serviceMocks.getBalanceHistory).toHaveBeenCalledWith(ASSET_CODE, 100);
    });

    it("respects the optional limit query parameter", async () => {
      await app.inject({
        method: "GET",
        url: `${PREFIX}/history/${ASSET_CODE}?limit=25`,
      });

      expect(serviceMocks.getBalanceHistory).toHaveBeenCalledWith(ASSET_CODE, 25);
    });

    it("returns empty history array when no records exist", async () => {
      serviceMocks.getBalanceHistory.mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/history/${ASSET_CODE}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().history).toHaveLength(0);
    });
  });

  describe("GET /compare/:assetCode", () => {
    it("returns cross-chain comparison for an asset", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/compare/${ASSET_CODE}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.assetCode).toBe(ASSET_CODE);
      expect(serviceMocks.getCrossChainComparison).toHaveBeenCalledWith(ASSET_CODE);
    });
  });

  describe("GET /reconcile/:assetCode", () => {
    it("returns reconciliation data for an asset", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/reconcile/${ASSET_CODE}`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.assetCode).toBe(ASSET_CODE);
      expect(body).toHaveProperty("discrepancy");
      expect(serviceMocks.reconcileBalances).toHaveBeenCalledWith(ASSET_CODE);
    });

    it("reports zero discrepancy when balances match", async () => {
      serviceMocks.reconcileBalances.mockResolvedValue({
        assetCode: ASSET_CODE,
        issuer: "1000000.0000000",
        reserve: "1000000.0000000",
        custody: "0.0000000",
        discrepancy: "0.0000000",
      });

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/reconcile/${ASSET_CODE}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().discrepancy).toBe("0.0000000");
    });
  });
});
