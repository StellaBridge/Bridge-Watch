import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { auditService } from "./audit.service.js";

// =============================================================================
// AUDIT LOG INTEGRITY CHECKS (#1181)
// =============================================================================

export interface IntegrityCheckOptions {
  limit?: number;
  from?: Date;
  to?: Date;
}

export interface IntegrityFailure {
  id: string;
  reason: "checksum_mismatch" | "chain_break";
  detail: string;
}

export interface IntegrityCheckResult {
  checked: number;
  intact: boolean;
  failures: IntegrityFailure[];
  firstCheckedAt: string | null;
  lastCheckedAt: string | null;
}

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export class AuditIntegrityService {
  private static instance: AuditIntegrityService;

  private constructor() {}

  public static getInstance(): AuditIntegrityService {
    if (!AuditIntegrityService.instance) {
      AuditIntegrityService.instance = new AuditIntegrityService();
    }
    return AuditIntegrityService.instance;
  }

  /**
   * Verifies per-entry checksums and hash-chain continuity over an ordered
   * window of audit_logs (oldest first).
   *
   * Legacy rows without previous_checksum get a per-entry checksum check
   * only; chained rows additionally require
   * current.previous_checksum === previous.checksum.
   */
  public async verifyChain(options: IntegrityCheckOptions = {}): Promise<IntegrityCheckResult> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const db = getDatabase();

    let query = db("audit_logs").select("*");
    if (options.from) query = query.where("created_at", ">=", options.from);
    if (options.to) query = query.where("created_at", "<=", options.to);

    const rows = await query.orderBy("created_at", "asc").orderBy("id", "asc").limit(limit);

    const failures: IntegrityFailure[] = [];
    let previousChecksum: string | null = null;

    for (const row of rows) {
      const entry = this.mapRow(row);
      let perEntryOk = false;
      try {
        perEntryOk = auditService.verifyChecksum(entry);
      } catch {
        perEntryOk = false;
      }
      if (!perEntryOk) {
        failures.push({
          id: String(row.id),
          reason: "checksum_mismatch",
          detail: "Stored checksum does not match recomputed checksum.",
        });
      }

      const previousChecksumRaw: string | null =
        (row.previous_checksum as string | null) ?? null;
      // Only enforce chain continuity when the row participates in the chain
      // AND we have a predecessor in the scanned window.
      if (previousChecksumRaw !== null && previousChecksum !== null) {
        if (previousChecksumRaw !== previousChecksum) {
          failures.push({
            id: String(row.id),
            reason: "chain_break",
            detail: "previous_checksum does not match predecessor checksum (window-scoped).",
          });
        }
      }

      if (typeof row.checksum === "string") {
        previousChecksum = row.checksum;
      }
    }

    const result: IntegrityCheckResult = {
      checked: rows.length,
      intact: failures.length === 0,
      failures: failures.slice(0, 100),
      firstCheckedAt: rows.length > 0 ? new Date(rows[0].created_at).toISOString() : null,
      lastCheckedAt:
        rows.length > 0 ? new Date(rows[rows.length - 1].created_at).toISOString() : null,
    };

    logger.info(
      { checked: result.checked, intact: result.intact, failures: failures.length },
      "Audit integrity chain verified"
    );

    return result;
  }

  private mapRow(row: Record<string, unknown>): Parameters<typeof auditService.verifyChecksum>[0] {
    const parse = (v: unknown): Record<string, unknown> | null => {
      if (!v) return null;
      if (typeof v === "object") return v as Record<string, unknown>;
      try {
        return JSON.parse(v as string);
      } catch {
        return null;
      }
    };

    return {
      id: row.id as string,
      action: row.action as never,
      actorId: row.actor_id as string,
      actorType: row.actor_type as never,
      ipAddress: (row.ip_address as string) ?? null,
      userAgent: (row.user_agent as string) ?? null,
      resourceType: (row.resource_type as string) ?? null,
      resourceId: (row.resource_id as string) ?? null,
      before: parse(row.before),
      after: parse(row.after),
      metadata: (parse(row.metadata) ?? {}) as Record<string, unknown>,
      severity: row.severity as never,
      checksum: row.checksum as string,
      createdAt: row.created_at as Date,
    };
  }
}

export const auditIntegrityService = AuditIntegrityService.getInstance();
