import type { FastifyInstance } from "fastify";
import { slowQueryRegressionRoutes } from "../slowQueryRegression.routes.js";
import { rollbackReadinessRoutes } from "../rollbackReadiness.routes.js";
import { canaryMetricRoutes } from "../canaryMetric.routes.js";
import { promotionGatesRoutes } from "../promotionGates.routes.js";
import { riskClusteringRoutes } from "../riskClustering.routes.js";
import { trustlineAnalyticsRoutes } from "../trustlineAnalytics.routes.js";
import { issuerAuthRoutes } from "../issuerAuth.routes.js";
import { contractEventSchemaRoutes } from "../contractEventSchema.routes.js";
// #1240 — Register orphaned route modules
import { deploymentDriftRoutes } from "../deploymentDrift.routes.js";
import { queryPerformanceRoutes } from "../queryPerformance.routes.js";
// #1196 — Disaster Recovery Readiness Scoring
import { disasterRecoveryReadinessRoutes } from "../disasterRecoveryReadiness.routes.js";

export async function registerOperationalRoutes(server: FastifyInstance): Promise<void> {
  server.register(slowQueryRegressionRoutes);
  server.register(rollbackReadinessRoutes);
  server.register(canaryMetricRoutes);
  server.register(promotionGatesRoutes);
  server.register(riskClusteringRoutes, { prefix: "/api/v1" });
  server.register(trustlineAnalyticsRoutes, { prefix: "/api/v1" });
  server.register(issuerAuthRoutes, { prefix: "/api/v1" });
  server.register(contractEventSchemaRoutes, { prefix: "/api/v1" });

  // #1240 — Register orphaned route modules
  server.register(deploymentDriftRoutes, { prefix: "/api/v1/deployment-drift" });
  server.register(queryPerformanceRoutes, { prefix: "/api/v1/query-performance" });

  // #1196 — Disaster Recovery Readiness Scoring
  server.register(disasterRecoveryReadinessRoutes, { prefix: "/api/v1/dr-readiness" });
}
