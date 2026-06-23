import type { FastifyInstance } from "fastify";
import { OperatorNotesService } from "../../services/operatorNotes.service.js";

export async function operatorNotesRoutes(server: FastifyInstance) {
  const notesService = new OperatorNotesService();

  // POST /api/v1/notes - Create a note
  server.post<{
    Body: {
      entityType: string;
      entityId: string;
      operatorAddress: string;
      content: string;
      category?: string;
      isInternal?: boolean;
    };
  }>("/", async (request, reply) => {
    const { entityType, entityId, operatorAddress, content, category, isInternal } =
      request.body;

    if (!entityType || !entityId || !operatorAddress || !content) {
      return reply.status(400).send({
        error: "Missing required fields: entityType, entityId, operatorAddress, content",
      });
    }

    const note = await notesService.createNote({
      entityType,
      entityId,
      operatorAddress,
      content,
      category,
      isInternal,
    });

    return reply.status(201).send({ note });
  });

  // GET /api/v1/notes/search?q=query
  server.get<{ Querystring: { q?: string; limit?: string } }>(
    "/search",
    async (request, reply) => {
      const { q, limit } = request.query;

      if (!q) {
        return reply.status(400).send({ error: "Query parameter 'q' is required" });
      }

      const maxResults = limit ? parseInt(limit, 10) : undefined;
      const notes = await notesService.searchNotes(q, maxResults);
      return { notes };
    }
  );

  // GET /api/v1/notes/:id
  server.get<{ Params: { id: string } }>(
    "/:id",
    async (request, reply) => {
      const note = await notesService.getNote(request.params.id);
      if (!note) {
        return reply.status(404).send({ error: "Note not found" });
      }
      return { note };
    }
  );

  // PATCH /api/v1/notes/:id
  server.patch<{
    Params: { id: string };
    Body: {
      operatorAddress: string;
      content?: string;
      category?: string;
      isInternal?: boolean;
    };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const { operatorAddress, ...updates } = request.body;

    if (!operatorAddress) {
      return reply.status(400).send({ error: "operatorAddress is required" });
    }

    const note = await notesService.updateNote(id, operatorAddress, updates);
    if (!note) {
      return reply.status(404).send({ error: "Note not found or not authorized" });
    }

    return { note };
  });

  // DELETE /api/v1/notes/:id
  server.delete<{
    Params: { id: string };
    Querystring: { operatorAddress: string };
  }>("/:id", async (request, reply) => {
    const { id } = request.params;
    const { operatorAddress } = request.query;

    if (!operatorAddress) {
      return reply.status(400).send({ error: "operatorAddress query param is required" });
    }

    const deleted = await notesService.deleteNote(id, operatorAddress);
    if (!deleted) {
      return reply.status(404).send({ error: "Note not found or not authorized" });
    }

    return { success: true };
  });

  // GET /api/v1/notes/entity/:entityType/:entityId
  server.get<{
    Params: { entityType: string; entityId: string };
  }>("/entity/:entityType/:entityId", async (request, reply) => {
    const { entityType, entityId } = request.params;
    const notes = await notesService.getNotesForEntity(entityType, entityId);
    return { notes };
  });

  // GET /api/v1/notes/operator/:operatorAddress
  server.get<{
    Params: { operatorAddress: string };
  }>("/operator/:operatorAddress", async (request, reply) => {
    const { operatorAddress } = request.params;
    const notes = await notesService.getNotesByOperator(operatorAddress);
    return { notes };
  });
}
