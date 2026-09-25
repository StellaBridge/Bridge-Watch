import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface OnChainConfigSnapshot {
  id: string;
  contractId: string;
  network: string;
  ledgerSequence: number;
  config: Record<string, unknown>;
  configHash: string;
  capturedBy: string;
  capturedAt: Date;
}

export type ConfigFieldChangeType = "added" | "removed" | "modified";

export interface ConfigFieldDiff {
  field: string;
  changeType: ConfigFieldChangeType;
  fromValue: unknown;
  toValue: unknown;
}

export interface OnChainConfigDiff {
  id: string;
  contractId: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  fromLedgerSequence: number;
  toLedgerSequence: number;
  fieldDiffs: ConfigFieldDiff[];
  fieldsAdded: number;
  fieldsRemoved: number;
  fieldsModified: number;
  summary: string | null;
  computedBy: string;
  computedAt: Date;
}

// =============================================================================
// SERVICE
// =============================================================================

export class OnChainConfigDiffService {
  private static instance: OnChainConfigDiffService;

  private constructor() {}

  public static getInstance(): OnChainConfigDiffService {
    if (!OnChainConfigDiffService.instance) {
      OnChainConfigDiffService.instance = new OnChainConfigDiffService();
    }
    return OnChainConfigDiffService.instance;
  }

  // ---------------------------------------------------------------------------
  // SNAPSHOT MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Records a new on-chain config snapshot.
   *
   * If a snapshot with the same (contract_id, network, ledger_sequence) already
   * exists the existing record is returned without inserting a duplicate.
   */
  public async captureSnapshot(
    contractId: string,
    network: string,
    ledgerSequence: number,
    config: Record<string, unknown>,
    capturedBy: string
  ): Promise<OnChainConfigSnapshot> {
    const db = getDatabase();
    const configHash = this.hashConfig(config);

    const existing = await db("on_chain_config_snapshots")
      .where("contract_id", contractId)
      .where("network", network)
      .where("ledger_sequence", ledgerSequence)
      .first();

    if (existing) {
      return this.mapSnapshot(existing);
    }

    const [row] = await db("on_chain_config_snapshots")
      .insert({
        contract_id: contractId,
        network,
        ledger_sequence: ledgerSequence,
        config: JSON.stringify(config),
        config_hash: configHash,
        captured_by: capturedBy,
        captured_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "on_chain_config_diff",
        action: "snapshot_captured",
        contract_id: contractId,
        network,
        ledger_sequence: ledgerSequence,
        config_hash: configHash,
        actor: capturedBy,
        timestamp: new Date().toISOString(),
      },
      "On-chain config snapshot captured"
    );

    return this.mapSnapshot(row);
  }

  /**
   * Returns a snapshot by ID, or null when not found.
   */
  public async getSnapshot(
    id: string
  ): Promise<OnChainConfigSnapshot | null> {
    const db = getDatabase();
    const row = await db("on_chain_config_snapshots").where("id", id).first();
    return row ? this.mapSnapshot(row) : null;
  }

  /**
   * Returns the snapshot for a specific ledger sequence, or null.
   */
  public async getSnapshotAtLedger(
    contractId: string,
    network: string,
    ledgerSequence: number
  ): Promise<OnChainConfigSnapshot | null> {
    const db = getDatabase();
    const row = await db("on_chain_config_snapshots")
      .where("contract_id", contractId)
      .where("network", network)
      .where("ledger_sequence", ledgerSequence)
      .first();
    return row ? this.mapSnapshot(row) : null;
  }

  /**
   * Lists snapshots for a contract in descending ledger order.
   */
  public async listSnapshots(
    contractId: string,
    network: string,
    limit = 50
  ): Promise<OnChainConfigSnapshot[]> {
    const db = getDatabase();
    const rows = await db("on_chain_config_snapshots")
      .where("contract_id", contractId)
      .where("network", network)
      .orderBy("ledger_sequence", "desc")
      .limit(limit);
    return rows.map(this.mapSnapshot);
  }

