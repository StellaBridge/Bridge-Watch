import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
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
import { initWebhookWorker, stopWebhookWorker } from "./workers/webhookDelivery.worker.js";

export async function buildServer() {
  const server = Fastify({
    logger: logger,
  });

  // Register plugins
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  // Sliding-window Redis rate limiting (replaces the simple @fastify/rate-limit global)
  await registerRateLimiting(server as any);

  await server.register(websocket);

  // Register routes
  await registerRoutes(server as any);

  // Health check
  server.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Rate-limit metrics (internal monitoring endpoint)
  server.get("/api/v1/metrics/rate-limits", async () => {
    return { metrics: getRateLimitMetrics(), timestamp: new Date().toISOString() };
  });

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

    // Initialize webhook delivery worker
    await initWebhookWorker();

    // Graceful shutdown
    const shutdown = async () => {
      logger.info("Closing server...");
      await server.close();
      await JobQueue.getInstance().stop();
      await stopWebhookWorker();
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
