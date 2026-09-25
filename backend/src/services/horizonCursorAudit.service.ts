import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { getMetricsService } from "./metrics.service.js";

export interface CursorPosition {
  cursorKey: string;
  cursorType: string;
  sourceName: string;
  currentPosition: string;
}

export interface AuditLogEntry {
  cursorId: string;
  action: "advance" | "reset" | "initialize" | "resume" | "pause";
  previousPosition?: string;
  newPosition: string;
  eventsInBatch: number;
  reasonCode?: string;
  reasonDescription?: string;
}

export interface RollbackInfo {
  cursorId: string;
  fromPosition: string;
  toPosition: string;
  eventsRolledBack: number;
  rollbackReason: "data_corruption" | "network_failure" | "duplicate_events" | "ordering_violation" | "manual_override";
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

export class HorizonCursorAuditService {
  async initializeCursor(cursorPosition: CursorPosition) {
    const database = getDatabase();
    logger.info({ cursorKey: cursorPosition.cursorKey }, "Initializing Horizon cursor");

    try {
      const [cursor] = await database("horizon_cursor_positions")
        .insert({
          cursor_key: cursorPosition.cursorKey,
          cursor_type: cursorPosition.cursorType,
          source_name: cursorPosition.sourceName,
          current_position: cursorPosition.currentPosition,
          last_synced_at: new Date(),
          status: "active",
        })
        .returning("*");

      await database("horizon_cursor_audit_logs").insert({
        cursor_id: cursor.id,
        action: "initialize",
        new_position: cursorPosition.currentPosition,
        events_in_batch: 0,
        initiated_by: "system",
      });

      return cursor;
    } catch (error) {
      logger.error({ error }, "Failed to initialize cursor");
      throw error;
    }
  }

  async advanceCursor(cursorKey: string, newPosition: string, eventsInBatch: number, reasonCode?: string) {
    const database = getDatabase();
    logger.info({ cursorKey, newPosition, eventsInBatch }, "Advancing Horizon cursor");

    try {
      const cursor = await database("horizon_cursor_positions").where("cursor_key", cursorKey).first();

      if (!cursor) {
        throw new Error(`Cursor not found: ${cursorKey}`);
      }

      const previousPosition = cursor.current_position;

      await database("horizon_cursor_positions")
        .where("id", cursor.id)
        .update({
          current_position: newPosition,
          last_synced_at: new Date(),
          total_events_processed: cursor.total_events_processed + eventsInBatch,
        });

      // #1245 — expose the last sync time so Prometheus can alert on cursor lag
      getMetricsService().horizonCursorLastSyncTimestamp.set(
        { cursor_key: cursorKey },
        Math.floor(Date.now() / 1000)
      );

      await database("horizon_cursor_audit_logs").insert({
        cursor_id: cursor.id,
        action: "advance",
        previous_position: previousPosition,
        new_position: newPosition,
        events_in_batch: eventsInBatch,
        initiated_by: "worker",
        reason_code: reasonCode || "normal_sync",
        validation_passed: true,
      });

      return { success: true, previousPosition, newPosition };
    } catch (error) {
      logger.error({ error }, "Failed to advance cursor");
      throw error;
    }
  }

  async createRollback(rollbackInfo: RollbackInfo) {
    const database = getDatabase();
    logger.info(
      {
        cursorId: rollbackInfo.cursorId,
        fromPosition: rollbackInfo.fromPosition,
        toPosition: rollbackInfo.toPosition,
      },
      "Creating cursor rollback"
    );

    try {
      const [rollback] = await database("horizon_cursor_rollbacks")
        .insert({
          cursor_id: rollbackInfo.cursorId,
          from_position: rollbackInfo.fromPosition,
          to_position: rollbackInfo.toPosition,
          events_rolled_back: rollbackInfo.eventsRolledBack,
          rollback_reason: rollbackInfo.rollbackReason,
          description: rollbackInfo.description,
          severity: rollbackInfo.severity,
          status: "initiated",
          requires_reprocessing: true,
        })
        .returning("*");

      await database("horizon_cursor_audit_logs").insert({
        cursor_id: rollbackInfo.cursorId,
        action: "reset",
        previous_position: rollbackInfo.fromPosition,
        new_position: rollbackInfo.toPosition,
        events_in_batch: rollbackInfo.eventsRolledBack,
        initiated_by: "operator",
        reason_code: rollbackInfo.rollbackReason,
        reason_description: rollbackInfo.description,
        validation_passed: false,
        validation_errors: JSON.stringify({ type: rollbackInfo.rollbackReason }),
      });

      return rollback;
    } catch (error) {
      logger.error({ error }, "Failed to create rollback");
      throw error;
    }
  }

