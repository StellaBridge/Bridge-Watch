import { logger } from "../../utils/logger.js";
import { getDatabase } from "../../database/connection.js";
import { getMetricsService } from "../metrics.service.js";
import type { Knex } from "knex";
import type {
  PoolSnapshot,
  PoolEvent,
  PoolHealthStatus,
  PoolEventType,
  EventSeverity,
} from "../../models/db-pool-metrics/pool.model.js";
import { PoolEventType, EventSeverity } from "../../models/db-pool-metrics/pool.model.js";

/**
 * Represents current pool metrics
 */
interface CurrentPoolMetrics {
  poolId: string;
  active: number;
  idle: number;
  waiting: number;
  max: number;
  min: number;
  acquiredTotal?: number;
  releasedTotal?: number;
  avgAcquireMs?: number;
  avgQueryMs?: number;
  errorCount?: number;
  timestamp: Date;
}

/**
 * Pool Metrics Collector Service
 * Collects metrics from the database connection pool at regular intervals
 * and stores them in the database, emits events for significant changes
 */
export class PoolMetricsCollector {
  private pool: any; // Reference to actual database pool (from pg or similar)
  private intervalMs: number;
  private intervalId?: NodeJS.Timeout;
  private db: Knex;
  private metricsService = getMetricsService();
  private lastMetrics: Map<string, CurrentPoolMetrics> = new Map();
  private isRunning = false;

  constructor(pool: any, intervalMs: number = 5000) {
    this.pool = pool;
    this.intervalMs = intervalMs;
    this.db = getDatabase();
  }

  /**
   * Start collecting metrics
   */
  start(): void {
    if (this.isRunning) {
      logger.warn("Pool metrics collector already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting pool metrics collector");

    // Collect immediately, then at intervals
    this.collectAndPersist().catch((error) => {
      logger.error({ error }, "Initial metrics collection failed");
    });

    this.intervalId = setInterval(() => {
      this.collectAndPersist().catch((error) => {
        logger.error({ error }, "Periodic metrics collection failed");
        // Continue running despite errors - do not crash the application
      });
    }, this.intervalMs);
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    logger.info("Stopped pool metrics collector");
  }

  /**
   * Check if collector is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Collect metrics and persist to database
   */
  private async collectAndPersist(): Promise<void> {
    try {
      const metrics = await this.collectMetrics();
      await this.persistSnapshot(metrics);
      await this.emitEvents(metrics);
      
      // Record in Prometheus metrics
      this.recordPrometheusMetrics(metrics);
    } catch (error) {
      // Log but do not crash the application
      logger.error(
        { error },
        "Pool metrics collection cycle failed"
      );
    }
  }

  /**
   * Collect current metrics from the pool
   */
  private async collectMetrics(): Promise<CurrentPoolMetrics> {
    // Extract metrics from the actual database pool
    // This adapts to the pg library's pool API
    const poolState = this.pool._pools || { // pg library internals
      getClient: [],
      idleClients: [],
    };

    const activeCount = (this.pool.totalCount || 0) - (this.pool.idleCount || 0);
    const idleCount = this.pool.idleCount || 0;
    const waitingCount = this.pool.waitingCount || 0;
    const maxConnections = this.pool.options?.max || 20;
    const minConnections = this.pool.options?.min || 2;

    return {
      poolId: "default",
      active: Math.max(0, activeCount),
      idle: Math.max(0, idleCount),
      waiting: Math.max(0, waitingCount),
      max: maxConnections,
      min: minConnections,
      timestamp: new Date(),
    };
  }

  /**
   * Persist a snapshot to the database
   */
  private async persistSnapshot(metrics: CurrentPoolMetrics): Promise<void> {
    try {
      await this.db("db_pool_snapshots").insert({
        timestamp: metrics.timestamp,
        pool_id: metrics.poolId,
        active_connections: metrics.active,
        idle_connections: metrics.idle,
        waiting_requests: metrics.waiting,
        max_connections: metrics.max,
        min_connections: metrics.min,
        acquired_total: metrics.acquiredTotal,
        released_total: metrics.releasedTotal,
        avg_acquire_ms: metrics.avgAcquireMs,
        avg_query_ms: metrics.avgQueryMs,
        error_count: metrics.errorCount,
      });
    } catch (error) {
      logger.error({ error }, "Failed to persist pool snapshot");
      throw error;
    }
  }

  /**
   * Emit events for significant pool state changes
   */
  private async emitEvents(metrics: CurrentPoolMetrics): Promise<void> {
    const lastMetrics = this.lastMetrics.get(metrics.poolId);

    try {
      // Check for waiting requests
      if (metrics.waiting > 0 && (!lastMetrics || lastMetrics.waiting === 0)) {
        await this.emitEvent("WAITING_REQUESTS", "warning", {
          waiting: metrics.waiting,
          active: metrics.active,
          max: metrics.max,
        });
      }

      // Check for pool near exhaustion (>90% utilization)
      const utilization = metrics.active / metrics.max;
      if (utilization >= 0.9 && (!lastMetrics || lastMetrics.active / lastMetrics.max < 0.9)) {
        await this.emitEvent("POOL_NEAR_EXHAUSTION", "critical", {
          active: metrics.active,
          max: metrics.max,
          utilization: utilization,
        });
      }

      // Check for pool exhaustion (100% utilization with waiting)
      if (
        utilization === 1.0 &&
        metrics.waiting > 0 &&
        (!lastMetrics || (lastMetrics.active / lastMetrics.max < 1.0 || lastMetrics.waiting === 0))
      ) {
        await this.emitEvent("POOL_EXHAUSTED", "critical", {
          active: metrics.active,
          max: metrics.max,
          waiting: metrics.waiting,
        });
      }

      // Check for recovery from exhaustion
      if (
        lastMetrics &&
        (lastMetrics.active / lastMetrics.max >= 0.9 || lastMetrics.waiting > 0) &&
        utilization < 0.7 &&
        metrics.waiting === 0
      ) {
        await this.emitEvent("POOL_RECOVERED", "info", {
          active: metrics.active,
          max: metrics.max,
          utilization: utilization,
        });
      }

      // Check for error spike
      if (
        metrics.errorCount &&
        lastMetrics?.errorCount &&
        metrics.errorCount - lastMetrics.errorCount > 10
      ) {
        await this.emitEvent("ERROR_SPIKE", "critical", {
          errors_in_period: metrics.errorCount - lastMetrics.errorCount,
          total_errors: metrics.errorCount,
        });
      }

      // Update last metrics
      this.lastMetrics.set(metrics.poolId, metrics);
    } catch (error) {
      logger.error({ error }, "Failed to emit pool events");
      throw error;
    }
  }

  /**
   * Emit an event to the database
   */
  private async emitEvent(
    eventType: PoolEventType,
    severity: EventSeverity,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.db("db_pool_events").insert({
        timestamp: new Date(),
        pool_id: "default",
        event_type: eventType,
        severity: severity,
        details: JSON.stringify(details),
        message: this.getEventMessage(eventType, details),
      });

      logger.info(
        { eventType, severity, details },
        "Pool event emitted"
      );
    } catch (error) {
      logger.error({ error }, "Failed to emit pool event");
      // Do not throw - continue operation
    }
  }

