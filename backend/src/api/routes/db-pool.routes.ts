import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { getPoolMetricsCollector } from "../../services/db-pool-monitor/metrics-collector.js";
import { getPoolControlHandler } from "../../services/db-pool-monitor/control-handler.js";
import { getPoolDataQueryService } from "../../services/db-pool-monitor/query-service.js";
import type { ControlActionRequest } from "../../models/db-pool-metrics/pool.model.js";
import { getDatabase } from "../../database/connection.js";

/**
 * Database Connection Pool Dashboard Routes
 * Exposes metrics, events, and control endpoints for pool management
 */
export async function dbPoolRoutes(server: FastifyInstance): Promise<void> {
  const queryService = getPoolDataQueryService();
  const db = getDatabase();

  /**
   * GET /db-pool/metrics
   * Get aggregated pool metrics for a time range
   */
  server.get<{ Querystring: Record<string, any> }>(
    "/metrics",
    {
      schema: {
        tags: ["Database Pool"],
        summary: "Get pool metrics",
        description: "Get aggregated connection pool metrics for a specified time range",
        querystring: {
          type: "object",
          properties: {
            range: { type: "string", example: "24h", description: "Time range (1h, 24h, 7d, etc.)" },
            resolution: { type: "string", example: "1h", description: "Resolution (1m, 5m, 1h, etc.)" },
            pool_id: { type: "string", example: "default", description: "Pool ID to query" },
          },
        },
      },
      onRequest: [authMiddleware({ requiredScopes: ["read:pool_metrics"] })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { range, resolution, pool_id } = request.query as Record<string, string>;

        const metrics = await queryService.getMetrics({
          range: range || "24h",
          resolution: resolution || "1h",
          pool_id: pool_id || "default",
        });

        reply.send({
          success: true,
          data: metrics,
          count: metrics.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch metrics";
        reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * GET /db-pool/events
   * Get recent pool events
   */
  server.get<{ Querystring: Record<string, any> }>(
    "/events",
    {
      schema: {
        tags: ["Database Pool"],
        summary: "Get pool events",
        description: "Get recent connection pool events with optional filtering",
        querystring: {
          type: "object",
          properties: {
            range: { type: "string", example: "24h", description: "Time range (24h, 7d, etc.)" },
            event_type: { type: "string", example: "POOL_NEAR_EXHAUSTION", description: "Filter by event type" },
            severity: { type: "string", example: "critical", description: "Filter by severity" },
            pool_id: { type: "string", example: "default", description: "Pool ID to query" },
            limit: { type: "number", example: 100, description: "Result limit" },
            offset: { type: "number", example: 0, description: "Result offset" },
          },
        },
      },
      onRequest: [authMiddleware({ requiredScopes: ["read:pool_events"] })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          range,
          event_type,
          severity,
          pool_id,
          limit,
          offset,
        } = request.query as Record<string, string>;

        const events = await queryService.getEvents({
          range: range || "24h",
          event_type: event_type as any,
          severity: severity as any,
          pool_id: pool_id || "default",
          limit: limit ? parseInt(limit, 10) : 100,
          offset: offset ? parseInt(offset, 10) : 0,
        });

        reply.send({
          success: true,
          data: events,
          count: events.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch events";
        reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * GET /db-pool/status
   * Get current pool health status
   */
  server.get(
    "/status",
    {
      schema: {
        tags: ["Database Pool"],
        summary: "Get pool status",
        description: "Get current health status and recommendations for the connection pool",
      },
      onRequest: [authMiddleware({ requiredScopes: ["read:pool_metrics"] })],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const collector = getPoolMetricsCollector();
        if (!collector) {
          return reply.status(503).send({
            success: false,
            error: "Pool metrics collector not initialized",
          });
        }

        const status = await collector.getHealthStatus();

        reply.send({
          success: true,
          data: status,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to get pool status";
        reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * GET /db-pool/stats
   * Get pool statistics for a time range
   */
  server.get<{ Querystring: Record<string, string> }>(
    "/stats",
    {
      schema: {
        tags: ["Database Pool"],
        summary: "Get pool statistics",
        description: "Get aggregated statistics (min, max, average) for a time range",
        querystring: {
          type: "object",
          properties: {
            range: { type: "string", example: "24h", description: "Time range (24h, 7d, etc.)" },
            pool_id: { type: "string", example: "default", description: "Pool ID to query" },
          },
        },
      },
      onRequest: [authMiddleware({ requiredScopes: ["read:pool_metrics"] })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { range, pool_id } = request.query;

        const stats = await queryService.getPoolStats(
          (pool_id as string) || "default",
          (range as string) || "24h"
        );

        reply.send({
          success: true,
          data: stats,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to get pool stats";
        reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * POST /db-pool/control
   * Execute a control action on the pool
   * Requires admin role
   */
  server.post<{ Body: ControlActionRequest & { confirmation?: boolean } }>(
    "/control",
    {
      schema: {
        tags: ["Database Pool"],
        summary: "Execute pool control action",
        description: "Perform an administrative action on the connection pool (requires confirmation)",
        body: {
          type: "object",
          required: ["pool_id", "action"],
          properties: {
            pool_id: { type: "string", example: "default" },
            action: {
              type: "string",
              enum: ["set_max_connections", "set_min_connections", "evict_idle", "drain_pool", "reset_stats"],
            },
            parameters: {
              type: "object",
              description: "Action-specific parameters",
            },
            confirmation: {
              type: "boolean",
              description: "Operator confirmation for the action",
            },
          },
        },
      },
      onRequest: [authMiddleware({ requiredScopes: ["admin:pool_control"] })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { pool_id, action, parameters, confirmation } = request.body as ControlActionRequest & {
          confirmation?: boolean;
        };

        // Require explicit confirmation for control actions
        if (!confirmation) {
          return reply.status(400).send({
            success: false,
            error: "Control actions require explicit confirmation",
            requiresConfirmation: true,
          });
        }

        // Get or initialize pool reference (in a real app, get from connection pool)
        const pg = (await import("pg")).default;
        let pool;
        try {
          pool = (await import("../../index.js")).then((m: any) => m.appPool || new pg.Pool());
        } catch {
          pool = new pg.Pool();
        }

        const controlHandler = getPoolControlHandler(pool);
        const actorId = request.apiKeyAuth?.id || "unknown";

        const result = await controlHandler.handle(
          { pool_id, action, parameters },
          actorId
        );

        if (result.success) {
          reply.send({
            success: true,
            data: result.result,
          });
        } else {
          reply.status(400).send({
            success: false,
            error: result.error,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to execute control action";
        reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * GET /db-pool/events/summary
   * Get summary of recent events by type
   */
  server.get<{ Querystring: Record<string, string> }>(
    "/events/summary",
    {
      schema: {
        tags: ["Database Pool"],
        summary: "Get events summary",
        description: "Get count of events by type for a time range",
        querystring: {
          type: "object",
          properties: {
            range: { type: "string", example: "24h", description: "Time range (24h, 7d, etc.)" },
            pool_id: { type: "string", example: "default", description: "Pool ID to query" },
          },
        },
      },
      onRequest: [authMiddleware({ requiredScopes: ["read:pool_events"] })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { range, pool_id } = request.query;

        const summary = await queryService.countEventsByType(
          (pool_id as string) || "default",
          (range as string) || "24h"
        );

        reply.send({
          success: true,
          data: summary,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to get events summary";
        reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * GET /db-pool/latest
   * Get the latest snapshot
   */
  server.get<{ Querystring: Record<string, string> }>(
    "/latest",
    {
      schema: {
        tags: ["Database Pool"],
        summary: "Get latest snapshot",
        description: "Get the most recent pool metrics snapshot",
      },
      onRequest: [authMiddleware({ requiredScopes: ["read:pool_metrics"] })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { pool_id } = request.query;

        const snapshot = await queryService.getLatestSnapshot((pool_id as string) || "default");

        if (!snapshot) {
          return reply.status(404).send({
            success: false,
            error: "No snapshots available",
          });
        }

        reply.send({
          success: true,
          data: snapshot,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to get latest snapshot";
        reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * GET /db-pool/controls/history
   * Get history of control actions
   */
  server.get<{ Querystring: Record<string, any> }>(
    "/controls/history",
    {
      schema: {
        tags: ["Database Pool"],
        summary: "Get control actions history",
        description: "Get audit trail of pool control actions",
        querystring: {
          type: "object",
          properties: {
            range: { type: "string", example: "7d", description: "Time range" },
            pool_id: { type: "string", example: "default", description: "Pool ID to query" },
            actor_id: { type: "string", description: "Filter by actor" },
            limit: { type: "number", example: 50 },
            offset: { type: "number", example: 0 },
          },
        },
      },
      onRequest: [authMiddleware({ requiredScopes: ["read:pool_audit"] })],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { range = "7d", pool_id = "default", actor_id, limit = 50, offset = 0 } = request.query as Record<
          string,
          any
        >;

        // Parse time range
        const end = new Date();
        const start = new Date();
        const rangeMatch = (range as string).match(/^(\d+)([hdwm])$/);
        if (rangeMatch) {
          const [, amount, unit] = rangeMatch;
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
        } else {
          start.setDate(start.getDate() - 7);
        }

        let query = db("db_pool_controls")
          .select("*")
          .where("pool_id", pool_id)
          .whereBetween("timestamp", [start, end]);

        if (actor_id) {
          query = query.where("actor_id", actor_id);
        }

        const results = await query
          .orderBy("timestamp", "desc")
          .limit(parseInt(String(limit), 10))
          .offset(parseInt(String(offset), 10));

        reply.send({
          success: true,
          data: results,
          count: results.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to get control history";
        reply.status(500).send({
          success: false,
          error: message,
        });
      }
    }
  );
}
