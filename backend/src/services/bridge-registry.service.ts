import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type BridgeRegistryStatus = "active" | "inactive" | "deprecated" | "pending";

export interface BridgeRegistryEntry {
  id: string;
  bridge_id: string;
  name: string;
  display_name: string;
  supported_chains: string[];
  owner_name: string | null;
  owner_contact: string | null;
  owner_url: string | null;
  status: BridgeRegistryStatus;
  manual_override: boolean;
  override_reason: string | null;
  validation_rules: Record<string, unknown>;
  description: string | null;
  homepage_url: string | null;
  documentation_url: string | null;
  /** Optimistic-locking revision, bumped on every update (issue #1279). */
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * Thrown when an update carries a stale `version` — another writer changed
 * the row first. Routes map this to HTTP 409 Conflict.
 */
export class OptimisticLockConflictError extends Error {
  readonly statusCode = 409;
  readonly bridgeId: string;
  constructor(bridgeId: string) {
    super(
      `Bridge registry entry '${bridgeId}' was modified by another writer; refresh and retry`
    );
    this.name = "OptimisticLockConflictError";
    this.bridgeId = bridgeId;
  }
}

export interface CreateBridgeRegistryInput {
  bridge_id: string;
  name: string;
  display_name: string;
  supported_chains: string[];
  owner_name?: string;
  owner_contact?: string;
  owner_url?: string;
  status?: BridgeRegistryStatus;
  validation_rules?: Record<string, unknown>;
  description?: string;
  homepage_url?: string;
  documentation_url?: string;
}

export interface UpdateBridgeRegistryInput {
  name?: string;
  display_name?: string;
  supported_chains?: string[];
  owner_name?: string;
  owner_contact?: string;
  owner_url?: string;
  status?: BridgeRegistryStatus;
  manual_override?: boolean;
  override_reason?: string;
  validation_rules?: Record<string, unknown>;
  description?: string;
  homepage_url?: string;
  documentation_url?: string;
  changed_by?: string;
  change_reason?: string;
}

export class BridgeRegistryService {
  async getAll(filters?: { status?: BridgeRegistryStatus; chain?: string }): Promise<BridgeRegistryEntry[]> {
    logger.info({ filters }, "Fetching all bridge registry entries");
    const db = getDatabase();
    let query = db("bridge_registry").select("*").orderBy("name", "asc");

    if (filters?.status) {
      query = query.where("status", filters.status);
    }

    if (filters?.chain) {
      query = query.whereRaw("? = ANY(supported_chains)", [filters.chain]);
    }

    const rows = await query;
    return rows.map(this.mapRow);
  }

  async getById(bridgeId: string): Promise<BridgeRegistryEntry | null> {
    logger.info({ bridgeId }, "Fetching bridge registry entry by bridge_id");
    const db = getDatabase();
    const row = await db("bridge_registry").where({ bridge_id: bridgeId }).first();
    return row ? this.mapRow(row) : null;
  }

  async create(input: CreateBridgeRegistryInput): Promise<BridgeRegistryEntry> {
    logger.info({ bridgeId: input.bridge_id }, "Creating bridge registry entry");
    const db = getDatabase();

    const existing = await db("bridge_registry").where({ bridge_id: input.bridge_id }).first();
    if (existing) {
      throw new Error(`Bridge with id '${input.bridge_id}' is already registered`);
    }

    const [row] = await db("bridge_registry")
      .insert({
        bridge_id: input.bridge_id,
        name: input.name,
        display_name: input.display_name,
        // text[] column: pass the JS array through so pg serializes a proper
        // array literal (JSON.stringify produced '["a","b"]', which Postgres
        // rejects as a malformed array literal).
        supported_chains: input.supported_chains,
        owner_name: input.owner_name ?? null,
        owner_contact: input.owner_contact ?? null,
        owner_url: input.owner_url ?? null,
        status: input.status ?? "active",
        validation_rules: JSON.stringify(input.validation_rules ?? {}),
        description: input.description ?? null,
        homepage_url: input.homepage_url ?? null,
        documentation_url: input.documentation_url ?? null,
      })
      .returning("*");

    return this.mapRow(row);
  }

