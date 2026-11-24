import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  listDependencies: vi.fn(),
  getDependencyHistory: vi.fn(),
  runAllChecks: vi.fn(),
  setMaintenanceMode: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

// The route module instantiates the service at import time, so the mock has to
// provide the constructor as well as the instance methods.
vi.mock("../../services/externalDependencyMonitor.service.js", () => ({
  ExternalDependencyMonitorService: class {
    listDependencies = serviceMocks.listDependencies;
    getDependencyHistory = serviceMocks.getDependencyHistory;
    runAllChecks = serviceMocks.runAllChecks;
    setMaintenanceMode = serviceMocks.setMaintenanceMode;
  },
}));

vi.mock("../../utils/logger.js", () => ({ logger: loggerMocks }));

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

import { externalDependenciesRoutes } from "../../api/routes/externalDependencies.routes.js";

// The module is registered under /api/v1/external-dependencies in
// route-groups/utility-routes.ts (the issue text calls it /api/v1/dependencies).
const PREFIX = "/api/v1/external-dependencies";
const JOBS_SCOPE = { "x-test-scopes": "jobs:trigger" };
const READONLY_SCOPE = { "x-test-scopes": "dependencies:read" };

const STARLOR = {
  providerKey: "stellar-horizon",
  displayName: "Stellar Horizon",
  category: "core-rpc",
  status: "healthy",
  lastLatencyMs: 120,
  lastCheckedAt: "2026-01-08T12:00:00.000Z",
};
const COINGECKO = {
  providerKey: "coingecko",
  displayName: "CoinGecko",
  category: "price-provider",
  status: "degraded",
  lastLatencyMs: 940,
  lastCheckedAt: "2026-01-08T12:00:00.000Z",
};

const dependencyList = {
  dependencies: [STARLOR, COINGECKO],
  summary: { healthy: 1, degraded: 1, down: 0, maintenance: 0, unknown: 0 },
};

const history = [
  { id: "check-3", providerKey: "stellar-horizon", checkedAt: "2026-01-08T12:00:00.000Z", latencyMs: 110, status: "healthy" },
  { id: "check-2", providerKey: "stellar-horizon", checkedAt: "2026-01-08T11:30:00.000Z", latencyMs: 180, status: "healthy" },
  { id: "check-1", providerKey: "stellar-horizon", checkedAt: "2026-01-08T11:00:00.000Z", latencyMs: 240, status: "degraded" },
];

