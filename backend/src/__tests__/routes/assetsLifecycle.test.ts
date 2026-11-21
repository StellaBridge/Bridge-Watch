import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  deactivateAsset: vi.fn(),
  reactivateAsset: vi.fn(),
  getLifecycleEvents: vi.fn(),
  getDeactivatedAssets: vi.fn(),
}));

vi.mock("../../services/assetLifecycle.service.js", () => ({
  assetLifecycleService: serviceMocks,
}));

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
      request.tenantContext = { tenantId: "t-1", actorId: "u-1", actorType: "user", bypass: false };
    },
}));

import { assetsLifecycleRoutes } from "../../api/routes/assetsLifecycle.js";

const PREFIX = "/api/v1";
const AUTH = { "x-test-scopes": "*" };
const SYMBOL = "USDC";

describe("assetsLifecycleRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();

    serviceMocks.deactivateAsset.mockResolvedValue({
      success: true,
      message: `Asset ${SYMBOL} deactivated`,
    });
    serviceMocks.reactivateAsset.mockResolvedValue({
      success: true,
      message: `Asset ${SYMBOL} reactivated`,
    });
    serviceMocks.getLifecycleEvents.mockResolvedValue({
      symbol: SYMBOL,
      events: [
        { type: "deactivated", performedBy: "admin", timestamp: "2026-01-01T00:00:00.000Z" },
      ],
    });
    serviceMocks.getDeactivatedAssets.mockResolvedValue({
      assets: [{ symbol: SYMBOL, deactivatedAt: "2026-01-01T00:00:00.000Z" }],
      total: 1,
    });

    app = Fastify();
    await app.register(assetsLifecycleRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /assets/:symbol/deactivate", () => {
    it("deactivates an asset with reason and performedBy", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/deactivate`,
        headers: AUTH,
        payload: { reason: "Routine maintenance", performedBy: "admin@bridge.watch" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ success: true });
      expect(serviceMocks.deactivateAsset).toHaveBeenCalledWith(
        SYMBOL,
        "Routine maintenance",
        "admin@bridge.watch"
      );
    });

    it("deactivates an asset with null reason", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/deactivate`,
        headers: AUTH,
        payload: { reason: null, performedBy: "admin@bridge.watch" },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.deactivateAsset).toHaveBeenCalledWith(SYMBOL, null, "admin@bridge.watch");
    });

    it("deactivates an asset without an optional reason", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/deactivate`,
        headers: AUTH,
        payload: { performedBy: "admin@bridge.watch" },
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.deactivateAsset).toHaveBeenCalled();
    });

    it("returns 400 when performedBy is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/deactivate`,
        headers: AUTH,
        payload: { reason: "test" },
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.deactivateAsset).not.toHaveBeenCalled();
    });

    it("returns 500 when service throws", async () => {
      serviceMocks.deactivateAsset.mockRejectedValue(new Error("DB error"));

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/deactivate`,
        headers: AUTH,
        payload: { performedBy: "admin" },
      });

      expect(res.statusCode).toBe(500);
    });

    it("returns 401 without credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/deactivate`,
        payload: { performedBy: "admin" },
      });

      expect(res.statusCode).toBe(401);
      expect(serviceMocks.deactivateAsset).not.toHaveBeenCalled();
    });
  });

  describe("POST /assets/:symbol/reactivate", () => {
    it("reactivates an asset", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/reactivate`,
        headers: AUTH,
        payload: { performedBy: "admin@bridge.watch" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ success: true });
      expect(serviceMocks.reactivateAsset).toHaveBeenCalledWith(SYMBOL, "admin@bridge.watch");
    });

    it("returns 400 when performedBy is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/reactivate`,
        headers: AUTH,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(serviceMocks.reactivateAsset).not.toHaveBeenCalled();
    });

    it("returns 500 when service throws", async () => {
      serviceMocks.reactivateAsset.mockRejectedValue(new Error("DB error"));

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/reactivate`,
        headers: AUTH,
        payload: { performedBy: "admin" },
      });

      expect(res.statusCode).toBe(500);
    });

    it("returns 401 without credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/assets/${SYMBOL}/reactivate`,
        payload: { performedBy: "admin" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /assets/:symbol/lifecycle", () => {
    it("returns lifecycle events for a symbol", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/assets/${SYMBOL}/lifecycle`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      const body = res.json();
      expect(body.symbol).toBe(SYMBOL);
      expect(body.events).toHaveLength(1);
      expect(serviceMocks.getLifecycleEvents).toHaveBeenCalledWith(SYMBOL, undefined);
    });

    it("passes optional limit query param", async () => {
      await app.inject({
        method: "GET",
        url: `${PREFIX}/assets/${SYMBOL}/lifecycle?limit=5`,
        headers: AUTH,
      });

      expect(serviceMocks.getLifecycleEvents).toHaveBeenCalledWith(SYMBOL, 5);
    });

    it("returns 401 without credentials", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/assets/${SYMBOL}/lifecycle`,
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns empty events array when no history exists", async () => {
      serviceMocks.getLifecycleEvents.mockResolvedValue({ symbol: SYMBOL, events: [] });

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/assets/${SYMBOL}/lifecycle`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().events).toHaveLength(0);
    });
  });

  describe("GET /assets/deactivated", () => {
    it("returns all deactivated assets", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/assets/deactivated`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(1);
      expect(body.assets).toHaveLength(1);
      expect(serviceMocks.getDeactivatedAssets).toHaveBeenCalled();
    });

    it("returns empty list when no assets are deactivated", async () => {
      serviceMocks.getDeactivatedAssets.mockResolvedValue({ assets: [], total: 0 });

      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/assets/deactivated`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ assets: [], total: 0 });
    });

    it("returns 401 without credentials", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/assets/deactivated`,
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
