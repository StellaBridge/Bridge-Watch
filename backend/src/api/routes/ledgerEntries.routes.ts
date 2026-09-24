import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import {
  LedgerEntryUpstreamError,
  LedgerEntryValidationError,
  ledgerEntryService,
} from "../../services/ledgerEntry.service.js";
import { logger } from "../../utils/logger.js";
import { sendApiError } from "../utils/response.js";

// =============================================================================
// LEDGER ENTRY INSPECTION API (#1200)
// =============================================================================

const inspectBodySchema = z.object({
  keys: z.array(z.string().min(1).max(8192)).min(1).max(100),
  ledgerSeq: z.number().int().positive().optional(),
});

/**
 * Authenticated ledger-entry inspection.
 * Registered at prefix: /api/v1/ledger-entries
 *
 * - POST /inspect — decode/validate base64 XDR ledger keys, fetch via
 *   Soroban RPC getLedgerEntries, return typed entries + notFoundKeys.
 * - GET /latest — passthrough to Soroban RPC latest ledger (health pinning).
 */
export async function ledgerEntriesRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware();

  server.get(
    "/latest",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["Ledger Entries"],
        summary: "Get latest ledger from Soroban RPC",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    } as never,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const latest = await ledgerEntryService.getLatestLedger();
        return latest;
      } catch (error) {
        logger.error(error, "Failed to fetch latest ledger");
        return sendApiError(reply, 502, "Soroban RPC unavailable for latest ledger.");
      }
    }
  );

  server.post(
    "/inspect",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["Ledger Entries"],
        summary: "Inspect ledger entries by XDR keys",
        body: {
          type: "object",
          required: ["keys"],
          additionalProperties: false,
          properties: {
            keys: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { type: "string" },
            },
            ledgerSeq: { type: "integer", minimum: 1 },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    } as never,
    async (
      request: FastifyRequest<{ Body: z.infer<typeof inspectBodySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const body = inspectBodySchema.parse(request.body) as {
          keys: string[];
          ledgerSeq?: number;
        };
        const result = await ledgerEntryService.inspect(body);
        return result;
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendApiError(reply, 400, "Invalid inspection payload", {
            issues: error.errors,
          });
        }
        if (error instanceof LedgerEntryValidationError) {
          return sendApiError(reply, 400, error.message);
        }
        if (error instanceof LedgerEntryUpstreamError) {
          return sendApiError(reply, 502, "Soroban RPC getLedgerEntries failed.");
        }
        logger.error(error, "Failed to inspect ledger entries");
        return sendApiError(reply, 500, "Failed to inspect ledger entries.");
      }
    }
  );
}
