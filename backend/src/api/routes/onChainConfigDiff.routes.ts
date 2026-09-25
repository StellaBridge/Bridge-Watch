import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../api/middleware/auth.js";
import { OnChainConfigDiffService } from "../../services/onChainConfigDiff.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Routes for on-chain configuration diffing.
 * Issue: #1202
 *
 * All endpoints require the admin:on-chain-config scope.
 * Registered at prefix: /api/v1/admin/on-chain-config-diff
 *
 * Endpoints:
 *   POST   /snapshots                         Capture a new config snapshot
 *   GET    /snapshots/:id                     Get snapshot by ID
 *   GET    /contracts/:contractId/snapshots   List snapshots for a contract
 *   POST   /diffs                             Compute (or retrieve cached) diff
 *   GET    /diffs/:id                         Get a diff by ID
 *   GET    /contracts/:contractId/diffs       List diffs for a contract
 */
export async function onChainConfigDiffRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({
    requiredScopes: ["admin:on-chain-config"],
  });
  const service = OnChainConfigDiffService.getInstance();

  // ---------------------------------------------------------------------------
  // POST /snapshots — capture a new on-chain config snapshot
  // ---------------------------------------------------------------------------
  server.post<{
    Body: {
      contractId?: unknown;
      network?: unknown;
      ledgerSequence?: unknown;
      config?: unknown;
    };
  }>(
    "/snapshots",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { contractId, network, ledgerSequence, config } = request.body ?? {};

      if (!contractId || typeof contractId !== "string" || !contractId.trim()) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "contractId is required and must be a non-empty string.",
        });
      }
      if (!network || typeof network !== "string" || !network.trim()) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "network is required and must be a non-empty string.",
        });
      }
      const seq = Number(ledgerSequence);
      if (!Number.isInteger(seq) || seq < 1) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "ledgerSequence must be a positive integer.",
        });
      }
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "config must be a JSON object.",
        });
      }

      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const snapshot = await service.captureSnapshot(
          contractId.trim(),
          network.trim(),
          seq,
          config as Record<string, unknown>,
          actor
        );
        return reply.code(201).send({ snapshot });
      } catch (err) {
        logger.error({ err, contractId }, "Failed to capture on-chain config snapshot");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to capture snapshot.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /snapshots/:id — get snapshot by ID
  // ---------------------------------------------------------------------------
  server.get<{ Params: { id: string } }>(
    "/snapshots/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const snapshot = await service.getSnapshot(id);
        if (!snapshot) {
          return reply.code(404).send({
            error: "Not Found",
            message: `Snapshot not found: ${id}.`,
          });
        }
        return reply.code(200).send({ snapshot });
      } catch (err) {
        logger.error({ err, id }, "Failed to get on-chain config snapshot");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve snapshot.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /contracts/:contractId/snapshots — list snapshots for a contract
  // ---------------------------------------------------------------------------
  server.get<{
    Params: { contractId: string };
    Querystring: { network?: string; limit?: string };
  }>(
    "/contracts/:contractId/snapshots",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { contractId } = request.params;
      const { network, limit: limitStr } = request.query;

      if (!network || !network.trim()) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "network query parameter is required.",
        });
      }

      const limit = limitStr ? parseInt(limitStr, 10) : 50;
      if (isNaN(limit) || limit < 1) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "limit must be a positive integer.",
        });
      }

      try {
        const snapshots = await service.listSnapshots(
          contractId,
          network.trim(),
          limit
        );
        return reply.code(200).send({ snapshots, contractId, network });
      } catch (err) {
        logger.error({ err, contractId }, "Failed to list on-chain config snapshots");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to list snapshots.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /diffs — compute (or retrieve cached) diff between two snapshots
  // ---------------------------------------------------------------------------
  server.post<{
    Body: {
      fromSnapshotId?: unknown;
      toSnapshotId?: unknown;
    };
  }>(
    "/diffs",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { fromSnapshotId, toSnapshotId } = request.body ?? {};

      if (!fromSnapshotId || typeof fromSnapshotId !== "string") {
        return reply.code(400).send({
          error: "Bad Request",
          message: "fromSnapshotId is required and must be a string.",
        });
      }
      if (!toSnapshotId || typeof toSnapshotId !== "string") {
        return reply.code(400).send({
          error: "Bad Request",
          message: "toSnapshotId is required and must be a string.",
        });
      }
      if (fromSnapshotId === toSnapshotId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "fromSnapshotId and toSnapshotId must be different.",
        });
      }

      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const diff = await service.computeDiff(fromSnapshotId, toSnapshotId, actor);
        return reply.code(201).send({ diff });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to compute diff.";
        const isNotFound = message.includes("not found");
        const isBadInput =
          message.includes("different contracts") ||
          message.includes("different networks") ||
          message.includes("same ledger") ||
          message.includes("must be different");
        return reply
          .code(isNotFound ? 404 : isBadInput ? 400 : 500)
          .send({
            error: isNotFound
              ? "Not Found"
              : isBadInput
              ? "Bad Request"
              : "Internal Server Error",
            message,
          });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /diffs/:id — get a diff by ID
  // ---------------------------------------------------------------------------
  server.get<{ Params: { id: string } }>(
    "/diffs/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const diff = await service.getDiff(id);
        if (!diff) {
          return reply.code(404).send({
            error: "Not Found",
            message: `Diff not found: ${id}.`,
          });
        }
        return reply.code(200).send({ diff });
      } catch (err) {
        logger.error({ err, id }, "Failed to get on-chain config diff");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve diff.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /contracts/:contractId/diffs — list diffs for a contract
  // ---------------------------------------------------------------------------
  server.get<{
    Params: { contractId: string };
    Querystring: { limit?: string };
  }>(
    "/contracts/:contractId/diffs",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { contractId } = request.params;
      const limit = request.query.limit
        ? parseInt(request.query.limit, 10)
        : 50;

      if (isNaN(limit) || limit < 1) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "limit must be a positive integer.",
        });
      }

      try {
        const diffs = await service.listDiffs(contractId, limit);
        return reply.code(200).send({ diffs, contractId });
      } catch (err) {
        logger.error({ err, contractId }, "Failed to list on-chain config diffs");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to list diffs.",
        });
      }
    }
  );
}
