import type { FastifyInstance } from "fastify";
import { IncidentService } from "../../services/incident.service.js";

export async function incidentsRoutes(server: FastifyInstance) {
  const incidentService = new IncidentService();

  // GET /api/v1/incidents - List incidents with filters
  server.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      assetSymbol?: string;
      severity?: string;
      limit?: string;
    };
  }>("/", async (request, reply) => {
    const { startDate, endDate, assetSymbol, severity, limit } = request.query;

    const incidents = await incidentService.getIncidents({
      startDate,
      endDate,
      assetSymbol,
      severity,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return { incidents };
  });

  // GET /api/v1/incidents/heatmap - Heatmap data
  server.get<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      assetSymbol?: string;
    };
  }>("/heatmap", async (request, reply) => {
    const { startDate, endDate, assetSymbol } = request.query;

    const heatmap = await incidentService.getHeatmapData({
      startDate,
      endDate,
      assetSymbol,
    });

    return heatmap;
  });
}
