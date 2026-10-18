import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface SensitiveFieldDefinitionRecord {
  id: string;
  resource_name: string;
  field_name: string;
  sensitivity_level: "low" | "medium" | "high" | "critical";
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SensitiveFieldAccessLogRecord {
  id: string;
  resource_name: string;
  field_name: string;
  actor_id: string;
  actor_role: string;
  access_type: "read" | "export" | "decrypted" | "modified";
  reason?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
}

export interface SensitiveFieldAccessReportRecord {
  id: string;
  title: string;
  time_range_start: string;
  time_range_end: string;
  sensitivity_filter?: string;
  total_accesses: number;
  unique_actors: number;
  critical_accesses: number;
  summary_json: Record<string, unknown> | string;
  generated_by: string;
  created_at: string;
}

export class SensitiveFieldAccessService {
  private db() {
    return getDatabase();
  }

  async listDefinitions() {
    const rows = await this.db()("sensitive_field_definitions")
      .where("is_active", true)
      .orderBy("resource_name", "asc");
    return rows.map(this.formatDefinition);
  }

  async createDefinition(data: {
    resourceName: string;
    fieldName: string;
    sensitivityLevel?: "low" | "medium" | "high" | "critical";
    description?: string;
  }) {
    if (!data.resourceName?.trim() || !data.fieldName?.trim()) {
      throw new Error("resourceName and fieldName are required");
    }

    const [row] = await this.db()("sensitive_field_definitions")
      .insert({
        resource_name: data.resourceName.trim(),
        field_name: data.fieldName.trim(),
        sensitivity_level: data.sensitivityLevel ?? "medium",
        description: data.description ?? null,
        is_active: true,
      })
      .onConflict(["resource_name", "field_name"])
      .merge({
        sensitivity_level: data.sensitivityLevel ?? "medium",
        description: data.description ?? null,
        is_active: true,
        updated_at: this.db().fn.now(),
      })
      .returning("*");

    return this.formatDefinition(row);
  }

  async logAccess(data: {
    resourceName: string;
    fieldName: string;
    actorId: string;
    actorRole?: string;
    accessType?: "read" | "export" | "decrypted" | "modified";
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    if (!data.resourceName?.trim() || !data.fieldName?.trim() || !data.actorId?.trim()) {
      throw new Error("resourceName, fieldName, and actorId are required");
    }

    const [row] = await this.db()("sensitive_field_access_logs")
      .insert({
        resource_name: data.resourceName.trim(),
        field_name: data.fieldName.trim(),
        actor_id: data.actorId.trim(),
        actor_role: data.actorRole ?? "operator",
        access_type: data.accessType ?? "read",
        reason: data.reason ?? null,
        ip_address: data.ipAddress ?? null,
        user_agent: data.userAgent ?? null,
      })
      .returning("*");

    return this.formatLog(row);
  }

  async queryLogs(filters?: {
    resourceName?: string;
    fieldName?: string;
    actorId?: string;
    accessType?: string;
    limit?: number;
  }) {
    let query = this.db()("sensitive_field_access_logs");

    if (filters?.resourceName) {
      query = query.where("resource_name", filters.resourceName);
    }
    if (filters?.fieldName) {
      query = query.where("field_name", filters.fieldName);
    }
    if (filters?.actorId) {
      query = query.where("actor_id", filters.actorId);
    }
    if (filters?.accessType) {
      query = query.where("access_type", filters.accessType);
    }

    const rows = await query.orderBy("timestamp", "desc").limit(filters?.limit ?? 100);
    return rows.map(this.formatLog);
  }

  async generateReport(data: {
    title: string;
    timeRangeStart: string;
    timeRangeEnd: string;
    sensitivityFilter?: string;
    generatedBy?: string;
  }) {
    if (!data.title?.trim() || !data.timeRangeStart || !data.timeRangeEnd) {
      throw new Error("title, timeRangeStart, and timeRangeEnd are required");
    }

    const logsQuery = this.db()("sensitive_field_access_logs")
      .where("timestamp", ">=", data.timeRangeStart)
      .where("timestamp", "<=", data.timeRangeEnd);

    const logs = await logsQuery;

    const definitions = await this.listDefinitions();
    const defMap = new Map<string, string>();
    definitions.forEach((d) => defMap.set(`${d.resourceName}:${d.fieldName}`, d.sensitivityLevel));

    let filteredLogs = logs;
    if (data.sensitivityFilter) {
      filteredLogs = logs.filter(
        (l) => defMap.get(`${l.resource_name}:${l.field_name}`) === data.sensitivityFilter
      );
    }

    const totalAccesses = filteredLogs.length;
    const uniqueActors = new Set(filteredLogs.map((l) => l.actor_id)).size;
    const criticalAccesses = filteredLogs.filter(
      (l) => defMap.get(`${l.resource_name}:${l.field_name}`) === "critical"
    ).length;

    const accessesByResource: Record<string, number> = {};
    filteredLogs.forEach((l) => {
      accessesByResource[l.resource_name] = (accessesByResource[l.resource_name] || 0) + 1;
    });

    const accessesByAccessType: Record<string, number> = {};
    filteredLogs.forEach((l) => {
      accessesByAccessType[l.access_type] = (accessesByAccessType[l.access_type] || 0) + 1;
    });

    const summaryJson = {
      accessesByResource,
      accessesByAccessType,
      sampleLogsCount: Math.min(filteredLogs.length, 50),
    };

    const [reportRow] = await this.db()("sensitive_field_access_reports")
      .insert({
        title: data.title.trim(),
        time_range_start: data.timeRangeStart,
        time_range_end: data.timeRangeEnd,
        sensitivity_filter: data.sensitivityFilter ?? null,
        total_accesses: totalAccesses,
        unique_actors: uniqueActors,
        critical_accesses: criticalAccesses,
        summary_json: JSON.stringify(summaryJson),
        generated_by: data.generatedBy ?? "system",
      })
      .returning("*");

    logger.info({ reportId: reportRow.id, title: data.title }, "Generated sensitive field access report");
    return this.formatReport(reportRow);
  }

  async listReports() {
    const rows = await this.db()("sensitive_field_access_reports").orderBy("created_at", "desc");
    return rows.map(this.formatReport);
  }

  async getReportById(id: string) {
    const row = await this.db()("sensitive_field_access_reports").where({ id }).first();
    return row ? this.formatReport(row) : null;
  }

  private formatDefinition(row: any) {
    return {
      id: row.id,
      resourceName: row.resource_name,
      fieldName: row.field_name,
      sensitivityLevel: row.sensitivity_level,
      description: row.description,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatLog(row: any) {
    return {
      id: row.id,
      resourceName: row.resource_name,
      fieldName: row.field_name,
      actorId: row.actor_id,
      actorRole: row.actor_role,
      accessType: row.access_type,
      reason: row.reason,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      timestamp: row.timestamp,
    };
  }

  private formatReport(row: any) {
    return {
      id: row.id,
      title: row.title,
      timeRangeStart: row.time_range_start,
      timeRangeEnd: row.time_range_end,
      sensitivityFilter: row.sensitivity_filter,
      totalAccesses: row.total_accesses,
      uniqueActors: row.unique_actors,
      criticalAccesses: row.critical_accesses,
      summaryJson: typeof row.summary_json === "string" ? JSON.parse(row.summary_json) : row.summary_json,
      generatedBy: row.generated_by,
      createdAt: row.created_at,
    };
  }
}

export const sensitiveFieldAccessService = new SensitiveFieldAccessService();
