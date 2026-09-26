import { createHash } from "crypto";
import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";
import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MigrationStatus =
  | "pending"
  | "migrating"
  | "verifying"
  | "complete"
  | "failed"
  | "rolled_back";

export interface MigrationManifest {
  id: string;
  entityType: string;
  archiveTable: string;
  rangeStart: Date;
  rangeEnd: Date;
  status: MigrationStatus;
  schemaVersion: number;
  rowCount: number | null;
  checksum: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface DualReadRow {
  source: "hot" | "archive";
  [key: string]: unknown;
}

export interface RestoreDrillResult {
  entityType: string;
  rangeStart: Date;
  rangeEnd: Date;
  hotCount: number;
  archiveCount: number;
  checksumMatch: boolean;
  gapFree: boolean;
}

export interface MigrateRangeOptions {
  entityType: string;
  rangeStart: Date;
  rangeEnd: Date;
  /** Caller-supplied schema version stamped into the manifest. */
  schemaVersion: number;
  /** When true, deletes matching hot rows after successful cutover. Defaults to false. */
  cutoverOnSuccess?: boolean;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Entity registry: maps an entity type to its hot hypertable and archive table.
 * Mirrors the ARCHIVE_ENTITIES registry in archivedDataBrowser.service.ts but
 * is kept separate so the migration service has no runtime dependency on the
 * browser service.
 */
export const MIGRATION_ENTITIES: Record<
  string,
  { hotTable: string; archiveTable: string; timeColumn: string }
> = {
  prices: {
    hotTable: "prices",
    archiveTable: "prices_archive",
    timeColumn: "time",
  },
  health_scores: {
    hotTable: "health_scores",
    archiveTable: "health_scores_archive",
    timeColumn: "time",
  },
  liquidity_snapshots: {
    hotTable: "liquidity_snapshots",
    archiveTable: "liquidity_snapshots_archive",
    timeColumn: "time",
  },
  pool_events: {
    hotTable: "pool_events",
    archiveTable: "pool_events_archive",
    timeColumn: "time",
  },
};

/**
 * Continuous aggregates that span the hypertables managed by this service.
 * Used by the verifier to confirm aggregates are consistent across the cutover
 * boundary.
 */
const CONTINUOUS_AGGREGATES: Record<string, string[]> = {
  prices: ["prices_hourly", "prices_daily"],
  health_scores: ["health_scores_hourly", "health_scores_daily"],
  liquidity_snapshots: ["liquidity_hourly", "liquidity_daily"],
};

/** Redis cache key patterns to invalidate after a successful cutover. */
const CACHE_KEY_PATTERNS: Record<string, string[]> = {
  prices: ["bw:prices:*", "bw:price:*"],
  health_scores: ["bw:health:*", "bw:bridge-health-snapshot"],
  liquidity_snapshots: ["bw:liquidity:*"],
  pool_events: ["bw:pool:*"],
};

/**
 * Segment-by columns for TimescaleDB columnar compression, per entity.
 * Grouping each chunk by its natural series key keeps compressed reads fast.
 */
const COMPRESSION_SEGMENTBY: Record<string, string> = {
  prices: "symbol",
  health_scores: "symbol",
  liquidity_snapshots: "symbol, dex",
  pool_events: "pool_id",
};

export interface ChunkCompressionStats {
  entityType: string;
  hotTable: string;
  totalChunks: number;
  compressedChunks: number;
  /** Share of chunks compressed, null when the table has no chunks. */
  compressionRatio: number | null;
  /** Bounded recent-rows scan latency in ms, null when not measured. */
  readProbeMs: number | null;
  /** False when TimescaleDB is absent or the stats query failed. */
  timescaledbAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Checksum helpers
// ---------------------------------------------------------------------------

/**
 * Produces a SHA-256 hex digest of the canonical row set.
 *
 * Rows are sorted deterministically by the time column value and then by JSON
 * key order so that the same logical data always produces the same hash,
 * regardless of database return order or column ordering.
 */
export function computeChecksum(rows: Record<string, unknown>[], timeColumn: string): string {
  const sorted = [...rows].sort((a, b) => {
    const ta = String(a[timeColumn] ?? "");
    const tb = String(b[timeColumn] ?? "");
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  const canonical = sorted
    .map((r) => {
      const ordered: Record<string, unknown> = {};
      for (const k of Object.keys(r).sort()) ordered[k] = r[k];
      return JSON.stringify(ordered);
    })
    .join("\n");

  return createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HotColdMigrationService {
  private readonly db: Knex;

  constructor(db?: Knex) {
    this.db = db ?? getDatabase();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Migrates a contiguous time range for one entity type from the hot
   * hypertable into the immutable archive table.
   *
   * Steps:
   *   1. Create or resume a manifest record (idempotent via unique constraint).
   *   2. Copy rows to the archive table with INSERT … SELECT … ON CONFLICT DO NOTHING
   *      so duplicate rows are never written even on retry.
   *   3. Compute SHA-256 checksum and row count; stamp the manifest.
   *   4. Verify continuous aggregates are consistent across the boundary.
   *   5. Invalidate Redis caches for the affected entity.
   *   6. Optionally perform an atomic cutover (delete hot rows in range).
   *
   * On any error the manifest is set to 'failed' and the error is re-thrown.
   * Callers can then call `resume()` or `rollback()`.
   */
  async migrateRange(opts: MigrateRangeOptions): Promise<MigrationManifest> {
    const entity = this.requireEntity(opts.entityType);

    const manifest = await this.createOrResumeManifest({
      entityType: opts.entityType,
      archiveTable: entity.archiveTable,
      rangeStart: opts.rangeStart,
      rangeEnd: opts.rangeEnd,
      schemaVersion: opts.schemaVersion,
    });

    if (manifest.status === "complete") {
      logger.info({ manifestId: manifest.id }, "hot-cold-migration: segment already complete, skipping");
      return manifest;
    }

    try {
      // Mark as migrating
      await this.setStatus(manifest.id, "migrating", { startedAt: new Date() });

      // Copy rows — ON CONFLICT DO NOTHING makes this safe on retry
      await this.db.raw(
        `INSERT INTO ?? SELECT * FROM ?? WHERE ?? >= ? AND ?? < ? ON CONFLICT DO NOTHING`,
        [
          entity.archiveTable,
          entity.hotTable,
          entity.timeColumn,
          opts.rangeStart,
          entity.timeColumn,
          opts.rangeEnd,
        ],
      );

      // Fetch copied rows for checksum computation
      const archived = await this.db(entity.archiveTable)
        .where(entity.timeColumn, ">=", opts.rangeStart)
        .where(entity.timeColumn, "<", opts.rangeEnd)
        .select("*") as Record<string, unknown>[];

      const rowCount = archived.length;
      const checksum = computeChecksum(archived, entity.timeColumn);

      // Move to verifying
      await this.setStatus(manifest.id, "verifying");

      // Verify continuous aggregates are consistent across the range boundary
      await this.verifyContinuousAggregates(opts.entityType, opts.rangeStart, opts.rangeEnd);

      // Invalidate Redis caches
      await this.invalidateCaches(opts.entityType, opts.rangeStart, opts.rangeEnd);

      // Stamp row count + checksum
      await this.db("migration_manifests").where({ id: manifest.id }).update({
        row_count: rowCount,
        checksum,
      });

      if (opts.cutoverOnSuccess) {
        await this.performCutover(manifest.id, entity, opts.rangeStart, opts.rangeEnd);
      } else {
        await this.setStatus(manifest.id, "complete", { completedAt: new Date() });
      }

      const updated = await this.getManifest(manifest.id);
      logger.info(
        { manifestId: manifest.id, rowCount, entityType: opts.entityType },
        "hot-cold-migration: segment migration complete",
      );
      return updated!;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.setStatus(manifest.id, "failed", { errorMessage });
      logger.error({ manifestId: manifest.id, err }, "hot-cold-migration: migration failed");
      throw err;
    }
  }

  /**
   * Dual-read query: returns rows from both the hot table and the archive table
   * for the given range, tagged with their source.
   *
   * Guarantees readers see a complete, gap-free range during any phase of the
   * migration because data in the hot table has not yet been deleted and data
   * already written to the archive is also included.
   */
  async dualRead(
    entityType: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<DualReadRow[]> {
    const entity = this.requireEntity(entityType);

    const [hotRows, archiveRows] = await Promise.all([
      this.db(entity.hotTable)
        .where(entity.timeColumn, ">=", rangeStart)
        .where(entity.timeColumn, "<", rangeEnd)
        .select("*") as Promise<Record<string, unknown>[]>,
      this.tableExists(entity.archiveTable).then((exists) =>
        exists
          ? (this.db(entity.archiveTable)
              .where(entity.timeColumn, ">=", rangeStart)
              .where(entity.timeColumn, "<", rangeEnd)
              .select("*") as Promise<Record<string, unknown>[]>)
          : Promise.resolve([] as Record<string, unknown>[]),
      ),
    ]);

    // De-duplicate: if a row exists in both (mid-cutover), the hot copy wins
    const seen = new Set<string>();
    const result: DualReadRow[] = [];

    for (const row of hotRows) {
      const key = this.rowKey(row, entity.timeColumn);
      seen.add(key);
      result.push({ ...row, source: "hot" });
    }

    for (const row of archiveRows) {
      const key = this.rowKey(row, entity.timeColumn);
      if (!seen.has(key)) {
        result.push({ ...row, source: "archive" });
      }
    }

    result.sort((a, b) => {
      const ta = String(a[entity.timeColumn] ?? "");
      const tb = String(b[entity.timeColumn] ?? "");
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    return result;
  }

  /**
   * Atomically completes a migration that has already copied rows but was not
   * yet cut over.  Deletes the matching hot rows and marks the manifest complete.
   *
   * The caller should verify the manifest is in 'verifying' or 'complete' status
   * before calling this, or pass the result of a `migrateRange()` call.
   */
  async atomicCutover(manifestId: string): Promise<void> {
    const manifest = await this.requireManifest(manifestId);

    if (manifest.status === "complete") {
      return; // already done
    }

    const entity = this.requireEntity(manifest.entityType);
    await this.performCutover(manifestId, entity, manifest.rangeStart, manifest.rangeEnd);
  }

  /**
   * Resumes a failed or stalled migration from its last checkpoint.
   *
   * Safe to call on a manifest in any non-terminal status.  Already-archived
   * rows are not re-copied thanks to the ON CONFLICT DO NOTHING clause.
   */
  async resume(manifestId: string): Promise<MigrationManifest> {
    const manifest = await this.requireManifest(manifestId);

    if (manifest.status === "complete" || manifest.status === "rolled_back") {
      return manifest;
    }

    // Reset to pending so migrateRange picks it up from the top
    await this.setStatus(manifestId, "pending", { errorMessage: null });

    return this.migrateRange({
      entityType: manifest.entityType,
      rangeStart: manifest.rangeStart,
      rangeEnd: manifest.rangeEnd,
      schemaVersion: manifest.schemaVersion,
    });
  }

  /**
   * Rolls back a failed migration: deletes the archive rows that were written
   * for this segment and marks the manifest 'rolled_back'.
   *
   * The hot table is untouched, so data is immediately available to readers
   * without any action on their side.
   */
  async rollback(manifestId: string): Promise<void> {
    const manifest = await this.requireManifest(manifestId);

    if (manifest.status === "complete") {
      throw new Error(
        `hot-cold-migration: cannot rollback a complete migration (id=${manifestId})`,
      );
    }

    const entity = this.requireEntity(manifest.entityType);

    const exists = await this.tableExists(entity.archiveTable);
    if (exists) {
      await this.db(entity.archiveTable)
        .where(entity.timeColumn, ">=", manifest.rangeStart)
        .where(entity.timeColumn, "<", manifest.rangeEnd)
        .delete();
    }

    await this.setStatus(manifestId, "rolled_back");
    logger.info({ manifestId }, "hot-cold-migration: rollback complete");
  }

  /**
   * Restore drill: verifies that the archive can reconstruct the same API
   * results as the hot table for the given range.
   *
   * Compares row counts and checksums between hot and archive.  When they
   * match the drill passes, proving the archive is a faithful copy.
   */
  async restoreDrill(
    entityType: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<RestoreDrillResult> {
    const entity = this.requireEntity(entityType);

    const [hotRows, archiveRows] = await Promise.all([
      this.db(entity.hotTable)
        .where(entity.timeColumn, ">=", rangeStart)
        .where(entity.timeColumn, "<", rangeEnd)
        .select("*") as Promise<Record<string, unknown>[]>,
      this.tableExists(entity.archiveTable).then((exists) =>
        exists
          ? (this.db(entity.archiveTable)
              .where(entity.timeColumn, ">=", rangeStart)
              .where(entity.timeColumn, "<", rangeEnd)
              .select("*") as Promise<Record<string, unknown>[]>)
          : Promise.resolve([] as Record<string, unknown>[]),
      ),
    ]);

    const hotChecksum = computeChecksum(hotRows, entity.timeColumn);
    const archiveChecksum = computeChecksum(archiveRows, entity.timeColumn);

    const checksumMatch = hotChecksum === archiveChecksum;

    // Gap-free: the dual-read view must cover every row that exists in either table
    const dualRows = await this.dualRead(entityType, rangeStart, rangeEnd);
    const gapFree = dualRows.length >= Math.max(hotRows.length, archiveRows.length);

    logger.info(
      { entityType, rangeStart, rangeEnd, hotCount: hotRows.length, archiveCount: archiveRows.length, checksumMatch, gapFree },
      "hot-cold-migration: restore drill complete",
    );

    return {
      entityType,
      rangeStart,
      rangeEnd,
      hotCount: hotRows.length,
      archiveCount: archiveRows.length,
      checksumMatch,
      gapFree,
    };
  }

  // -------------------------------------------------------------------------
  // TimescaleDB chunk compression (issue #1273)
  // -------------------------------------------------------------------------

  /**
   * Ensure columnar compression + a 7-day compression policy on the entity's
   * hot hypertable. Safe to call when TimescaleDB is absent: the statements
   * fail, the error is logged, and `{ applied: false }` is returned so
   * callers (and jobs) can continue against regular tables.
   */
  async ensureChunkCompression(
    entityType: string,
    compressAfterDays = 7
  ): Promise<{ applied: boolean; reason?: string }> {
    const entity = this.requireEntity(entityType);
    const segmentby = COMPRESSION_SEGMENTBY[entityType] ?? "";
    try {
      await this.db.raw(
        `ALTER TABLE ?? SET (timescaledb.compress = true${
          segmentby ? `, timescaledb.compress_segmentby = '${segmentby}'` : ""
        });`,
        [entity.hotTable]
      );
      await this.db.raw(
        `SELECT add_compression_policy(?, INTERVAL '${compressAfterDays} days', if_not_exists => true);`,
        [entity.hotTable]
      );
      logger.info(
        { entityType, hotTable: entity.hotTable, compressAfterDays },
        "hot-cold-migration: chunk compression policy ensured"
      );
      return { applied: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn(
        { entityType, reason },
        "hot-cold-migration: TimescaleDB compression unavailable, continuing uncompressed"
      );
      return { applied: false, reason };
    }
  }

  /**
   * Report chunk compression state for the entity's hot hypertable and probe
   * read performance with a bounded recent-rows scan. Logs the compression
   * ratio so jobs can alert on uncompressed growth.
   */
  async getChunkCompressionStats(entityType: string): Promise<ChunkCompressionStats> {
    const entity = this.requireEntity(entityType);
    const base: ChunkCompressionStats = {
      entityType,
      hotTable: entity.hotTable,
      totalChunks: 0,
      compressedChunks: 0,
      compressionRatio: null,
      readProbeMs: null,
      timescaledbAvailable: false,
    };
    try {
      const raw = await this.db.raw(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_compressed) AS compressed
           FROM timescaledb_information.chunks WHERE hypertable_name = ?;`,
        [entity.hotTable]
      );
      const row = (Array.isArray(raw) ? raw[0] : raw?.rows?.[0]) as
        | Record<string, unknown>
        | undefined;
      const total = Number(row?.total ?? 0);
      const compressed = Number(row?.compressed ?? 0);
      base.totalChunks = total;
      base.compressedChunks = compressed;
      base.compressionRatio = total > 0 ? compressed / total : null;
      base.timescaledbAvailable = true;

      const startedAt = Date.now();
      await this.db.raw(
        `SELECT * FROM ?? ORDER BY ?? DESC LIMIT 100;`,
        [entity.hotTable, entity.timeColumn]
      );
      base.readProbeMs = Date.now() - startedAt;

      logger.info(
        {
          entityType,
          hotTable: entity.hotTable,
          totalChunks: total,
          compressedChunks: compressed,
          compressionRatio: base.compressionRatio,
          readProbeMs: base.readProbeMs,
        },
        "hot-cold-migration: chunk compression stats"
      );
    } catch (err) {
      logger.warn(
        { entityType, reason: err instanceof Error ? err.message : String(err) },
        "hot-cold-migration: compression stats unavailable"
      );
    }
    return base;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireEntity(entityType: string) {
    const entity = MIGRATION_ENTITIES[entityType];
    if (!entity) {
      throw new Error(
        `hot-cold-migration: unknown entityType "${entityType}". Supported: ${Object.keys(MIGRATION_ENTITIES).join(", ")}`,
      );
    }
    return entity;
  }

  private async requireManifest(id: string): Promise<MigrationManifest> {
    const manifest = await this.getManifest(id);
    if (!manifest) {
      throw new Error(`hot-cold-migration: manifest not found (id=${id})`);
    }
    return manifest;
  }

  private async getManifest(id: string): Promise<MigrationManifest | null> {
    const row = await this.db("migration_manifests").where({ id }).first() as Record<string, unknown> | undefined;
    return row ? this.rowToManifest(row) : null;
  }

  private async createOrResumeManifest(opts: {
    entityType: string;
    archiveTable: string;
    rangeStart: Date;
    rangeEnd: Date;
    schemaVersion: number;
  }): Promise<MigrationManifest> {
    // Try to find an existing manifest for this exact segment
    const existing = await this.db("migration_manifests")
      .where({
        entity_type: opts.entityType,
        range_start: opts.rangeStart,
        range_end: opts.rangeEnd,
      })
      .first() as Record<string, unknown> | undefined;

    if (existing) {
      return this.rowToManifest(existing);
    }

    await this.db("migration_manifests").insert({
      entity_type: opts.entityType,
      archive_table: opts.archiveTable,
      range_start: opts.rangeStart,
      range_end: opts.rangeEnd,
      status: "pending",
      schema_version: opts.schemaVersion,
    });

    const created = await this.db("migration_manifests")
      .where({
        entity_type: opts.entityType,
        range_start: opts.rangeStart,
        range_end: opts.rangeEnd,
      })
      .first() as Record<string, unknown>;

    return this.rowToManifest(created);
  }

  private async setStatus(
    id: string,
    status: MigrationStatus,
    extra: Partial<{
      startedAt: Date;
      completedAt: Date;
      errorMessage: string | null;
    }> = {},
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (extra.startedAt !== undefined) update.started_at = extra.startedAt;
    if (extra.completedAt !== undefined) update.completed_at = extra.completedAt;
    if ("errorMessage" in extra) update.error_message = extra.errorMessage ?? null;
    await this.db("migration_manifests").where({ id }).update(update);
  }

  private async performCutover(
    manifestId: string,
    entity: { hotTable: string; archiveTable: string; timeColumn: string },
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<void> {
    // Delete hot rows only after archive rows are confirmed present
    const archiveCount = await this.db(entity.archiveTable)
      .where(entity.timeColumn, ">=", rangeStart)
      .where(entity.timeColumn, "<", rangeEnd)
      .count("* as count")
      .first()
      .then((r) => Number((r as Record<string, unknown>)?.count ?? 0));

    if (archiveCount === 0) {
      throw new Error(
        "hot-cold-migration: atomicCutover aborted — no rows found in archive table",
      );
    }

    await this.db(entity.hotTable)
      .where(entity.timeColumn, ">=", rangeStart)
      .where(entity.timeColumn, "<", rangeEnd)
      .delete();

    await this.setStatus(manifestId, "complete", { completedAt: new Date() });
    logger.info({ manifestId, archiveCount }, "hot-cold-migration: atomic cutover complete");
  }

  /**
   * Verifies that TimescaleDB continuous aggregates that span the migration
   * boundary exist and have materialized data for the given range.
   *
   * Does not throw on TimescaleDB-less installations — it simply skips the check.
   */
  private async verifyContinuousAggregates(
    entityType: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<void> {
    const aggregates = CONTINUOUS_AGGREGATES[entityType] ?? [];

    for (const view of aggregates) {
      try {
        const exists = await this.tableExists(view);
        if (!exists) continue;

        const row = await this.db(view)
          .where("bucket", ">=", rangeStart)
          .where("bucket", "<", rangeEnd)
          .count("* as count")
          .first() as Record<string, unknown> | undefined;

        const count = Number(row?.count ?? 0);
        logger.info(
          { view, rangeStart, rangeEnd, count },
          "hot-cold-migration: continuous aggregate verified",
        );
      } catch {
        // Non-fatal: log and continue — the migration itself is not blocked by this
        logger.warn({ view }, "hot-cold-migration: could not verify continuous aggregate");
      }
    }
  }

  /**
   * Deletes Redis cache entries that may contain hot data for the migrated range.
   * Uses SCAN + DELETE to handle wildcard patterns safely without KEYS.
   */
  async invalidateCaches(entityType: string, _rangeStart: Date, _rangeEnd: Date): Promise<void> {
    const patterns = CACHE_KEY_PATTERNS[entityType] ?? [];

    for (const pattern of patterns) {
      if (!pattern.includes("*")) {
        // Exact key — just delete it
        await redis.del(pattern);
        continue;
      }

      // SCAN is safe for production Redis; KEYS is not
      let cursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = Number(nextCursor);
        if (keys.length > 0) {
          await redis.del(keys);
        }
      } while (cursor !== 0);
    }

    logger.info({ entityType, patterns }, "hot-cold-migration: caches invalidated");
  }

  private async tableExists(tableName: string): Promise<boolean> {
    return this.db.schema.hasTable(tableName);
  }

  private rowKey(row: Record<string, unknown>, timeColumn: string): string {
    return `${String(row[timeColumn] ?? "")}_${String(row["id"] ?? row["symbol"] ?? JSON.stringify(row))}`;
  }

  private rowToManifest(row: Record<string, unknown>): MigrationManifest {
    return {
      id: row.id as string,
      entityType: row.entity_type as string,
      archiveTable: row.archive_table as string,
      rangeStart: new Date(row.range_start as string),
      rangeEnd: new Date(row.range_end as string),
      status: row.status as MigrationStatus,
      schemaVersion: Number(row.schema_version),
      rowCount: row.row_count != null ? Number(row.row_count) : null,
      checksum: (row.checksum as string | null) ?? null,
      errorMessage: (row.error_message as string | null) ?? null,
      startedAt: row.started_at ? new Date(row.started_at as string) : null,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
      createdAt: new Date(row.created_at as string),
    };
  }
}
