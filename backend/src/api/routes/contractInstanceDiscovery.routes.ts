import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import {
  ContractDiscoveryUpstreamError,
  ContractDiscoveryValidationError,
  contractInstanceDiscoveryService,
} from "../../services/contractInstanceDiscovery.service.js";
import { logger } from "../../utils/logger.js";
import { sendApiError } from "../utils/response.js";

// =============================================================================
// SOROBAN CONTRACT INSTANCE DISCOVERY (#1198)
// =============================================================================

const discoverBodySchema = z.object({
  contractIds: z.array(z.string().min(56).max(56)).min(1).max(50),
  ledgerSeq: z.number().int().positive().optional(),
});

const knownQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

/**
 * Authenticated Soroban contract instance discovery.
 * Registered at prefix: /api/v1/soroban-contracts
 *
 * - POST /discover — batch-probe contract instance entries via
 *   getLedgerEntries, persist last-seen state, return existence + metadata.
 * - GET /known — known contract IDs from local event index + env config.
 * - GET /:contractId — discover a single instance (404 when absent on-chain).
 */
export async function contractInstanceDiscoveryRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware();

  server.post(
    "/discover",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["Soroban Contracts"],
        summary: "Discover Soroban contract instances",
        body: {
          type: "object",
          required: ["contractIds"],
          additionalProperties: false,
          properties: {
            contractIds: { type: "array", minItems: 1, maxItems: 50, items: { type: "string" } },
            ledgerSeq: { type: "integer", minimum: 1 },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    } as never,
    async (
      request: FastifyRequest<{ Body: z.infer<typeof discoverBodySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const body = discoverBodySchema.parse(request.body) as {
          contractIds: string[];
          ledgerSeq?: number;
        };
        const result = await contractInstanceDiscoveryService.discover(body);
        return result;
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendApiError(reply, 400, "Invalid discovery payload", {
            issues: error.errors,
          });
        }
        if (error instanceof ContractDiscoveryValidationError) {
          return sendApiError(reply, 400, error.message);
        }
        if (error instanceof ContractDiscoveryUpstreamError) {
          return sendApiError(reply, 502, "Soroban RPC getLedgerEntries failed.");
        }
        logger.error(error, "Failed to discover contract instances");
        return sendApiError(reply, 500, "Failed to discover contract instances.");
      }
    }
  );

  server.get(
    "/known",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["Soroban Contracts"],
        summary: "List known Soroban contract IDs",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    } as never,
    async (
      request: FastifyRequest<{ Querystring: z.infer<typeof knownQuerySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const query = knownQuerySchema.parse(request.query);
        const contractIds = await contractInstanceDiscoveryService.listKnownContractIds(
          query.limit
        );
        return { contractIds };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendApiError(reply, 400, "Invalid query parameters", {
            issues: error.errors,
          });
        }
        logger.error(error, "Failed to list known contracts");
        return sendApiError(reply, 500, "Failed to list known contracts.");
      }
    }
  );

  server.get(
    "/:contractId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["Soroban Contracts"],
        summary: "Discover a single Soroban contract instance",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    } as never,
    async (request: FastifyRequest<{ Params: { contractId: string } }>, reply: FastifyReply) => {
      try {
        const result = await contractInstanceDiscoveryService.discover({
          contractIds: [request.params.contractId],
        });
        const instance = result.instances[0];
        if (!instance?.exists) {
          return sendApiError(reply, 404, "Contract instance not found on-chain.");
        }
        return { instance };
      } catch (error) {
        if (error instanceof ContractDiscoveryValidationError) {
          return sendApiError(reply, 400, error.message);
        }
        if (error instanceof ContractDiscoveryUpstreamError) {
          return sendApiError(reply, 502, "Soroban RPC getLedgerEntries failed.");
        }
        logger.error(error, "Failed to discover contract instance");
        return sendApiError(reply, 500, "Failed to discover contract instance.");
      }
    }
  );
}
