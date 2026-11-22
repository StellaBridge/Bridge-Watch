import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export type QuarantineStatus =
  | "quarantined"
  | "in_review"
  | "resolved"
  | "disposed"
  | "failed";

export interface QuarantineRecord {
  id: string;
  source: string;
  dataType: string;
  rawPayload: Record<string, unknown>;
  parseError: string;
  errorCode: string | null;
  status: QuarantineStatus;
  retryCount: number;
  retryHistory: Array<Record<string, unknown>>;
  priority: number;
  reviewedBy: string | null;
  resolutionNote: string | null;
  quarantinedAt: string;
  reviewedAt: string | null;
  resolvedAt: string | null;
}

export interface QuarantineStats {
  total: number;
  byStatus: Record<QuarantineStatus, number>;
  bySource: Record<string, number>;
}

interface Row {
  [key: string]: unknown;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ParseQuarantineQueueService {
  /**
   * Enqueue a record that failed parsing into the quarantine queue.
   */
  async enqueue(input: {
    source: string;
    dataType: string;
    rawPayload: Record<string, unknown>;
    parseError: string;
    errorCode?: string;
    priority?: number;
  }): Promise<QuarantineRecord> {
    const db = getDatabase();

    if (!input.source?.trim() || !input.dataType?.trim()) {
      throw new Error("source and dataType are required");
    }
    if (!input.parseError?.trim()) {
      throw new Error("parseError is required");
    }

    const [inserted] = await db("parse_quarantine_records")
      .insert({
        source: input.source.trim(),
        data_type: input.dataType.trim(),
        raw_payload: JSON.stringify(input.rawPayload ?? {}),
        parse_error: input.parseError.trim(),
        error_code: input.errorCode ?? null,
        status: "quarantined",
        retry_count: 0,
        retry_history: JSON.stringify([]),
        priority: input.priority ?? 0,
        quarantined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "parse_quarantine_queue",
        action: "record_quarantined",
        record_id: inserted.id,
        source: input.source,
        data_type: input.dataType,
        error_code: input.errorCode ?? null,
      },
      "Record quarantined after failed parse"
    );

    return this.mapRow(inserted as Row);
  }

  /**
   * List quarantined records with optional filters.
   */
  async list(filters?: {
    status?: QuarantineStatus;
    source?: string;
    dataType?: string;
    limit?: number;
    offset?: number;
  }): Promise<QuarantineRecord[]> {
    const db = getDatabase();
    const rows = (await db("parse_quarantine_records")
      .modify((qb) => {
        if (filters?.status) {
          qb.where("status", filters.status);
        }
        if (filters?.source) {
          qb.where("source", filters.source);
        }
        if (filters?.dataType) {
          qb.where("data_type", filters.dataType);
        }
      })
      .orderBy("priority", "desc")
      .orderBy("quarantined_at", "asc")
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)) as Row[];

    return rows.map((row) => this.mapRow(row));
  }

