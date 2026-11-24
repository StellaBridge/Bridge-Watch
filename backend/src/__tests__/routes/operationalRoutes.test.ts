import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const watermark = vi.hoisted(() => ({
  inspect: vi.fn(),
  overrideBarrier: vi.fn(),
}));
const jobs = vi.hoisted(() => ({
  cancel: vi.fn(),
  status: vi.fn(),
  dependencies: vi.fn(),
}));
const ledger = vi.hoisted(() => ({
  record: vi.fn(),
  update: vi.fn(),
  compute: vi.fn(),
  stats: vi.fn(),
  patterns: vi.fn(),
}));
const analytics = vi.hoisted(() => ({
  getAnalytics: vi.fn(),
  history: vi.fn(),
  log: vi.fn(),
}));

vi.mock("../../services/ingestionWatermarkCoordinator.service.js", () => ({
  ingestionWatermarkCoordinator: {
    inspect: watermark.inspect,
    overrideBarrier: watermark.overrideBarrier,
  },
}));
vi.mock("../../services/jobDependency.service.js", () => ({
  JobDependencyService: class {
    cancelJobExecution = jobs.cancel;
    getExecutionStatus = jobs.status;
    getExecutionDependencies = jobs.dependencies;
  },
}));
vi.mock("../../database/connection.js", () => ({
  getDatabase: vi.fn(() => ({})),
}));
vi.mock("../../services/ledgerCloseDelay.service.js", () => ({
  ledgerCloseDelayService: {
    recordClosureEvent: ledger.record,
    updateAlertStatus: ledger.update,
    computeDelayStats: ledger.compute,
    getDelayStats: ledger.stats,
    detectPatterns: ledger.patterns,
  },
}));
vi.mock("../../services/notificationAnalytics.service.js", () => ({
  NotificationAnalyticsService: class {
    getAnalytics = analytics.getAnalytics;
    getDeliveryHistory = analytics.history;
    logDelivery = analytics.log;
  },
}));
vi.mock("../../api/middleware/auth.js", () => ({
  authMiddleware: () => async (request: any, reply: any) => {
    if (!request.headers["x-test-auth"])
      return reply.code(401).send({ error: "Unauthorized" });
  },
}));

describe("ingestion watermark routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watermark.inspect.mockResolvedValue({ consumer: "indexer", latest: 42 });
    watermark.overrideBarrier.mockResolvedValue(undefined);
  });
  it("reads a watermark and requires authentication", async () => {
    const { ingestionWatermarkRoutes } =
      await import("../../api/routes/ingestionWatermarks.routes.js");
    const app = Fastify();
    await app.register(ingestionWatermarkRoutes);
    expect(
      (await app.inject({ method: "GET", url: "/indexer" })).statusCode,
    ).toBe(401);
    const response = await app.inject({
      method: "GET",
      url: "/indexer",
      headers: { "x-test-auth": "1" },
    });
    expect(response.statusCode).toBe(200);
    expect(watermark.inspect).toHaveBeenCalledWith("indexer");
  });
  it("validates and records an override", async () => {
    const { ingestionWatermarkRoutes } =
      await import("../../api/routes/ingestionWatermarks.routes.js");
    const app = Fastify();
    await app.register(ingestionWatermarkRoutes);
    const payload = {
      source: "manual",
      allowThrough: 50,
      reason: "temporary recovery",
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/indexer/overrides",
          headers: { "x-test-auth": "1" },
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(watermark.overrideBarrier).toHaveBeenCalledWith(
      expect.objectContaining({
        consumer: "indexer",
        allowThrough: 50,
        actorId: "admin",
      }),
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/indexer/overrides",
          headers: { "x-test-auth": "1" },
          payload: { ...payload, reason: "x" },
        })
      ).statusCode,
    ).toBe(500);
  });
});

describe("job dependency routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobs.cancel.mockResolvedValue({ cancelled: true });
    jobs.status.mockResolvedValue({ id: "run-1", state: "running" });
    jobs.dependencies.mockResolvedValue(["run-0"]);
  });
  it("cancels executions and rejects missing reasons", async () => {
    const { jobsRoutes } = await import("../../api/routes/jobs.routes.js");
    const app = Fastify();
    await app.register(jobsRoutes);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/jobs/run-1/cancel",
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    const r = await app.inject({
      method: "POST",
      url: "/jobs/run-1/cancel",
      payload: { reason: "operator request", cascade: false },
    });
    expect(r.statusCode).toBe(200);
    expect(jobs.cancel).toHaveBeenCalledWith(
      "run-1",
      "operator request",
      "system",
      false,
    );
  });
  it("returns status, dependencies, and a not-found status", async () => {
    const { jobsRoutes } = await import("../../api/routes/jobs.routes.js");
    const app = Fastify();
    await app.register(jobsRoutes);
    expect(
      (await app.inject({ method: "GET", url: "/jobs/run-1/status" }))
        .statusCode,
    ).toBe(200);
    jobs.status.mockResolvedValueOnce(null);
    expect(
      (await app.inject({ method: "GET", url: "/jobs/missing/status" }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({ method: "GET", url: "/jobs/run-1/dependencies" })
      ).json().data,
    ).toEqual(["run-0"]);
  });
});

