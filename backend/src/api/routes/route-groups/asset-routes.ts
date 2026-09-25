import type { FastifyInstance } from "fastify";
import { assetsRoutes } from "../assets.js";
import { assetMergeRoutes } from "../assetMerge.routes.js";
import { assetFreshnessRoutes } from "../assetFreshness.routes.js";
import { healthScoreHistoryRoutes } from "../healthScoreHistory.routes.js";
import { assetExposureRoutes } from "../assetExposure.routes.js";
import { assetLifecycleTimelineRoutes } from "../assetLifecycleTimeline.routes.js";
// #1240 — Register orphaned route modules
import { assetsLifecycleRoutes } from "../assetsLifecycle.js";

export async function registerAssetRoutes(server: FastifyInstance): Promise<void> {
  server.register(assetsRoutes, { prefix: "/api/v1/assets" });
  server.register(assetMergeRoutes, { prefix: "/api/v1/asset-merge" });
  server.register(assetFreshnessRoutes, { prefix: "/api/v1/freshness/assets" });
  server.register(healthScoreHistoryRoutes, {
    prefix: "/api/v1/health-score-history",
  });
  server.register(assetExposureRoutes, { prefix: "/api/v1/asset-exposure" });
  server.register(assetLifecycleTimelineRoutes, {
    prefix: "/api/v1/assets/lifecycle-timeline",
  });

  // #1240 — Register orphaned route modules
  server.register(assetsLifecycleRoutes, { prefix: "/api/v1" });
}
