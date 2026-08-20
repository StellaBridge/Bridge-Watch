import type { FastifyInstance } from "fastify";
import { incidentRoutes } from "../incidents.routes.js";
import { incidentsRoutes } from "../incidents.js";
import { incidentCorrelationRoutes } from "../incidentCorrelation.routes.js";
import { incidentTimelineRoutes } from "../incidentTimeline.routes.js";

export async function registerIncidentRoutes(server: FastifyInstance): Promise<void> {
  server.register(incidentRoutes, { prefix: "/api/v1/incidents" });
  server.register(incidentsRoutes, { prefix: "/api/v1/incidents-heatmap" });
  server.register(incidentCorrelationRoutes, { prefix: "/api/v1/incidents" });
  server.register(incidentTimelineRoutes, { prefix: "/api/v1/incidents" });
}
