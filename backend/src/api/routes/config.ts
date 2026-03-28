import type { FastifyInstance } from "fastify";
import { configService, ConfigValue } from "../../services/config.service";

export async function configRoutes(server: FastifyInstance) {
  server.get(
    "/",
    {
      schema: {
        tags: ["Config"],
        summary: "List all configuration entries",
        response: {
          200: {
            type: "object",
            properties: {
              configs: { type: "array", items: { type: "object", additionalProperties: true } },
              total: { type: "integer" },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const configs = await configService.getAll();
      return { configs, total: configs.length };
    },
  );

  server.get<{ Params: { key: string } }>(
    "/:key",
    {
      schema: {
        tags: ["Config"],
        summary: "Get a configuration value",
        params: {
          type: "object",
          properties: { key: { type: "string", example: "feature.analytics" } },
          required: ["key"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              key: { type: "string" },
              value: { additionalProperties: true },
            },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const value = await configService.get(key);
      if (value === undefined) {
        return reply.code(404).send({ error: "Configuration not found" });
      }
      return { key, value };
    },
  );

  server.post<{
    Body: {
      key: string;
      value: string | number | boolean | unknown[] | Record<string, unknown>;
      environment?: string;
      isSensitive?: boolean;
      createdBy: string;
    };
  }>(
    "/",
    {
      schema: {
        tags: ["Config"],
        summary: "Set a configuration value",
        body: {
          type: "object",
          required: ["key", "value", "createdBy"],
          properties: {
            key: { type: "string" },
            value: { additionalProperties: true },
            environment: { type: "string" },
            isSensitive: { type: "boolean" },
            createdBy: { type: "string" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { key, value, environment, isSensitive, createdBy } = request.body;
      await configService.set(key, value as ConfigValue, { environment, isSensitive, createdBy });
      return reply.code(201).send({ message: "Configuration set successfully" });
    },
  );

  server.delete<{
    Params: { key: string };
    Body: { deletedBy: string };
  }>(
    "/:key",
    {
      schema: {
        tags: ["Config"],
        summary: "Delete a configuration entry",
        params: {
          type: "object",
          properties: { key: { type: "string" } },
          required: ["key"],
        },
        body: {
          type: "object",
          required: ["deletedBy"],
          properties: { deletedBy: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const { deletedBy } = request.body;
      await configService.delete(key, deletedBy);
      return reply.code(200).send({ message: "Configuration deleted successfully" });
    },
  );

  server.get<{ Params: { name: string } }>(
    "/features/:name",
    {
      schema: {
        tags: ["Config"],
        summary: "Check a feature flag",
        params: {
          type: "object",
          properties: { name: { type: "string", example: "analytics" } },
          required: ["name"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              name: { type: "string" },
              enabled: { type: "boolean" },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { name } = request.params;
      const enabled = await configService.isFeatureEnabled(name);
      return { name, enabled };
    },
  );

  server.post<{
    Body: {
      name: string;
      enabled: boolean;
      environment?: string;
      rolloutPercentage?: number;
      conditions?: Record<string, unknown>;
    };
  }>(
    "/features",
    {
      schema: {
        tags: ["Config"],
        summary: "Set a feature flag",
        body: {
          type: "object",
          required: ["name", "enabled"],
          properties: {
            name: { type: "string" },
            enabled: { type: "boolean" },
            environment: { type: "string" },
            rolloutPercentage: { type: "number", minimum: 0, maximum: 100 },
            conditions: { type: "object", additionalProperties: true },
          },
        },
        response: {
          201: {
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, enabled, environment, rolloutPercentage, conditions } = request.body;
      await configService.setFeatureFlag(name, enabled, { environment, rolloutPercentage, conditions });
      return reply.code(201).send({ message: "Feature flag set successfully" });
    },
  );

  server.get<{ Querystring: { environment?: string } }>(
    "/export",
    {
      schema: {
        tags: ["Config"],
        summary: "Export configuration",
        querystring: {
          type: "object",
          properties: { environment: { type: "string" } },
        },
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (request, _reply) => {
      const { environment } = request.query;
      const exported = await configService.exportConfig(environment);
      return exported;
    },
  );

  server.post<{
    Body: { configs: Record<string, ConfigValue>; importedBy: string; environment?: string };
  }>(
    "/import",
    {
      schema: {
        tags: ["Config"],
        summary: "Import configuration",
        body: {
          type: "object",
          required: ["configs", "importedBy"],
          properties: {
            configs: { type: "object", additionalProperties: true },
            importedBy: { type: "string" },
            environment: { type: "string" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      const { configs, importedBy, environment } = request.body;
      await configService.importConfig(configs, importedBy, environment);
      return reply.code(201).send({ message: "Configuration imported successfully" });
    },
  );

  server.get<{ Querystring: { key?: string; limit?: number } }>(
    "/audit",
    {
      schema: {
        tags: ["Config"],
        summary: "Get configuration audit trail",
        querystring: {
          type: "object",
          properties: {
            key: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 500 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              trail: { type: "array", items: { type: "object", additionalProperties: true } },
              total: { type: "integer" },
            },
          },
        },
      },
    },
    async (request, _reply) => {
      const { key, limit } = request.query;
      const trail = await configService.getAuditTrail(key, limit);
      return { trail, total: trail.length };
    },
  );

  server.post(
    "/cache/clear",
    {
      schema: {
        tags: ["Config"],
        summary: "Clear configuration cache",
        response: {
          200: {
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    async (_request, reply) => {
      configService.clearCache();
      return reply.code(200).send({ message: "Cache cleared successfully" });
    },
  );
}
