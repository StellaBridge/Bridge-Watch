import type { FastifyInstance } from "fastify";
import {
  aggregationService,
  AggregationInterval,
} from "../../services/aggregation.service";

const intervalQuerySchema = {
  type: "object",
  required: ["interval", "startTime", "endTime"],
  properties: {
    interval: {
      type: "string",
      enum: ["1m", "5m", "15m", "1h", "4h", "1d"],
      description: "Aggregation interval",
    },
    startTime: { type: "string", format: "date-time" },
    endTime: { type: "string", format: "date-time" },
  },
};

const aggregationResponse = {
  type: "object",
  properties: {
    symbol: { type: "string" },
    interval: { type: "string" },
    aggregations: { type: "array", items: { type: "object", additionalProperties: true } },
    total: { type: "integer" },
  },
};

export async function aggregationRoutes(server: FastifyInstance) {
  server.get<{
    Params: { symbol: string };
    Querystring: { interval: AggregationInterval; startTime: string; endTime: string };
  }>(
    "/:symbol/prices",
    {
      schema: {
        tags: ["Aggregation"],
        summary: "Aggregate price data",
        description: "Returns OHLCV-style price aggregations over the requested time window.",
        params: {
          type: "object",
          properties: { symbol: { type: "string", example: "USDC" } },
          required: ["symbol"],
        },
        querystring: intervalQuerySchema,
        response: { 200: aggregationResponse },
      },
    },
    async (request, _reply) => {
      const { symbol } = request.params;
      const { interval, startTime, endTime } = request.query;
      const aggregations = await aggregationService.aggregatePrices(
        symbol, interval, new Date(startTime), new Date(endTime),
      );
      return { symbol, interval, aggregations, total: aggregations.length };
    },
  );

  server.get<{
    Params: { symbol: string };
    Querystring: { interval: AggregationInterval; startTime: string; endTime: string };
  }>(
    "/:symbol/health",
    {
      schema: {
        tags: ["Aggregation"],
        summary: "Aggregate health scores",
        params: {
          type: "object",
          properties: { symbol: { type: "string", example: "USDC" } },
          required: ["symbol"],
        },
        querystring: intervalQuerySchema,
        response: { 200: aggregationResponse },
      },
    },
    async (request, _reply) => {
      const { symbol } = request.params;
      const { interval, startTime, endTime } = request.query;
      const aggregations = await aggregationService.aggregateHealthScores(
        symbol, interval, new Date(startTime), new Date(endTime),
      );
      return { symbol, interval, aggregations, total: aggregations.length };
    },
  );

  server.get<{
    Params: { symbol: string };
    Querystring: { interval: AggregationInterval; startTime: string; endTime: string };
  }>(
    "/:symbol/volume",
    {
      schema: {
        tags: ["Aggregation"],
        summary: "Aggregate volume data",
        params: {
          type: "object",
          properties: { symbol: { type: "string", example: "USDC" } },
          required: ["symbol"],
        },
        querystring: intervalQuerySchema,
        response: { 200: aggregationResponse },
      },
    },
    async (request, _reply) => {
      const { symbol } = request.params;
      const { interval, startTime, endTime } = request.query;
      const aggregations = await aggregationService.aggregateVolume(
        symbol, interval, new Date(startTime), new Date(endTime),
      );
      return { symbol, interval, aggregations, total: aggregations.length };
    },
  );

  server.post<{ Body: { interval: AggregationInterval } }>(
    "/precompute",
    {
      schema: {
        tags: ["Aggregation"],
        summary: "Pre-compute aggregations",
        description: "Triggers background pre-computation for the given interval.",
        body: {
          type: "object",
          required: ["interval"],
          properties: { interval: { type: "string", enum: ["1m", "5m", "15m", "1h", "4h", "1d"] } },
        },
        response: { 200: { type: "object", properties: { message: { type: "string" } } } },
      },
    },
    async (request, reply) => {
      const { interval } = request.body;
      await aggregationService.preComputeAggregations(interval);
      return reply.code(200).send({ message: "Aggregations pre-computed successfully" });
    },
  );

  server.post<{ Body: { symbol: string; startDate: string; endDate: string } }>(
    "/rebuild",
    {
      schema: {
        tags: ["Aggregation"],
        summary: "Rebuild historical aggregations",
        body: {
          type: "object",
          required: ["symbol", "startDate", "endDate"],
          properties: {
            symbol: { type: "string" },
            startDate: { type: "string", format: "date-time" },
            endDate: { type: "string", format: "date-time" },
          },
        },
        response: { 200: { type: "object", properties: { message: { type: "string" } } } },
      },
    },
    async (request, reply) => {
      const { symbol, startDate, endDate } = request.body;
      await aggregationService.rebuildHistoricalAggregations(symbol, new Date(startDate), new Date(endDate));
      return reply.code(200).send({ message: "Historical aggregations rebuilt successfully" });
    },
  );

  server.post<{
    Body: { symbols: string[]; interval: AggregationInterval; startTime: string; endTime: string };
  }>(
    "/multi-asset",
    {
      schema: {
        tags: ["Aggregation"],
        summary: "Multi-asset aggregation",
        description: "Fetches aggregated data for multiple symbols in a single request.",
        body: {
          type: "object",
          required: ["symbols", "interval", "startTime", "endTime"],
          properties: {
            symbols: { type: "array", items: { type: "string" }, example: ["USDC", "BTC"] },
            interval: { type: "string", enum: ["1m", "5m", "15m", "1h", "4h", "1d"] },
            startTime: { type: "string", format: "date-time" },
            endTime: { type: "string", format: "date-time" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: { aggregations: { type: "object", additionalProperties: true } },
          },
        },
      },
    },
    async (request, _reply) => {
      const { symbols, interval, startTime, endTime } = request.body;
      const aggregations = await aggregationService.getMultiAssetAggregation(
        symbols, interval, new Date(startTime), new Date(endTime),
      );
      return { aggregations };
    },
  );

  server.post<{ Body: { olderThanDays?: number } }>(
    "/cache/cleanup",
    {
      schema: {
        tags: ["Aggregation"],
        summary: "Clean up old aggregation cache",
        body: {
          type: "object",
          properties: { olderThanDays: { type: "integer", minimum: 1, example: 30 } },
        },
        response: { 200: { type: "object", properties: { message: { type: "string" } } } },
      },
    },
    async (request, reply) => {
      const { olderThanDays } = request.body;
      await aggregationService.cleanupOldCache(olderThanDays);
      return reply.code(200).send({ message: "Old cache cleaned up successfully" });
    },
  );

  server.get(
    "/stats",
    {
      schema: {
        tags: ["Aggregation"],
        summary: "Get aggregation statistics",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (_request, _reply) => {
      const stats = await aggregationService.getAggregationStats();
      return stats;
    },
  );
}
