import { describe, it, expect, beforeEach, vi } from "vitest";
import { PoolMetricsCollector } from "../../src/services/db-pool-monitor/metrics-collector.js";
import { PoolControlHandler } from "../../src/services/db-pool-monitor/control-handler.js";
import { PoolDataQueryService } from "../../src/services/db-pool-monitor/query-service.js";
import type { ControlActionRequest } from "../../src/models/db-pool-metrics/pool.model.js";
import { ControlAction } from "../../src/models/db-pool-metrics/pool.model.js";

// Mock database
const mockDb = {
  query: vi.fn(),
  raw: vi.fn(),
  insert: vi.fn(),
};

// Mock pool
const mockPool = {
  totalCount: 10,
  idleCount: 5,
  waitingCount: 0,
  options: {
    max: 20,
    min: 2,
  },
  idleClients: [],
  stats: {
    acquired: 0,
    released: 0,
    errors: 0,
  },
};

describe("PoolMetricsCollector", () => {
  let collector: PoolMetricsCollector;

  beforeEach(() => {
    collector = new PoolMetricsCollector(mockPool);
    vi.clearAllMocks();
  });

  it("should initialize with pool and interval", () => {
    expect(collector).toBeDefined();
    expect(collector.isActive()).toBe(false);
  });

  it("should start and stop collection", () => {
    collector.start();
    expect(collector.isActive()).toBe(true);

    collector.stop();
    expect(collector.isActive()).toBe(false);
  });

  it("should not start twice", () => {
    collector.start();
    collector.start(); // Should log a warning but not start again
    expect(collector.isActive()).toBe(true);
    collector.stop();
  });

  it("should get health status", async () => {
    const status = await collector.getHealthStatus();

    expect(status).toBeDefined();
    expect(status.pool_id).toBe("default");
    expect(status.is_healthy).toBeDefined();
    expect(status.current_utilization).toBeDefined();
    expect(status.active_connections).toBeDefined();
  });
});

describe("PoolControlHandler", () => {
  let handler: PoolControlHandler;

  beforeEach(() => {
    handler = new PoolControlHandler(mockPool);
    vi.clearAllMocks();
  });

  it("should validate action request", async () => {
    const request: ControlActionRequest = {
      pool_id: "",
      action: ControlAction.SET_MAX_CONNECTIONS,
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("pool_id");
  });

  it("should validate action type", async () => {
    const request = {
      pool_id: "default",
      action: "invalid_action" as any,
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid action");
  });

  it("should validate SET_MAX_CONNECTIONS parameters", async () => {
    const request: ControlActionRequest = {
      pool_id: "default",
      action: ControlAction.SET_MAX_CONNECTIONS,
      parameters: { max: 0 }, // Invalid: must be >= 1
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("must be >= 1");
  });

  it("should reject max_connections > 1000", async () => {
    const request: ControlActionRequest = {
      pool_id: "default",
      action: ControlAction.SET_MAX_CONNECTIONS,
      parameters: { max: 1001 },
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot exceed 1000");
  });

  it("should execute SET_MAX_CONNECTIONS", async () => {
    const request: ControlActionRequest = {
      pool_id: "default",
      action: ControlAction.SET_MAX_CONNECTIONS,
      parameters: { max: 50 },
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty("newMax", 50);
  });

  it("should execute SET_MIN_CONNECTIONS", async () => {
    const request: ControlActionRequest = {
      pool_id: "default",
      action: ControlAction.SET_MIN_CONNECTIONS,
      parameters: { min: 5 },
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty("newMin", 5);
  });

  it("should handle EVICT_IDLE", async () => {
    const request: ControlActionRequest = {
      pool_id: "default",
      action: ControlAction.EVICT_IDLE,
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty("evicted");
  });

  it("should handle DRAIN_POOL", async () => {
    const request: ControlActionRequest = {
      pool_id: "default",
      action: ControlAction.DRAIN_POOL,
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty("status", "drained");
  });

  it("should handle RESET_STATS", async () => {
    const request: ControlActionRequest = {
      pool_id: "default",
      action: ControlAction.RESET_STATS,
    };

    const result = await handler.handle(request, "user1");
    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty("status", "reset");
  });
});

describe("PoolDataQueryService", () => {
  let service: PoolDataQueryService;

  beforeEach(() => {
    service = new PoolDataQueryService();
    vi.clearAllMocks();
  });

  it("should parse time range correctly", async () => {
    // Test parsing of different time ranges
    expect(() => service["parseTimeRange"]("1h")).not.toThrow();
    expect(() => service["parseTimeRange"]("24h")).not.toThrow();
    expect(() => service["parseTimeRange"]("7d")).not.toThrow();
    expect(() => service["parseTimeRange"]("30d")).not.toThrow();
  });

  it("should get resolution interval correctly", () => {
    expect(service["getResolutionInterval"]("1m")).toBe("1 minute");
    expect(service["getResolutionInterval"]("1h")).toBe("1 hour");
    expect(service["getResolutionInterval"]("1d")).toBe("1 day");
  });

  it("should have expected query methods", () => {
    expect(service.getMetrics).toBeDefined();
    expect(service.getEvents).toBeDefined();
    expect(service.getLatestSnapshot).toBeDefined();
    expect(service.getPoolStats).toBeDefined();
    expect(service.countEventsByType).toBeDefined();
  });
});
