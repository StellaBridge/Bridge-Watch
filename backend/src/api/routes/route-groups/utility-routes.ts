import type { FastifyInstance } from "fastify";
import { exportsRoutes } from "../exports.js";
import { usageMetricsRoutes } from "../usageMetrics.routes.js";
import { horizonStreamRoutes } from "../horizonStream.routes.js";
import { digestSchedulerRoutes } from "../digestScheduler.js";
import { queryPresetsRoutes } from "../queryPresets.js";
import { serviceAnnotationRoutes } from "../serviceAnnotation.routes.js";
import { contractAnnotationRoutes } from "../contractAnnotations.routes.js";
import { liquidityFragmentationRoutes } from "../liquidityFragmentation.routes.js";
import { ownershipMatrixRoutes } from "../ownershipMatrix.js";
import { operatorNotesRoutes } from "../notes.js";
import { externalDependenciesRoutes } from "../externalDependencies.routes.js";
import { eventReplayRoutes } from "../eventReplay.routes.js";
import { eventFederationRoutes } from "../eventFederation.routes.js";
import jobsRoutes from "../jobs.js";
import { schedulesRoutes } from "../schedules.routes.js";
import { platformContractsRoutes } from "../platformContracts.routes.js";
import { liquidityRouteSimulationRoutes } from "../liquidityRouteSimulation.routes.js";
import { operatorCapacityMetricsRoutes } from "../operatorCapacityMetrics.routes.js";
import { ingestionWatermarkRoutes } from "../ingestionWatermarks.routes.js";
import { sessionDeviceRoutes } from "../sessionDevice.routes.js";
// #1240 — Register orphaned route modules (aliased: `jobsRoutes` above)
import { exportIntegrityRoutes } from "../exportIntegrity.routes.js";
import { jobsRoutes as jobExecutionRoutes } from "../jobs.routes.js";

export async function registerUtilityRoutes(server: FastifyInstance): Promise<void> {
  server.register(exportsRoutes, { prefix: "/api/v1/exports" });
  server.register(usageMetricsRoutes, { prefix: "/api/v1" });
  server.register(horizonStreamRoutes, { prefix: "/api/v1/horizon-streams" });
  server.register(digestSchedulerRoutes, { prefix: "/api/v1/digest" });
  server.register(queryPresetsRoutes, { prefix: "/api/v1/query-presets" });
  server.register(serviceAnnotationRoutes, {
    prefix: "/api/v1/service-annotations",
  });
  server.register(contractAnnotationRoutes, { prefix: "/api/v1/contracts" });
  server.register(liquidityFragmentationRoutes, { prefix: "/api/v1" });
  server.register(ownershipMatrixRoutes, { prefix: "/api/v1" });
  server.register(operatorNotesRoutes, { prefix: "/api/v1/notes" });
  server.register(externalDependenciesRoutes, {
    prefix: "/api/v1/external-dependencies",
  });
  server.register(eventReplayRoutes, { prefix: "/api/v1/events/replay" });
  server.register(eventFederationRoutes, { prefix: "/api/v1/event-federation" });
  server.register(jobsRoutes, { prefix: "/api/v1/jobs" });
  server.register(schedulesRoutes, { prefix: "/api/v1/schedules" });
  server.register(platformContractsRoutes, { prefix: "/api/v1/platform" });
  server.register(liquidityRouteSimulationRoutes, {
    prefix: "/api/v1/liquidity/simulation",
  });
  server.register(operatorCapacityMetricsRoutes, {
    prefix: "/api/v1/operators/capacity",
  });
  server.register(ingestionWatermarkRoutes, { prefix: "/api/v1/ingestion-watermarks" });
  server.register(sessionDeviceRoutes, { prefix: "/api/v1/user/devices" });

  // #1240 — Register orphaned route modules
  server.register(exportIntegrityRoutes, { prefix: "/api/v1" });
  server.register(jobExecutionRoutes, { prefix: "/api/v1" });
}
