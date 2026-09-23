import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { ConfigVersionService } from "../../services/configVersion.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Admin routes for config version history and rollback preview.
 * Issue: #1061
 *
 * All endpoints require admin:config-versions scope.
 *
 * Registered at prefix: /api/v1/admin/config-versions
 *
 * Integration with change approval (#1060):
 * If REQUIRE_APPROVAL_FOR_ROLLBACK=true (env var, default false), the
 * rollback endpoint requires a body field `changeRequestId` referencing an
 * approved change request from the change_requests table.
 */
export async function configVersionsRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:config-versions"] });
  const service = ConfigVersionService.getInstance();

  const requireApproval =
    process.env.REQUIRE_APPROVAL_FOR_ROLLBACK === "true";

  // ---------------------------------------------------------------------------
  // POST /:configKey  — create the initial (or a new) version for a config key
  // ---------------------------------------------------------------------------
  server.post<{
    Params: { configKey: string };
    Body: {
      payload?: unknown;
      changeSummary?: unknown;
    };
  }>(
    "/:configKey",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { configKey } = request.params;
      const { payload, changeSummary } = request.body ?? {};

      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload)
      ) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "payload must be a JSON object.",
        });
      }

      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const version = await service.createVersion(
          configKey,
          payload as Record<string, unknown>,
          actor,
          typeof changeSummary === "string" ? changeSummary : undefined
        );
        return reply.code(201).send({ version });
      } catch (err) {
        logger.error({ err, configKey }, "Failed to create config version");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to create config version.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /:configKey  — list version history (newest first)
  // ---------------------------------------------------------------------------
  server.get<{
    Params: { configKey: string };
    Querystring: { limit?: string };
  }>(
    "/:configKey",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { configKey } = request.params;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;

      try {
        const versions = await service.getVersionHistory(configKey, limit);
        return reply.code(200).send({ versions, configKey });
      } catch (err) {
        logger.error({ err, configKey }, "Failed to get config version history");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve config version history.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /:configKey/current  — get the current version
  // ---------------------------------------------------------------------------
  server.get<{ Params: { configKey: string } }>(
    "/:configKey/current",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { configKey } = request.params;

      try {
        const version = await service.getCurrentVersion(configKey);
        if (!version) {
          return reply.code(404).send({
            error: "Not Found",
            message: `No current version found for config key: ${configKey}.`,
          });
        }
        return reply.code(200).send({ version });
      } catch (err) {
        logger.error({ err, configKey }, "Failed to get current config version");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve current config version.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /:configKey/diff/:fromVersion/:toVersion — diff any two versions (#1189)
  // ---------------------------------------------------------------------------
  server.get<{
    Params: { configKey: string; fromVersion: string; toVersion: string };
  }>(
    "/:configKey/diff/:fromVersion/:toVersion",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { configKey, fromVersion, toVersion } = request.params;
      const fromVersionNumber = parseInt(fromVersion, 10);
      const toVersionNumber = parseInt(toVersion, 10);

      if (
        isNaN(fromVersionNumber) ||
        fromVersionNumber < 1 ||
        isNaN(toVersionNumber) ||
        toVersionNumber < 1
      ) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "fromVersion and toVersion must be positive integers.",
        });
      }

      try {
        const comparison = await service.compareVersions(
          configKey,
          fromVersionNumber,
          toVersionNumber
        );
        return reply.code(200).send(comparison);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to compute version diff.";
        const isNotFound = message.includes("not found");
        const isSameVersion = message.includes("identical");
        return reply
          .code(isNotFound ? 404 : isSameVersion ? 400 : 500)
          .send({
            error: isNotFound
              ? "Not Found"
              : isSameVersion
              ? "Bad Request"
              : "Internal Server Error",
            message,
          });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /:configKey/rollback-preview/:targetVersion  — preview diff without applying
  // ---------------------------------------------------------------------------
  server.get<{
    Params: { configKey: string; targetVersion: string };
  }>(
    "/:configKey/rollback-preview/:targetVersion",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { configKey, targetVersion } = request.params;
      const targetVersionNumber = parseInt(targetVersion, 10);

      if (isNaN(targetVersionNumber) || targetVersionNumber < 1) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "targetVersion must be a positive integer.",
        });
      }

      try {
        const preview = await service.previewRollback(configKey, targetVersionNumber);
        return reply.code(200).send(preview);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to compute rollback preview.";
        const isNotFound =
          message.includes("not found") || message.includes("No current version");
        const isSameVersion = message.includes("already the current version");
        return reply
          .code(isNotFound ? 404 : isSameVersion ? 400 : 500)
          .send({
            error: isNotFound
              ? "Not Found"
              : isSameVersion
              ? "Bad Request"
              : "Internal Server Error",
            message,
          });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /:configKey/rollback/:targetVersion  — apply rollback
  // ---------------------------------------------------------------------------
  server.post<{
    Params: { configKey: string; targetVersion: string };
    Body: { changeRequestId?: unknown };
  }>(
    "/:configKey/rollback/:targetVersion",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { configKey, targetVersion } = request.params;
      const targetVersionNumber = parseInt(targetVersion, 10);

      if (isNaN(targetVersionNumber) || targetVersionNumber < 1) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "targetVersion must be a positive integer.",
        });
      }

      // Optional change approval gate (#1060 integration)
      if (requireApproval) {
        const changeRequestId = request.body?.changeRequestId;
        if (!changeRequestId || typeof changeRequestId !== "string") {
          return reply.code(422).send({
            error: "Unprocessable Entity",
            message:
              "REQUIRE_APPROVAL_FOR_ROLLBACK is enabled. " +
              "Provide an approved changeRequestId in the request body.",
          });
        }

        // Verify the referenced change request is approved
        const { getDatabase } = await import("../../database/connection.js");
        const db = getDatabase();
        const cr = await db("change_requests")
          .where("id", changeRequestId)
          .where("status", "approved")
          .first();

        if (!cr) {
          return reply.code(422).send({
            error: "Unprocessable Entity",
            message: `Change request ${changeRequestId} not found or not in 'approved' status.`,
          });
        }
      }

      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const newVersion = await service.applyRollback(
          configKey,
          targetVersionNumber,
          actor
        );
        return reply.code(201).send({ version: newVersion });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to apply rollback.";
        const isNotFound =
          message.includes("not found") || message.includes("No current version");
        const isSameVersion = message.includes("already the current version");
        return reply
          .code(isNotFound ? 404 : isSameVersion ? 400 : 500)
          .send({
            error: isNotFound
              ? "Not Found"
              : isSameVersion
              ? "Bad Request"
              : "Internal Server Error",
            message,
          });
      }
    }
  );
}
