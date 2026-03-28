import type { FastifyInstance } from "fastify";
import { WatchlistsService } from "../../services/watchlists.service.js";

const userIdParamSchema = {
  type: "object",
  required: ["userId"],
  properties: {
    userId: { type: "string", minLength: 1 },
  },
} as const;

const watchlistIdParamSchema = {
  type: "object",
  required: ["userId", "id"],
  properties: {
    userId: { type: "string", minLength: 1 },
    id: { type: "string", format: "uuid" },
  },
} as const;

export async function watchlistsRoutes(server: FastifyInstance) {
  const watchlistsService = new WatchlistsService();

  server.get<{ Params: { userId: string } }>(
    "/:userId",
    {
      schema: {
        tags: ["Watchlists"],
        summary: "Get all watchlists for a user",
        params: userIdParamSchema,
        response: {
          200: {
            type: "object",
            properties: {
              watchlists: { type: "array", items: { $ref: "Watchlist#" } },
            },
          },
        },
      },
    },
    async (request) => {
      const { userId } = request.params;
      const watchlists = await watchlistsService.getWatchlists(userId);
      return { watchlists };
    },
  );

  server.post<{
    Params: { userId: string };
    Body: { name: string; isDefault?: boolean };
  }>(
    "/:userId",
    {
      schema: {
        tags: ["Watchlists"],
        summary: "Create a watchlist",
        params: userIdParamSchema,
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", example: "My favourites" },
            isDefault: { type: "boolean", default: false },
          },
        },
        response: {
          200: {
            type: "object",
            properties: { watchlist: { $ref: "Watchlist#" } },
          },
          400: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      const { name, isDefault } = request.body;

      if (!name) return reply.status(400).send({ error: "Name is required" });

      try {
        const watchlist = await watchlistsService.createWatchlist(userId, name, isDefault);
        return { watchlist };
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }
    },
  );

  server.delete<{ Params: { userId: string; id: string } }>(
    "/:userId/:id",
    {
      schema: {
        tags: ["Watchlists"],
        summary: "Delete a watchlist",
        params: watchlistIdParamSchema,
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" } },
          },
        },
      },
    },
    async (request, _reply) => {
      const { userId, id } = request.params;
      await watchlistsService.deleteWatchlist(userId, id);
      return { success: true };
    },
  );

  server.patch<{
    Params: { userId: string; id: string };
    Body: { name?: string; isDefault?: boolean; assets?: string[] };
  }>(
    "/:userId/:id",
    {
      schema: {
        tags: ["Watchlists"],
        summary: "Update a watchlist",
        params: watchlistIdParamSchema,
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            isDefault: { type: "boolean" },
            assets: { type: "array", items: { type: "string" } },
          },
        },
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" } },
          },
          400: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { userId, id } = request.params;
      const { name, isDefault, assets } = request.body;

      try {
        if (name !== undefined) {
          await watchlistsService.renameWatchlist(userId, id, name);
        }
        if (isDefault !== undefined && isDefault) {
          await watchlistsService.setWatchlistDefault(userId, id);
        }
        if (assets !== undefined) {
          await watchlistsService.updateWatchlistAssets(userId, id, assets);
        }
        return { success: true };
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }
    },
  );
}
