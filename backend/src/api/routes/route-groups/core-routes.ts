import type { FastifyInstance } from "fastify";
import { healthRoutes } from "../health.js";
import { websocketRoutes } from "../websocket.js";
import { configRoutes } from "../config.js";
import { preferencesRoutes } from "../preferences.js";
import { watchlistsRoutes } from "../watchlists.js";
import { cacheRoutes } from "../cache.js";
import { metadataRoutes } from "../metadata.js";
import { aggregationRoutes } from "../aggregation.js";
import { circuitBreakerRoutes } from "../circuitBreaker.js";
import { circuitHealthRoutes } from "../circuitHealth.js";
import { searchRoutes } from "../search.routes.js";
import { sessionsRoutes } from "../sessions.js";
import { tagsRoutes } from "../tags.js";
import { notificationTemplatesRoutes } from "../notificationTemplates.js";

export async function registerCoreRoutes(server: FastifyInstance): Promise<void> {
  server.register(healthRoutes, { prefix: "/api/v1/health" });
  server.register(healthRoutes, { prefix: "/health" });
  server.register(websocketRoutes, { prefix: "/api/v1/ws" });
  server.register(configRoutes, { prefix: "/api/v1/config" });
  server.register(preferencesRoutes, { prefix: "/api/v1/preferences" });
  server.register(watchlistsRoutes, { prefix: "/api/v1/watchlists" });
  server.register(cacheRoutes, { prefix: "/api/v1/cache" });
  server.register(metadataRoutes, { prefix: "/api/v1/metadata" });
  server.register(aggregationRoutes, { prefix: "/api/v1/aggregation" });
  server.register(circuitBreakerRoutes, { prefix: "/api/v1/circuit-breaker" });
  server.register(circuitHealthRoutes, { prefix: "/api/v1/circuit-health" });
  server.register(searchRoutes, { prefix: "/api/v1/search" });
  server.register(sessionsRoutes, { prefix: "/api/v1/sessions" });
  server.register(tagsRoutes, { prefix: "/api/v1/tags" });
  server.register(notificationTemplatesRoutes, {
    prefix: "/api/v1/notification-templates",
  });
}
