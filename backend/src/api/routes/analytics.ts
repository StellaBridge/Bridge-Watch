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

const analyticsSuccessResponse = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
};

const analyticsErrorResponse = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    error: { type: "string" },
  },
};

const forceRefreshQuery = {
  type: "object",
  properties: {
    forceRefresh: { type: "string", enum: ["true", "false"], description: "Bypass cache" },
  },
};

export async function analyticsRoutes(server: FastifyInstance) {
  server.get<{ Querystring: QueryParams }>(
    "/protocol",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Get protocol-wide statistics",
        querystring: forceRefreshQuery,
        response: {
          200: analyticsSuccessResponse,
          500: analyticsErrorResponse,
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
      try {
        const forceRefresh = request.query.forceRefresh === "true";
        const stats = await analyticsService.getProtocolStats(forceRefresh);
        return reply.send({ success: true, data: stats });
      } catch (error) {
        logger.error({ error }, "Failed to fetch protocol stats");
        return reply.status(500).send({ success: false, error: "Failed to fetch protocol statistics" });
      }
    },
  );

  server.get<{ Querystring: QueryParams }>(
    "/bridges/comparison",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Get bridge comparison metrics",
        querystring: forceRefreshQuery,
        response: { 200: analyticsSuccessResponse, 500: analyticsErrorResponse },
      },
    },
    async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
      try {
        const forceRefresh = request.query.forceRefresh === "true";
        const comparisons = await analyticsService.getBridgeComparisons(forceRefresh);
        return reply.send({ success: true, data: comparisons });
      } catch (error) {
        logger.error({ error }, "Failed to fetch bridge comparisons");
        return reply.status(500).send({ success: false, error: "Failed to fetch bridge comparisons" });
      }
    },
  );

  server.get<{ Querystring: QueryParams }>(
    "/assets/rankings",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Get asset rankings",
        querystring: forceRefreshQuery,
        response: { 200: analyticsSuccessResponse, 500: analyticsErrorResponse },
      },
    },
    async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
      try {
        const forceRefresh = request.query.forceRefresh === "true";
        const rankings = await analyticsService.getAssetRankings(forceRefresh);
        return reply.send({ success: true, data: rankings });
      } catch (error) {
        logger.error({ error }, "Failed to fetch asset rankings");
        return reply.status(500).send({ success: false, error: "Failed to fetch asset rankings" });
      }
    },
  );

  server.get<{ Querystring: QueryParams }>(
    "/volume",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Get volume aggregations",
        querystring: {
          type: "object",
          properties: {
            period: {
              type: "string",
              enum: ["hourly", "daily", "weekly", "monthly"],
              default: "daily",
            },
            symbol: { type: "string" },
            bridgeName: { type: "string" },
            forceRefresh: { type: "string", enum: ["true", "false"] },
          },
        },
        response: { 200: analyticsSuccessResponse, 400: analyticsErrorResponse, 500: analyticsErrorResponse },
      },
    },
    async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
      try {
        const { period = "daily", symbol, bridgeName, forceRefresh } = request.query;
        if (!["hourly", "daily", "weekly", "monthly"].includes(period)) {
          return reply.status(400).send({ success: false, error: "Invalid period. Must be one of: hourly, daily, weekly, monthly" });
        }
        const aggregations = await analyticsService.getVolumeAggregation(
          period as AggregationPeriod, symbol, bridgeName, forceRefresh === "true",
        );
        return reply.send({ success: true, data: aggregations });
      } catch (error) {
        logger.error({ error }, "Failed to fetch volume aggregations");
        return reply.status(500).send({ success: false, error: "Failed to fetch volume aggregations" });
      }
    },
  );

  server.get<{ Params: { metric: string }; Querystring: QueryParams }>(
    "/trends/:metric",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Calculate trend for a metric",
        params: {
          type: "object",
          required: ["metric"],
          properties: { metric: { type: "string", example: "volume" } },
        },
        querystring: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            bridgeName: { type: "string" },
            forceRefresh: { type: "string", enum: ["true", "false"] },
          },
        },
        response: { 200: analyticsSuccessResponse, 500: analyticsErrorResponse },
      },
    },
    async (
      request: FastifyRequest<{ Params: { metric: string }; Querystring: QueryParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const { metric } = request.params;
        const { symbol, bridgeName, forceRefresh } = request.query;
        const trend = await analyticsService.calculateTrend(metric, symbol, bridgeName, forceRefresh === "true");
        return reply.send({ success: true, data: trend });
      } catch (error) {
        logger.error({ error }, "Failed to calculate trend");
        return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : "Failed to calculate trend" });
      }
    },
  );

  server.get<{ Querystring: QueryParams }>(
    "/top-performers",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Get top performing assets or bridges",
        querystring: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["assets", "bridges"], default: "assets" },
            metric: { type: "string", enum: ["volume", "tvl", "health"], default: "health" },
            limit: { type: "string", default: "10" },
            forceRefresh: { type: "string", enum: ["true", "false"] },
          },
        },
        response: { 200: analyticsSuccessResponse, 400: analyticsErrorResponse, 500: analyticsErrorResponse },
      },
    },
    async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
      try {
        const { type = "assets", metric = "health", limit = "10", forceRefresh } = request.query;
        if (!["assets", "bridges"].includes(type)) {
          return reply.status(400).send({ success: false, error: "Invalid type. Must be 'assets' or 'bridges'" });
        }
        if (!["volume", "tvl", "health"].includes(metric)) {
          return reply.status(400).send({ success: false, error: "Invalid metric. Must be 'volume', 'tvl', or 'health'" });
        }
        const performers = await analyticsService.getTopPerformers(
          type as "assets" | "bridges", metric as "volume" | "tvl" | "health",
          parseInt(limit, 10), forceRefresh === "true",
        );
        return reply.send({ success: true, data: performers });
      } catch (error) {
        logger.error({ error }, "Failed to fetch top performers");
        return reply.status(500).send({ success: false, error: "Failed to fetch top performers" });
      }
    },
  );

  server.get<{ Params: { metric: string }; Querystring: QueryParams }>(
    "/historical/:metric",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Get historical comparison data",
        params: {
          type: "object",
          required: ["metric"],
          properties: { metric: { type: "string", example: "health" } },
        },
        querystring: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            days: { type: "string", default: "30", description: "Number of days of history" },
            forceRefresh: { type: "string", enum: ["true", "false"] },
          },
        },
        response: { 200: analyticsSuccessResponse, 500: analyticsErrorResponse },
      },
    },
    async (
      request: FastifyRequest<{ Params: { metric: string }; Querystring: QueryParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const { metric } = request.params;
        const { symbol, days = "30", forceRefresh } = request.query;
        const history = await analyticsService.getHistoricalComparison(
          metric, symbol, parseInt(days, 10), forceRefresh === "true",
        );
        return reply.send({ success: true, data: history });
      } catch (error) {
        logger.error({ error }, "Failed to fetch historical data");
        return reply.status(500).send({ success: false, error: error instanceof Error ? error.message : "Failed to fetch historical data" });
      }
    },
  );

  server.post<{ Body: { pattern?: string } }>(
    "/cache/invalidate",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Invalidate analytics cache",
        body: {
          type: "object",
          properties: { pattern: { type: "string", description: "Redis key pattern to invalidate" } },
        },
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" }, message: { type: "string" } },
          },
          500: analyticsErrorResponse,
        },
      },
    },
    async (request: FastifyRequest<{ Body: { pattern?: string } }>, reply: FastifyReply) => {
      try {
        const { pattern } = request.body || {};
        await analyticsService.invalidateCache(pattern);
        return reply.send({
          success: true,
          message: pattern ? `Cache invalidated for pattern: ${pattern}` : "All analytics cache invalidated",
        });
      } catch (error) {
        logger.error({ error }, "Failed to invalidate cache");
        return reply.status(500).send({ success: false, error: "Failed to invalidate cache" });
      }
    },
  );

  server.get<{ Querystring: QueryParams }>(
    "/summary",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Get comprehensive analytics summary",
        description: "Combines protocol stats, top assets, and top bridges into a single response.",
        querystring: forceRefreshQuery,
        response: { 200: analyticsSuccessResponse, 500: analyticsErrorResponse },
      },
    },
    async (request: FastifyRequest<{ Querystring: QueryParams }>, reply: FastifyReply) => {
      try {
        const forceRefresh = request.query.forceRefresh === "true";
        const [protocolStats, topAssets, topBridges] = await Promise.all([
          analyticsService.getProtocolStats(forceRefresh),
          analyticsService.getTopPerformers("assets", "health", 5, forceRefresh),
          analyticsService.getTopPerformers("bridges", "tvl", 5, forceRefresh),
        ]);
        return reply.send({ success: true, data: { protocol: protocolStats, topAssets, topBridges } });
      } catch (error) {
        logger.error({ error }, "Failed to fetch analytics summary");
        return reply.status(500).send({ success: false, error: "Failed to fetch analytics summary" });
      }
    },
  );

  server.get(
    "/custom-metrics",
    {
      schema: {
        tags: ["Analytics"],
        summary: "List all custom metrics",
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    cacheTTL: { type: "integer" },
                  },
                },
              },
            },
          },
          500: analyticsErrorResponse,
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = getAllCustomMetrics();
        return reply.send({
          success: true,
          data: metrics.map((m) => ({ id: m.id, name: m.name, description: m.description, cacheTTL: m.cacheTTL })),
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch custom metrics list");
        return reply.status(500).send({ success: false, error: "Failed to fetch custom metrics list" });
      }
    },
  );

  server.get<{ Params: { metricId: string }; Querystring: QueryParams }>(
    "/custom-metrics/:metricId",
    {
      schema: {
        tags: ["Analytics"],
        summary: "Execute a custom metric query",
        params: {
          type: "object",
          required: ["metricId"],
          properties: { metricId: { type: "string" } },
        },
        querystring: forceRefreshQuery,
        response: {
          200: analyticsSuccessResponse,
          404: analyticsErrorResponse,
          500: analyticsErrorResponse,
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { metricId: string }; Querystring: QueryParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const { metricId } = request.params;
        const metric = getCustomMetric(metricId);
        if (!metric) {
          return reply.status(404).send({ success: false, error: `Custom metric '${metricId}' not found` });
        }
        const result = await analyticsService.executeCustomMetric(metric, request.query.forceRefresh === "true");
        return reply.send({
          success: true,
          data: { metric: { id: metric.id, name: metric.name, description: metric.description }, result },
        });
      } catch (error) {
        logger.error({ error }, "Failed to execute custom metric");
        return reply.status(500).send({ success: false, error: "Failed to execute custom metric" });
      }
    },
  );
}
