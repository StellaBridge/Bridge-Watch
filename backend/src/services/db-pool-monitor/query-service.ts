import { logger } from "../../utils/logger.js";
import { getDatabase } from "../../database/connection.js";
import type { Knex } from "knex";
import type {
  PoolSnapshot,
  PoolEvent,
  AggregatedPoolMetrics,
  MetricsQueryOptions,
  EventsQueryOptions,
} from "../../models/db-pool-metrics/pool.model.js";

/**
 * Pool Data Query Service
 * Handles database queries for pool metrics, events, and analysis
 */
export class PoolDataQueryService {
  private db: Knex;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Get aggregated metrics for a time range
   */
  async getMetrics(options: MetricsQueryOptions = {}): Promise<AggregatedPoolMetrics[]> {
    try {
      const {
        range = "24h",
        resolution = "1h",
        pool_id = "default",
      } = options;

      const timeRange = this.parseTimeRange(range);
      const resolutionInterval = this.getResolutionInterval(resolution);

      const query = this.db("db_pool_snapshots")
        .select(
          this.db.raw(`date_trunc(?, timestamp) as bucket`, [resolutionInterval]),
          this.db.raw("AVG(active_connections) as avg_active"),
          this.db.raw("AVG(idle_connections) as avg_idle"),
          this.db.raw("AVG(waiting_requests) as avg_waiting"),
          this.db.raw("MAX(active_connections) as max_active"),
          this.db.raw("MIN(active_connections) as min_active"),
          this.db.raw("MAX(waiting_requests) as max_waiting"),
          "pool_id"
        )
        .where("pool_id", pool_id)
        .whereBetween("timestamp", [timeRange.start, timeRange.end])
        .groupBy("bucket", "pool_id")
        .orderBy("bucket", "asc");

      const results = await query;
      return results as AggregatedPoolMetrics[];
    } catch (error) {
      logger.error({ error }, "Failed to get pool metrics");
      throw error;
    }
  }

  /**
   * Get recent events
   */
  async getEvents(options: EventsQueryOptions = {}): Promise<PoolEvent[]> {
    try {
      const {
        range = "24h",
        event_type,
        severity,
        pool_id = "default",
        limit = 100,
        offset = 0,
      } = options;

      const timeRange = this.parseTimeRange(range);

      let query = this.db("db_pool_events")
        .select("*")
        .where("pool_id", pool_id)
        .whereBetween("timestamp", [timeRange.start, timeRange.end]);

      if (event_type) {
        query = query.where("event_type", event_type);
      }

      if (severity) {
        query = query.where("severity", severity);
      }

      const results = await query
        .orderBy("timestamp", "desc")
        .limit(limit)
        .offset(offset);

      return results as PoolEvent[];
    } catch (error) {
      logger.error({ error }, "Failed to get pool events");
      throw error;
    }
  }

  /**
   * Get latest snapshot
   */
  async getLatestSnapshot(poolId: string = "default"): Promise<PoolSnapshot | null> {
    try {
      const result = await this.db("db_pool_snapshots")
        .select("*")
        .where("pool_id", poolId)
        .orderBy("timestamp", "desc")
        .first();

      return result as PoolSnapshot | undefined || null;
    } catch (error) {
      logger.error({ error }, "Failed to get latest snapshot");
      throw error;
    }
  }

  /**
   * Get pool statistics for a time range
   */
  async getPoolStats(
    poolId: string = "default",
    range: string = "24h"
  ): Promise<Record<string, any>> {
    try {
      const timeRange = this.parseTimeRange(range);

      const stats = await this.db("db_pool_snapshots")
        .select(
          this.db.raw("AVG(active_connections) as avg_active"),
          this.db.raw("MAX(active_connections) as max_active"),
          this.db.raw("MIN(active_connections) as min_active"),
          this.db.raw("AVG(idle_connections) as avg_idle"),
          this.db.raw("AVG(waiting_requests) as avg_waiting"),
          this.db.raw("MAX(waiting_requests) as max_waiting"),
          this.db.raw("COUNT(*) as sample_count"),
          this.db.raw("MAX(error_count) as total_errors")
        )
        .where("pool_id", poolId)
        .whereBetween("timestamp", [timeRange.start, timeRange.end])
        .first();

      return stats || {};
    } catch (error) {
      logger.error({ error }, "Failed to get pool stats");
      throw error;
    }
  }

  /**
   * Count events by type
   */
  async countEventsByType(
    poolId: string = "default",
    range: string = "24h"
  ): Promise<Record<string, number>> {
    try {
      const timeRange = this.parseTimeRange(range);

      const results = await this.db("db_pool_events")
        .select("event_type")
        .count("* as count")
        .where("pool_id", poolId)
        .whereBetween("timestamp", [timeRange.start, timeRange.end])
        .groupBy("event_type");

      const counts: Record<string, number> = {};
      for (const row of results) {
        counts[(row as any).event_type] = parseInt((row as any).count, 10);
      }
      return counts;
    } catch (error) {
      logger.error({ error }, "Failed to count events by type");
      throw error;
    }
  }

  /**
   * Parse a time range string like "1h", "24h", "7d"
   */
  private parseTimeRange(range: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();

    const match = range.match(/^(\d+)([hdwm])$/);
    if (!match) {
      // Default to 24 hours
      start.setHours(start.getHours() - 24);
      return { start, end };
    }

    const [, amount, unit] = match;
    const num = parseInt(amount, 10);

    switch (unit) {
      case "h":
        start.setHours(start.getHours() - num);
        break;
      case "d":
        start.setDate(start.getDate() - num);
        break;
      case "w":
        start.setDate(start.getDate() - num * 7);
        break;
      case "m":
        start.setMonth(start.getMonth() - num);
        break;
    }

    return { start, end };
  }

  /**
   * Get the SQL interval string for a resolution
   */
  private getResolutionInterval(resolution: string): string {
    const match = resolution.match(/^(\d+)([hmsd])$/);
    if (!match) {
      return "1 hour"; // Default
    }

    const [, amount, unit] = match;
    const num = parseInt(amount, 10);

    switch (unit) {
      case "m":
        return `${num} minute`;
      case "h":
        return `${num} hour`;
      case "d":
        return `${num} day`;
      case "s":
        return `${num} second`;
      default:
        return "1 hour";
    }
  }
}

// Singleton instance
let queryService: PoolDataQueryService | undefined;

/**
 * Get or create the query service instance
 */
export function getPoolDataQueryService(): PoolDataQueryService {
  if (!queryService) {
    queryService = new PoolDataQueryService();
  }
  return queryService;
}
