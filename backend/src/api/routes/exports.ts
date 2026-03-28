import type { FastifyInstance } from "fastify";
import { ExportService } from "../../services/export.service.js";
import { logger } from "../../utils/logger.js";

export async function exportsRoutes(server: FastifyInstance) {
  const exportService = new ExportService();

  // POST /api/v1/exports - Request a new export
  server.post<{
    Body: {
      format: "csv" | "json" | "pdf";
      dataType: "analytics" | "transactions" | "health_metrics";
      filters: {
        startDate: string;
        endDate: string;
        assetCodes?: string[];
        bridgeIds?: string[];
        limit?: number;
      };
      emailDelivery?: boolean;
      emailAddress?: string;
    };
  }>("/", async (request, reply) => {
    const userId = (request as any).user?.address || "anonymous";

    try {
      const exportRecord = await exportService.requestExport(userId, request.body);
      return reply.status(201).send({ export: exportRecord });
    } catch (error) {
      logger.error({ error }, "Failed to create export");
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Failed to create export",
      });
    }
  });

  // GET /api/v1/exports - List exports for user
  server.get<{
    Querystring: { page?: string; limit?: string };
  }>("/", async (request, reply) => {
    const userId = (request as any).user?.address || "anonymous";
    const page = parseInt(request.query.page ?? "1", 10);
    const limit = parseInt(request.query.limit ?? "20", 10);

    try {
      const paginatedExports = await exportService.listExports(userId, { page, limit });
      return { exports: paginatedExports };
    } catch (error) {
      logger.error({ error }, "Failed to list exports");
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Failed to list exports",
      });
    }
  });

  // GET /api/v1/exports/:exportId - Get export status
  server.get<{
    Params: { exportId: string };
  }>("/:exportId", async (request, reply) => {
    const { exportId } = request.params;

    try {
      const exportRecord = await exportService.getExportStatus(exportId);

      if (!exportRecord) {
        return reply.status(404).send({ error: "Export not found" });
      }

      return { export: exportRecord };
    } catch (error) {
      logger.error({ error, exportId }, "Failed to get export status");
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Failed to get export status",
      });
    }
  });

  // GET /api/v1/exports/:exportId/download - Generate or refresh download URL
  server.get<{
    Params: { exportId: string };
  }>("/:exportId/download", async (request, reply) => {
    const { exportId } = request.params;

    try {
      const downloadLink = await exportService.generateDownloadUrl(exportId);
      return { downloadLink };
    } catch (error) {
      logger.error({ error, exportId }, "Failed to generate download URL");
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Failed to generate download URL",
      });
    }
  });

  // DELETE /api/v1/exports/:exportId - Delete an export
  server.delete<{
    Params: { exportId: string };
  }>("/:exportId", async (request, reply) => {
    const { exportId } = request.params;

    try {
      await exportService.deleteExport(exportId);
      return reply.status(204).send();
    } catch (error) {
      logger.error({ error, exportId }, "Failed to delete export");
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Failed to delete export",
      });
    }
  });
}
