import type { FastifyInstance } from "fastify";
import { BackfillService } from "../../services/backfill.service.js";

const backfillService = new BackfillService();

export async function backfillRoutes(server: FastifyInstance) {
  server.post<{
    Body: {
      assetCode: string;
      assetIssuer: string;
      bridgeName?: string;
      operationTypes?: string[];
      cursor?: string;
      pages?: number;
      pageSize?: number;
      chunkPages?: number;
      priority?: "normal" | "high";
    };
  }>(
    "/",
    {
      schema: {
        tags: ["Backfill"],
        summary: "Start a historical transaction backfill job",
        body: {
          type: "object",
          required: ["assetCode", "assetIssuer"],
          properties: {
            assetCode: { type: "string" },
            assetIssuer: { type: "string" },
            bridgeName: { type: "string" },
            operationTypes: { type: "array", items: { type: "string" } },
            cursor: { type: "string" },
            pages: { type: "number", default: 250 },
            pageSize: { type: "number", default: 100 },
            chunkPages: { type: "number", default: 5 },
            priority: { type: "string", enum: ["normal", "high"], default: "normal" },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request) => {
      const result = await backfillService.createTransactionBackfill(request.body);
      return { success: true, ...result };
    },
  );

  server.get(
    "/",
    {
      schema: {
        tags: ["Backfill"],
        summary: "List active backfill jobs",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async () => {
      const jobs = await backfillService.listBackfillJobs();
      return { jobs };
    },
  );

  server.get<{
    Params: { jobId: string };
  }>(
    "/:jobId",
    {
      schema: {
        tags: ["Backfill"],
        summary: "Get backfill job status",
        params: {
          type: "object",
          required: ["jobId"],
          properties: { jobId: { type: "string" } },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      const job = await backfillService.getJobStatus(request.params.jobId);
      if (!job) {
        return reply.status(404).send({ error: "Backfill job not found" });
      }
      return { job };
    },
  );

  server.post<{
    Params: { jobId: string };
  }>(
    "/:jobId/resume",
    {
      schema: {
        tags: ["Backfill"],
        summary: "Resume a failed or paused backfill job",
        params: {
          type: "object",
          required: ["jobId"],
          properties: { jobId: { type: "string" } },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      const job = await backfillService.resumeBackfillJob(request.params.jobId);
      if (!job) {
        return reply.status(404).send({ error: "Backfill job not found" });
      }
      return { job };
    },
  );
}