describe("ledger close delay routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledger.record.mockResolvedValue({ id: "event-1" });
    ledger.update.mockResolvedValue(undefined);
    ledger.compute.mockResolvedValue({ averageMs: 12 });
    ledger.stats.mockResolvedValue([]);
    ledger.patterns.mockResolvedValue([]);
  });
  it("records and updates delay data", async () => {
    const { ledgerCloseDelayRoutes } =
      await import("../../api/routes/ledgerCloseDelay.routes.js");
    const app = Fastify();
    await app.register(ledgerCloseDelayRoutes);
    const payload = {
      ledgerSequence: 10,
      expectedCloseTime: "2026-01-01T00:00:00.000Z",
      actualCloseTime: "2026-01-01T00:00:01.000Z",
      ledgerHash: "abc",
      transactionCount: 2,
      operationCount: 3,
      baseFeeRate: "100",
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/events",
          headers: { "x-test-auth": "1" },
          payload,
        })
      ).statusCode,
    ).toBe(201);
    expect(ledger.record).toHaveBeenCalledWith(
      expect.objectContaining({ ledgerSequence: 10n }),
    );
    const r = await app.inject({
      method: "PUT",
      url: "/alerts/550e8400-e29b-41d4-a716-446655440000",
      headers: { "x-test-auth": "1" },
      payload: { status: "resolved", notes: "fixed" },
    });
    expect(r.statusCode).toBe(200);
    expect(ledger.update).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      "resolved",
      "fixed",
    );
  });
  it("computes stats, lists stats, and detects patterns", async () => {
    const { ledgerCloseDelayRoutes } =
      await import("../../api/routes/ledgerCloseDelay.routes.js");
    const app = Fastify();
    await app.register(ledgerCloseDelayRoutes);
    const h = { "x-test-auth": "1" };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/compute-stats?granularity=weekly",
          headers: h,
        })
      ).statusCode,
    ).toBe(201);
    expect(ledger.compute).toHaveBeenCalledWith("weekly");
    await app.inject({ method: "GET", url: "/stats?limit=5", headers: h });
    expect(ledger.stats).toHaveBeenCalledWith(undefined, 5);
    await app.inject({ method: "POST", url: "/detect-patterns", headers: h });
    expect(ledger.patterns).toHaveBeenCalled();
  });
});

describe("notification analytics routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analytics.getAnalytics.mockResolvedValue({ sent: 2 });
    analytics.history.mockResolvedValue([{ id: "d-1" }]);
    analytics.log.mockResolvedValue({ id: "d-2" });
  });
  it("returns analytics and history", async () => {
    const { notificationAnalyticsRoutes } =
      await import("../../api/routes/notificationAnalytics.js");
    const app = Fastify();
    await app.register(notificationAnalyticsRoutes);
    const h = { "x-test-auth": "1" };
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/analytics?startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-02T00:00:00.000Z&notificationType=email",
          headers: h,
        })
      ).statusCode,
    ).toBe(200);
    expect(analytics.getAnalytics).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      "email",
    );
    const r = await app.inject({
      method: "GET",
      url: "/history?channel=email&limit=10",
      headers: h,
    });
    expect(r.json().history).toHaveLength(1);
    expect(analytics.history).toHaveBeenCalledWith("email", 10);
  });
  it("logs a delivery and enforces required input", async () => {
    const { notificationAnalyticsRoutes } =
      await import("../../api/routes/notificationAnalytics.js");
    const app = Fastify();
    await app.register(notificationAnalyticsRoutes);
    const h = { "x-test-auth": "1" };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/log",
          headers: h,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    const r = await app.inject({
      method: "POST",
      url: "/log",
      headers: h,
      payload: {
        notificationType: "alert",
        channel: "email",
        recipient: "a@example.com",
        status: "sent",
        deliveryTimeMs: 20,
      },
    });
    expect(r.statusCode).toBe(201);
    expect(analytics.log).toHaveBeenCalledWith(
      "alert",
      "email",
      "a@example.com",
      "sent",
      20,
      undefined,
      undefined,
    );
  });
});
