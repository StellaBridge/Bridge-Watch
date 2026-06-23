import { TagModel, type Tag, type TagAuditEntry } from "../database/models/tag.model.js";
import { logger } from "../utils/logger.js";

const VALID_ENTITY_TYPES = ["asset", "bridge", "incident"];
const MAX_TAG_LENGTH = 64;
const MAX_TAGS_PER_ENTITY = 50;

export class TagSyncService {
  private model = new TagModel();

  validateTag(tag: string): string | null {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed.length === 0 || trimmed.length > MAX_TAG_LENGTH) {
      return null;
    }
    if (!/^[a-z0-9._-]+$/.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  validateEntityType(entityType: string): boolean {
    return VALID_ENTITY_TYPES.includes(entityType);
  }

  async getTagsForEntity(
    entityType: string,
    entityId: string
  ): Promise<Tag[]> {
    if (!this.validateEntityType(entityType)) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }
    return this.model.findByEntity(entityType, entityId);
  }

  async addTag(
    entityType: string,
    entityId: string,
    tag: string,
    source = "manual"
  ): Promise<Tag> {
    if (!this.validateEntityType(entityType)) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }

    const validatedTag = this.validateTag(tag);
    if (!validatedTag) {
      throw new Error(`Invalid tag: "${tag}"`);
    }

    const existing = await this.model.findByEntity(entityType, entityId);
    if (existing.length >= MAX_TAGS_PER_ENTITY) {
      throw new Error(`Maximum tags (${MAX_TAGS_PER_ENTITY}) reached for this entity`);
    }

    logger.info(
      { entityType, entityId, tag: validatedTag, source },
      "Adding tag"
    );

    return this.model.addTag(entityType, entityId, validatedTag, source);
  }

  async removeTag(
    entityType: string,
    entityId: string,
    tag: string,
    source = "manual"
  ): Promise<boolean> {
    if (!this.validateEntityType(entityType)) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }

    const validatedTag = this.validateTag(tag);
    if (!validatedTag) {
      throw new Error(`Invalid tag: "${tag}"`);
    }

    logger.info(
      { entityType, entityId, tag: validatedTag, source },
      "Removing tag"
    );

    return this.model.removeTag(entityType, entityId, validatedTag, source);
  }

  async syncEntityTags(
    entityType: string,
    entityId: string,
    desiredTags: string[],
    source = "sync"
  ): Promise<{ added: string[]; removed: string[] }> {
    if (!this.validateEntityType(entityType)) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }

    const validated = desiredTags
      .map((t) => this.validateTag(t))
      .filter((t): t is string => t !== null);

    if (validated.length > MAX_TAGS_PER_ENTITY) {
      throw new Error(`Too many valid tags (max ${MAX_TAGS_PER_ENTITY})`);
    }

    logger.info(
      { entityType, entityId, desiredCount: validated.length, source },
      "Syncing tags"
    );

    return this.model.syncTags(entityType, entityId, validated, source);
  }

  async findEntitiesByTag(
    tag: string,
    entityType?: string
  ): Promise<Array<{ entity_type: string; entity_id: string }>> {
    const validatedTag = this.validateTag(tag);
    if (!validatedTag) {
      return [];
    }
    return this.model.findEntitiesByTag(validatedTag, entityType);
  }

  async getAuditLog(
    entityType: string,
    entityId: string,
    limit?: number
  ): Promise<TagAuditEntry[]> {
    if (!this.validateEntityType(entityType)) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }
    return this.model.getAuditLog(entityType, entityId, limit);
  }

  async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
    return this.model.getAllTags();
  }

  async propagateTag(
    tag: string,
    entityType: string,
    entityIds: string[],
    source = "propagation"
  ): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    for (const entityId of entityIds) {
      try {
        await this.addTag(entityType, entityId, tag, source);
        synced++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${entityId}: ${message}`);
      }
    }

    logger.info({ tag, entityType, synced, errorCount: errors.length }, "Tag propagation complete");

    return { synced, errors };
  }
}
