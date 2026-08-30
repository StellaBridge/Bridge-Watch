import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";
import { redactionService } from "../privacy/redaction.service.js";
import { redactionDecisionService } from "../privacy/redactionDecision.service.js";
import type { RedactionDecision } from "../privacy/types.js";

// =============================================================================
// TYPES
// =============================================================================

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.api_key_created"
  | "auth.api_key_revoked"
  | "data.created"
  | "data.updated"
  | "data.deleted"
  | "admin.config_changed"
  | "admin.provider_allowlist_changed"
  | "admin.user_permission_changed"
  | "admin.retention_policy_changed"
  | "alert.rule_created"
  | "alert.rule_updated"
  | "alert.rule_deleted"
  | "alert.triggered"
  | "webhook.endpoint_created"
  | "webhook.endpoint_deleted"
  | "webhook.secret_rotated"
  | "export.initiated"
  | "export.completed"
  | "tag.created"
  | "tag.updated"
  | "tag.deleted"
  | "tag.assigned"
  | "tag.unassigned"
  | "event.replay_executed"
  | "source.decommission_started"
  | "source.decommission_progress_updated"
  | "source.decommission_completed"
  | "source.decommission_rolled_back"
  | "provider.circuit_breaker_tripped"
  | "provider.circuit_breaker_recovered"
  | "provider.circuit_breaker_override"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actorId: string;
  actorType: "user" | "api_key" | "system" | "admin";
  ipAddress: string | null;
  userAgent: string | null;
  resourceType: string | null;
  resourceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  severity: AuditSeverity;
  checksum: string;
  createdAt: Date;
}

export interface AuditQuery {
  actorId?: string;
  action?: AuditAction;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  total: number;
  bySeverity: Record<AuditSeverity, number>;
  byAction: Record<string, number>;
  recentCount: number;
}

// =============================================================================
// AUDIT SERVICE
// =============================================================================

export class AuditService {
  private static instance: AuditService;

  private constructor() {}

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  // ---------------------------------------------------------------------------
  // TAMPER DETECTION
  // ---------------------------------------------------------------------------

