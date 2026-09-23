import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ConfigVersion {
  id: string;
  configKey: string;
  versionNumber: number;
  payload: Record<string, unknown>;
  changeSummary: string | null;
  appliedBy: string;
  appliedAt: Date;
  isCurrent: boolean;
}

export type FieldChangeType = "modified" | "added" | "removed";

export interface FieldDiff {
  field: string;
  currentValue: unknown;
  targetValue: unknown;
  changeType: FieldChangeType;
}

export interface RollbackPreview {
  configKey: string;
  currentVersion: number;
  targetVersion: number;
  diff: FieldDiff[];
  impactSummary: string;
}

export interface VersionDiff {
  configKey: string;
  fromVersion: number;
  toVersion: number;
  diff: FieldDiff[];
  impactSummary: string;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ConfigVersionService {
  private static instance: ConfigVersionService;

  private constructor() {}

  public static getInstance(): ConfigVersionService {
    if (!ConfigVersionService.instance) {
      ConfigVersionService.instance = new ConfigVersionService();
    }
    return ConfigVersionService.instance;
  }

  // ---------------------------------------------------------------------------
  // QUERIES
  // ---------------------------------------------------------------------------

  /**
   * Returns the currently active version for the given config key.
   * Returns null when no version record exists.
   */
  public async getCurrentVersion(
    configKey: string
  ): Promise<ConfigVersion | null> {
    const db = getDatabase();
    const row = await db("config_versions")
      .where("config_key", configKey)
      .where("is_current", true)
      .first();
    return row ? this.mapRow(row) : null;
  }

  /**
   * Returns the full version history for a config key, newest first.
   * @param limit Maximum number of versions to return (default 50).
   */
  public async getVersionHistory(
    configKey: string,
    limit = 50
  ): Promise<ConfigVersion[]> {
    const db = getDatabase();
    const rows = await db("config_versions")
      .where("config_key", configKey)
      .orderBy("version_number", "desc")
      .limit(limit);
    return rows.map(this.mapRow);
  }

  /**
   * Returns a specific version by config key and version number.
   * Returns null when not found.
   */
  public async getVersion(
    configKey: string,
    versionNumber: number
  ): Promise<ConfigVersion | null> {
    const db = getDatabase();
    const row = await db("config_versions")
      .where("config_key", configKey)
      .where("version_number", versionNumber)
      .first();
    return row ? this.mapRow(row) : null;
  }

  // ---------------------------------------------------------------------------
  // ROLLBACK PREVIEW
  // ---------------------------------------------------------------------------

  /**
   * Computes a structured diff between the current version and a target version
   * without applying any change.
   *
   * Both versions must exist. If there is no current version, throws an error.
   * Rolling back to the current version is rejected with a descriptive error.
   *
   * @throws Error when either version does not exist, or target === current.
   */
  public async previewRollback(
    configKey: string,
    targetVersionNumber: number
  ): Promise<RollbackPreview> {
    const current = await this.getCurrentVersion(configKey);
    if (!current) {
      throw new Error(
        `No current version found for config key: ${configKey}. ` +
          `Create an initial version before requesting a rollback preview.`
      );
    }

    if (current.versionNumber === targetVersionNumber) {
      throw new Error(
        `Target version ${targetVersionNumber} is already the current version. ` +
          `No rollback is needed.`
      );
    }

    const target = await this.getVersion(configKey, targetVersionNumber);
    if (!target) {
      throw new Error(
        `Version ${targetVersionNumber} not found for config key: ${configKey}.`
      );
    }

    const diff = this.computeDiff(current.payload, target.payload);
    const impactSummary = this.buildImpactSummary(
      configKey,
      current.versionNumber,
      targetVersionNumber,
      diff
    );

    return {
      configKey,
      currentVersion: current.versionNumber,
      targetVersion: targetVersionNumber,
      diff,
      impactSummary,
    };
  }

  /**
   * Compares any two versions of a config key (#1189).
   * Powers the runtime configuration diff view for arbitrary version pairs
   * (not just current-vs-target rollback previews).
   *
   * @throws Error when either version does not exist, or versions are equal.
   */
  public async compareVersions(
    configKey: string,
    fromVersionNumber: number,
    toVersionNumber: number
  ): Promise<VersionDiff> {
    if (fromVersionNumber === toVersionNumber) {
      throw new Error(
        `Versions are identical (v${fromVersionNumber}). ` +
          `Select two different versions to compare.`
      );
    }

    const [from, to] = await Promise.all([
      this.getVersion(configKey, fromVersionNumber),
      this.getVersion(configKey, toVersionNumber),
    ]);

    if (!from) {
      throw new Error(
        `Version ${fromVersionNumber} not found for config key: ${configKey}.`
      );
    }
    if (!to) {
      throw new Error(
        `Version ${toVersionNumber} not found for config key: ${configKey}.`
      );
    }

    const diff = this.computeDiff(from.payload, to.payload);
    const impactSummary = this.buildCompareSummary(
      configKey,
      fromVersionNumber,
      toVersionNumber,
      diff
    );

    return { configKey, fromVersion: fromVersionNumber, toVersion: toVersionNumber, diff, impactSummary };
  }

  // ---------------------------------------------------------------------------
  // APPLY ROLLBACK / CREATE VERSION
  // ---------------------------------------------------------------------------

  /**
   * Records a new config version with the given payload as the current state.
   * Used for the initial creation of a versioned config.
   *
   * Does not overwrite any existing record — inserts a new row with the next
   * version number and marks it as current.
   */
  public async createVersion(
    configKey: string,
    payload: Record<string, unknown>,
    appliedBy: string,
    changeSummary?: string
  ): Promise<ConfigVersion> {
    return this.insertNewVersion(configKey, payload, appliedBy, changeSummary);
  }

  /**
   * Applies a rollback by creating a new version record with the target's
   * payload as the new current state.
   *
   * History is never overwritten: the new version gets version_number = max + 1
   * and is_current = true. The previous current version is set to is_current = false.
   *
   * @throws Error when either version does not exist, or target === current.
   */
  public async applyRollback(
    configKey: string,
    targetVersionNumber: number,
    appliedBy: string
  ): Promise<ConfigVersion> {
    // Validate via preview (also ensures versions exist and differ)
    const preview = await this.previewRollback(configKey, targetVersionNumber);

    const target = await this.getVersion(configKey, targetVersionNumber);
    // target is guaranteed non-null because previewRollback succeeded
    const targetPayload = target!.payload;

    const summary =
      `Rollback from v${preview.currentVersion} to v${targetVersionNumber}. ` +
      `${preview.diff.length} field(s) changed.`;

    const newVersion = await this.insertNewVersion(
      configKey,
      targetPayload,
      appliedBy,
      summary
    );

    logger.info(
      {
        feature: "config_rollback",
        action: "rollback_applied",
        actor: appliedBy,
        resource_id: configKey,
        from_version: preview.currentVersion,
        to_version: targetVersionNumber,
        new_version_number: newVersion.versionNumber,
        timestamp: new Date().toISOString(),
      },
      "Config rollback applied"
    );

    return newVersion;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Inserts a new version row, marks it as current, and demotes the previous
   * current row. Wrapped in a transaction for atomicity.
   */
  private async insertNewVersion(
    configKey: string,
    payload: Record<string, unknown>,
    appliedBy: string,
    changeSummary?: string
  ): Promise<ConfigVersion> {
    const db = getDatabase();

    return db.transaction(async (trx) => {
      // Compute the next version number
      const maxRow = await trx("config_versions")
        .where("config_key", configKey)
        .max("version_number as max_version")
        .first();

      const nextVersion = ((maxRow?.max_version as number | null) ?? 0) + 1;

      // Demote any existing current version
      await trx("config_versions")
        .where("config_key", configKey)
        .where("is_current", true)
        .update({ is_current: false });

      // Insert the new version
      const [row] = await trx("config_versions")
        .insert({
          id: crypto.randomUUID(),
          config_key: configKey,
          version_number: nextVersion,
          payload: JSON.stringify(payload),
          change_summary: changeSummary ?? null,
          applied_by: appliedBy,
          applied_at: new Date(),
          is_current: true,
        })
        .returning("*");

      logger.info(
        {
          feature: "config_rollback",
          action: "version_created",
          actor: appliedBy,
          resource_id: configKey,
          version_number: nextVersion,
          timestamp: new Date().toISOString(),
        },
        "Config version created"
      );

      return this.mapRow(row);
    });
  }

  /**
   * Computes a field-by-field diff between two flat or nested JSON payloads.
   *
   * All top-level keys from both payloads are compared. Nested objects are
   * compared by JSON serialization (not deep-diffed recursively). To extend
   * to deep diffs, replace the comparison with a recursive implementation.
   */
  public computeDiff(
    current: Record<string, unknown>,
    target: Record<string, unknown>
  ): FieldDiff[] {
    const allKeys = new Set([
      ...Object.keys(current),
      ...Object.keys(target),
    ]);

    const diffs: FieldDiff[] = [];

    for (const field of allKeys) {
      const inCurrent = field in current;
      const inTarget = field in target;

      if (!inCurrent && inTarget) {
        diffs.push({
          field,
          currentValue: undefined,
          targetValue: target[field],
          changeType: "added",
        });
      } else if (inCurrent && !inTarget) {
        diffs.push({
          field,
          currentValue: current[field],
          targetValue: undefined,
          changeType: "removed",
        });
      } else {
        // Both exist — compare by serialized form to handle nested objects
        const currentSerialized = JSON.stringify(current[field]);
        const targetSerialized = JSON.stringify(target[field]);
        if (currentSerialized !== targetSerialized) {
          diffs.push({
            field,
            currentValue: current[field],
            targetValue: target[field],
            changeType: "modified",
          });
        }
      }
    }

    return diffs;
  }

  /** Generates a human-readable impact summary string from a diff. */
  private buildImpactSummary(
    configKey: string,
    currentVersion: number,
    targetVersion: number,
    diff: FieldDiff[]
  ): string {
    if (diff.length === 0) {
      return (
        `Rolling back '${configKey}' from v${currentVersion} to v${targetVersion} ` +
        `would make no changes (payloads are identical).`
      );
    }

    const modified = diff.filter((d) => d.changeType === "modified").length;
    const added = diff.filter((d) => d.changeType === "added").length;
    const removed = diff.filter((d) => d.changeType === "removed").length;

    const parts: string[] = [];
    if (modified > 0) parts.push(`${modified} field(s) modified`);
    if (added > 0) parts.push(`${added} field(s) added`);
    if (removed > 0) parts.push(`${removed} field(s) removed`);

    return (
      `Rolling back '${configKey}' from v${currentVersion} to v${targetVersion}: ` +
      parts.join(", ") +
      "."
    );
  }

  /** Summary for arbitrary version-to-version diffs (#1189). */
  private buildCompareSummary(
    configKey: string,
    fromVersion: number,
    toVersion: number,
    diff: FieldDiff[]
  ): string {
    if (diff.length === 0) {
      return (
        `Comparing '${configKey}' v${fromVersion} to v${toVersion}: ` +
        `no changes (payloads are identical).`
      );
    }

    const modified = diff.filter((d) => d.changeType === "modified").length;
    const added = diff.filter((d) => d.changeType === "added").length;
    const removed = diff.filter((d) => d.changeType === "removed").length;

    const parts: string[] = [];
    if (modified > 0) parts.push(`${modified} field(s) modified`);
    if (added > 0) parts.push(`${added} field(s) added`);
    if (removed > 0) parts.push(`${removed} field(s) removed`);

    return (
      `Comparing '${configKey}' v${fromVersion} to v${toVersion}: ` +
      parts.join(", ") +
      "."
    );
  }

  // ---------------------------------------------------------------------------
  // MAPPER
  // ---------------------------------------------------------------------------

  private mapRow(row: Record<string, unknown>): ConfigVersion {
    const parsePayload = (v: unknown): Record<string, unknown> => {
      if (!v) return {};
      if (typeof v === "object") return v as Record<string, unknown>;
      try {
        return JSON.parse(v as string);
      } catch {
        return {};
      }
    };

    return {
      id: row.id as string,
      configKey: row.config_key as string,
      versionNumber: row.version_number as number,
      payload: parsePayload(row.payload),
      changeSummary: (row.change_summary as string) ?? null,
      appliedBy: row.applied_by as string,
      appliedAt: row.applied_at as Date,
      isCurrent: row.is_current as boolean,
    };
  }
}

export const configVersionService = ConfigVersionService.getInstance();