  async completeRollback(rollbackId: string) {
    const database = getDatabase();
    logger.info({ rollbackId }, "Completing cursor rollback");

    await database("horizon_cursor_rollbacks").where("id", rollbackId).update({
      status: "completed",
      completed_at: new Date(),
    });
  }

  async reconcileCursorPosition(cursorId: string, horizonPosition: string) {
    const database = getDatabase();
    logger.info({ cursorId, horizonPosition }, "Reconciling cursor position");

    const cursor = await database("horizon_cursor_positions").where("id", cursorId).first();

    if (!cursor) {
      throw new Error(`Cursor not found: ${cursorId}`);
    }

    const localPosition = cursor.current_position;
    const positionsMatch = horizonPosition === localPosition;
    let actionTaken = "none";
    let autoCorrect = false;

    if (!positionsMatch) {
      const gap = Math.abs(parseInt(horizonPosition) - parseInt(localPosition));

      if (gap < 100) {
        actionTaken = "corrected_local";
        autoCorrect = true;
        await database("horizon_cursor_positions").where("id", cursorId).update({
          current_position: horizonPosition,
        });
      } else {
        actionTaken = "escalated";
      }
    }

    const [reconciliation] = await database("horizon_cursor_reconciliations")
      .insert({
        cursor_id: cursorId,
        cursor_type: cursor.cursor_type,
        checked_at: new Date(),
        horizon_position: horizonPosition,
        local_position: localPosition,
        positions_match: positionsMatch,
        position_gap: parseInt(horizonPosition) - parseInt(localPosition),
        consistency_verified: positionsMatch,
        action_taken: actionTaken,
        auto_corrected: autoCorrect,
      })
      .returning("*");

    return reconciliation;
  }

  async getAuditLog(cursorKey: string, limit = 100, offset = 0) {
    const database = getDatabase();
    const cursor = await database("horizon_cursor_positions").where("cursor_key", cursorKey).first();

    if (!cursor) {
      throw new Error(`Cursor not found: ${cursorKey}`);
    }

    const logs = await database("horizon_cursor_audit_logs")
      .where("cursor_id", cursor.id)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    const total = await database("horizon_cursor_audit_logs")
      .where("cursor_id", cursor.id)
      .count("id as count")
      .first();

    return {
      cursor,
      logs,
      pagination: { total: total?.count || 0, limit, offset },
    };
  }

  async getRollbackHistory(cursorKey: string, limit = 50) {
    const database = getDatabase();
    const cursor = await database("horizon_cursor_positions").where("cursor_key", cursorKey).first();

    if (!cursor) {
      throw new Error(`Cursor not found: ${cursorKey}`);
    }

    const rollbacks = await database("horizon_cursor_rollbacks")
      .where("cursor_id", cursor.id)
      .orderBy("created_at", "desc")
      .limit(limit);

    return rollbacks;
  }

  async getReconciliationHistory(cursorKey: string, limit = 50) {
    const database = getDatabase();
    const cursor = await database("horizon_cursor_positions").where("cursor_key", cursorKey).first();

    if (!cursor) {
      throw new Error(`Cursor not found: ${cursorKey}`);
    }

    const reconciliations = await database("horizon_cursor_reconciliations")
      .where("cursor_id", cursor.id)
      .orderBy("checked_at", "desc")
      .limit(limit);

    return reconciliations;
  }

  async getDiscrepancies(limit = 50) {
    const database = getDatabase();
    const discrepancies = await database("horizon_cursor_reconciliations")
      .where("positions_match", false)
      .orderBy("checked_at", "desc")
      .limit(limit);

    return discrepancies;
  }

  async pauseCursor(cursorKey: string) {
    const database = getDatabase();
    logger.info({ cursorKey }, "Pausing cursor");

    const cursor = await database("horizon_cursor_positions").where("cursor_key", cursorKey).first();

    if (!cursor) {
      throw new Error(`Cursor not found: ${cursorKey}`);
    }

    await database("horizon_cursor_positions").where("id", cursor.id).update({
      status: "paused",
    });

    await database("horizon_cursor_audit_logs").insert({
      cursor_id: cursor.id,
      action: "pause",
      new_position: cursor.current_position,
      events_in_batch: 0,
      initiated_by: "operator",
    });
  }

  async resumeCursor(cursorKey: string) {
    const database = getDatabase();
    logger.info({ cursorKey }, "Resuming cursor");

    const cursor = await database("horizon_cursor_positions").where("cursor_key", cursorKey).first();

    if (!cursor) {
      throw new Error(`Cursor not found: ${cursorKey}`);
    }

    await database("horizon_cursor_positions").where("id", cursor.id).update({
      status: "active",
    });

    await database("horizon_cursor_audit_logs").insert({
      cursor_id: cursor.id,
      action: "resume",
      new_position: cursor.current_position,
      events_in_batch: 0,
      initiated_by: "operator",
    });
  }
}

export const horizonCursorAuditService = new HorizonCursorAuditService();