  // ---------------------------------------------------------------------------
  // DIFFING
  // ---------------------------------------------------------------------------

  /**
   * Computes and persists a field-level diff between two snapshots.
   *
   * If a diff for the same (from_snapshot_id, to_snapshot_id) pair already
   * exists it is returned without recomputation.
   *
   * @throws Error when either snapshot does not exist, or they refer to
   *   different contracts/networks, or the same ledger sequence is used.
   */
  public async computeDiff(
    fromSnapshotId: string,
    toSnapshotId: string,
    computedBy: string
  ): Promise<OnChainConfigDiff> {
    if (fromSnapshotId === toSnapshotId) {
      throw new Error(
        "from_snapshot_id and to_snapshot_id must be different snapshots."
      );
    }

    const db = getDatabase();

    // Return cached diff when available
    const existing = await db("on_chain_config_diffs")
      .where("from_snapshot_id", fromSnapshotId)
      .where("to_snapshot_id", toSnapshotId)
      .first();

    if (existing) {
      return this.mapDiff(existing);
    }

    const [fromSnapshot, toSnapshot] = await Promise.all([
      this.getSnapshot(fromSnapshotId),
      this.getSnapshot(toSnapshotId),
    ]);

    if (!fromSnapshot) {
      throw new Error(`Snapshot not found: ${fromSnapshotId}.`);
    }
    if (!toSnapshot) {
      throw new Error(`Snapshot not found: ${toSnapshotId}.`);
    }
    if (fromSnapshot.contractId !== toSnapshot.contractId) {
      throw new Error(
        `Snapshots belong to different contracts: ` +
          `${fromSnapshot.contractId} vs ${toSnapshot.contractId}.`
      );
    }
    if (fromSnapshot.network !== toSnapshot.network) {
      throw new Error(
        `Snapshots belong to different networks: ` +
          `${fromSnapshot.network} vs ${toSnapshot.network}.`
      );
    }
    if (fromSnapshot.ledgerSequence === toSnapshot.ledgerSequence) {
      throw new Error(
        `Both snapshots are at ledger sequence ${fromSnapshot.ledgerSequence}. ` +
          `Select snapshots from different ledgers.`
      );
    }

    const fieldDiffs = this.diffConfigs(fromSnapshot.config, toSnapshot.config);
    const fieldsAdded = fieldDiffs.filter((d) => d.changeType === "added").length;
    const fieldsRemoved = fieldDiffs.filter((d) => d.changeType === "removed").length;
    const fieldsModified = fieldDiffs.filter((d) => d.changeType === "modified").length;
    const summary = this.buildSummary(
      fromSnapshot.contractId,
      fromSnapshot.ledgerSequence,
      toSnapshot.ledgerSequence,
      fieldDiffs
    );

    const [row] = await db("on_chain_config_diffs")
      .insert({
        contract_id: fromSnapshot.contractId,
        from_snapshot_id: fromSnapshotId,
        to_snapshot_id: toSnapshotId,
        from_ledger_sequence: fromSnapshot.ledgerSequence,
        to_ledger_sequence: toSnapshot.ledgerSequence,
        field_diffs: JSON.stringify(fieldDiffs),
        fields_added: fieldsAdded,
        fields_removed: fieldsRemoved,
        fields_modified: fieldsModified,
        summary,
        computed_by: computedBy,
        computed_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "on_chain_config_diff",
        action: "diff_computed",
        contract_id: fromSnapshot.contractId,
        from_ledger: fromSnapshot.ledgerSequence,
        to_ledger: toSnapshot.ledgerSequence,
        fields_changed: fieldDiffs.length,
        actor: computedBy,
        timestamp: new Date().toISOString(),
      },
      "On-chain config diff computed"
    );

    return this.mapDiff(row);
  }

  /**
   * Returns a previously computed diff by ID, or null when not found.
   */
  public async getDiff(id: string): Promise<OnChainConfigDiff | null> {
    const db = getDatabase();
    const row = await db("on_chain_config_diffs").where("id", id).first();
    return row ? this.mapDiff(row) : null;
  }

