import type { FastifyInstance } from "fastify";
import {
  getRateLimitMetrics,
  RATE_LIMIT_TIERS,
} from "../middleware/rateLimit.middleware.js";

export async function rateLimitMetricsRoutes(server: FastifyInstance) {
  // GET /api/v1/rate-limit/metrics — today's counters from Redis
  server.get("/metrics", async (_request, _reply) => {
    const metrics = await getRateLimitMetrics();
    return { metrics };
  });

  // GET /api/v1/rate-limit/tiers — current tier definitions
  server.get("/tiers", async (_request, _reply) => {
    return { tiers: RATE_LIMIT_TIERS };
  });
}