  async get(id: string): Promise<QuarantineRecord | null> {
    const db = getDatabase();
    const row = (await db("parse_quarantine_records")
      .where({ id })
      .first()) as Row | undefined;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Mark a quarantined record as resolved (e.g. manually fixed payload).
   */
  async resolve(
    id: string,
    actor: string,
    note?: string
  ): Promise<QuarantineRecord | null> {
    return this.transition(id, "resolved", actor, note);
  }

  /**
   * Dispose (permanently drop) a quarantined record.
   */
  async dispose(
    id: string,
    actor: string,
    note?: string
  ): Promise<QuarantineRecord | null> {
    return this.transition(id, "disposed", actor, note);
  }

  /**
   * Mark a record as failed (retries exhausted / not fixable).
   */
  async markFailed(
    id: string,
    actor: string,
    note?: string
  ): Promise<QuarantineRecord | null> {
    return this.transition(id, "failed", actor, note);
  }

  /**
   * Retry a quarantined record: returns the raw payload so the caller can
   * attempt to re-parse it, and records the retry attempt history.
   */
  async retry(id: string, actor: string): Promise<QuarantineRecord | null> {
    const db = getDatabase();
    const existing = await this.get(id);
    if (!existing || existing.status === "disposed" || existing.status === "resolved") {
      return null;
    }

    const updated = await db.transaction(async (trx) => {
      // Lock and recheck inside the transaction so concurrent replay attempts
      // cannot both increment the same stale retry count.
      const row = await trx("parse_quarantine_records")
        .where({ id })
        .forUpdate()
        .first();
      if (!row || row.status === "disposed" || row.status === "resolved") return null;

      const history = this.parseArray(row.retry_history);
      history.push({
        attemptedAt: new Date().toISOString(),
        by: actor,
        error: String(row.parse_error),
      });

      const [saved] = await trx("parse_quarantine_records")
        .where({ id })
        .update({
          status: "in_review",
          retry_count: Number(row.retry_count) + 1,
          retry_history: JSON.stringify(history),
          reviewed_by: actor,
          reviewed_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");
      return saved ?? null;
    });

    logger.info(
      {
        feature: "parse_quarantine_queue",
        action: "record_retried",
        record_id: id,
        actor,
        retry_count: Number((updated as Row)?.retry_count ?? 0),
      },
      "Quarantined record retried"
    );

    return updated ? this.mapRow(updated as Row) : null;
  }

  async stats(): Promise<QuarantineStats> {
    const db = getDatabase();
    const rows = (await db("parse_quarantine_records")
      .select("status")
      .select(db.raw("count(*)::int as cnt"))
      .groupBy("status")) as Row[];

    const sourceRows = (await db("parse_quarantine_records")
      .select("source")
      .select(db.raw("count(*)::int as cnt"))
      .groupBy("source")) as Row[];

    const byStatus = {
      quarantined: 0,
      in_review: 0,
      resolved: 0,
      disposed: 0,
      failed: 0,
    } as Record<QuarantineStatus, number>;

    let total = 0;
    for (const row of rows) {
      const status = String(row.status) as QuarantineStatus;
      if (status in byStatus) {
        byStatus[status] = Number(row.cnt);
      }
      total += Number(row.cnt);
    }

    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
      bySource[String(row.source)] = Number(row.cnt);
    }

    return { total, byStatus, bySource };
  }

  private async transition(
    id: string,
    toStatus: QuarantineStatus,
    actor: string,
    note?: string
  ): Promise<QuarantineRecord | null> {
    const db = getDatabase();
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }

    const allowed: Record<QuarantineStatus, QuarantineStatus[]> = {
      quarantined: ["resolved", "disposed", "failed", "in_review"],
      in_review: ["resolved", "disposed", "failed"],
      resolved: [],
      disposed: [],
      failed: [],
    };

    if (!allowed[existing.status as QuarantineStatus]?.includes(toStatus)) {
      throw new Error(
        `cannot transition from '${existing.status}' to '${toStatus}'`
      );
    }

    const [updated] = await db("parse_quarantine_records")
      .where({ id })
      .update({
        status: toStatus,
        reviewed_by: actor,
        resolution_note: note ?? null,
        reviewed_at: new Date(),
        resolved_at: toStatus === "resolved" || toStatus === "disposed" || toStatus === "failed"
          ? new Date()
          : null,
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "parse_quarantine_queue",
        action: "record_transitioned",
        record_id: id,
        to_status: toStatus,
        actor,
      },
      "Quarantined record status transitioned"
    );

    return updated ? this.mapRow(updated as Row) : null;
  }

  private mapRow(row: Row): QuarantineRecord {
    return {
      id: String(row.id),
      source: String(row.source),
      dataType: String(row.data_type),
      rawPayload: this.parseObject(row.raw_payload),
      parseError: String(row.parse_error),
      errorCode: row.error_code ? String(row.error_code) : null,
      status: String(row.status) as QuarantineStatus,
      retryCount: Number(row.retry_count),
      retryHistory: this.parseArray(row.retry_history),
      priority: Number(row.priority),
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
      quarantinedAt: String(row.quarantined_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    };
  }

  private parseObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, unknown>;
    try {
      return JSON.parse(String(value));
    } catch {
      return {};
    }
  }

  private parseArray(value: unknown): Array<Record<string, unknown>> {
    if (!value) return [];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
    try {
      return JSON.parse(String(value));
    } catch {
      return [];
    }
  }
}

export const parseQuarantineQueueService = new ParseQuarantineQueueService();
