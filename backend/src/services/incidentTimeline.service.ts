import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface TimelineEvent {
  id: string;
  incidentId: string;
  deploymentId?: string | null;
  type: string;
  actor?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTimelineEventInput {
  type: string;
  deploymentId?: string | null;
  actor?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: string | Date;
}

export class IncidentTimelineService {
  private formatRow(row: any): TimelineEvent {
    let metadataParsed: Record<string, unknown> | null = null;
    if (row.metadata) {
      if (typeof row.metadata === "string") {
        try {
          metadataParsed = JSON.parse(row.metadata);
        } catch {
          metadataParsed = null;
        }
      } else if (typeof row.metadata === "object") {
        metadataParsed = row.metadata;
      }
    }

    return {
      id: String(row.id),
      incidentId: String(row.incident_id),
      deploymentId: row.deployment_id ? String(row.deployment_id) : null,
      type: String(row.type),
      actor: row.actor ? String(row.actor) : null,
      metadata: metadataParsed,
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ? String(row.updated_at) : undefined,
    };
  }

  async addEvent(incidentId: string, event: CreateTimelineEventInput): Promise<TimelineEvent> {
    const db = getDatabase();

    if (event.deploymentId) {
      const deploymentExists = await db("contract_deployments")
        .where({ id: event.deploymentId })
        .first();
      if (!deploymentExists) {
        throw new Error(`Deployment with ID ${event.deploymentId} not found`);
      }
    }

    const occurredAt = event.occurredAt
      ? event.occurredAt instanceof Date
        ? event.occurredAt.toISOString()
        : event.occurredAt
      : new Date().toISOString();

    const [inserted] = await db("incident_timeline_events")
      .insert({
        incident_id: incidentId,
        deployment_id: event.deploymentId ?? null,
        type: event.type,
        actor: event.actor ?? null,
        metadata: JSON.stringify(event.metadata ?? {}),
        occurred_at: occurredAt,
      })
      .returning("*");

    logger.info({ incidentId, type: event.type, deploymentId: event.deploymentId }, "Added timeline event");
    return this.formatRow(inserted);
  }

  async getTimeline(incidentId: string): Promise<TimelineEvent[]> {
    const db = getDatabase();
    const rows = await db("incident_timeline_events")
      .where({ incident_id: incidentId })
      .orderBy("occurred_at", "asc");

    return rows.map((r) => this.formatRow(r));
  }

  async getEventsByDeployment(deploymentId: string): Promise<TimelineEvent[]> {
    const db = getDatabase();
    const rows = await db("incident_timeline_events")
      .where({ deployment_id: deploymentId })
      .orderBy("occurred_at", "asc");

    return rows.map((r) => this.formatRow(r));
  }

  async getEvent(id: string): Promise<TimelineEvent | null> {
    const db = getDatabase();
    const row = await db("incident_timeline_events").where({ id }).first();
    return row ? this.formatRow(row) : null;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const db = getDatabase();
    const deletedCount = await db("incident_timeline_events").where({ id }).delete();
    return deletedCount > 0;
  }

  async listAll(): Promise<Record<string, TimelineEvent[]>> {
    const db = getDatabase();
    const rows = await db("incident_timeline_events").orderBy("occurred_at", "asc");
    const result: Record<string, TimelineEvent[]> = {};

    for (const row of rows) {
      const formatted = this.formatRow(row);
      if (!result[formatted.incidentId]) {
        result[formatted.incidentId] = [];
      }
      result[formatted.incidentId].push(formatted);
    }

    return result;
  }
}

export const incidentTimelineService = new IncidentTimelineService();
