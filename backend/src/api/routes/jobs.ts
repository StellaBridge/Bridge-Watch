import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { JobQueue } from "../../workers/queue.js";
import { logger } from "../../utils/logger.js";

export default async function jobsRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  const jobQueue = JobQueue.getInstance();

  fastify.get(
    "/monitor",
    {
      schema: {
        tags: ["Jobs"],
        summary: "Get job queue status",
        description: "Returns current BullMQ queue counts and a list of recently failed jobs.",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", example: "active" },
              counts: { type: "object", additionalProperties: true },
              failed: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    data: { type: "object", additionalProperties: true },
                    failedReason: { type: "string" },
                    timestamp: { type: "number" },
                  },
                },
              },
            },
          },
          500: { $ref: "Error#" },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const counts = await jobQueue.getJobCounts();
        const failed = await jobQueue.getFailedJobs();
        return {
          status: "active",
          counts,
          failed: failed.map((j: any) => ({
            id: j.id,
            name: j.name,
            data: j.data,
            failedReason: j.failedReason,
            timestamp: j.timestamp,
          })),
        };
      } catch (error) {
        logger.error({ error }, "Failed to fetch job monitor data");
        return reply.code(500).send({ error: "Failed to fetch job monitor data" });
      }
    },
  );

  fastify.post<{ Params: { jobName: string } }>(
    "/:jobName/trigger",
    {
      schema: {
        tags: ["Jobs"],
        summary: "Manually trigger a job",
        description: "Enqueues the named job immediately, bypassing its normal schedule.",
        params: {
          type: "object",
          required: ["jobName"],
          properties: { jobName: { type: "string", example: "bridge-health-check" } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", example: "queued" },
              jobName: { type: "string" },
            },
          },
          500: { $ref: "Error#" },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { jobName: string } }>, reply: FastifyReply) => {
      const { jobName } = request.params;
      try {
        await jobQueue.addJob(jobName, { triggeredManually: true });
        return { status: "queued", jobName };
      } catch (error) {
        logger.error({ jobName, error }, "Failed to trigger manual job");
        return reply.code(500).send({ error: `Failed to trigger job ${jobName}` });
      }
    },
  );
}
