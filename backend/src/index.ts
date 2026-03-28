import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { registerRoutes } from "./api/routes/index.js";
import { startBridgeVerificationJob } from "./jobs/verification.job.js";
import {
  registerRateLimiting,
  getRateLimitMetrics,
} from "./api/middleware/rateLimit.middleware.js";
import { initJobSystem } from "./workers/index.js";
import { JobQueue } from "./workers/queue.js";
import { swaggerOptions, swaggerUiOptions } from "./config/openapi.js";

export async function buildServer() {
  const server = Fastify({
    logger: logger,
  });

  // Register tracing middleware first (to capture all requests)
  await registerTracing(server as any);

  // Register plugins
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  // OpenAPI / Swagger — must be registered before routes so schemas are collected
  await server.register(swagger, swaggerOptions);
  await server.register(swaggerUi, swaggerUiOptions);

  // Sliding-window Redis rate limiting (replaces the simple @fastify/rate-limit global)
  await registerRateLimiting(server as any);

  await server.register(websocket);

  // Register routes
  await registerRoutes(server as any);

  // Health check
  server.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Service health check",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", example: "ok" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async () => {
      return { status: "ok", timestamp: new Date().toISOString() };
    },
  );

  // Rate-limit metrics (internal monitoring endpoint)
  server.get(
    "/api/v1/metrics/rate-limits",
    {
      schema: {
        tags: ["Cache"],
        summary: "Rate-limit sliding-window metrics",
        security: [{ ApiKeyAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              metrics: { type: "object", additionalProperties: true },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async () => {
      return { metrics: getRateLimitMetrics(), timestamp: new Date().toISOString() };
    },
  );

  return server;
}

async function start() {
  const server = await buildServer();

  try {
    await server.listen({ port: config.PORT, host: "0.0.0.0" });
    server.log.info(
      `Stellar Bridge Watch API running on port ${config.PORT}`
    );

    // Initialize background jobs
    await initJobSystem();

    // Graceful shutdown
    const shutdown = async () => {
      logger.info("Closing server...");
      await server.close();
      await JobQueue.getInstance().stop();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  start();
}
