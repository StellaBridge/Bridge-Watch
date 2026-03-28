import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { CacheService } from "../../utils/cache.js";
import { logger } from "../../utils/logger.js";

export async function cacheRoutes(server: FastifyInstance) {
  server.get(
    "/stats",
    {
      schema: {
        tags: ["Cache"],
        summary: "Get Redis cache statistics",
        description: "Returns hit/miss counts, memory usage, and key-space info from the Redis cache layer.",
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", additionalProperties: true },
            },
          },
          500: { $ref: "Error#" },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = CacheService.getStats();
        return reply.send({ success: true, data: stats });
      } catch (error) {
        logger.error({ error }, "Failed to fetch cache statistics");
        return reply.status(500).send({ success: false, error: "Failed to fetch cache statistics" });
      }
    },
  );

  server.post<{ Body: { tag?: string; key?: string } }>(
    "/invalidate",
    {
      schema: {
        tags: ["Cache"],
        summary: "Invalidate cache entries",
        description: "Evicts cache entries matching a specific key or all entries tagged with the given tag.",
        body: {
          type: "object",
          properties: {
            tag: { type: "string", description: "Invalidate all entries with this cache tag" },
            key: { type: "string", description: "Invalidate a single cache key" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: { $ref: "Error#" },
          500: { $ref: "Error#" },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { tag?: string; key?: string } }>, reply: FastifyReply) => {
      try {
        const { tag, key } = request.body;
        if (key) {
          await CacheService.invalidateKey(key);
        } else if (tag) {
          await CacheService.invalidateByTag(tag);
        } else {
          return reply.status(400).send({ success: false, error: "Provide either tag or key to invalidate" });
        }
        return reply.send({ success: true, message: "Invalidation successful" });
      } catch (error) {
        logger.error({ error }, "Failed to invalidate cache target");
        return reply.status(500).send({ success: false, error: "Failed to invalidate cache target" });
      }
    },
  );
}
