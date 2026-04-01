import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { HealthCheckService } from "../../services/health-check.service.js";

const healthService = HealthCheckService.getInstance();

/**
 * Health check routes for monitoring and Kubernetes probes
 * 
 * Endpoints:
 * - GET /health - Simple health check (existing)
 * - GET /health/ready - Readiness probe (Kubernetes)
 * - GET /health/live - Liveness probe (Kubernetes)
 * - GET /health/detailed - Comprehensive system health
 */

export async function healthRoutes(server: FastifyInstance) {
  // Simple health check (backward compatibility)
  // Using empty string instead of "/" to avoid route conflicts
  server.get(
    "",
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      return { 
        status: "ok", 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || "0.1.0"
      };
    }
  );

  // Kubernetes liveness probe
  // Checks if the process is running and responsive
  server.get(
    "/live",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const liveness = await healthService.getLiveness();
        
        // Return appropriate HTTP status for Kubernetes
        if (liveness.status === "healthy") {
          reply.code(200);
        } else {
          reply.code(503);
        }
        
        return liveness;
      } catch (error) {
        server.log.error({ error }, "Liveness probe failed");
        reply.code(503);
        return {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: 0,
          version: process.env.npm_package_version || "0.1.0",
          checks: {
            database: { status: "unhealthy", message: "Liveness check failed" },
            redis: { status: "unhealthy", message: "Liveness check failed" },
            memory: { status: "unhealthy", message: "Liveness check failed" },
            disk: { status: "unhealthy", message: "Liveness check failed" },
          },
        };
      }
    }
  );

  // Kubernetes readiness probe
  // Checks if essential dependencies (database, redis) are ready
  server.get(
    "/ready",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const readiness = await healthService.getReadiness();
        
        // Return appropriate HTTP status for Kubernetes
        if (readiness.status === "healthy") {
          reply.code(200);
        } else {
          reply.code(503);
        }
        
        return readiness;
      } catch (error) {
        server.log.error({ error }, "Readiness probe failed");
        reply.code(503);
        return {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: 0,
          version: process.env.npm_package_version || "0.1.0",
          checks: {
            database: { status: "unhealthy", message: "Readiness check failed" },
            redis: { status: "unhealthy", message: "Readiness check failed" },
            memory: { status: "unhealthy", message: "Readiness check failed" },
            disk: { status: "unhealthy", message: "Readiness check failed" },
          },
        };
      }
    }
  );

  // Comprehensive health check
  // Detailed system health for monitoring dashboards
  server.get(
    "/detailed",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const health = await healthService.getHealth();
        
        // Return appropriate HTTP status based on overall health
        reply.code(200);
        return health;
      } catch (error) {
        server.log.error({ error }, "Detailed health check failed");
        reply.code(503);
        return {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || "0.1.0",
          checks: {
            database: { status: "unhealthy", message: "Health check failed" },
            redis: { status: "unhealthy", message: "Health check failed" },
            memory: { status: "unhealthy", message: "Health check failed" },
            disk: { status: "unhealthy", message: "Health check failed" },
          },
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Individual component checks
  server.get(
    "/components/:component",
    async (
      request: FastifyRequest<{ Params: { component: string } }>,
      reply: FastifyReply
    ) => {
      const { component } = request.params;
      
      try {
        const health = await healthService.getHealth();
        let result;
        
        switch (component) {
          case "database":
            result = health.checks.database;
            break;
          case "redis":
            result = health.checks.redis;
            break;
          case "memory":
            result = health.checks.memory;
            break;
          case "disk":
            result = health.checks.disk;
            break;
          default:
            reply.code(404);
            return {
              error: "Component not found",
              validComponents: ["database", "redis", "memory", "disk"],
            };
        }
        
        // Return appropriate HTTP status
        switch (result.status) {
          case "healthy":
            reply.code(200);
            break;
          case "degraded":
            reply.code(200);
            break;
          case "unhealthy":
            reply.code(503);
            break;
        }
        
        return result;
      } catch (error) {
        server.log.error({ component, error }, "Component health check failed");
        reply.code(503);
        return {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Health check metrics endpoint
  // Returns metrics for monitoring systems
  server.get(
    "/metrics",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const health = await healthService.getHealth();
        
        // Prometheus-style metrics
        const metrics = [
          `# HELP bridge_watch_health_status Health check status (1=healthy, 0.5=degraded, 0=unhealthy)`,
          `# TYPE bridge_watch_health_status gauge`,
          `bridge_watch_health_status{component="database"} ${health.checks.database.status === "healthy" ? 1 : health.checks.database.status === "degraded" ? 0.5 : 0}`,
          `bridge_watch_health_status{component="redis"} ${health.checks.redis.status === "healthy" ? 1 : health.checks.redis.status === "degraded" ? 0.5 : 0}`,
          `bridge_watch_health_status{component="memory"} ${health.checks.memory.status === "healthy" ? 1 : health.checks.memory.status === "degraded" ? 0.5 : 0}`,
          `bridge_watch_health_status{component="disk"} ${health.checks.disk.status === "healthy" ? 1 : health.checks.disk.status === "degraded" ? 0.5 : 0}`,
          `bridge_watch_health_status{component="overall"} ${health.status === "healthy" ? 1 : health.status === "degraded" ? 0.5 : 0}`,
          "",
          `# HELP bridge_watch_uptime_seconds Application uptime in seconds`,
          `# TYPE bridge_watch_uptime_seconds counter`,
          `bridge_watch_uptime_seconds ${health.uptime}`,
          "",
        ];

        reply.type("text/plain");
        return metrics.join("\n") + "\n";
      } catch (error) {
        server.log.error({ error }, "Health metrics failed");
        reply.code(503);
        return {
          error: "Failed to generate metrics",
          timestamp: new Date().toISOString(),
        };
      }
    }
  );
}
