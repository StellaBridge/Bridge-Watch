import { getDatabase } from "../database/connection.js";

/** Raised when a compare-and-swap update loses a race. */
export class ConcurrencyConflictError extends Error {
  constructor(
    public readonly currentRecord: VersionedRecord | null,
    public readonly expectedVersion: number,
  ) {
    super(`Optimistic concurrency conflict: expected version ${expectedVersion}, received ${currentRecord?.version ?? "missing"}`);
    this.name = "ConcurrencyConflictError";
  }
}

export interface VersionedRecord {
  id: string;
  version: number;
  [key: string]: unknown;
}

/**
 * Compare-and-swap updates: only one writer can update a given version.
 * The WHERE predicate is evaluated atomically by the database.
 */
export class OptimisticLockingVersionService {
  async update(
    table: string,
    id: string,
    expectedVersion: number,
    changes: Record<string, unknown>,
  ): Promise<VersionedRecord> {
    if (!/^[a-z][a-z0-9_]*$/i.test(table)) throw new Error("Invalid table name");
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      throw new Error("Expected version must be a non-negative integer");
    }
    if ("id" in changes || "version" in changes) {
      throw new Error("Cannot directly modify id or version");
    }

    const db = getDatabase();
    const [updated] = await db(table)
      .where({ id, version: expectedVersion })
      .update({ ...changes, version: expectedVersion + 1 })
      .returning("*");
    if (updated) return updated as VersionedRecord;

    const current = (await db(table).where({ id }).first()) as VersionedRecord | undefined;
    throw new ConcurrencyConflictError(current ?? null, expectedVersion);
  }

  /**
   * Retries only version conflicts, not validation or database failures.
   * The caller computes changes from the freshly fetched state each time.
   */
  async updateWithRetry(
    table: string,
    id: string,
    changesFor: (current: VersionedRecord) => Record<string, unknown>,
    options: { maxRetries?: number; baseDelayMs?: number } = {},
  ): Promise<VersionedRecord> {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 25;
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 20 ||
        !Number.isFinite(baseDelayMs) || baseDelayMs < 0 || baseDelayMs > 60000) {
      throw new Error("Invalid retry options");
    }
    const db = getDatabase();
    for (let attempt = 0; ; attempt++) {
      const current = (await db(table).where({ id }).first()) as VersionedRecord | undefined;
      if (!current) throw new ConcurrencyConflictError(null, 0);
      try {
        return await this.update(table, id, current.version, changesFor(current));
      } catch (error) {
        if (!(error instanceof ConcurrencyConflictError) || attempt >= maxRetries) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
      }
    }
  }
}

export const optimisticLockingVersionService = new OptimisticLockingVersionService();
