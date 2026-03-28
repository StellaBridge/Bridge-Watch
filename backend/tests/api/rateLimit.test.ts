import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";
import { redis } from "../../src/utils/redis.js";

describe("Rate Limiting", () => {
  let server: FastifyInstance;
  const testIP = "192.168.1.100";
  const testApiKey = "basic_test123";
  const premiumApiKey = "premium_test123";
  const adminApiKey = "admin_test123";

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
    
    // Clean up any existing test data
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await server.close();
  });

  async function cleanupTestData() {
    try {
      const keys = await redis.keys("bw:rl:ip:" + testIP + ":*");
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      
      const keyKeys = await redis.keys("bw:rl:key:" + testApiKey + ":*");
      if (keyKeys.length > 0) {
        await redis.del(...keyKeys);
      }
      
      const premiumKeyKeys = await redis.keys("bw:rl:key:" + premiumApiKey + ":*");
      if (premiumKeyKeys.length > 0) {
        await redis.del(...premiumKeyKeys);
      }
    } catch (error) {
      console.error("Failed to cleanup test data:", error);
    }
  }

  describe("Basic Rate Limiting", () => {
    it("should allow requests within limit", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
      expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(response.headers["x-ratelimit-reset"]).toBeDefined();
      expect(response.headers["x-ratelimit-tier"]).toBe("free");
    });

    it("should enforce rate limits for IP-based requests", async () => {
      // Make multiple requests to hit the limit
      const requests = [];
      for (let i = 0; i < 250; i++) {
        requests.push(
          server.inject({
            method: "GET",
            url: "/api/v1/assets",
            headers: {
              "X-Forwarded-For": testIP,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      
      const rateLimitedResponse = rateLimitedResponses[0];
      const payload = JSON.parse(rateLimitedResponse.payload);
      expect(payload.error).toBe("Too Many Requests");
      expect(rateLimitedResponse.headers["retry-after"]).toBeDefined();
    });

    it("should include proper rate limit headers", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.headers["x-ratelimit-limit"]).toMatch(/^\d+$/);
      expect(response.headers["x-ratelimit-remaining"]).toMatch(/^\d+$/);
      expect(response.headers["x-ratelimit-reset"]).toMatch(/^\d+$/);
      expect(response.headers["x-ratelimit-policy"]).toMatch(/^\d+;w=\d+$/);
      expect(response.headers["x-ratelimit-tier"]).toBe("free");
    });
  });

  describe("API Key Rate Limiting", () => {
    it("should apply different limits for different tiers", async () => {
      // Test basic tier
      const basicResponse = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": testApiKey,
        },
      });

      expect(basicResponse.statusCode).toBe(200);
      expect(basicResponse.headers["x-ratelimit-tier"]).toBe("basic");
      expect(parseInt(basicResponse.headers["x-ratelimit-limit"])).toBeGreaterThan(
        parseInt(response.headers["x-ratelimit-limit"])
      );

      // Test premium tier
      const premiumResponse = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": "192.168.1.101",
          "X-API-Key": premiumApiKey,
        },
      });

      expect(premiumResponse.statusCode).toBe(200);
      expect(premiumResponse.headers["x-ratelimit-tier"]).toBe("premium");
      expect(parseInt(premiumResponse.headers["x-ratelimit-limit"])).toBeGreaterThan(
        parseInt(basicResponse.headers["x-ratelimit-limit"])
      );
    });

    it("should bypass rate limiting for admin API keys", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-ratelimit-tier"]).toBe("trusted");
    });
  });

  describe("Per-Endpoint Rate Limits", () => {
    it("should apply different limits for different endpoints", async () => {
      // Test health endpoint (high limits)
      const healthResponse = await server.inject({
        method: "GET",
        url: "/health/",
        headers: {
          "X-Forwarded-For": "192.168.1.200",
        },
      });

      expect(healthResponse.statusCode).toBe(200);
      const healthLimit = parseInt(healthResponse.headers["x-ratelimit-limit"]);

      // Test assets endpoint (moderate limits)
      const assetsResponse = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": "192.168.1.201",
        },
      });

      expect(assetsResponse.statusCode).toBe(200);
      const assetsLimit = parseInt(assetsResponse.headers["x-ratelimit-limit"]);

      // Test config endpoint (strict limits)
      const configResponse = await server.inject({
        method: "GET",
        url: "/api/v1/config",
        headers: {
          "X-Forwarded-For": "192.168.1.202",
        },
      });

      expect(configResponse.statusCode).toBe(200);
      const configLimit = parseInt(configResponse.headers["x-ratelimit-limit"]);

      // Health should have highest limits, config should have lowest
      expect(healthLimit).toBeGreaterThan(assetsLimit);
      expect(assetsLimit).toBeGreaterThan(configLimit);
    });

    it("should apply stricter limits for write operations", async () => {
      // Test GET (read operation)
      const getResponse = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": "192.168.1.210",
        },
      });

      expect(getResponse.statusCode).toBe(200);
      const getLimit = parseInt(getResponse.headers["x-ratelimit-limit"]);

      // Test POST (write operation) - using alerts endpoint
      const postResponse = await server.inject({
        method: "POST",
        url: "/api/v1/alerts",
        headers: {
          "X-Forwarded-For": "192.168.1.211",
        },
        payload: {
          name: "Test Alert",
          conditions: [],
        },
      });

      // Even if it fails due to validation, it should still have rate limit headers
      expect(postResponse.statusCode).toBeGreaterThanOrEqual(400);
      const postLimit = parseInt(postResponse.headers["x-ratelimit-limit"]);

      // Write operations should have stricter limits
      expect(postLimit).toBeLessThan(getLimit);
    });
  });

  describe("Rate Limit Admin Routes", () => {
    it("should require admin API key for admin routes", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/rate-limit/stats",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe("Forbidden");
    });

    it("should allow admin access with valid admin API key", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/admin/rate-limit/stats",
        headers: {
          "X-Forwarded-For": testIP,
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.data).toBeDefined();
    });

    it("should get rate limit status for IP", async () => {
      // First make a request to create rate limit data
      await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      const response = await server.inject({
        method: "GET",
        url: `/api/v1/admin/rate-limit/status/ip/${testIP}`,
        headers: {
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.data.currentUsage).toBeGreaterThanOrEqual(0);
    });

    it("should reset rate limit for IP", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: `/api/v1/admin/rate-limit/reset/ip/${testIP}`,
        headers: {
          "X-API-Key": adminApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.message).toContain("Rate limit reset");
    });

    it("should update rate limits for tier", async () => {
      const response = await server.inject({
        method: "PUT",
        url: "/api/v1/admin/rate-limit/tiers/free",
        headers: {
          "X-API-Key": adminApiKey,
        },
        payload: {
          requestsPerWindow: 150,
          windowMs: 60000,
          burstAllowance: 15,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.success).toBe(true);
      expect(payload.newLimits.requestsPerWindow).toBe(150);
    });
  });

  describe("Graceful Degradation", () => {
    it("should fail open when Redis is unavailable", async () => {
      // Mock Redis failure
      const originalEval = redis.eval;
      redis.eval = vi.fn().mockRejectedValue(new Error("Redis unavailable"));

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      // Should still allow the request
      expect(response.statusCode).toBe(200);

      // Restore original function
      redis.eval = originalEval;
    });
  });

  describe("Rate Limit Headers", () => {
    it("should include Retry-After header when rate limited", async () => {
      // Make many requests to trigger rate limiting
      const requests = [];
      for (let i = 0; i < 300; i++) {
        requests.push(
          server.inject({
            method: "GET",
            url: "/api/v1/assets",
            headers: {
              "X-Forwarded-For": "192.168.1.150",
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses.find(r => r.statusCode === 429);

      if (rateLimitedResponse) {
        expect(rateLimitedResponse.headers["retry-after"]).toBeDefined();
        expect(parseInt(rateLimitedResponse.headers["retry-after"])).toBeGreaterThan(0);
      }
    });

    it("should include proper policy header", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIP,
        },
      });

      expect(response.headers["x-ratelimit-policy"]).toMatch(/^\d+;w=\d+$/);
      
      const policy = response.headers["x-ratelimit-policy"].split(";");
      expect(policy[0]).toMatch(/^\d+$/); // limit
      expect(policy[1]).toMatch(/^w=\d+$/); // window
    });
  });

  describe("Concurrent Requests", () => {
    it("should handle concurrent requests correctly", async () => {
      const concurrentRequests = 50;
      const requests = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          server.inject({
            method: "GET",
            url: "/api/v1/assets",
            headers: {
              "X-Forwarded-For": "192.168.1.160",
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.statusCode === 200).length;
      const rateLimitedCount = responses.filter(r => r.statusCode === 429).length;

      // Most should succeed, some might be rate limited
      expect(successCount + rateLimitedCount).toBe(concurrentRequests);
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe("Different HTTP Methods", () => {
    it("should apply different limits for different HTTP methods", async () => {
      const testIPBase = "192.168.1.17";

      // GET request (read)
      const getResponse = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
        headers: {
          "X-Forwarded-For": testIPBase + "0",
        },
      });

      // POST request (write) - even if validation fails, rate limiting should apply
      const postResponse = await server.inject({
        method: "POST",
        url: "/api/v1/alerts",
        headers: {
          "X-Forwarded-For": testIPBase + "1",
        },
        payload: {},
      });

      const getLimit = parseInt(getResponse.headers["x-ratelimit-limit"]);
      const postLimit = parseInt(postResponse.headers["x-ratelimit-limit"]);

      // POST (write) should have stricter limits than GET (read)
      expect(postLimit).toBeLessThan(getLimit);
    });
  });
});

describe("Rate Limit Service", () => {
  let rateLimitService: any;

  beforeAll(async () => {
    const module = await import("../../src/services/rateLimit.service.js");
    const { RateLimitService } = module;
    rateLimitService = new RateLimitService();
  });

  it("should get rate limit stats", async () => {
    const stats = await rateLimitService.getRateLimitStats("1h");
    
    expect(stats).toHaveProperty("totalRequests");
    expect(stats).toHaveProperty("blockedRequests");
    expect(stats).toHaveProperty("whitelistedRequests");
    expect(stats).toHaveProperty("topIPs");
    expect(stats).toHaveProperty("topApiKeys");
    expect(stats).toHaveProperty("endpointStats");
    expect(stats).toHaveProperty("tierDistribution");
    expect(stats).toHaveProperty("currentWindowStats");
  });

  it("should get real-time metrics", async () => {
    const metrics = await rateLimitService.getRealTimeMetrics();
    
    expect(metrics).toHaveProperty("requestsPerSecond");
    expect(metrics).toHaveProperty("blockedPerSecond");
    expect(metrics).toHaveProperty("activeConnections");
    expect(metrics).toHaveProperty("memoryUsage");
    expect(metrics).toHaveProperty("redisConnections");
  });

  it("should export data in JSON format", async () => {
    const data = await rateLimitService.exportData("json", "1h");
    
    expect(() => JSON.parse(data)).not.toThrow();
    const parsed = JSON.parse(data);
    expect(parsed).toHaveProperty("totalRequests");
  });

  it("should export data in CSV format", async () => {
    const data = await rateLimitService.exportData("csv", "1h");
    
    expect(data).toContain("Type,Identifier,Tier,Endpoint,Requests,Blocked");
  });
});