  /**
   * Lists diffs for a contract in descending computed_at order.
   */
  public async listDiffs(
    contractId: string,
    limit = 50
  ): Promise<OnChainConfigDiff[]> {
    const db = getDatabase();
    const rows = await db("on_chain_config_diffs")
      .where("contract_id", contractId)
      .orderBy("computed_at", "desc")
      .limit(limit);
    return rows.map(this.mapDiff);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC DIFFING PRIMITIVE
  // ---------------------------------------------------------------------------

  /**
   * Computes a field-level diff between two config objects.
   * Exposed publicly for unit testing without DB access.
   */
  public diffConfigs(
    from: Record<string, unknown>,
    to: Record<string, unknown>
  ): ConfigFieldDiff[] {
    const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
    const diffs: ConfigFieldDiff[] = [];

    for (const field of allKeys) {
      const inFrom = field in from;
      const inTo = field in to;

      if (!inFrom && inTo) {
        diffs.push({ field, changeType: "added", fromValue: undefined, toValue: to[field] });
      } else if (inFrom && !inTo) {
        diffs.push({ field, changeType: "removed", fromValue: from[field], toValue: undefined });
      } else if (JSON.stringify(from[field]) !== JSON.stringify(to[field])) {
        diffs.push({ field, changeType: "modified", fromValue: from[field], toValue: to[field] });
      }
    }

    return diffs;
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private hashConfig(config: Record<string, unknown>): string {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(config))
      .digest("hex");
  }

  private buildSummary(
    contractId: string,
    fromLedger: number,
    toLedger: number,
    diffs: ConfigFieldDiff[]
  ): string {
    if (diffs.length === 0) {
      return (
        `Config for '${contractId}' is identical between ` +
        `ledger ${fromLedger} and ledger ${toLedger}.`
      );
    }

    const added = diffs.filter((d) => d.changeType === "added").length;
    const removed = diffs.filter((d) => d.changeType === "removed").length;
    const modified = diffs.filter((d) => d.changeType === "modified").length;

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} field(s) added`);
    if (removed > 0) parts.push(`${removed} field(s) removed`);
    if (modified > 0) parts.push(`${modified} field(s) modified`);

    return (
      `Config for '${contractId}' changed between ` +
      `ledger ${fromLedger} and ledger ${toLedger}: ` +
      parts.join(", ") +
      "."
    );
  }

  // ---------------------------------------------------------------------------
  // MAPPERS
  // ---------------------------------------------------------------------------

  private mapSnapshot(row: Record<string, unknown>): OnChainConfigSnapshot {
    const parseConfig = (v: unknown): Record<string, unknown> => {
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
      contractId: row.contract_id as string,
      network: row.network as string,
      ledgerSequence: Number(row.ledger_sequence),
      config: parseConfig(row.config),
      configHash: row.config_hash as string,
      capturedBy: row.captured_by as string,
      capturedAt: row.captured_at as Date,
    };
  }

  private mapDiff(row: Record<string, unknown>): OnChainConfigDiff {
    const parseFieldDiffs = (v: unknown): ConfigFieldDiff[] => {
      if (Array.isArray(v)) return v as ConfigFieldDiff[];
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch {
          return [];
        }
      }
      return [];
    };

    return {
      id: row.id as string,
      contractId: row.contract_id as string,
      fromSnapshotId: row.from_snapshot_id as string,
      toSnapshotId: row.to_snapshot_id as string,
      fromLedgerSequence: Number(row.from_ledger_sequence),
      toLedgerSequence: Number(row.to_ledger_sequence),
      fieldDiffs: parseFieldDiffs(row.field_diffs),
      fieldsAdded: Number(row.fields_added),
      fieldsRemoved: Number(row.fields_removed),
      fieldsModified: Number(row.fields_modified),
      summary: (row.summary as string) ?? null,
      computedBy: row.computed_by as string,
      computedAt: row.computed_at as Date,
    };
  }
}

export const onChainConfigDiffService = OnChainConfigDiffService.getInstance();