  private computeChecksum(entry: Omit<AuditEntry, "id" | "checksum" | "createdAt">): string {
    const payload = JSON.stringify({
      action: entry.action,
      actorId: entry.actorId,
      actorType: entry.actorType,
      ipAddress: entry.ipAddress,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      before: entry.before,
      after: entry.after,
      severity: entry.severity,
    });
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  public verifyChecksum(entry: AuditEntry): boolean {
    const expected = this.computeChecksum(entry);
    return crypto.timingSafeEqual(
      Buffer.from(entry.checksum),
      Buffer.from(expected)
    );
  }

  // ---------------------------------------------------------------------------
  // LOG
  // ---------------------------------------------------------------------------

  public async log(params: {
    action: AuditAction;
    actorId: string;
    actorType?: "user" | "api_key" | "system" | "admin";
    ipAddress?: string;
    userAgent?: string;
    resourceType?: string;
    resourceId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    severity?: AuditSeverity;
  }): Promise<AuditEntry> {
    const db = getDatabase();

    const draft = {
      action: params.action,
      actorId: params.actorId,
      actorType: params.actorType ?? "user",
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
      metadata: params.metadata ?? {},
      severity: params.severity ?? this.inferSeverity(params.action),
    };

    // Redact sensitive operational fields (IP, addresses, notes, evidence)
    // before the checksum is computed and before persistence, so the stored
    // values are already scrubbed and the checksum covers the scrubbed state.
    const redaction = this.applyRedaction(draft);

    const checksum = this.computeChecksum(redaction.draft);

    const [row] = await db("audit_logs")
      .insert({
        id: crypto.randomUUID(),
        action: redaction.draft.action,
        actor_id: redaction.draft.actorId,
        actor_type: redaction.draft.actorType,
        ip_address: redaction.draft.ipAddress,
        user_agent: redaction.draft.userAgent,
        resource_type: redaction.draft.resourceType,
        resource_id: redaction.draft.resourceId,
        before: redaction.draft.before ? JSON.stringify(redaction.draft.before) : null,
        after: redaction.draft.after ? JSON.stringify(redaction.draft.after) : null,
        metadata: JSON.stringify(redaction.draft.metadata),
        severity: redaction.draft.severity,
        checksum,
        created_at: new Date(),
      })
      .returning("*");

    if (redaction.decision) {
      this.recordRedactionDecision(redaction.decision, params.resourceType ?? null, params.resourceId ?? null);
    }

    logger.info(
      { auditId: row.id, action: redaction.draft.action, actorId: redaction.draft.actorId, severity: redaction.draft.severity },
      "Audit event recorded"
    );

    return this.mapRow(row);
  }

  // ---------------------------------------------------------------------------
  // QUERY
  // ---------------------------------------------------------------------------

  public async query(params: AuditQuery = {}): Promise<{ entries: AuditEntry[]; total: number }> {
    const db = getDatabase();
    const limit = Math.min(params.limit ?? 100, 1000);
    const offset = params.offset ?? 0;

    let query = db("audit_logs");
    let countQuery = db("audit_logs");

    if (params.actorId) {
      query = query.where("actor_id", params.actorId);
      countQuery = countQuery.where("actor_id", params.actorId);
    }
    if (params.action) {
      query = query.where("action", params.action);
      countQuery = countQuery.where("action", params.action);
    }
    if (params.resourceType) {
      query = query.where("resource_type", params.resourceType);
      countQuery = countQuery.where("resource_type", params.resourceType);
    }
    if (params.resourceId) {
      query = query.where("resource_id", params.resourceId);
      countQuery = countQuery.where("resource_id", params.resourceId);
    }
    if (params.severity) {
      query = query.where("severity", params.severity);
      countQuery = countQuery.where("severity", params.severity);
    }
    if (params.from) {
      query = query.where("created_at", ">=", params.from);
      countQuery = countQuery.where("created_at", ">=", params.from);
    }
    if (params.to) {
      query = query.where("created_at", "<=", params.to);
      countQuery = countQuery.where("created_at", "<=", params.to);
    }

    const [rows, countResult] = await Promise.all([
      query.orderBy("created_at", "desc").limit(limit).offset(offset),
      countQuery.count("id as count").first(),
    ]);

    return {
      entries: rows.map(this.mapRow),
      total: Number(countResult?.count ?? 0),
    };
  }

  public async getEntry(id: string): Promise<AuditEntry | null> {
    const db = getDatabase();
    const row = await db("audit_logs").where("id", id).first();
    return row ? this.mapRow(row) : null;
  }

  // ---------------------------------------------------------------------------
  // STATS
  // ---------------------------------------------------------------------------

  public async getStats(from?: Date): Promise<AuditStats> {
    const db = getDatabase();
    let baseQuery = db("audit_logs");
    if (from) baseQuery = baseQuery.where("created_at", ">=", from);

    const [totalRow, severityRows, actionRows, recentRow] = await Promise.all([
      baseQuery.clone().count("id as count").first(),
      baseQuery.clone().select("severity").count("id as count").groupBy("severity"),
      baseQuery.clone().select("action").count("id as count").groupBy("action").orderBy("count", "desc").limit(20),
      db("audit_logs")
        .where("created_at", ">=", new Date(Date.now() - 3600_000))
        .count("id as count")
        .first(),
    ]);

    const bySeverity: Record<AuditSeverity, number> = { info: 0, warning: 0, critical: 0 };
    for (const row of severityRows) {
      bySeverity[row.severity as AuditSeverity] = Number(row.count);
    }

    const byAction: Record<string, number> = {};
    for (const row of actionRows) {
      byAction[row.action] = Number(row.count);
    }

    return {
      total: Number(totalRow?.count ?? 0),
      bySeverity,
      byAction,
      recentCount: Number(recentRow?.count ?? 0),
    };
  }

  // ---------------------------------------------------------------------------
  // EXPORT
  // ---------------------------------------------------------------------------

  public async exportCsv(params: AuditQuery = {}): Promise<string> {
    const { entries } = await this.query({ ...params, limit: 10_000, offset: 0 });

    const header = [
      "id", "action", "actor_id", "actor_type", "ip_address",
      "resource_type", "resource_id", "severity", "checksum", "created_at",
    ].join(",");

    const rows = entries.map((e) =>
      [
        e.id,
        e.action,
        e.actorId,
        e.actorType,
        e.ipAddress ?? "",
        e.resourceType ?? "",
        e.resourceId ?? "",
        e.severity,
        e.checksum,
        e.createdAt.toISOString(),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );

    return [header, ...rows].join("\n");
  }

  // ---------------------------------------------------------------------------
  // RETENTION
  // ---------------------------------------------------------------------------

  public async applyRetentionPolicy(retentionDays: number): Promise<number> {
    const db = getDatabase();
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);

    const deleted = await db("audit_logs")
      .where("severity", "info")
      .where("created_at", "<", cutoff)
      .delete();

    logger.info(
      { deleted, cutoff, retentionDays },
      "Audit log retention policy applied"
    );

    return deleted;
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private applyRedaction(draft: {
    action: AuditAction;
    actorId: string;
    actorType: "user" | "api_key" | "system" | "admin";
    ipAddress: string | null;
    userAgent: string | null;
    resourceType: string | null;
    resourceId: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
    severity: AuditSeverity;
  }): { draft: typeof draft; decision: RedactionDecision | null } {
    if (!config.REDACTION_ENABLED) {
      return { draft, decision: null };
    }

    const composite = {
      actorId: draft.actorId,
      ipAddress: draft.ipAddress,
      userAgent: draft.userAgent,
      resourceId: draft.resourceId,
      before: draft.before,
      after: draft.after,
      metadata: draft.metadata,
    };

    const result = redactionService.redact(composite, { sink: "audit" });
    const red = result.output as typeof composite;

    return {
      draft: { ...draft, ...red },
      decision: result.decision,
    };
  }

  private recordRedactionDecision(decision: RedactionDecision, resourceType: string | null, resourceId: string | null): void {
    void redactionDecisionService.record(decision, {
      resourceType: resourceType ?? undefined,
      resourceId: resourceId ?? undefined,
    });
  }

  private inferSeverity(action: AuditAction): AuditSeverity {
    if (
      action === "admin.user_permission_changed" ||
      action === "auth.api_key_revoked" ||
      action === "webhook.secret_rotated" ||
      action === "admin.config_changed" ||
      action === "admin.provider_allowlist_changed" ||
      action === "event.replay_executed" ||
      action === "source.decommission_started" ||
      action === "source.decommission_rolled_back" ||
      action === "provider.circuit_breaker_override"
    ) return "warning";

    if (action === "admin.retention_policy_changed" || action === "source.decommission_completed") return "critical";

    return "info";
  }

  private mapRow(row: Record<string, unknown>): AuditEntry {
    const parse = (v: unknown): Record<string, unknown> | null => {
      if (!v) return null;
      if (typeof v === "object") return v as Record<string, unknown>;
      try { return JSON.parse(v as string); } catch { return null; }
    };

    return {
      id: row.id as string,
      action: row.action as AuditAction,
      actorId: row.actor_id as string,
      actorType: row.actor_type as AuditEntry["actorType"],
      ipAddress: (row.ip_address as string) ?? null,
      userAgent: (row.user_agent as string) ?? null,
      resourceType: (row.resource_type as string) ?? null,
      resourceId: (row.resource_id as string) ?? null,
      before: parse(row.before),
      after: parse(row.after),
      metadata: (parse(row.metadata) ?? {}) as Record<string, unknown>,
      severity: row.severity as AuditSeverity,
      checksum: row.checksum as string,
      createdAt: row.created_at as Date,
    };
  }
}

export const auditService = AuditService.getInstance();
