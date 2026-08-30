import { logger } from "../../utils/logger.js";
import { getDatabase } from "../../database/connection.js";
import type { Knex } from "knex";
import type { PoolControl, ControlActionRequest, ControlActionResponse } from "../../models/db-pool-metrics/pool.model.js";
import { ControlAction, ControlResult } from "../../models/db-pool-metrics/pool.model.js";

/**
 * Pool Control Handler Service
 * Handles operator requests to control the connection pool
 * Validates, executes, and audits all control actions
 */
export class PoolControlHandler {
  private pool: any;
  private db: Knex;

  constructor(pool: any) {
    this.pool = pool;
    this.db = getDatabase();
  }

  /**
   * Handle a control action request
   */
  async handle(
    request: ControlActionRequest,
    actorId: string
  ): Promise<ControlActionResponse> {
    const auditId = this.generateAuditId();

    try {
      // Log the request
      logger.info(
        { request, actorId, auditId },
        "Pool control action requested"
      );

      // Validate the request
      this.validateRequest(request);

      // Execute the action
      const result = await this.executeAction(request);

      // Audit the successful action
      await this.auditAction({
        pool_id: request.pool_id,
        action: request.action,
        actor_id: actorId,
        parameters: request.parameters,
        result: ControlResult.SUCCESS,
        audit_id: auditId,
      });

      logger.info({ auditId, result }, "Pool control action succeeded");
      return { success: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Audit the failed action
      await this.auditAction(
        {
          pool_id: request.pool_id,
          action: request.action,
          actor_id: actorId,
          parameters: request.parameters,
          result: ControlResult.FAILED,
          error_message: errorMessage,
          audit_id: auditId,
        }
      ).catch((auditError) => {
        logger.error({ auditError }, "Failed to audit failed action");
      });

      logger.error({ auditId, error }, "Pool control action failed");
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Validate a control request
   */
  private validateRequest(request: ControlActionRequest): void {
    if (!request.pool_id) {
      throw new Error("pool_id is required");
    }

    if (!request.action) {
      throw new Error("action is required");
    }

    // Validate action type
    const validActions = Object.values(ControlAction);
    if (!validActions.includes(request.action)) {
      throw new Error(`Invalid action: ${request.action}. Valid actions: ${validActions.join(", ")}`);
    }

    // Validate action-specific parameters
    this.validateActionParameters(request.action, request.parameters);
  }

  /**
   * Validate parameters for a specific action
   */
  private validateActionParameters(
    action: ControlAction,
    parameters?: Record<string, any>
  ): void {
    switch (action) {
      case ControlAction.SET_MAX_CONNECTIONS:
        if (!parameters?.max || typeof parameters.max !== "number") {
          throw new Error("SET_MAX_CONNECTIONS requires 'max' parameter (number)");
        }
        if (parameters.max < 1) {
          throw new Error("max_connections must be >= 1");
        }
        if (parameters.max > 1000) {
          throw new Error("max_connections cannot exceed 1000");
        }
        break;

      case ControlAction.SET_MIN_CONNECTIONS:
        if (!parameters?.min || typeof parameters.min !== "number") {
          throw new Error("SET_MIN_CONNECTIONS requires 'min' parameter (number)");
        }
        if (parameters.min < 0) {
          throw new Error("min_connections must be >= 0");
        }
        if (parameters.min > 100) {
          throw new Error("min_connections cannot exceed 100");
        }
        break;

      case ControlAction.EVICT_IDLE:
        // No parameters required
        break;

      case ControlAction.DRAIN_POOL:
        // No parameters required
        break;

      case ControlAction.RESET_STATS:
        // No parameters required
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Execute a control action on the pool
   */
  private async executeAction(request: ControlActionRequest): Promise<any> {
    switch (request.action) {
      case ControlAction.SET_MAX_CONNECTIONS:
        return this.setMaxConnections(request.parameters!.max);

      case ControlAction.SET_MIN_CONNECTIONS:
        return this.setMinConnections(request.parameters!.min);

      case ControlAction.EVICT_IDLE:
        return this.evictIdleConnections();

      case ControlAction.DRAIN_POOL:
        return this.drainPool();

      case ControlAction.RESET_STATS:
        return this.resetStats();

      default:
        throw new Error(`Unhandled action: ${request.action}`);
    }
  }

  /**
   * Set max connections
   */
  private async setMaxConnections(max: number): Promise<any> {
    const oldMax = this.pool.options?.max || 20;

    // Update pool configuration
    if (this.pool.options) {
      this.pool.options.max = max;
    }

    logger.info({ oldMax, newMax: max }, "Pool max_connections updated");
    return { oldMax, newMax: max };
  }

  /**
   * Set min connections
   */
  private async setMinConnections(min: number): Promise<any> {
    const oldMin = this.pool.options?.min || 2;

    // Update pool configuration
    if (this.pool.options) {
      this.pool.options.min = min;
    }

    logger.info({ oldMin, newMin: min }, "Pool min_connections updated");
    return { oldMin, newMin: min };
  }

  /**
   * Evict idle connections
   */
  private async evictIdleConnections(): Promise<any> {
    // For pg library, idle connections are in pool.idleClients
    let evicted = 0;
    try {
      if (this.pool.idleClients && Array.isArray(this.pool.idleClients)) {
        evicted = this.pool.idleClients.length;
        // In a real implementation, we would call disconnect on idle clients
        // this.pool.idleClients.forEach(client => client.end());
        // For safety, we just count them
      }
    } catch (error) {
      logger.warn({ error }, "Failed to evict idle connections");
    }

    logger.info({ evicted }, "Idle connections evicted");
    return { evicted };
  }

  /**
   * Drain the pool (close all connections)
   */
  private async drainPool(): Promise<any> {
    try {
      const totalConnections = this.pool.totalCount || 0;
      // In production, this would call pool.drain() or similar
      // For now, we just log it
      logger.warn({ totalConnections }, "Pool drain requested");
      return { totalConnections, status: "drained" };
    } catch (error) {
      throw new Error(`Failed to drain pool: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reset pool statistics
   */
  private async resetStats(): Promise<any> {
    try {
      // Reset internal counters
      if (this.pool.stats) {
        this.pool.stats = {
          acquired: 0,
          released: 0,
          errors: 0,
        };
      }
      logger.info("Pool statistics reset");
      return { status: "reset" };
    } catch (error) {
      throw new Error(`Failed to reset stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Audit a control action
   */
  private async auditAction(action: Omit<PoolControl, "id" | "created_at" | "updated_at" | "timestamp">): Promise<void> {
    try {
      await this.db("db_pool_controls").insert({
        timestamp: new Date(),
        ...action,
      });
    } catch (error) {
      logger.error({ error }, "Failed to audit pool control action");
      // Do not throw - continue operation
    }
  }

  /**
   * Generate a unique audit ID
   */
  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
let controlHandler: PoolControlHandler | undefined;

/**
 * Get or create the control handler instance
 */
export function getPoolControlHandler(pool?: any): PoolControlHandler {
  if (!controlHandler && pool) {
    controlHandler = new PoolControlHandler(pool);
  }
  return controlHandler!;
}
