import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

describe("Health Check Endpoints", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /health", () => {
    it("should return simple health status", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/",
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        status: "ok",
        uptime: expect.any(Number),
        version: expect.any(String),
      });
      expect(new Date(payload.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("GET /health/live", () => {
    it("should return liveness status", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/live",
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        status: "ok",
      });
      expect(new Date(payload.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("GET /health/ready", () => {
    it("should return readiness status", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/ready",
      });

      expect([200, 503]).toContain(response.statusCode);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        status: expect.stringMatching(/ready|not_ready/),
        checks: {
          database: expect.any(Boolean),
          redis: expect.any(Boolean),
        },
      });
      expect(new Date(payload.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("GET /health/detailed", () => {
    it("should return comprehensive system health", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/detailed",
      });

      expect([200, 503]).toContain(response.statusCode);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        uptime: expect.any(Number),
        version: expect.any(String),
        checks: {
          database: {
            status: expect.stringMatching(/healthy|degraded|unhealthy/),
            timestamp: expect.any(String),
            duration: expect.any(Number),
          },
          redis: {
            status: expect.stringMatching(/healthy|degraded|unhealthy/),
            timestamp: expect.any(String),
            duration: expect.any(Number),
          },
          externalApis: {
            status: expect.stringMatching(/healthy|degraded|unhealthy/),
            timestamp: expect.any(String),
            duration: expect.any(Number),
          },
          system: {
            status: expect.stringMatching(/healthy|degraded|unhealthy/),
            timestamp: expect.any(String),
            duration: expect.any(Number),
          },
        },
        summary: {
          total: 4,
          healthy: expect.any(Number),
          unhealthy: expect.any(Number),
          degraded: expect.any(Number),
        },
      });
      expect(new Date(payload.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("GET /health/components/:component", () => {
    it("should return individual component health for database", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/components/database",
      });

      expect([200, 503]).toContain(response.statusCode);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        duration: expect.any(Number),
      });
    });

    it("should return individual component health for redis", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/components/redis",
      });

      expect([200, 503]).toContain(response.statusCode);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        duration: expect.any(Number),
      });
    });

    it("should return individual component health for external-apis", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/components/external-apis",
      });

      expect([200, 503]).toContain(response.statusCode);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        duration: expect.any(Number),
      });
    });

    it("should return individual component health for system", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/components/system",
      });

      expect([200, 503]).toContain(response.statusCode);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        duration: expect.any(Number),
      });
    });

    it("should return 404 for invalid component", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/components/invalid",
      });

      expect(response.statusCode).toBe(404);
      const payload = JSON.parse(response.payload);
      expect(payload).toMatchObject({
        error: "Component not found",
        validComponents: ["database", "redis", "external-apis", "system"],
      });
    });
  });

  describe("GET /health/metrics", () => {
    it("should return Prometheus-style metrics", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/health/metrics",
      });

      expect([200, 503]).toContain(response.statusCode);
      expect(response.headers["content-type"]).toMatch(/^text\/plain/);
      
      const payload = response.payload;
      expect(payload).toContain("# HELP bridge_watch_health_status");
      expect(payload).toContain("# TYPE bridge_watch_health_status gauge");
      expect(payload).toContain("bridge_watch_health_status{component=\"database\"}");
      expect(payload).toContain("bridge_watch_health_status{component=\"redis\"}");
      expect(payload).toContain("bridge_watch_health_status{component=\"external_apis\"}");
      expect(payload).toContain("bridge_watch_health_status{component=\"system\"}");
      expect(payload).toContain("bridge_watch_health_status{component=\"overall\"}");
      
      expect(payload).toContain("# HELP bridge_watch_uptime_seconds");
      expect(payload).toContain("# TYPE bridge_watch_uptime_seconds counter");
      expect(payload).toContain("bridge_watch_uptime_seconds");
      
      expect(payload).toContain("# HELP bridge_watch_health_check_duration_seconds");
      expect(payload).toContain("# TYPE bridge_watch_health_check_duration_seconds gauge");
      expect(payload).toContain("bridge_watch_health_check_duration_seconds{component=\"database\"}");
    });
  });
});

describe("Health Check Service Unit Tests", () => {
  let HealthCheckService: any;
  let healthService: any;

  beforeAll(async () => {
    // Dynamic import to avoid module loading issues
    const module = await import("../../src/services/healthCheck.service.js");
    HealthCheckService = module.HealthCheckService;
    healthService = new HealthCheckService();
  });

  afterAll(async () => {
    if (healthService) {
      await healthService.disconnect();
    }
  });

  describe("getLiveness", () => {
    it("should return ok status", async () => {
      const result = await healthService.getLiveness();
      expect(result).toMatchObject({
        status: "ok",
      });
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("getReadiness", () => {
    it("should return readiness status with checks", async () => {
      const result = await healthService.getReadiness();
      expect(result).toMatchObject({
        status: expect.stringMatching(/ready|not_ready/),
        checks: {
          database: expect.any(Boolean),
          redis: expect.any(Boolean),
        },
      });
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("getSystemHealth", () => {
    it("should return comprehensive system health", async () => {
      const result = await healthService.getSystemHealth();
      expect(result).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        uptime: expect.any(Number),
        version: expect.any(String),
        checks: {
          database: expect.any(Object),
          redis: expect.any(Object),
          externalApis: expect.any(Object),
          system: expect.any(Object),
        },
        summary: {
          total: 4,
          healthy: expect.any(Number),
          unhealthy: expect.any(Number),
          degraded: expect.any(Number),
        },
      });
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("checkDatabase", () => {
    it("should perform database health check", async () => {
      const result = await healthService.checkDatabase();
      expect(result).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        duration: expect.any(Number),
      });
      if (result.status === "healthy") {
        expect(result.details).toMatchObject({
          tableCount: expect.any(Number),
          connection: "postgresql",
        });
      }
      if (result.status === "unhealthy") {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("checkRedis", () => {
    it("should perform Redis health check", async () => {
      const result = await healthService.checkRedis();
      expect(result).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        duration: expect.any(Number),
      });
      if (result.status === "healthy") {
        expect(result.details).toMatchObject({
          usedMemory: expect.any(Number),
          connection: "redis",
        });
      }
      if (result.status === "unhealthy") {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("checkSystemResources", () => {
    it("should perform system resource check", async () => {
      const result = await healthService.checkSystemResources();
      expect(result).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        duration: expect.any(Number),
      });
      if (result.details) {
        expect(result.details).toMatchObject({
          memory: expect.any(Object),
          disk: expect.any(Object),
          thresholds: expect.any(Object),
        });
        expect(result.details.memory).toMatchObject({
          rss: expect.any(Number),
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
          external: expect.any(Number),
          systemUsagePercent: expect.any(Number),
        });
      }
    });
  });

  describe("checkExternalApis", () => {
    it("should perform external API health check", async () => {
      const result = await healthService.checkExternalApis();
      expect(result).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        timestamp: expect.any(String),
        duration: expect.any(Number),
      });
      if (result.details) {
        expect(result.details).toMatchObject({
          apis: expect.any(Array),
          healthyCount: expect.any(Number),
          totalCount: expect.any(Number),
        });
      }
    });
  });
});
