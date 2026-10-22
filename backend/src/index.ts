import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { registerRoutes } from "./api/routes/index.js";
import { registerValidation } from "./api/middleware/validation.js";
import { registerMetrics } from "./api/middleware/metrics.js";
import { startBridgeVerificationJob } from "./jobs/verification.job.js";
import { startMigrationDriftMonitor, stopMigrationDriftMonitor } from "./jobs/migrationDrift.job.js";
import { wsServer } from "./api/websocket/websocket.server.js";
import {
  registerRateLimiting,
  getRateLimitMetrics,
} from "./api/middleware/rateLimit.middleware.js";
import { initJobSystem } from "./workers/index.js";
import { JobQueue } from "./workers/queue.js";
import { initWebhookWorker, stopWebhookWorker } from "./workers/webhookDelivery.worker.js";
import { getSupplyVerificationQueue } from "./jobs/supplyVerification.job.js";
import { swaggerOptions, swaggerUiOptions } from "./config/openapi.js";
import { registerCorrelationMiddleware } from "./api/middleware/correlation.middleware.js";
import { registerRequestLoggingMiddleware } from "./api/middleware/logging.middleware.js";
import { registerTracing } from "./api/middleware/tracing.js";
import { getTelegramBotService } from "./services/telegram.bot.service.js";
import { registerCompatibilityMiddleware } from "./api/compatibility/middleware.js";
import { registerDrainProtectionMiddleware } from "./api/middleware/drainProtection.middleware.js";
import { drainProtocolService } from "./services/drainProtocol.service.js";

export async function buildServer() {
  const server = Fastify({
    logger: false,
    loggerInstance: logger as any,
    ajv: {
      customOptions: {
        strict: false,
      },
    },
    // Default body size limit (1MB) - can be overridden per-route
    bodyLimit: config.BODY_LIMIT_DEFAULT,
  });

  // Register shared schemas referenced via $ref in route definitions
  server.addSchema({
    $id: "Error",
    type: "object",
    properties: {
      error: { type: "string" },
      message: { type: "string" },
      statusCode: { type: "number" },
    },
  });
  server.addSchema({
    $id: "HealthScore",
    type: "object",
    additionalProperties: true,
  });
  server.addSchema({
    $id: "AlertRule",
    type: "object",
    additionalProperties: true,
  });
  server.addSchema({
    $id: "Watchlist",
    type: "object",
    additionalProperties: true,
  });

  // Register correlation middleware first (to capture trace context for all requests)
  await registerCorrelationMiddleware(server as any);

  // Register request/response logging middleware
  await registerRequestLoggingMiddleware(server as any);

  // Register tracing middleware to populate trace headers/context
  await registerTracing(server as any);

  // Register metrics middleware (to capture all requests)
  await registerMetrics(server as any);

  // Register graceful shutdown drain protection middleware
  await registerDrainProtectionMiddleware(server as any);

  // Register security headers (helmet)
  await server.register(helmet, {
    contentSecurityPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: {
      action: "deny",
    },
    noSniff: true,
    xFrameOptions: { action: "deny" },
  });

  // Register plugins
  await server.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // Check if origin is in the allowed list
      if (config.CORS_ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      
      // Log rejected origins for debugging
      logger.warn({ msg: 'CORS_REJECTED', origin });
      return callback(null, false);
    },
    credentials: true,
  });

  // Content-Length validation middleware - prevents oversized payloads before body parsing
  server.addHook("onRequest", async (request, reply) => {
    const contentLength = request.headers["content-length"];
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (isNaN(length) || length < 0) {
        reply.code(400).send({ 
          error: "Bad Request", 
          message: "Invalid Content-Length header" 
        });
        return;
      }
      // Check against route-specific limit if set, otherwise use default
      const routeLimit = (request.routeOptions?.config?.bodyLimit as number) || config.BODY_LIMIT_DEFAULT;
      if (length > routeLimit) {
        reply.code(413).send({ 
          error: "Payload Too Large", 
          message: `Request body exceeds maximum allowed size of ${routeLimit} bytes` 
        });
        return;
      }
    }
  });

  // Set higher body limits for specific routes that need it
  server.addHook("onRoute", (routeOptions) => {
    const path = routeOptions.url;
    if (path) {
      // Higher limits for bulk operations, imports, uploads
      if (path.includes("/bulk") || path.includes("/import") || path.includes("/upload") || path.includes("/batch")) {
        routeOptions.config = {
          ...routeOptions.config,
          bodyLimit: config.BODY_LIMIT_BULK_IMPORT,
        };
      } else if (path.includes("/upload") || path.includes("/file")) {
        routeOptions.config = {
          ...routeOptions.config,
          bodyLimit: config.BODY_LIMIT_UPLOAD,
        };
      }
    }
  });

  await registerCompatibilityMiddleware(server as any);

  // OpenAPI / Swagger — must be registered before routes so schemas are collected
  await server.register(swagger, swaggerOptions);
  await server.register(swaggerUi, swaggerUiOptions);

  // Sliding-window Redis rate limiting (replaces the simple @fastify/rate-limit global)
  await registerRateLimiting(server as any);

  // Register official rate-limit plugin to satisfy CodeQL and handle per-route config
  await server.register(rateLimit, {
    global: false,
    addHeaders: {
      "x-ratelimit-limit": false,
      "x-ratelimit-remaining": false,
      "x-ratelimit-reset": false,
      "retry-after": false,
    },
  });

  // Enable permessage-deflate compression for WebSocket frames.
  await server.register(websocket, {
    options: {
      perMessageDeflate: true,
    },
  });

  // Register routes
  await registerRoutes(server as any);
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

    // Monitor for pending database migrations (#1426)
    startMigrationDriftMonitor();

    // Initialize webhook delivery worker
    await initWebhookWorker();

    // Initialize Telegram bot service
    const telegramService = getTelegramBotService();
    if (config.TELEGRAM_BOT_ENABLED && config.TELEGRAM_BOT_TOKEN) {
      try {
        await telegramService.start();
      } catch (error) {
        server.log.error(error, "Failed to start Telegram bot service");
        // Log error but don't exit - Telegram is a secondary service
      }
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received; initiating drain protocol");
    await drainProtocolService.startDrain({ reason: `Received signal ${signal}`, initiatedBy: "system" });

    // Stop Telegram bot service
    const telegramService = getTelegramBotService();
    if (telegramService.isRunning()) {
      try {
        await telegramService.stop();
      } catch (error) {
        logger.error(error, "Error stopping Telegram bot service");
      }
    }

    stopMigrationDriftMonitor();
    await wsServer.shutdown();
    await server.close();
    await JobQueue.getInstance().stop();
    await getSupplyVerificationQueue().stop();
    await stopWebhookWorker();
    logger.info("Server closed");
    process.exit(0);
  };

  process.once("SIGTERM", () => { shutdown("SIGTERM").catch(() => process.exit(1)); });
  process.once("SIGINT",  () => { shutdown("SIGINT").catch(() => process.exit(1)); });
}

if (process.env.NODE_ENV !== "test") {
  start();
}
