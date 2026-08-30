import type { FastifyInstance } from "fastify";
import { dbPoolRoutes } from "../db-pool.routes.js";

export async function registerDbPoolRoutes(server: FastifyInstance): Promise<void> {
  server.register(dbPoolRoutes, { prefix: "/api/v1/db-pool" });
  server.register(dbPoolRoutes, { prefix: "/api/db-pool" });
}