  async update(
    bridgeId: string,
    input: UpdateBridgeRegistryInput,
    expectedVersion?: number
  ): Promise<BridgeRegistryEntry | null> {
    logger.info({ bridgeId }, "Updating bridge registry entry");
    const db = getDatabase();

    const existing = await db("bridge_registry").where({ bridge_id: bridgeId }).first();
    if (!existing) return null;

    if (
      expectedVersion !== undefined &&
      Number(existing.version ?? 1) !== expectedVersion
    ) {
      throw new OptimisticLockConflictError(bridgeId);
    }

    const updatePayload: Record<string, unknown> = { updated_at: new Date() };
    const changedFields: Array<{ field: string; old: string; next: string }> = [];

    const trackableFields: Array<keyof UpdateBridgeRegistryInput> = [
      "name", "display_name", "supported_chains", "owner_name",
      "owner_contact", "owner_url", "status", "manual_override",
      "override_reason", "validation_rules", "description",
      "homepage_url", "documentation_url",
    ];

    for (const field of trackableFields) {
      if (input[field] !== undefined) {
        const oldVal = existing[field];
        const newVal = input[field];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changedFields.push({
            field,
            old: JSON.stringify(oldVal),
            next: JSON.stringify(newVal),
          });
        }
        updatePayload[field] =
          field === "validation_rules"
            ? JSON.stringify(newVal)
            : newVal;
      }
    }

    // Bump the revision so concurrent writers detect the change. When the
    // caller supplied the version they read, guard the write with it: zero
    // affected rows means someone else won the race.
    const where =
      expectedVersion !== undefined
        ? { bridge_id: bridgeId, version: expectedVersion }
        : { bridge_id: bridgeId };
    const [updated] = await db("bridge_registry")
      .where(where)
      .update({ ...updatePayload, version: Number(existing.version ?? 1) + 1 })
      .returning("*");

    if (!updated) {
      throw new OptimisticLockConflictError(bridgeId);
    }

    if (changedFields.length > 0) {
      await db("bridge_registry_history").insert(
        changedFields.map((c) => ({
          registry_id: existing.id,
          bridge_id: bridgeId,
          changed_field: c.field,
          old_value: c.old,
          new_value: c.next,
          changed_by: input.changed_by ?? null,
          change_reason: input.change_reason ?? null,
        }))
      );
    }

    return this.mapRow(updated);
  }

  async delete(bridgeId: string): Promise<boolean> {
    logger.info({ bridgeId }, "Deleting bridge registry entry");
    const db = getDatabase();
    const deleted = await db("bridge_registry").where({ bridge_id: bridgeId }).delete();
    return deleted > 0;
  }

  async getHistory(bridgeId: string, limit = 50): Promise<unknown[]> {
    logger.info({ bridgeId }, "Fetching bridge registry history");
    const db = getDatabase();
    return db("bridge_registry_history")
      .where({ bridge_id: bridgeId })
      .orderBy("changed_at", "desc")
      .limit(limit);
  }

  async setManualOverride(
    bridgeId: string,
    override: boolean,
    reason: string,
    changedBy?: string
  ): Promise<BridgeRegistryEntry | null> {
    return this.update(bridgeId, {
      manual_override: override,
      override_reason: override ? reason : null,
      changed_by: changedBy,
      change_reason: reason,
    });
  }

  private mapRow(row: Record<string, unknown>): BridgeRegistryEntry {
    return {
      id: row.id as string,
      bridge_id: row.bridge_id as string,
      name: row.name as string,
      display_name: row.display_name as string,
      supported_chains: Array.isArray(row.supported_chains)
        ? row.supported_chains as string[]
        : (typeof row.supported_chains === "string"
            ? JSON.parse(row.supported_chains)
            : []),
      owner_name: (row.owner_name ?? null) as string | null,
      owner_contact: (row.owner_contact ?? null) as string | null,
      owner_url: (row.owner_url ?? null) as string | null,
      status: row.status as BridgeRegistryStatus,
      manual_override: Boolean(row.manual_override),
      override_reason: (row.override_reason ?? null) as string | null,
      validation_rules: typeof row.validation_rules === "object" && row.validation_rules !== null
        ? row.validation_rules as Record<string, unknown>
        : {},
      description: (row.description ?? null) as string | null,
      homepage_url: (row.homepage_url ?? null) as string | null,
      documentation_url: (row.documentation_url ?? null) as string | null,
      version: Number(row.version ?? 1),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
