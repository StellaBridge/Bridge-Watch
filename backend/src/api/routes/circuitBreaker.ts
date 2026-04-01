import { FastifyInstance } from "fastify";
import { getCircuitBreakerService, PauseScope } from "../../services/circuitBreaker.service.js";
import { logger } from "../../utils/logger.js";

export async function circuitBreakerRoutes(fastify: FastifyInstance) {
  const circuitBreaker = getCircuitBreakerService();
  if (!circuitBreaker) {
    logger.warn("Circuit breaker service not configured, routes disabled");
    return;
  }

  fastify.get(
    "/status",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Check circuit-breaker pause status",
        description: "Returns whether the specified scope (global, bridge, or asset) is currently paused.",
        querystring: {
          type: "object",
          required: ["scope"],
          properties: {
            scope: {
              type: "string",
              enum: ["global", "bridge", "asset"],
              description: "Pause scope",
            },
            identifier: {
              type: "string",
              description: "Required for bridge and asset scopes",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              paused: { type: "boolean" },
              scope: { type: "string" },
              identifier: { type: "string", nullable: true },
            },
          },
          400: { $ref: "Error#" },
          500: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const { scope, identifier } = request.query as { scope?: string; identifier?: string };
        let pauseScope: PauseScope;
        switch (scope) {
          case "global":
            pauseScope = PauseScope.Global;
            break;
          case "bridge":
            if (!identifier) {
              return reply.code(400).send({ error: "identifier required for bridge scope" });
            }
            pauseScope = PauseScope.Bridge;
            break;
          case "asset":
            if (!identifier) {
              return reply.code(400).send({ error: "identifier required for asset scope" });
            }
            pauseScope = PauseScope.Asset;
            break;
          default:
            return reply.code(400).send({ error: "invalid scope" });
        }
        const isPaused = await circuitBreaker.isPaused(pauseScope, identifier);
        return { paused: isPaused, scope, identifier };
      } catch (error) {
        logger.error({ err: error }, "Circuit breaker status check failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );

  fastify.get(
    "/whitelist",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Check whitelist status",
        querystring: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string", enum: ["address", "asset"] },
            address: { type: "string" },
            asset: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              whitelisted: { type: "boolean" },
              type: { type: "string" },
              address: { type: "string", nullable: true },
              asset: { type: "string", nullable: true },
            },
          },
          400: { $ref: "Error#" },
          500: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const { type, address, asset } = request.query as {
          type?: string;
          address?: string;
          asset?: string;
        };
        if (type === "address" && address) {
          const isWhitelisted = await circuitBreaker.isWhitelistedAddress(address);
          return { whitelisted: isWhitelisted, type: "address", address };
        }
        if (type === "asset" && asset) {
          const isWhitelisted = await circuitBreaker.isWhitelistedAsset(asset);
          return { whitelisted: isWhitelisted, type: "asset", asset };
        }
        return reply.code(400).send({ error: "invalid whitelist query" });
      } catch (error) {
        logger.error({ err: error }, "Whitelist check failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );

  fastify.post(
    "/pause",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Pause a scope (requires guardian auth — not yet implemented)",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["scope", "reason"],
          properties: {
            scope: { type: "string", enum: ["global", "bridge", "asset"] },
            identifier: { type: "string" },
            reason: { type: "string" },
          },
        },
        response: {          500: { $ref: "Error#" },          501: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const { scope, identifier, reason } = request.body as {
          scope: string;
          identifier?: string;
          reason: string;
        };
        logger.info({ scope, identifier, reason }, "Pause operation requested");
        return reply.code(501).send({ error: "Not implemented - requires guardian authentication" });
      } catch (error) {
        logger.error({ err: error }, "Pause operation failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );

  fastify.post(
    "/recovery",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Recover from a pause (requires guardian auth — not yet implemented)",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["pauseId"],
          properties: { pauseId: { type: "integer" } },
        },
        response: {
          500: { $ref: "Error#" },
          501: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const { pauseId } = request.body as { pauseId: number };
        logger.info({ pauseId }, "Recovery operation requested");
        return reply.code(501).send({ error: "Not implemented - requires guardian authentication" });
      } catch (error) {
        logger.error({ err: error }, "Recovery operation failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );
}