  /**
   * Generate a human-readable message for an event
   */
  private getEventMessage(
    eventType: PoolEventType,
    details: Record<string, any>
  ): string {
    switch (eventType) {
      case PoolEventType.WAITING_REQUESTS:
        return `${details.waiting} requests waiting for connection (${details.active}/${details.max} active)`;
      case PoolEventType.POOL_NEAR_EXHAUSTION:
        return `Pool utilization at ${(details.utilization * 100).toFixed(1)}% (${details.active}/${details.max})`;
      case PoolEventType.POOL_EXHAUSTED:
        return `Pool exhausted with ${details.waiting} requests waiting`;
      case PoolEventType.POOL_RECOVERED:
        return `Pool recovered to ${(details.utilization * 100).toFixed(1)}% utilization`;
      case PoolEventType.ERROR_SPIKE:
        return `${details.errors_in_period} errors detected in recent period (total: ${details.total_errors})`;
      default:
        return eventType;
    }
  }

  /**
   * Record metrics to Prometheus
   */
  private recordPrometheusMetrics(metrics: CurrentPoolMetrics): void {
    try {
      // Update Prometheus gauges for database connections
      this.metricsService.dbConnectionsActive.set(metrics.active);
      this.metricsService.dbConnectionsIdle.set(metrics.idle);
    } catch (error) {
      logger.warn({ error }, "Failed to record Prometheus metrics");
      // Do not crash on metrics errors
    }
  }

  /**
   * Get current pool health status
   */
  async getHealthStatus(): Promise<PoolHealthStatus> {
    try {
      const latest = await this.db("db_pool_snapshots")
        .select("*")
        .where("pool_id", "default")
        .orderBy("timestamp", "desc")
        .first();

      if (!latest) {
        return {
          pool_id: "default",
          is_healthy: true,
          current_utilization: 0,
          active_connections: 0,
          idle_connections: 0,
          waiting_requests: 0,
          max_connections: 0,
          recent_errors: 0,
          last_heartbeat: new Date(),
          recommended_actions: [],
        };
      }

      const utilization = latest.active_connections / latest.max_connections;
      const recommendedActions: string[] = [];

      if (latest.waiting_requests > 0) {
        recommendedActions.push("Investigate waiting requests");
      }
      if (utilization > 0.9) {
        recommendedActions.push("Consider increasing max_connections");
      }
      if (latest.error_count && latest.error_count > 10) {
        recommendedActions.push("Investigate connection errors");
      }

      return {
        pool_id: latest.pool_id,
        is_healthy: utilization < 0.9 && latest.waiting_requests === 0,
        current_utilization: utilization,
        active_connections: latest.active_connections,
        idle_connections: latest.idle_connections,
        waiting_requests: latest.waiting_requests,
        max_connections: latest.max_connections,
        recent_errors: latest.error_count || 0,
        last_heartbeat: latest.timestamp,
        recommended_actions: recommendedActions,
      };
    } catch (error) {
      logger.error({ error }, "Failed to get pool health status");
      throw error;
    }
  }
}

// Singleton instance
let metricsCollector: PoolMetricsCollector | undefined;

/**
 * Get or create the metrics collector instance
 */
export function getPoolMetricsCollector(pool?: any): PoolMetricsCollector {
  if (!metricsCollector && pool) {
    metricsCollector = new PoolMetricsCollector(pool);
  }
  return metricsCollector!;
}
