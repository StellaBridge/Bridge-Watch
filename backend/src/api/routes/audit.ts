import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import "@fastify/rate-limit";
import { auditService, type AuditAction, type AuditSeverity, type AuditQuery } from "../../services/audit.service.js";
import { auditIntegrityService } from "../../services/auditIntegrity.service.js";
import { authMiddleware } from "../middleware/auth.js";

// =============================================================================
// TYPES
// =============================================================================

interface AuditQuerystring {
  actorId?: string;
  action?: AuditAction;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

interface AuditIdParams {
  id: string;
}

interface RetentionBody {
  retentionDays: number;
}

// =============================================================================
// ROUTES
// =============================================================================

export async function auditRoutes(server: FastifyInstance) {
  const requireAuditRead = authMiddleware({ requiredScopes: ["admin:audit"] });
  const requireAuditAdmin = authMiddleware({ requiredScopes: ["admin:audit", "admin:config"] });

  // ---------------------------------------------------------------------------
  // LIST — searchable, paginated audit log
  // ---------------------------------------------------------------------------

  server.get<{ Querystring: AuditQuerystring }>(
    "/",
    { preHandler: requireAuditRead, rateLimit: { max: 30, timeWindow: "1 minute" } } as any,
    async (request: FastifyRequest<{ Querystring: AuditQuerystring }>, reply: FastifyReply) => {
      try {
        const q: AuditQuery = {
          actorId: request.query.actorId,
          action: request.query.action,
          resourceType: request.query.resourceType,
          resourceId: request.query.resourceId,
          severity: request.query.severity,
          from: request.query.from ? new Date(request.query.from) : undefined,
          to: request.query.to ? new Date(request.query.to) : undefined,
          limit: request.query.limit ? Number(request.query.limit) : 100,
          offset: request.query.offset ? Number(request.query.offset) : 0,
        };

        const result = await auditService.query(q);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to query audit logs";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // INTEGRITY — full chain + checksum verification over a window (#1181)
  // ---------------------------------------------------------------------------

  server.get<{ Querystring: { limit?: number; from?: string; to?: string } }>(
    "/integrity",
    { preHandler: requireAuditRead, rateLimit: { max: 10, timeWindow: "1 minute" } } as any,
    async (request: FastifyRequest<{ Querystring: { limit?: number; from?: string; to?: string } }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? Number(request.query.limit) : 1000;
        if (!Number.isFinite(limit) || limit < 1 || limit > 5000) {
          return reply.code(400).send({ error: "limit must be an integer between 1 and 5000" });
        }
        const result = await auditIntegrityService.verifyChain({
          limit: Math.floor(limit),
          from: request.query.from ? new Date(request.query.from) : undefined,
          to: request.query.to ? new Date(request.query.to) : undefined,
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to verify audit integrity";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET — single audit entry
  // ---------------------------------------------------------------------------

  server.get<{ Params: AuditIdParams }>(
    "/:id",
    { preHandler: requireAuditRead, rateLimit: { max: 60, timeWindow: "1 minute" } } as any,
    async (request: FastifyRequest<{ Params: AuditIdParams }>, reply: FastifyReply) => {
      const entry = await auditService.getEntry(request.params.id);
      if (!entry) {
        return reply.code(404).send({ error: "Audit entry not found" });
      }

      const intact = auditService.verifyChecksum(entry);
      return { ...entry, intact };
    }
  );

  // ---------------------------------------------------------------------------
  // STATS
  // ---------------------------------------------------------------------------

  server.get<{ Querystring: { from?: string } }>(
    "/stats",
    { preHandler: requireAuditRead, rateLimit: { max: 30, timeWindow: "1 minute" } } as any,
    async (request: FastifyRequest<{ Querystring: { from?: string } }>, reply: FastifyReply) => {
      try {
        const from = request.query.from ? new Date(request.query.from) : undefined;
        const stats = await auditService.getStats(from);
        return stats;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to get audit stats";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // EXPORT CSV
  // ---------------------------------------------------------------------------

  server.get<{ Querystring: AuditQuerystring }>(
    "/export",
    { preHandler: requireAuditAdmin, rateLimit: { max: 5, timeWindow: "1 minute" } } as any,
    async (request: FastifyRequest<{ Querystring: AuditQuerystring }>, reply: FastifyReply) => {
      try {
        const q: AuditQuery = {
          actorId: request.query.actorId,
          action: request.query.action,
          resourceType: request.query.resourceType,
          severity: request.query.severity,
          from: request.query.from ? new Date(request.query.from) : undefined,
          to: request.query.to ? new Date(request.query.to) : undefined,
        };

        const csv = await auditService.exportCsv(q);
        return reply
          .code(200)
          .header("Content-Type", "text/csv")
          .header("Content-Disposition", `attachment; filename="audit-${Date.now()}.csv"`)
          .send(csv);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to export audit logs";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // VERIFY ENTRY INTEGRITY
  // ---------------------------------------------------------------------------

  server.get<{ Params: AuditIdParams }>(
    "/:id/verify",
    { preHandler: requireAuditRead, rateLimit: { max: 60, timeWindow: "1 minute" } } as any,
    async (request: FastifyRequest<{ Params: AuditIdParams }>, reply: FastifyReply) => {
      const entry = await auditService.getEntry(request.params.id);
      if (!entry) {
        return reply.code(404).send({ error: "Audit entry not found" });
      }
      const intact = auditService.verifyChecksum(entry);
      return {
        id: entry.id,
        intact,
        message: intact ? "Entry checksum is valid" : "Entry checksum mismatch — possible tampering",
      };
    }
  );

  // ---------------------------------------------------------------------------
  // RETENTION POLICY (admin)
  // ---------------------------------------------------------------------------

  server.post<{ Body: RetentionBody }>(
    "/retention",
    { preHandler: requireAuditAdmin, rateLimit: { max: 5, timeWindow: "1 minute" } } as any,
    async (request: FastifyRequest<{ Body: RetentionBody }>, reply: FastifyReply) => {
      try {
        const { retentionDays } = request.body;
        if (!retentionDays || retentionDays < 7) {
          return reply.code(400).send({ error: "retentionDays must be >= 7" });
        }
        const deleted = await auditService.applyRetentionPolicy(retentionDays);
        return { deleted, retentionDays };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to apply retention policy";
        return reply.code(500).send({ error: message });
      }
    }
  );
}
