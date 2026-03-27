import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { registerRoutes } from "./api/routes/index.js";
import { registerRateLimiting } from "./api/middleware/rateLimit.middleware.js";
import { initJobSystem } from "./workers/index.js";
import { JobQueue } from "./workers/queue.js";

export async function buildServer() {
  const server = Fastify({
    logger: logger,
  });

  // Register plugins
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  await registerRateLimiting(server);

  await server.register(websocket);

  // Register routes
  await registerRoutes(server as any);

  // Health check
  server.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
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