describe("externalDependenciesRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    serviceMocks.listDependencies.mockResolvedValue(dependencyList);
    serviceMocks.getDependencyHistory.mockResolvedValue(history);
    serviceMocks.runAllChecks.mockResolvedValue([{ providerKey: "stellar-horizon", status: "healthy" }]);
    serviceMocks.setMaintenanceMode.mockResolvedValue({ ...STARLOR, maintenanceMode: true });

    app = Fastify();
    await app.register(externalDependenciesRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /", () => {
    it("returns the status array for all tracked providers plus a summary", async () => {
      const res = await app.inject({ method: "GET", url: PREFIX });

      expect(res.statusCode).toBe(200);
      expect(res.json().dependencies).toHaveLength(2);
      expect(res.json().dependencies.map((item: any) => item.providerKey)).toEqual([
        "stellar-horizon",
        "coingecko",
      ]);
      expect(res.json().summary).toEqual(dependencyList.summary);
      expect(serviceMocks.listDependencies).toHaveBeenCalledWith({
        includeHistory: false,
        historyLimit: 10,
      });
    });

    it("is readable without credentials", async () => {
      const res = await app.inject({ method: "GET", url: PREFIX });

      expect(res.statusCode).toBe(200);
    });

    it("forwards includeHistory and historyLimit query options", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}?includeHistory=true&historyLimit=5`,
        headers: READONLY_SCOPE,
      });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.listDependencies).toHaveBeenCalledWith({
        includeHistory: true,
        historyLimit: 5,
      });
    });

    it("surfaces service failures as a 500 API error", async () => {
      serviceMocks.listDependencies.mockRejectedValue(new Error("database unavailable"));

      const res = await app.inject({ method: "GET", url: PREFIX });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toMatchObject({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Failed to list external dependencies",
      });
      expect(loggerMocks.error).toHaveBeenCalled();
    });
  });

  describe("GET /:providerKey/history", () => {
    it("returns a 24h latency timeseries for the named provider", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}/stellar-horizon/history?limit=24`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ providerKey: "stellar-horizon", history });
      expect(serviceMocks.getDependencyHistory).toHaveBeenCalledWith("stellar-horizon", 24);

      const timestamps = res.json().history.map((item: any) => Date.parse(item.checkedAt));
      const oldest = Math.min(...timestamps);
      expect(Date.parse("2026-01-08T12:00:00.000Z") - oldest).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    it("defaults the history limit to 50", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/coingecko/history` });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.getDependencyHistory).toHaveBeenCalledWith("coingecko", 50);
    });

    // The issue asks for 404 on an unknown name. The current route does no
    // existence check: the service returns [] and the handler answers 200.
    // Pin that behaviour so the gap is visible to reviewers.
    it("returns an empty history array for an unknown dependency name (no 404 yet)", async () => {
      serviceMocks.getDependencyHistory.mockResolvedValue([]);

      const res = await app.inject({ method: "GET", url: `${PREFIX}/does-not-exist/history` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ providerKey: "does-not-exist", history: [] });
      expect(serviceMocks.getDependencyHistory).toHaveBeenCalledWith("does-not-exist", 50);
    });
  });

  describe("response caching", () => {
    // There is no cache layer and no Cache-Control/ETag header in this route.
    // These assertions document the current behaviour instead of inventing it.
    it("does not serve repeated list requests from a cache", async () => {
      const first = await app.inject({ method: "GET", url: PREFIX });
      const second = await app.inject({ method: "GET", url: PREFIX });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(serviceMocks.listDependencies).toHaveBeenCalledTimes(2);
      expect(first.headers["cache-control"]).toBeUndefined();
      expect(first.headers.etag).toBeUndefined();
    });

    it("does not serve repeated history requests from a cache", async () => {
      await app.inject({ method: "GET", url: `${PREFIX}/stellar-horizon/history` });
      await app.inject({ method: "GET", url: `${PREFIX}/stellar-horizon/history` });

      expect(serviceMocks.getDependencyHistory).toHaveBeenCalledTimes(2);
    });
  });

  describe("protected endpoints", () => {
    it.each([
      { method: "POST" as const, url: `${PREFIX}/checks/run`, payload: undefined },
      { method: "PATCH" as const, url: `${PREFIX}/stellar-horizon/maintenance`, payload: { maintenanceMode: true } },
    ])("$method $url returns 401 without credentials", async (endpoint) => {
      const res = await app.inject({ ...endpoint });

      expect(res.statusCode).toBe(401);
      expect(serviceMocks.runAllChecks).not.toHaveBeenCalled();
      expect(serviceMocks.setMaintenanceMode).not.toHaveBeenCalled();
    });

    it.each([
      { method: "POST" as const, url: `${PREFIX}/checks/run`, payload: undefined },
      { method: "PATCH" as const, url: `${PREFIX}/stellar-horizon/maintenance`, payload: { maintenanceMode: true } },
    ])("$method $url returns 403 for a scope other than jobs:trigger", async (endpoint) => {
      const res = await app.inject({ ...endpoint, headers: READONLY_SCOPE });

      expect(res.statusCode).toBe(403);
      expect(serviceMocks.runAllChecks).not.toHaveBeenCalled();
      expect(serviceMocks.setMaintenanceMode).not.toHaveBeenCalled();
    });

    it("runs all checks with the jobs:trigger scope", async () => {
      const res = await app.inject({ method: "POST", url: `${PREFIX}/checks/run`, headers: JOBS_SCOPE });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, results: [{ providerKey: "stellar-horizon", status: "healthy" }] });
      expect(serviceMocks.runAllChecks).toHaveBeenCalledWith("manual");
    });

    it("updates maintenance mode with the jobs:trigger scope", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/stellar-horizon/maintenance`,
        headers: JOBS_SCOPE,
        payload: { maintenanceMode: true, note: "planned upgrade" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ success: true, dependency: { providerKey: "stellar-horizon" } });
      expect(serviceMocks.setMaintenanceMode).toHaveBeenCalledWith("stellar-horizon", true, "planned upgrade");
    });

    it("returns 404 when maintenance mode is set for an unknown provider", async () => {
      serviceMocks.setMaintenanceMode.mockResolvedValue(null);

      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/does-not-exist/maintenance`,
        headers: JOBS_SCOPE,
        payload: { maintenanceMode: true },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ message: "Dependency not found" });
    });
  });
});
