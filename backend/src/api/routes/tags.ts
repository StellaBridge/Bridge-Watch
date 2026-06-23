import type { FastifyInstance } from "fastify";
import { TagSyncService } from "../../services/tagSync.service.js";

export async function tagsRoutes(server: FastifyInstance) {
  const tagService = new TagSyncService();

  // GET /api/v1/tags - All unique tags with counts
  server.get("/", async (_request, reply) => {
    const tags = await tagService.getAllTags();
    return { tags };
  });

  // POST /api/v1/tags - Add a tag to an entity
  server.post<{
    Body: {
      entityType: string;
      entityId: string;
      tag: string;
      source?: string;
    };
  }>("/", async (request, reply) => {
    const { entityType, entityId, tag, source } = request.body;

    if (!entityType || !entityId || !tag) {
      return reply.status(400).send({
        error: "Missing required fields: entityType, entityId, tag",
      });
    }

    try {
      const created = await tagService.addTag(entityType, entityId, tag, source);
      return reply.status(201).send({ tag: created });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  // DELETE /api/v1/tags - Remove a tag from an entity
  server.delete<{
    Body: {
      entityType: string;
      entityId: string;
      tag: string;
      source?: string;
    };
  }>("/", async (request, reply) => {
    const { entityType, entityId, tag, source } = request.body;

    if (!entityType || !entityId || !tag) {
      return reply.status(400).send({
        error: "Missing required fields: entityType, entityId, tag",
      });
    }

    try {
      const removed = await tagService.removeTag(entityType, entityId, tag, source);
      return { success: removed };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  // PUT /api/v1/tags/sync - Full sync of tags for an entity
  server.put<{
    Body: {
      entityType: string;
      entityId: string;
      tags: string[];
      source?: string;
    };
  }>("/sync", async (request, reply) => {
    const { entityType, entityId, tags, source } = request.body;

    if (!entityType || !entityId || !Array.isArray(tags)) {
      return reply.status(400).send({
        error: "Missing required fields: entityType, entityId, tags (array)",
      });
    }

    try {
      const result = await tagService.syncEntityTags(
        entityType,
        entityId,
        tags,
        source
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  // POST /api/v1/tags/propagate - Propagate a tag to multiple entities
  server.post<{
    Body: {
      tag: string;
      entityType: string;
      entityIds: string[];
      source?: string;
    };
  }>("/propagate", async (request, reply) => {
    const { tag, entityType, entityIds, source } = request.body;

    if (!tag || !entityType || !Array.isArray(entityIds)) {
      return reply.status(400).send({
        error: "Missing required fields: tag, entityType, entityIds (array)",
      });
    }

    try {
      const result = await tagService.propagateTag(
        tag,
        entityType,
        entityIds,
        source
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  // GET /api/v1/tags/find?tag=xyz&type=asset - Find entities by tag
  server.get<{
    Querystring: { tag?: string; type?: string };
  }>("/find", async (request, reply) => {
    const { tag, type } = request.query;

    if (!tag) {
      return reply.status(400).send({ error: "Query parameter 'tag' is required" });
    }

    const entities = await tagService.findEntitiesByTag(tag, type);
    return { entities };
  });

  // GET /api/v1/tags/:entityType/:entityId - Tags for a specific entity
  server.get<{
    Params: { entityType: string; entityId: string };
  }>("/:entityType/:entityId", async (request, reply) => {
    const { entityType, entityId } = request.params;

    try {
      const tags = await tagService.getTagsForEntity(entityType, entityId);
      return { tags };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  // GET /api/v1/tags/:entityType/:entityId/audit - Audit log for entity tags
  server.get<{
    Params: { entityType: string; entityId: string };
    Querystring: { limit?: string };
  }>("/:entityType/:entityId/audit", async (request, reply) => {
    const { entityType, entityId } = request.params;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : undefined;

    try {
      const auditLog = await tagService.getAuditLog(entityType, entityId, limit);
      return { auditLog };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
