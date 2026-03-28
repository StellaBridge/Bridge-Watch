import type { FastifyInstance } from "fastify";
import {
  bulkPreferenceUpdateSchema,
  categorySchema,
  importPreferencesSchema,
  singlePreferenceUpdateSchema,
} from "../../services/preferences.validation.js";
import { PreferencesService } from "../../services/preferences.service.js";

const userIdParamSchema = {
  type: "object",
  required: ["userId"],
  properties: {
    userId: { type: "string", minLength: 1 },
  },
} as const;

const preferencesResponse = {
  type: "object",
  properties: {
    preferences: { type: "object", additionalProperties: true },
  },
};

export async function preferencesRoutes(server: FastifyInstance) {
  const preferencesService = new PreferencesService();

  server.get<{ Params: { userId: string } }>(
    "/:userId",
    {
      schema: {
        tags: ["Preferences"],
        summary: "Get all preferences for a user",
        params: userIdParamSchema,
        response: { 200: preferencesResponse },
      },
    },
    async (request) => {
      const { userId } = request.params;
      const preferences = await preferencesService.getPreferences(userId);
      return { preferences };
    },
  );

  server.get<{ Params: { userId: string; category: string; key: string } }>(
    "/:userId/:category/:key",
    {
      schema: {
        tags: ["Preferences"],
        summary: "Get a single preference value",
        params: {
          type: "object",
          required: ["userId", "category", "key"],
          properties: {
            userId: { type: "string" },
            category: { type: "string", description: "Preference category (notifications, display, alerts)" },
            key: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              category: { type: "string" },
              key: { type: "string" },
              value: { additionalProperties: true },
            },
          },
          400: { $ref: "Error#" },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { userId, category, key } = request.params;
      const parsedCategory = categorySchema.safeParse(category);
      if (!parsedCategory.success) {
        return reply.status(400).send({ error: "Invalid preference category" });
      }
      try {
        const value = await preferencesService.getPreference(userId, parsedCategory.data, key);
        if (value === null) {
          return reply.status(404).send({ error: "Preference key not found" });
        }
        return { category: parsedCategory.data, key, value };
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }
    },
  );

  server.put<{
    Params: { userId: string; category: string; key: string };
    Body: { value: unknown };
  }>(
    "/:userId/:category/:key",
    {
      schema: {
        tags: ["Preferences"],
        summary: "Set a single preference value",
        params: {
          type: "object",
          required: ["userId", "category", "key"],
          properties: {
            userId: { type: "string" },
            category: { type: "string" },
            key: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["value"],
          properties: { value: { additionalProperties: true } },
        },
        response: { 200: preferencesResponse, 400: { $ref: "Error#" } },
      },
    },
    async (request, reply) => {
      const { userId, category, key } = request.params;
      const categoryResult = categorySchema.safeParse(category);
      const bodyResult = singlePreferenceUpdateSchema.safeParse(request.body);

      if (!categoryResult.success) {
        return reply.status(400).send({ error: "Invalid preference category" });
      }
      if (!bodyResult.success) {
        return reply.status(400).send({ error: bodyResult.error.flatten() });
      }
      try {
        const preferences = await preferencesService.setPreference(
          userId, categoryResult.data, key, bodyResult.data.value,
        );
        return { preferences };
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }
    },
  );

  server.patch<{
    Params: { userId: string };
    Body: { expectedVersion?: number; updates: Record<string, Record<string, unknown>> };
  }>(
    "/:userId/bulk",
    {
      schema: {
        tags: ["Preferences"],
        summary: "Bulk update preferences",
        description: "Optimistically-locked bulk update. Supply `expectedVersion` to detect conflicts.",
        params: userIdParamSchema,
        body: {
          type: "object",
          required: ["updates"],
          properties: {
            expectedVersion: { type: "integer" },
            updates: { type: "object", additionalProperties: true },
          },
        },
        response: {
          200: preferencesResponse,
          400: { $ref: "Error#" },
          409: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const bodyResult = bulkPreferenceUpdateSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.status(400).send({ error: bodyResult.error.flatten() });
      }
      try {
        const preferences = await preferencesService.bulkUpdatePreferences(
          request.params.userId,
          bodyResult.data.updates,
          bodyResult.data.expectedVersion,
        );
        return { preferences };
      } catch (error) {
        const message = (error as Error).message;
        if (message.startsWith("Version conflict")) {
          return reply.status(409).send({ error: message });
        }
        return reply.status(400).send({ error: message });
      }
    },
  );

  server.delete<{ Params: { userId: string; category: string; key: string } }>(
    "/:userId/:category/:key",
    {
      schema: {
        tags: ["Preferences"],
        summary: "Reset (delete) a preference key",
        params: {
          type: "object",
          required: ["userId", "category", "key"],
          properties: {
            userId: { type: "string" },
            category: { type: "string" },
            key: { type: "string" },
          },
        },
        response: { 200: preferencesResponse, 400: { $ref: "Error#" } },
      },
    },
    async (request, reply) => {
      const { userId, category, key } = request.params;
      const categoryResult = categorySchema.safeParse(category);
      if (!categoryResult.success) {
        return reply.status(400).send({ error: "Invalid preference category" });
      }
      try {
        const preferences = await preferencesService.resetPreference(
          userId, categoryResult.data, key,
        );
        return { preferences };
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }
    },
  );

  server.get<{ Params: { userId: string } }>(
    "/:userId/export",
    {
      schema: {
        tags: ["Preferences"],
        summary: "Export user preferences",
        params: userIdParamSchema,
        response: {
          200: {
            type: "object",
            properties: { data: { type: "object", additionalProperties: true } },
          },
        },
      },
    },
    async (request) => {
      const payload = await preferencesService.exportPreferences(request.params.userId);
      return { data: payload };
    },
  );

  server.post<{
    Params: { userId: string };
    Body: { overwrite?: boolean; data: { schemaVersion: number; categories: Record<string, Record<string, unknown>> } };
  }>(
    "/:userId/import",
    {
      schema: {
        tags: ["Preferences"],
        summary: "Import user preferences",
        params: userIdParamSchema,
        body: {
          type: "object",
          required: ["data"],
          properties: {
            overwrite: { type: "boolean", default: false },
            data: {
              type: "object",
              required: ["schemaVersion", "categories"],
              properties: {
                schemaVersion: { type: "integer" },
                categories: { type: "object", additionalProperties: true },
              },
            },
          },
        },
        response: { 200: preferencesResponse, 400: { $ref: "Error#" } },
      },
    },
    async (request, reply) => {
      const payloadResult = importPreferencesSchema.safeParse(request.body);
      if (!payloadResult.success) {
        return reply.status(400).send({ error: payloadResult.error.flatten() });
      }
      try {
        const preferences = await preferencesService.importPreferences(
          request.params.userId,
          { schemaVersion: payloadResult.data.data.schemaVersion, categories: payloadResult.data.data.categories },
          payloadResult.data.overwrite,
        );
        return { preferences };
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }
    },
  );

  server.get<{ Params: { userId: string } }>(
    "/:userId/stream",
    {
      schema: {
        tags: ["Preferences"],
        summary: "Stream preference change events (SSE)",
        description: "Opens a Server-Sent Events stream that pushes `preferencesUpdated` events whenever the user's preferences change.",
        params: userIdParamSchema,
        produces: ["text/event-stream"],
        response: {
          200: { type: "string", description: "SSE stream" },
        },
      },
    },
    async (request, reply) => {
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      const send = (eventName: string, payload: unknown) => {
        reply.raw.write(`event: ${eventName}\n`);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      send("connected", { userId: request.params.userId, time: new Date().toISOString() });

      const unsubscribe = preferencesService.onPreferencesUpdated((event) => {
        if (event.userId !== request.params.userId) return;
        send("preferencesUpdated", event);
      });

      request.raw.on("close", () => { unsubscribe(); });
      return reply;
    },
  );
}
