import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getMetricsService } from "../../services/metrics.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Metrics Middleware
 * Automatically collects HTTP request/response metrics
 */
export async function registerMetrics(server: FastifyInstance): Promise<void> {
  const metricsService = getMetricsService();

  // Track active connections
  server.addHook("onRequest", async (_request: FastifyRequest, _reply: FastifyReply) => {
    metricsService.httpActiveConnections.inc();
  });

  server.addHook("onResponse", async (_request: FastifyRequest, _reply: FastifyReply) => {
    metricsService.httpActiveConnections.dec();
  });

  // Track request metrics
  server.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const duration = reply.elapsedTime / 1000; // Convert ms to seconds
      const method = request.method;
      const route = request.routeOptions?.url || request.url;
      const statusCode = reply.statusCode;

      // Get request and response sizes
      const requestSize = request.headers["content-length"]
        ? parseInt(request.headers["content-length"], 10)
        : undefined;
      
      const responseSize = reply.getHeader("content-length")
        ? parseInt(reply.getHeader("content-length") as string, 10)
        : undefined;

      metricsService.recordHttpRequest(
        method,
        route,
        statusCode,
        duration,
        requestSize,
        responseSize
      );
    } catch (error) {
      logger.error({ error }, "Failed to record HTTP metrics");
    }
  });

  logger.info("Metrics middleware registered");
}

/**
 * Helper to track API key usage in metrics
 */
export function trackApiKeyUsage(apiKeyId: string, tier: string) {
  const metricsService = getMetricsService();
  metricsService.apiKeyRequests.inc({ api_key_id: apiKeyId, tier });
}

/**
 * Helper to track rate limit hits
 */
export function trackRateLimitHit(apiKeyId: string, tier: string) {
  const metricsService = getMetricsService();
  metricsService.apiKeyRateLimitHits.inc({ api_key_id: apiKeyId, tier });
}
