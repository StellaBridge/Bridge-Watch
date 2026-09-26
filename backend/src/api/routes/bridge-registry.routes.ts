import type { FastifyInstance } from "fastify";
import {
  BridgeRegistryService,
  OptimisticLockConflictError,
} from "../../services/bridge-registry.service.js";

const STATUSES = ["active", "inactive", "deprecated", "pending"] as const;

export async function bridgeRegistryRoutes(server: FastifyInstance) {
  const service = new BridgeRegistryService();

  server.get<{ Querystring: { status?: string; chain?: string } }>(
    "/",
    {
      schema: {
        tags: ["Bridge Registry"],
        summary: "List all bridge registry entries",
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: [...STATUSES], description: "Filter by status" },
            chain: { type: "string", description: "Filter by supported chain (e.g. ethereum)" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: { bridges: { type: "array", items: { type: "object", additionalProperties: true } } },
          },
        },
      },
    },
    async (request, _reply) => {
      const { status, chain } = request.query;
      const bridges = await service.getAll({
        status: status as any,
        chain,
      });
      return { bridges };
    }
  );

  server.get<{ Params: { bridgeId: string } }>(
    "/:bridgeId",
    {
      schema: {
        tags: ["Bridge Registry"],
        summary: "Get a bridge registry entry by ID",
        params: {
          type: "object",
          properties: { bridgeId: { type: "string", example: "circle" } },
          required: ["bridgeId"],
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const entry = await service.getById(request.params.bridgeId);
      if (!entry) {
        return reply.status(404).send({ error: "Bridge not found in registry" });
      }
      return entry;
    }
  );

  server.post<{ Body: Record<string, unknown> }>(
    "/",
    {
      schema: {
        tags: ["Bridge Registry"],
        summary: "Register a new bridge",
        body: {
          type: "object",
          required: ["bridge_id", "name", "display_name", "supported_chains"],
          properties: {
            bridge_id: { type: "string", example: "allbridge" },
            name: { type: "string", example: "allbridge" },
            display_name: { type: "string", example: "Allbridge" },
            supported_chains: { type: "array", items: { type: "string" }, example: ["ethereum", "stellar"] },
            owner_name: { type: "string" },
            owner_contact: { type: "string" },
            owner_url: { type: "string" },
            status: { type: "string", enum: [...STATUSES] },
            validation_rules: { type: "object", additionalProperties: true },
            description: { type: "string" },
            homepage_url: { type: "string" },
            documentation_url: { type: "string" },
          },
        },
        response: {
          201: { type: "object", additionalProperties: true },
          409: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const entry = await service.create(request.body as any);
        return reply.status(201).send(entry);
      } catch (err: any) {
        if (err?.message?.includes("already registered")) {
          return reply.status(409).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  server.patch<{ Params: { bridgeId: string }; Body: Record<string, unknown> }>(
    "/:bridgeId",
    {
      schema: {
        tags: ["Bridge Registry"],
        summary: "Update a bridge registry entry",
        params: {
          type: "object",
          properties: { bridgeId: { type: "string" } },
          required: ["bridgeId"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            display_name: { type: "string" },
            supported_chains: { type: "array", items: { type: "string" } },
            owner_name: { type: "string" },
            owner_contact: { type: "string" },
            owner_url: { type: "string" },
            status: { type: "string", enum: [...STATUSES] },
            manual_override: { type: "boolean" },
            override_reason: { type: "string" },
            validation_rules: { type: "object", additionalProperties: true },
            description: { type: "string" },
            homepage_url: { type: "string" },
            documentation_url: { type: "string" },
            changed_by: { type: "string" },
            change_reason: { type: "string" },
            version: {
              type: "integer",
              minimum: 1,
              description: "Revision read from GET; when supplied, the update applies only if the row still carries it",
            },
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: { $ref: "Error#" },
          409: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { version, ...input } = request.body as Record<string, unknown>;
      try {
        const updated = await service.update(
          request.params.bridgeId,
          input as any,
          typeof version === "number" ? version : undefined
        );
        if (!updated) {
          return reply.status(404).send({ error: "Bridge not found in registry" });
        }
        return updated;
      } catch (err) {
        if (err instanceof OptimisticLockConflictError) {
          return reply.status(409).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  server.delete<{ Params: { bridgeId: string } }>(
    "/:bridgeId",
    {
      schema: {
        tags: ["Bridge Registry"],
        summary: "Remove a bridge from the registry",
        params: {
          type: "object",
          properties: { bridgeId: { type: "string" } },
          required: ["bridgeId"],
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" } } },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const deleted = await service.delete(request.params.bridgeId);
      if (!deleted) {
        return reply.status(404).send({ error: "Bridge not found in registry" });
      }
      return { success: true };
    }
  );

  server.get<{ Params: { bridgeId: string }; Querystring: { limit?: string } }>(
    "/:bridgeId/history",
    {
      schema: {
        tags: ["Bridge Registry"],
        summary: "Get change history for a bridge registry entry",
        params: {
          type: "object",
          properties: { bridgeId: { type: "string" } },
          required: ["bridgeId"],
        },
        querystring: {
          type: "object",
          properties: { limit: { type: "string", default: "50" } },
        },
        response: {
          200: {
            type: "object",
            properties: { history: { type: "array", items: { type: "object", additionalProperties: true } } },
          },
        },
      },
    },
    async (request, _reply) => {
      const limit = Math.min(Number(request.query.limit ?? 50), 200);
      const history = await service.getHistory(request.params.bridgeId, limit);
      return { history };
    }
  );

  server.post<{ Params: { bridgeId: string }; Body: { override: boolean; reason: string; changed_by?: string } }>(
    "/:bridgeId/override",
    {
      schema: {
        tags: ["Bridge Registry"],
        summary: "Set or clear a manual override on a bridge registry entry",
        params: {
          type: "object",
          properties: { bridgeId: { type: "string" } },
          required: ["bridgeId"],
        },
        body: {
          type: "object",
          required: ["override", "reason"],
          properties: {
            override: { type: "boolean" },
            reason: { type: "string" },
            changed_by: { type: "string" },
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { override, reason, changed_by } = request.body;
      const updated = await service.setManualOverride(
        request.params.bridgeId,
        override,
        reason,
        changed_by
      );
      if (!updated) {
        return reply.status(404).send({ error: "Bridge not found in registry" });
      }
      return updated;
    }
  );
}
