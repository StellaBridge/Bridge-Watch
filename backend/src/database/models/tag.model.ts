import { getDatabase } from "../connection.js";

export interface Tag {
  id: string;
  entity_type: string;
  entity_id: string;
  tag: string;
  source: string;
  created_at: Date;
  updated_at: Date;
}

export interface TagAuditEntry {
  id: string;
  time: Date;
  entity_type: string;
  entity_id: string;
  tag: string;
  action: string;
  source: string;
  metadata: Record<string, unknown> | null;
}

export class TagModel {
  private db = getDatabase();
  private tagsTable = "tags";
  private auditTable = "tag_audit_log";

  async findByEntity(entityType: string, entityId: string): Promise<Tag[]> {
    return this.db(this.tagsTable)
      .where({ entity_type: entityType, entity_id: entityId })
      .orderBy("created_at", "desc");
  }

  async findEntitiesByTag(
    tag: string,
    entityType?: string
  ): Promise<Array<{ entity_type: string; entity_id: string }>> {
    const query = this.db(this.tagsTable)
      .where({ tag })
      .select("entity_type", "entity_id")
      .distinct();

    if (entityType) {
      query.where("entity_type", entityType);
    }

    return query;
  }

  async addTag(
    entityType: string,
    entityId: string,
    tag: string,
    source = "manual"
  ): Promise<Tag> {
    const [existing] = await this.db(this.tagsTable)
      .where({ entity_type: entityType, entity_id: entityId, tag })
      .select("id");

    if (existing) {
      return existing;
    }

    const [created] = await this.db(this.tagsTable)
      .insert({ entity_type: entityType, entity_id: entityId, tag, source })
      .returning("*");

    await this.logAudit(entityType, entityId, tag, "add", source);
    return created;
  }

  async removeTag(
    entityType: string,
    entityId: string,
    tag: string,
    source = "manual"
  ): Promise<boolean> {
    const count = await this.db(this.tagsTable)
      .where({ entity_type: entityType, entity_id: entityId, tag })
      .del();

    if (count > 0) {
      await this.logAudit(entityType, entityId, tag, "remove", source);
    }

    return count > 0;
  }

  async syncTags(
    entityType: string,
    entityId: string,
    desiredTags: string[],
    source = "sync"
  ): Promise<{ added: string[]; removed: string[] }> {
    const current = await this.findByEntity(entityType, entityId);
    const currentTags = new Set(current.map((t) => t.tag));
    const desired = new Set(desiredTags);

    const added: string[] = [];
    const removed: string[] = [];

    for (const tag of desired) {
      if (!currentTags.has(tag)) {
        await this.addTag(entityType, entityId, tag, source);
        added.push(tag);
      }
    }

    for (const tag of currentTags) {
      if (!desired.has(tag)) {
        await this.removeTag(entityType, entityId, tag, source);
        removed.push(tag);
      }
    }

    return { added, removed };
  }

  async getAuditLog(
    entityType: string,
    entityId: string,
    limit = 50
  ): Promise<TagAuditEntry[]> {
    return this.db(this.auditTable)
      .where({ entity_type: entityType, entity_id: entityId })
      .orderBy("time", "desc")
      .limit(limit);
  }

  async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
    const rows = await this.db(this.tagsTable)
      .select("tag")
      .count("id as count")
      .groupBy("tag")
      .orderBy("count", "desc");
    return rows as Array<{ tag: string; count: number }>;
  }

  private async logAudit(
    entityType: string,
    entityId: string,
    tag: string,
    action: string,
    source: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.db(this.auditTable).insert({
      entity_type: entityType,
      entity_id: entityId,
      tag,
      action,
      source,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }
}
