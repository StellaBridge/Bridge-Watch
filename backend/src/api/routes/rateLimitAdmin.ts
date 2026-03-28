import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { RateLimitService } from "../../services/rateLimit.service.js";
import { getRateLimitMetrics } from "../middleware/rateLimit.middleware.js";
import { logger } from "../../utils/logger.js";
import { config } from "../../config/index.js";

const rateLimitService = new RateLimitService();

/**
 * Admin routes for rate limit management and monitoring
 * These routes require admin API key authentication
 */

export async function rateLimitAdminRoutes(server: FastifyInstance) {
  // Admin authentication middleware
  server.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.headers["x-api-key"] as string;
    
    if (!apiKey || !apiKey.startsWith(config.RATE_LIMIT_ADMIN_API_KEY_PREFIX)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Admin API key required for rate limit management",
      });
    }
  });

  // Get comprehensive rate limiting statistics
  server.get(
    "/stats",
    async (
      request: FastifyRequest<{ Querystring: { timeRange?: "1h" | "24h" | "7d" } }>,
      reply: FastifyReply
    ) => {
      try {
        const timeRange = request.query.timeRange || "24h";
        const stats = await rateLimitService.getRateLimitStats(timeRange);
        
        return {
          success: true,
          data: stats,
          timeRange,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error }, "Failed to get rate limit stats");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve rate limit statistics",
        });
      }
    }
  );

  // Get rate limit status for specific IP or API key
  server.get(
    "/status/:type/:identifier",
    async (
      request: FastifyRequest<{
        Params: { type: "ip" | "apiKey"; identifier: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { type, identifier } = request.params;
        
        if (!["ip", "apiKey"].includes(type)) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Type must be 'ip' or 'apiKey'",
          });
        }

        const status = await rateLimitService.getRateLimitStatus(identifier, type);
        
        return {
          success: true,
          data: status,
          queriedAt: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error, params: request.params }, "Failed to get rate limit status");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve rate limit status",
        });
      }
    }
  );

  // Reset rate limit for IP or API key
  server.delete(
    "/reset/:type/:identifier",
    async (
      request: FastifyRequest<{
        Params: { type: "ip" | "apiKey"; identifier: string };
        Querystring: { endpoint?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { type, identifier } = request.params;
        const { endpoint } = request.query;
        
        if (!["ip", "apiKey"].includes(type)) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Type must be 'ip' or 'apiKey'",
          });
        }

        await rateLimitService.resetRateLimit(identifier, type, endpoint);
        
        logger.info(
          { type, identifier, endpoint, adminKey: request.headers["x-api-key"] },
          "Rate limit reset by admin"
        );

        return {
          success: true,
          message: `Rate limit reset for ${type} ${identifier}${endpoint ? ` on endpoint ${endpoint}` : ""}`,
          resetAt: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error, params: request.params }, "Failed to reset rate limit");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to reset rate limit",
        });
      }
    }
  );

  // Update rate limits for a tier
  server.put(
    "/tiers/:tier",
    async (
      request: FastifyRequest<{
        Params: { tier: string };
        Body: {
          requestsPerWindow: number;
          windowMs: number;
          burstAllowance: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tier } = request.params;
        const newLimits = request.body;

        if (!["free", "basic", "premium"].includes(tier)) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Tier must be 'free', 'basic', or 'premium'",
          });
        }

        // Validate limits
        if (newLimits.requestsPerWindow <= 0 || newLimits.windowMs <= 0 || newLimits.burstAllowance < 0) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "All limits must be positive numbers (burstAllowance can be 0)",
          });
        }

        await rateLimitService.updateRateLimit(tier as any, newLimits);
        
        logger.info(
          { tier, newLimits, adminKey: request.headers["x-api-key"] },
          "Rate limits updated by admin"
        );

        return {
          success: true,
          message: `Rate limits updated for ${tier} tier`,
          tier,
          newLimits,
          updatedAt: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error, params: request.params, body: request.body }, "Failed to update rate limits");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to update rate limits",
        });
      }
    }
  );

  // Get real-time metrics
  server.get(
    "/realtime",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await rateLimitService.getRealTimeMetrics();
        
        return {
          success: true,
          data: metrics,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error }, "Failed to get real-time metrics");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve real-time metrics",
        });
      }
    }
  );

  // Export rate limit data
  server.get(
    "/export",
    async (
      request: FastifyRequest<{
        Querystring: { format?: "json" | "csv"; timeRange?: "1h" | "24h" | "7d" };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const format = request.query.format || "json";
        const timeRange = request.query.timeRange || "24h";

        if (!["json", "csv"].includes(format)) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Format must be 'json' or 'csv'",
          });
        }

        const data = await rateLimitService.exportData(format as any, timeRange as any);
        
        const filename = `rate-limit-export-${timeRange}-${Date.now()}.${format}`;
        
        if (format === "csv") {
          reply.header("Content-Type", "text/csv");
        } else {
          reply.header("Content-Type", "application/json");
        }
        
        reply.header("Content-Disposition", `attachment; filename="${filename}"`);
        
        return data;
      } catch (error) {
        logger.error({ error, query: request.query }, "Failed to export rate limit data");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to export rate limit data",
        });
      }
    }
  );

  // Get current rate limit metrics (legacy endpoint)
  server.get(
    "/metrics",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = getRateLimitMetrics();
        
        return {
          success: true,
          data: metrics,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error }, "Failed to get rate limit metrics");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve rate limit metrics",
        });
      }
    }
  );

  // Health check for rate limiting service
  server.get(
    "/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Test Redis connectivity
        await rateLimitService.getRealTimeMetrics();
        
        return {
          success: true,
          status: "healthy",
          service: "rate-limit-admin",
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error }, "Rate limit admin health check failed");
        return reply.status(503).send({
          success: false,
          status: "unhealthy",
          service: "rate-limit-admin",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  logger.info("Rate limit admin routes registered");
}
