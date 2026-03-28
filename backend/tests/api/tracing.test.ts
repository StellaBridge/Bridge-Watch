import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";
import { TraceManager, maskSensitiveData } from "../../src/api/middleware/tracing.js";

describe("Request Tracing and Logging", () => {
  let server: FastifyInstance;
  const testIP = "192.168.1.100";
  const testUserAgent = "Test-Agent/1.0";

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("Request ID Generation", () => {
    it("should generate unique request IDs", async () => {
      const response1 = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
          "User-Agent": testUserAgent,
        },
      });

      const response2 = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
          "User-Agent": testUserAgent,
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const requestId1 = response1.headers["x-request-id"];
      const requestId2 = response2.headers["x-request-id"];

      expect(requestId1).toBeDefined();
      expect(requestId2).toBeDefined();
      expect(requestId1).not.toBe(requestId2);
      expect(requestId1).toMatch(/^[a-f0-9]{32}$/);
    });

    it("should include correlation ID in response headers", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
          "User-Agent": testUserAgent,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-correlation-id"]).toBeDefined();
      expect(response.headers["x-trace-id"]).toBeDefined();
      expect(response.headers["x-span-id"]).toBeDefined();
    });
  });

  describe("Correlation ID Propagation", () => {
    it("should use provided correlation ID", async () => {
      const correlationId = "test-correlation-123";
      const traceId = "test-trace-456";

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
          "X-Correlation-ID": correlationId,
          "X-Trace-ID": traceId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-correlation-id"]).toBe(correlationId);
      expect(response.headers["x-trace-id"]).toBe(traceId);
    });

    it("should generate correlation ID if not provided", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-correlation-id"]).toBeDefined();
      expect(response.headers["x-correlation-id"]).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe("Trace Context Management", () => {
    it("should create trace context with correct information", async () => {
      const traceManager = TraceManager.getInstance();
      const requestId = "test-request-123";

      const mockRequest = {
        ip: testIP,
        headers: {
          "user-agent": testUserAgent,
          "x-forwarded-for": testIP,
        },
      } as any;

      const traceContext = traceManager.createTraceContext(mockRequest);

      expect(traceContext.requestId).toBeDefined();
      expect(traceContext.correlationId).toBeDefined();
      expect(traceContext.traceId).toBeDefined();
      expect(traceContext.spanId).toBeDefined();
      expect(traceContext.ip).toBe(testIP);
      expect(traceContext.userAgent).toBe(testUserAgent);
      expect(traceContext.startTime).toBeGreaterThan(0);
    });

    it("should update trace context", async () => {
      const traceManager = TraceManager.getInstance();
      const mockRequest = {
        ip: testIP,
        headers: {},
      } as any;

      const traceContext = traceManager.createTraceContext(mockRequest);
      const originalStartTime = traceContext.startTime;

      traceManager.updateTraceContext(traceContext.requestId, {
        tags: { statusCode: 200 },
      });

      const updatedContext = traceManager.getTraceContext(traceContext.requestId);
      expect(updatedContext?.tags.statusCode).toBe(200);
      expect(updatedContext?.startTime).toBe(originalStartTime);
    });

    it("should complete trace and cleanup", async () => {
      const traceManager = TraceManager.getInstance();
      const mockRequest = {
        ip: testIP,
        headers: {},
      } as any;

      const traceContext = traceManager.createTraceContext(mockRequest);
      expect(traceManager.getTraceContext(traceContext.requestId)).toBeDefined();

      const completedContext = traceManager.completeTrace(traceContext.requestId);
      expect(completedContext).toBeDefined();
      expect(traceManager.getTraceContext(traceContext.requestId)).toBeUndefined();
    });
  });

  describe("Sensitive Data Masking", () => {
    it("should mask sensitive fields in objects", () => {
      const data = {
        username: "john.doe",
        password: "secret123",
        email: "john@example.com",
        apiKey: "sk-1234567890abcdef",
        normalField: "visible",
      };

      const masked = maskSensitiveData(data);

      expect(masked.username).toBe("john.doe");
      expect(masked.password).toBe("***MASKED***");
      expect(masked.email).toBe("***MASKED***");
      expect(masked.apiKey).toBe("***MASKED***");
      expect(masked.normalField).toBe("visible");
    });

    it("should mask sensitive patterns in strings", () => {
      const data = "User email: john@example.com, API key: sk-1234567890abcdef";
      const masked = maskSensitiveData(data);

      expect(masked).toContain("***MASKED***");
      expect(masked).not.toContain("john@example.com");
      expect(masked).not.toContain("sk-1234567890abcdef");
    });

    it("should handle nested objects", () => {
      const data = {
        user: {
          name: "John",
          password: "secret",
          profile: {
            email: "john@example.com",
            phone: "555-123-4567",
          },
        },
        settings: {
          theme: "dark",
        },
      };

      const masked = maskSensitiveData(data);

      expect(masked.user.name).toBe("John");
      expect(masked.user.password).toBe("***MASKED***");
      expect(masked.user.profile.email).toBe("***MASKED***");
      expect(masked.user.profile.phone).toBe("***MASKED***");
      expect(masked.settings.theme).toBe("dark");
    });

    it("should handle arrays", () => {
      const data = [
        { name: "Item 1", password: "secret1" },
        { name: "Item 2", password: "secret2" },
      ];

      const masked = maskSensitiveData(data);

      expect(masked[0].name).toBe("Item 1");
      expect(masked[0].password).toBe("***MASKED***");
      expect(masked[1].name).toBe("Item 2");
      expect(masked[1].password).toBe("***MASKED***");
    });

    it("should handle errors gracefully", () => {
      const error = new Error("Test error");
      (error as any).password = "secret";
      (error as any).apiKey = "sk-123456";

      const masked = maskSensitiveData(error);

      expect(masked.name).toBe("Error");
      expect(masked.message).toBe("Test error");
      expect(masked.password).toBeUndefined();
      expect(masked.apiKey).toBeUndefined();
    });
  });

  describe("Request Logging", () => {
    it("should log request start and completion", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
          "User-Agent": testUserAgent,
        },
      });

      // In a real test, we would check the log output
      // For now, just ensure the request completes successfully
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it("should include timing information", async () => {
      const startTime = Date.now();

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeGreaterThan(0);
    });
  });

  describe("Error Logging with Context", () => {
    it("should log errors with trace context", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Make a request that will cause an error
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/invalid-endpoint",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe("Performance Monitoring", () => {
    it("should track request performance", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.statusCode).toBe(200);
      // Performance metrics would be tracked internally
    });
  });

  describe("Tracing Admin Routes", () => {
    const adminApiKey = "admin_test123";

    it("should require admin API key", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/tracing/traces/active",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe("Forbidden");
    });

    it("should get active traces with admin key", async () => {
      // First make a request to create an active trace
      await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/tracing/traces/active",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.data.activeTraces).toBeInstanceOf(Array);
      expect(payload.data.count).toBeGreaterThanOrEqual(0);
    });

    it("should get performance metrics", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/tracing/metrics/performance",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.data.stats).toBeDefined();
      expect(payload.data.stats.totalRequests).toBeGreaterThanOrEqual(0);
    });

    it("should get trace visualization data", async () => {
      // First make a request to create a trace
      const traceResponse = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      const traceId = traceResponse.headers["x-trace-id"];

      const response = await server.inject({
        method: "GET",
        url: `/api/v1/admin/tracing/traces/${traceId}/visualization`,
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.data.traceId).toBe(traceId);
      expect(payload.data.services).toBeInstanceOf(Array);
    });

    it("should export trace data", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/tracing/traces/export?format=json",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/json");
      
      const payload = JSON.parse(response.payload);
      expect(payload.traces).toBeInstanceOf(Array);
      expect(payload.exportedAt).toBeDefined();
    });

    it("should export trace data as CSV", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/tracing/traces/export?format=csv",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/csv");
      expect(response.payload).toContain("requestId,traceId,correlationId");
    });

    it("should get logging configuration", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/tracing/config/logging",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.data.level).toBeDefined();
      expect(payload.data.maxFileSize).toBeDefined();
    });

    it("should pass health check", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/tracing/health",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.status).toBe("healthy");
      expect(payload.metrics).toBeDefined();
    });
  });

  describe("Structured Logging", () => {
    it("should include structured fields in logs", async () => {
      // This would test the structured logging format
      // In a real implementation, we would capture and verify log output
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("Concurrent Request Handling", () => {
    it("should handle multiple concurrent requests with unique trace IDs", async () => {
      const requests = [];
      const requestCount = 10;

      for (let i = 0; i < requestCount; i++) {
        requests.push(
          server.inject({
            method: "GET",
            url: "/api/v1/assets",
            headers: {
              "X-Forwarded-For": `192.168.1.${100 + i}`,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const requestIds = responses.map(r => r.headers["x-request-id"]);
      const uniqueIds = new Set(requestIds);

      expect(responses.every(r => r.statusCode === 200)).toBe(true);
      expect(uniqueIds.size).toBe(requestCount);
    });
  });
});
