import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from "fastify";
import { JobQueue } from "../../workers/queue.js";
import { logger } from "../../utils/logger.js";
import { authMiddleware } from "../middleware/auth.js";

export default async function jobsRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const jobQueue = JobQueue.getInstance();
  const requireRead = authMiddleware({ requiredScopes: ["jobs:read"] });
  const requireTrigger = authMiddleware({ requiredScopes: ["jobs:trigger"] });

  /**
   * GET /api/jobs/monitor
   * Returns current queue status and job counts
   */
  fastify.get("/monitor", { preHandler: requireRead }, async (request: FastifyRequest, reply: FastifyReply) => {
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
  });

  /**
   * POST /api/jobs/:jobName/trigger
   * Manually trigger a job by name
   */
  fastify.post("/:jobName/trigger", { preHandler: requireTrigger }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { jobName } = request.params as { jobName: string };
    
    try {
      await jobQueue.addJob(jobName, { triggeredManually: true });
      return { status: "queued", jobName };
    } catch (error) {
      logger.error({ jobName, error }, "Failed to trigger manual job");
      return reply.code(500).send({ error: `Failed to trigger job ${jobName}` });
    }
  });
}
