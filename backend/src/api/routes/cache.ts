import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CacheService } from "../../utils/cache.js";
import { logger } from "../../utils/logger.js";

export async function cacheRoutes(server: FastifyInstance) {
  /**
   * GET /api/v1/cache/stats
   * Get Redis cache statistics
   */
  server.get("/stats", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = CacheService.getStats();
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error({ error }, "Failed to fetch cache statistics");
      return reply.status(500).send({
        success: false,
        error: "Failed to fetch cache statistics",
      });
    }
  });

  /**
   * POST /api/v1/cache/invalidate
   * Manually invalidate tag or specific key
   */
  server.post<{ Body: { tag?: string, key?: string } }>(
    "/invalidate", 
    async (request: FastifyRequest<{ Body: { tag?: string, key?: string } }>, reply: FastifyReply) => {
    try {
      const { tag, key } = request.body;
      if (key) {
        await CacheService.invalidateKey(key);
      } else if (tag) {
        await CacheService.invalidateByTag(tag);
      } else {
        return reply.status(400).send({
          success: false,
          error: "Provide either tag or key to invalidate",
        });
      }

      return reply.send({
        success: true,
        message: "Invalidation successful",
      });
    } catch (error) {
      logger.error({ error }, "Failed to invalidate cache target");
      return reply.status(500).send({
        success: false,
        error: "Failed to invalidate cache target",
      });
    }
  });
}
