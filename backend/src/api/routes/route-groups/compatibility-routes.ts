import type { FastifyInstance } from "fastify";
import { compatibilityRoutes } from "../../compatibility/routes.js";
// #1240 — Register orphaned route modules
import { apiChangelogDiffRoutes } from "../apiChangelogDiff.routes.js";
import { releaseCompatibilityRoutes } from "../releaseCompatibility.routes.js";

export async function registerCompatibilityRoutes(server: FastifyInstance): Promise<void> {
  server.register(compatibilityRoutes, { prefix: "/api/v1/compatibility" });

  // #1240 — Register orphaned route modules
  server.register(apiChangelogDiffRoutes, { prefix: "/api/v1/api-changelog" });
  server.register(releaseCompatibilityRoutes, { prefix: "/api/v1/release-compatibility" });
}
