import type { FastifyInstance } from "fastify";
import { assetsRoutes } from "./assets.js";
import { bridgesRoutes } from "./bridges.js";
import { websocketRoutes } from "./websocket.js";
import { alertsRoutes } from "./alerts.js";
import { circuitBreakerRoutes } from "./circuitBreaker.js";
import jobsRoutes from "./jobs.js";
import { rateLimitMetricsRoutes } from "./rateLimitMetrics.js";

export async function registerRoutes(server: FastifyInstance) {
  server.register(assetsRoutes, { prefix: "/api/v1/assets" });
  server.register(bridgesRoutes, { prefix: "/api/v1/bridges" });
  server.register(websocketRoutes, { prefix: "/api/v1/ws" });
  server.register(alertsRoutes, { prefix: "/api/v1/alerts" });
  server.register(circuitBreakerRoutes, { prefix: "/api/v1/circuit-breaker" });
  server.register(jobsRoutes, { prefix: "/api/v1/jobs" });
  server.register(rateLimitMetricsRoutes, { prefix: "/api/v1/rate-limit" });
}
