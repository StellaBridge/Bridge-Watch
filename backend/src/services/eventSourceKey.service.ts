/**
 * Service for managing event source public verification keys.
 *
 * Provides CRUD operations for the event_source_keys table and
 * lookup helpers used by the signature validation middleware.
 */

import { getDatabase } from "../database/connection.js";
import type { EventSourceKey, NewEventSourceKey } from "../database/types.js";

const TABLE = "event_source_keys";

export class EventSourceKeyService {
  async create(data: NewEventSourceKey): Promise<EventSourceKey> {
    const db = getDatabase();
    const rows = await db(TABLE)
      .insert({ ...data, created_at: new Date(), updated_at: new Date() })
      .returning("*");
    return rows[0] as EventSourceKey;
  }

  async findBySourceName(sourceName: string): Promise<EventSourceKey | null> {
    const db = getDatabase();
    const rows = await db(TABLE)
      .where({ source_name: sourceName, is_active: true })
      .limit(1);
    return (rows[0] as EventSourceKey) ?? null;
  }

  async findActiveKey(sourceName: string): Promise<EventSourceKey | null> {
    return this.findBySourceName(sourceName);
  }

  async list(): Promise<EventSourceKey[]> {
    const db = getDatabase();
    return db(TABLE).orderBy("created_at", "desc");
  }

  async rotate(sourceName: string, newPublicKey: string, algorithm?: string): Promise<EventSourceKey> {
    const db = getDatabase();
    const now = new Date();

    await db(TABLE)
      .where({ source_name: sourceName, is_active: true })
      .update({ is_active: false, rotated_at: now, updated_at: now });

    const rows = await db(TABLE)
      .insert({
        source_name: sourceName,
        public_key: newPublicKey,
        algorithm: algorithm ?? "ed25519",
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .returning("*");

    return rows[0] as EventSourceKey;
  }

  async deactivate(sourceName: string): Promise<void> {
    const db = getDatabase();
    await db(TABLE)
      .where({ source_name: sourceName, is_active: true })
      .update({ is_active: false, updated_at: new Date() });
  }

  async delete(sourceName: string): Promise<void> {
    const db = getDatabase();
    await db(TABLE).where({ source_name: sourceName }).delete();
  }
}
