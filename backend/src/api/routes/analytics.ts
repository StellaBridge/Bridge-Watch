import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AnalyticsService, AggregationPeriod } from "../../services/analytics.service.js";
import { getCustomMetric, getAllCustomMetrics } from "../../config/customMetrics.js";
import { logger } from "../../utils/logger.js";

const analyticsService = new AnalyticsService();

interface QueryParams {
  symbol?: string;
  bridgeName?: string;
  period?: AggregationPeriod;
  metric?: string;
  type?: "assets" | "bridges";
  limit?: string;
  days?: string;
  pattern?: string;
  forceRefresh?: string;
}

export async function analyticsRoutes(server: FastifyInstance) {
  /**
   * GET /api/v1/analytics/protocol
   * Get protocol-wide statistics
   */
  server.get<{ Querystring: QueryParams }>("/protocol", async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
    try {
      const forceRefresh = request.query.forceRefresh === "true";
      const stats = await analyticsService.getProtocolStats(forceRefresh);
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error({ error }, "Failed to fetch protocol stats");
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch protocol statistics",
      });
    }
  });

  /**
   * GET /api/v1/analytics/bridges/comparison
   * Get bridge comparison metrics
   */
  server.get<{ Querystring: QueryParams }>("/bridges/comparison", async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
    try {
      const forceRefresh = request.query.forceRefresh === "true";
      const comparisons = await analyticsService.getBridgeComparisons(forceRefresh);
      return reply.send({
        success: true,
        data: comparisons,
      });
    } catch (error) {
      logger.error({ error }, "Failed to fetch bridge comparisons");
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch bridge comparisons",
      });
    }
  });

  /**
   * GET /api/v1/analytics/assets/rankings
   * Get asset rankings
   */
  server.get<{ Querystring: QueryParams }>("/assets/rankings", async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
    try {
      const forceRefresh = request.query.forceRefresh === "true";
      const rankings = await analyticsService.getAssetRankings(forceRefresh);
      return reply.send({
        success: true,
        data: rankings,
      });
    } catch (error) {
      logger.error({ error }, "Failed to fetch asset rankings");
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch asset rankings",
      });
    }
  });

  /**
   * GET /api/v1/analytics/volume
   * Get volume aggregations
   * Query params: period (hourly|daily|weekly|monthly), symbol, bridgeName
   */
  server.get<{ Querystring: QueryParams }>(
    "/volume",
    async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
      try {
        const { period = "daily", symbol, bridgeName, forceRefresh } = request.query;

        if (!["hourly", "daily", "weekly", "monthly"].includes(period)) {
          return reply.status(400).send({
            success: false,
            error: "Invalid period. Must be one of: hourly, daily, weekly, monthly",
          });
        }

        const bypassCache = forceRefresh === "true";
        const aggregations = await analyticsService.getVolumeAggregation(
          period as AggregationPeriod,
          symbol,
          bridgeName,
          bypassCache
        );

        return reply.send({
          success: true,
          data: aggregations,
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch volume aggregations");
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch volume aggregations",
        });
      }
    }
  );

  /**
   * GET /api/v1/analytics/trends/:metric
   * Calculate trend for a specific metric
   * Query params: symbol, bridgeName
   */
  server.get<{ Params: { metric: string }; Querystring: QueryParams }>(
    "/trends/:metric",
    async (
      request: FastifyRequest<{ Params: { metric: string }; Querystring: QueryParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { metric } = request.params;
        const { symbol, bridgeName, forceRefresh } = request.query;

        const bypassCache = forceRefresh === "true";
        const trend = await analyticsService.calculateTrend(metric, symbol, bridgeName, bypassCache);

        return reply.send({
          success: true,
          data: trend,
        });
      } catch (error) {
        logger.error({ error }, "Failed to calculate trend");
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Failed to calculate trend",
        });
      }
    }
  );

  /**
   * GET /api/v1/analytics/top-performers
   * Get top performing assets or bridges
   * Query params: type (assets|bridges), metric (volume|tvl|health), limit
   */
  server.get<{ Querystring: QueryParams }>(
    "/top-performers",
    async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
      try {
        const { type = "assets", metric = "health", limit = "10", forceRefresh } = request.query;

        if (!["assets", "bridges"].includes(type)) {
          return reply.status(400).send({
            success: false,
            error: "Invalid type. Must be 'assets' or 'bridges'",
          });
        }

        if (!["volume", "tvl", "health"].includes(metric)) {
          return reply.status(400).send({
            success: false,
            error: "Invalid metric. Must be 'volume', 'tvl', or 'health'",
          });
        }

        const bypassCache = forceRefresh === "true";
        const performers = await analyticsService.getTopPerformers(
          type as "assets" | "bridges",
          metric as "volume" | "tvl" | "health",
          parseInt(limit, 10),
          bypassCache
        );

        return reply.send({
          success: true,
          data: performers,
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch top performers");
        return reply.status(500).send({
          success: false,
          error: "Failed to fetch top performers",
        });
      }
    }
  );

  /**
   * GET /api/v1/analytics/historical/:metric
   * Get historical comparison data
   * Query params: symbol, days
   */
  server.get<{ Params: { metric: string }; Querystring: QueryParams }>(
    "/historical/:metric",
    async (
      request: FastifyRequest<{ Params: { metric: string }; Querystring: QueryParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { metric } = request.params;
        const { symbol, days = "30", forceRefresh } = request.query;

        const bypassCache = forceRefresh === "true";
        const history = await analyticsService.getHistoricalComparison(
          metric,
          symbol,
          parseInt(days, 10),
          bypassCache
        );

        return reply.send({
          success: true,
          data: history,
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch historical data");
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Failed to fetch historical data",
        });
      }
    }
  );

  /**
   * POST /api/v1/analytics/cache/invalidate
   * Invalidate analytics cache
   * Body: { pattern?: string }
   */
  server.post<{ Body: { pattern?: string } }>(
    "/cache/invalidate",
    async (request: FastifyRequest<{ Body: { pattern?: string } }>, reply: FastifyReply) => {
      try {
        const { pattern } = request.body || {};

        await analyticsService.invalidateCache(pattern);

        return reply.send({
          success: true,
          message: pattern
            ? `Cache invalidated for pattern: ${pattern}`
            : "All analytics cache invalidated",
        });
      } catch (error) {
        logger.error({ error }, "Failed to invalidate cache");
        return reply.status(500).send({
          success: false,
          error: "Failed to invalidate cache",
        });
      }
    }
  );

  /**
   * GET /api/v1/analytics/summary
   * Get comprehensive analytics summary (combines multiple metrics)
   */
  server.get<{ Querystring: QueryParams }>("/summary", async (request: FastifyRequest<{Querystring: QueryParams}>, reply: FastifyReply) => {
    try {
      const forceRefresh = request.query.forceRefresh === "true";
      const [protocolStats, topAssets, topBridges] = await Promise.all([
        analyticsService.getProtocolStats(forceRefresh),
        analyticsService.getTopPerformers("assets", "health", 5, forceRefresh),
        analyticsService.getTopPerformers("bridges", "tvl", 5, forceRefresh),
      ]);

      return reply.send({
        success: true,
        data: {
          protocol: protocolStats,
          topAssets,
          topBridges,
        },
      });
    } catch (error) {
      logger.error({ error }, "Failed to fetch analytics summary");
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch analytics summary",
      });
    }
  });

  /**
   * GET /api/v1/analytics/custom-metrics
   * List all available custom metrics
   */
  server.get("/custom-metrics", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = getAllCustomMetrics();
      return reply.send({
        success: true,
        data: metrics.map(m => ({
          id: m.id,
          name: m.name,
          description: m.description,
          cacheTTL: m.cacheTTL,
        })),
      });
    } catch (error) {
      logger.error({ error }, "Failed to fetch custom metrics list");
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch custom metrics list",
      });
    }
  });

  /**
   * GET /api/v1/analytics/custom-metrics/:metricId
   * Execute a custom metric query
   */
  server.get<{ Params: { metricId: string }; Querystring: QueryParams }>(
    "/custom-metrics/:metricId",
    async (
      request: FastifyRequest<{ Params: { metricId: string }; Querystring: QueryParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { metricId } = request.params;
        const metric = getCustomMetric(metricId);

        if (!metric) {
          return reply.status(404).send({
            success: false,
            error: `Custom metric '${metricId}' not found`,
          });
        }

        const bypassCache = request.query.forceRefresh === "true";
        const result = await analyticsService.executeCustomMetric(metric, bypassCache);

        return reply.send({
          success: true,
          data: {
            metric: {
              id: metric.id,
              name: metric.name,
              description: metric.description,
            },
            result,
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to execute custom metric");
        return reply.status(500).send({
          success: false,
          error: "Failed to execute custom metric",
        });
      }
    }
  );
}
