import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { HealthService } from "../../services/health.service.js";
import { LiquidityService } from "../../services/liquidity.service.js";
import { PriceService } from "../../services/price.service.js";

export async function assetsRoutes(server: FastifyInstance) {
  const healthService = new HealthService();
  const liquidityService = new LiquidityService();
  const priceService = new PriceService();

  // List all monitored assets
  server.get(
    "/",
    {
      schema: {
        tags: ["Assets"],
        summary: "List all monitored assets",
        description: "Returns every asset currently tracked by Bridge-Watch.",
        response: {
          200: {
            type: "object",
            properties: {
              assets: { type: "array", items: { type: "object", additionalProperties: true } },
              total: { type: "integer", example: 0 },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      return { assets: [], total: 0 };
    },
  );

  // Get detailed asset information
  server.get<{ Params: { symbol: string } }>(
    "/:symbol",
    {
      schema: {
        tags: ["Assets"],
        summary: "Get asset details",
        params: {
          type: "object",
          properties: { symbol: { type: "string", description: "Asset symbol, e.g. USDC", example: "USDC" } },
          required: ["symbol"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              symbol: { type: "string" },
              details: { nullable: true, type: "object", additionalProperties: true },
            },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { symbol: string } }>,
      _reply: FastifyReply,
    ) => {
      const { symbol } = request.params;
      return { symbol, details: null };
    },
  );

  // Get current health score for an asset
  server.get<{ Params: { symbol: string } }>(
    "/:symbol/health",
    {
      schema: {
        tags: ["Assets"],
        summary: "Get current health score",
        description: "Returns the most recent health score for the specified asset.",
        params: {
          type: "object",
          properties: { symbol: { type: "string", example: "USDC" } },
          required: ["symbol"],
        },
        response: {
          200: { $ref: "HealthScore#" },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { symbol: string } }>,
      _reply: FastifyReply,
    ) => {
      const { symbol } = request.params;
      const health = await healthService.getHealthScore(symbol);
      return health;
    },
  );

  // Get historical health scores for sparklines
  server.get<{
    Params: { symbol: string };
    Querystring: { period?: "24h" | "7d" | "30d" };
  }>(
    "/:symbol/health/history",
    {
      schema: {
        tags: ["Assets"],
        summary: "Get health score history",
        description: "Returns time-series health score data for sparkline rendering.",
        params: {
          type: "object",
          properties: { symbol: { type: "string", example: "USDC" } },
          required: ["symbol"],
        },
        querystring: {
          type: "object",
          properties: {
            period: {
              type: "string",
              enum: ["24h", "7d", "30d"],
              default: "7d",
              description: "Time window for history",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              symbol: { type: "string" },
              period: { type: "string" },
              points: { type: "array", items: { type: "object", additionalProperties: true } },
            },
          },
          400: { $ref: "Error#" },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { symbol: string };
        Querystring: { period?: "24h" | "7d" | "30d" };
      }>,
      reply: FastifyReply,
    ) => {
      const { symbol } = request.params;
      const period = request.query.period ?? "7d";
      const days = period === "24h" ? 1 : period === "30d" ? 30 : 7;

      if (!symbol) {
        return reply.status(400).send({ error: "Missing symbol" });
      }

      const points = await healthService.getHealthHistory(symbol, days);
      return { symbol, period, points };
    },
  );

  // Get aggregated liquidity data for an asset
  server.get<{ Params: { symbol: string } }>(
    "/:symbol/liquidity",
    {
      schema: {
        tags: ["Assets"],
        summary: "Get aggregated liquidity",
        params: {
          type: "object",
          properties: { symbol: { type: "string", example: "USDC" } },
          required: ["symbol"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { symbol: string } }>,
      _reply: FastifyReply,
    ) => {
      const { symbol } = request.params;
      const liquidity = await liquidityService.getAggregatedLiquidity(symbol);
      return liquidity;
    },
  );

  // Get current price from all sources
  server.get<{ Params: { symbol: string } }>(
    "/:symbol/price",
    {
      schema: {
        tags: ["Assets"],
        summary: "Get aggregated price",
        description: "Returns the current price aggregated across all tracked sources.",
        params: {
          type: "object",
          properties: { symbol: { type: "string", example: "USDC" } },
          required: ["symbol"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { symbol: string } }>,
      _reply: FastifyReply,
    ) => {
      const { symbol } = request.params;
      const price = await priceService.getAggregatedPrice(symbol);
      return price;
    },
  );
}
