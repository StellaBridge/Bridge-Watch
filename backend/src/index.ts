import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { registerRoutes } from "./api/routes/index.js";
import { startBridgeVerificationJob } from "./jobs/verification.job.js";
import { wsServer } from "./api/websocket/websocket.server.js";

export async function buildServer() {
  const server = Fastify({
    logger: logger,
  });

  // Register plugins
  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  await server.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });

  // Enable permessage-deflate compression for WebSocket frames.
  await server.register(websocket, {
    options: {
      perMessageDeflate: true,
    },
  });

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
    startBridgeVerificationJob();
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");

    await wsServer.shutdown();

    await server.close();
    logger.info("Server closed");
    process.exit(0);
  };

  process.once("SIGTERM", () => { shutdown("SIGTERM").catch(() => process.exit(1)); });
  process.once("SIGINT",  () => { shutdown("SIGINT").catch(() => process.exit(1)); });
}

if (process.env.NODE_ENV !== "test") {
  start();
}
