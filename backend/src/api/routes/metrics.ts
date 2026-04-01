import type { FastifyInstance } from "fastify";
import { getMetricsService } from "../../services/metrics.service.js";
import { authMiddleware } from "../middleware/auth.js";

/**
 * Metrics Routes
 * Exposes Prometheus-compatible metrics endpoint
 */
export async function metricsRoutes(server: FastifyInstance) {
  const metricsService = getMetricsService();

  /**
   * GET /metrics
   * Returns metrics in Prometheus text format
   */
  server.get(
    "/",
    {
      schema: {
        tags: ["Metrics"],
        summary: "Get application metrics in Prometheus format",
        description: "Returns all application metrics in Prometheus exposition format for scraping",
        response: {
          200: {
            type: "string",
            description: "Metrics in Prometheus text format",
          },
        },
      },
    },
    async (_request, reply) => {
      const metrics = await metricsService.getMetrics();
      reply.type("text/plain; version=0.0.4; charset=utf-8");
      return metrics;
    }
  );

  /**
   * GET /metrics/json
   * Returns metrics in JSON format (for debugging)
   */
  server.get(
    "/json",
    {
      schema: {
        tags: ["Metrics"],
        summary: "Get application metrics in JSON format",
        description: "Returns all application metrics in JSON format for debugging and inspection",
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                help: { type: "string" },
                type: { type: "string" },
                values: { type: "array" },
                aggregator: { type: "string" },
              },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const metrics = await metricsService.getMetricsJSON();
      return metrics;
    }
  );

  /**
   * GET /metrics/health
   * Returns health status of metrics collection
   */
  server.get(
    "/health",
    {
      schema: {
        tags: ["Metrics"],
        summary: "Metrics system health check",
        description: "Returns the health status of the metrics collection system",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", example: "healthy" },
              metricsCount: { type: "number" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const metrics = await metricsService.getMetricsJSON();
      return {
        status: "healthy",
        metricsCount: metrics.length,
        timestamp: new Date().toISOString(),
      };
    }
  );

  /**
   * POST /metrics/reset
   * Reset all metrics (admin only, useful for testing)
   */
  server.post(
    "/reset",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin"] }),
      schema: {
        tags: ["Metrics"],
        summary: "Reset all metrics",
        description: "Resets all collected metrics to zero (admin only)",
        security: [{ ApiKeyAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      metricsService.reset();
      return {
        success: true,
        message: "All metrics have been reset",
        timestamp: new Date().toISOString(),
      };
    }
  );
}
