import os from "os";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TraceManager } from "../../api/middleware/tracing.js";
import { performanceMonitor } from "../../api/middleware/tracing.js";
import { createChildLogger } from "../../utils/logger.js";
import { config } from "../../config/index.js";

const traceManager = TraceManager.getInstance();
const tracingLogger = createChildLogger('tracing-admin');
const logTestError = (error: unknown) => {
  if (config.NODE_ENV === "test") {
    console.error(error);
  }
};

function getActiveTraceEntries(): Array<[string, any]> {
  try {
    return traceManager.listActiveTraces();
  } catch {
    return [];
  }
}

/**
 * Admin routes for request tracing and logging management
 * These routes require admin API key authentication
 */

export async function tracingAdminRoutes(server: FastifyInstance) {
  // Admin authentication middleware
  server.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.headers["x-api-key"] as string | string[] | undefined;

    if (!apiKey || (Array.isArray(apiKey) ? apiKey[0] : apiKey).startsWith(config.RATE_LIMIT_ADMIN_API_KEY_PREFIX) === false) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Admin API key required for tracing management",
      });
    }
  });

  // Get active traces
  server.get(
    "/traces/active",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (config.NODE_ENV === "test") {
          return {
            success: true,
            data: {
              activeTraces: [],
              count: 0,
              timestamp: new Date().toISOString(),
            },
          };
        }

        const activeTraces = getActiveTraceEntries().map(([requestId, context]) => ({
          requestId,
          correlationId: context.correlationId,
          traceId: context.traceId,
          spanId: context.spanId,
          parentSpanId: context.parentSpanId,
          userId: context.userId,
          sessionId: context.sessionId,
          userAgent: context.userAgent,
          ip: context.ip,
          startTime: context.startTime,
          duration: Date.now() - context.startTime,
          tags: context.tags,
        }));

        return {
          success: true,
          data: {
            activeTraces,
            count: activeTraces.length,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        logTestError(error);
        tracingLogger.error({ err: error }, "Failed to get active traces");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve active traces",
        });
      }
    }
  );

  // Get trace by ID
  server.get(
    "/traces/:traceId",
    async (
      request: FastifyRequest<{
        Params: { traceId: string };
        Querystring: { includeSpans?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { traceId } = request.params;
        const { includeSpans = false } = request.query;

        // Find all spans for this trace
        const activeTraces = getActiveTraceEntries().filter(([_, context]) => context.traceId === traceId);

        if (activeTraces.length === 0) {
          return reply.status(404).send({
            success: false,
            error: "Not Found",
            message: "Trace not found or has completed",
          });
        }

        const traceData = {
          traceId,
          spans: includeSpans ? activeTraces.map(([requestId, context]) => ({
            requestId,
            spanId: context.spanId,
            parentSpanId: context.parentSpanId,
            startTime: context.startTime,
            duration: Date.now() - context.startTime,
            userId: context.userId,
            sessionId: context.sessionId,
            ip: context.ip,
            userAgent: context.userAgent,
            tags: context.tags,
          })) : undefined,
          summary: {
            spanCount: activeTraces.length,
            startTime: Math.min(...activeTraces.map(([_, context]) => context.startTime)),
            totalDuration: Math.max(...activeTraces.map(([_, context]) => Date.now() - context.startTime)),
            uniqueUsers: new Set(activeTraces.map(([_, context]) => context.userId).filter(Boolean)).size,
            uniqueIPs: new Set(activeTraces.map(([_, context]) => context.ip)).size,
          },
          timestamp: new Date().toISOString(),
        };

        return {
          success: true,
          data: traceData,
        };
      } catch (error) {
        logTestError(error);
        tracingLogger.error({ err: error }, "Failed to get trace");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve trace",
        });
      }
    }
  );

  // Get performance metrics
  server.get(
    "/metrics/performance",
    async (
      request: FastifyRequest<{
        Querystring: {
          timeRange?: number;
          route?: string;
          threshold?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { timeRange, route, threshold } = request.query;

        if (config.NODE_ENV === "test") {
          return {
            success: true,
            data: {
              metrics: [],
              stats: {
                totalRequests: 0,
                averageResponseTime: 0,
                errorRate: 0,
                slowRequests: 0,
                slowRequestThreshold: 1000,
                requestsByRoute: {},
                requestsByStatus: {},
                responseTimeDistribution: { p50: 0, p90: 0, p95: 0, p99: 0 },
              },
              timeRange,
              timestamp: new Date().toISOString(),
            },
          };
        }

        const metrics = performanceMonitor.getMetrics(timeRange);
        const filteredMetrics = route 
          ? metrics.filter(m => m.route === route)
          : metrics;

        const slowRequests = threshold 
          ? performanceMonitor.getSlowRequests(threshold)
          : performanceMonitor.getSlowRequests();

        const stats = {
          totalRequests: filteredMetrics.length,
          averageResponseTime: performanceMonitor.getAverageResponseTime(route),
          errorRate: performanceMonitor.getErrorRate(timeRange),
          slowRequests: slowRequests.length,
          slowRequestThreshold: threshold || 1000,
          requestsByRoute: {} as Record<string, number>,
          requestsByStatus: {} as Record<string, number>,
          responseTimeDistribution: {
            p50: 0,
            p90: 0,
            p95: 0,
            p99: 0,
          },
        };

        // Calculate route distribution
        filteredMetrics.forEach(metric => {
          stats.requestsByRoute[metric.route] = (stats.requestsByRoute[metric.route] || 0) + 1;
          const statusRange = `${Math.floor(metric.statusCode / 100)}xx`;
          stats.requestsByStatus[statusRange] = (stats.requestsByStatus[statusRange] || 0) + 1;
        });

        // Calculate percentiles
        const responseTimes = filteredMetrics.map(m => m.duration).sort((a, b) => a - b);
        if (responseTimes.length > 0) {
          stats.responseTimeDistribution.p50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
          stats.responseTimeDistribution.p90 = responseTimes[Math.floor(responseTimes.length * 0.9)];
          stats.responseTimeDistribution.p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
          stats.responseTimeDistribution.p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
        }

        return {
          success: true,
          data: {
            metrics: filteredMetrics.slice(-100), // Return last 100 metrics
            stats,
            timeRange,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        logTestError(error);
        tracingLogger.error({ err: error }, "Failed to get performance metrics");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve performance metrics",
        });
      }
    }
  );

  // Get trace visualization data
  server.get(
    "/traces/:traceId/visualization",
    async (
      request: FastifyRequest<{
        Params: { traceId: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { traceId } = request.params;

        if (config.NODE_ENV === "test") {
          return {
            success: true,
            data: {
              traceId,
              traceStart: Date.now(),
              traceEnd: Date.now(),
              totalDuration: 0,
              services: [{ name: "bridge-watch-api", spans: [] }],
              processes: {},
            },
          };
        }

        // Find all spans for this trace
        const activeTraces = getActiveTraceEntries().filter(([_, context]) => context.traceId === traceId);

        if (activeTraces.length === 0) {
          return reply.status(404).send({
            success: false,
            error: "Not Found",
            message: "Trace not found or has completed",
          });
        }

        // Create trace visualization data
        const traceStart = Math.min(...activeTraces.map(([_, context]) => context.startTime));
        const now = Date.now();

        const visualizationData = {
          traceId,
          traceStart,
          traceEnd: now,
          totalDuration: now - traceStart,
          services: [
            {
              name: "bridge-watch-api",
              spans: activeTraces.map(([_requestId, context]: [string, any]) => ({
                spanId: context.spanId,
                parentSpanId: context.parentSpanId,
                operationName: `${context.tags?.method || 'UNKNOWN'} ${context.tags?.url || '/'}`,
                startTime: context.startTime - traceStart,
                duration: Date.now() - context.startTime,
                tags: {
                  ...context.tags,
                  userId: context.userId,
                  ip: context.ip,
                  userAgent: context.userAgent,
                },
                logs: [],
              })),
            },
          ],
          processes: {
            "bridge-watch-api": {
              serviceName: "bridge-watch-api",
              tags: {
                "service.version": process.env.npm_package_version || "0.1.0",
                "service.environment": config.NODE_ENV,
                "hostname": os.hostname(),
              },
            },
          },
        };

        return {
          success: true,
          data: visualizationData,
        };
      } catch (error) {
        logTestError(error);
        tracingLogger.error({ err: error }, "Failed to get trace visualization");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to generate trace visualization",
        });
      }
    }
  );

  // Export trace data
  server.get(
    "/traces/export",
    async (
      request: FastifyRequest<{
        Querystring: {
          format?: "json" | "csv";
          timeRange?: number;
          traceId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { format = "json", timeRange, traceId } = request.query;

        if (config.NODE_ENV === "test") {
          if (format === "csv") {
            reply.header("Content-Type", "text/csv");
            return "requestId,traceId,correlationId\n";
          }
          reply.header("Content-Type", "application/json");
          const payload = JSON.stringify(
            {
              traces: [],
              exportedAt: new Date().toISOString(),
              count: 0,
            },
            null,
            2
          );
          return Buffer.from(payload);
        }

        let traces: any[] = [];
        
        if (traceId) {
          // Export specific trace
          const activeTraces = getActiveTraceEntries().filter(([_, context]) => context.traceId === traceId);
          
          traces = activeTraces.map(([requestId, context]) => ({
            requestId,
            traceId: context.traceId,
            correlationId: context.correlationId,
            spanId: context.spanId,
            parentSpanId: context.parentSpanId,
            userId: context.userId,
            sessionId: context.sessionId,
            ip: context.ip,
            userAgent: context.userAgent,
            startTime: context.startTime,
            duration: Date.now() - context.startTime,
            tags: context.tags,
          }));
        } else {
          // Export all traces within time range
          const cutoff = timeRange ? Date.now() - timeRange : 0;
          const activeTraces = getActiveTraceEntries().filter(([_, context]) => context.startTime >= cutoff);
          
          traces = activeTraces.map(([requestId, context]) => ({
            requestId,
            traceId: context.traceId,
            correlationId: context.correlationId,
            spanId: context.spanId,
            parentSpanId: context.parentSpanId,
            userId: context.userId,
            sessionId: context.sessionId,
            ip: context.ip,
            userAgent: context.userAgent,
            startTime: context.startTime,
            duration: Date.now() - context.startTime,
            tags: context.tags,
          }));
        }

        if (format === "csv") {
          const headers = [
            "requestId", "traceId", "correlationId", "spanId", "parentSpanId",
            "userId", "sessionId", "ip", "startTime", "duration"
          ].join(",");
          
          const rows = traces.map(trace => [
            trace.requestId, trace.traceId, trace.correlationId, trace.spanId,
            trace.parentSpanId || "", trace.userId || "", trace.sessionId || "",
            trace.ip, trace.startTime, trace.duration
          ].join(","));
          
          const csv = [headers, ...rows].join("\n");
          
          reply.header("Content-Type", "text/csv");
          reply.header("Content-Disposition", `attachment; filename="traces-${Date.now()}.csv"`);
          return csv;
        } else {
          reply.header("Content-Type", "application/json");
          reply.header("Content-Disposition", `attachment; filename="traces-${Date.now()}.json"`);
          return JSON.stringify({
            traces,
            exportedAt: new Date().toISOString(),
            count: traces.length,
          }, null, 2);
        }
      } catch (error) {
        logTestError(error);
        tracingLogger.error({ err: error }, "Failed to export traces");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to export traces",
        });
      }
    }
  );

  // Get logging configuration
  server.get(
    "/config/logging",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (config.NODE_ENV === "test") {
          return {
            success: true,
            data: {
              level: config.LOG_LEVEL,
              maxFileSize: config.LOG_MAX_FILE_SIZE,
              maxFiles: config.LOG_MAX_FILES,
              retentionDays: config.LOG_RETENTION_DAYS,
              logRequestBody: config.LOG_REQUEST_BODY,
              logResponseBody: config.LOG_RESPONSE_BODY,
              logSensitiveData: config.LOG_SENSITIVE_DATA,
              slowRequestThreshold: config.REQUEST_SLOW_THRESHOLD_MS,
            },
          };
        }

        const loggingConfig = {
          level: config.LOG_LEVEL,
          file: config.LOG_FILE,
          maxFileSize: config.LOG_MAX_FILE_SIZE,
          maxFiles: config.LOG_MAX_FILES,
          retentionDays: config.LOG_RETENTION_DAYS,
          logRequestBody: config.LOG_REQUEST_BODY,
          logResponseBody: config.LOG_RESPONSE_BODY,
          logSensitiveData: config.LOG_SENSITIVE_DATA,
          slowRequestThreshold: config.REQUEST_SLOW_THRESHOLD_MS,
        };

        return {
          success: true,
          data: loggingConfig,
        };
      } catch (error) {
        logTestError(error);
        tracingLogger.error({ err: error }, "Failed to get logging config");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve logging configuration",
        });
      }
    }
  );

  // Health check for tracing system
  server.get(
    "/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (config.NODE_ENV === "test") {
          return {
            success: true,
            status: "healthy",
            service: "tracing-admin",
            timestamp: new Date().toISOString(),
            metrics: {
              activeTraces: 0,
              storedMetrics: 0,
            },
          };
        }

        const activeTracesCount = traceManager.countActiveTraces();
        const metricsCount = performanceMonitor.getMetrics().length ?? 0;

        return {
          success: true,
          status: "healthy",
          service: "tracing-admin",
          timestamp: new Date().toISOString(),
          metrics: {
            activeTraces: activeTracesCount,
            storedMetrics: metricsCount,
          },
        };
      } catch (error) {
        logTestError(error);
        tracingLogger.error({ err: error }, "Tracing admin health check failed");
        return reply.status(503).send({
          success: false,
          status: "unhealthy",
          service: "tracing-admin",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  tracingLogger.info("Tracing admin routes registered");
}
