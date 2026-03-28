import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { HealthCheckService } from "../../services/healthCheck.service.js";

const healthService = new HealthCheckService();

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
  server.get(
    "/",
    async (_request: FastifyRequest, reply: FastifyReply) => {
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
        if (liveness.status === "ok") {
          reply.code(200);
        } else {
          reply.code(503);
        }
        
        return liveness;
      } catch (error) {
        server.log.error({ error }, "Liveness probe failed");
        reply.code(503);
        return {
          status: "error",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
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
        if (readiness.status === "ready") {
          reply.code(200);
        } else {
          reply.code(503);
        }
        
        return readiness;
      } catch (error) {
        server.log.error({ error }, "Readiness probe failed");
        reply.code(503);
        return {
          status: "not_ready",
          timestamp: new Date().toISOString(),
          checks: {
            database: false,
            redis: false,
          },
          error: error instanceof Error ? error.message : "Unknown error",
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
        const health = await healthService.getSystemHealth();
        
        // Return appropriate HTTP status based on overall health
        switch (health.status) {
          case "healthy":
            reply.code(200);
            break;
          case "degraded":
            reply.code(200); // Still serve traffic but indicate issues
            break;
          case "unhealthy":
            reply.code(503);
            break;
        }
        
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
            database: { status: "unhealthy", error: "Health check failed" },
            redis: { status: "unhealthy", error: "Health check failed" },
            externalApis: { status: "unhealthy", error: "Health check failed" },
            system: { status: "unhealthy", error: "Health check failed" },
          },
          summary: {
            total: 4,
            healthy: 0,
            unhealthy: 4,
            degraded: 0,
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
        let result;
        
        switch (component) {
          case "database":
            result = await healthService.getSystemHealth().then(h => h.checks.database);
            break;
          case "redis":
            result = await healthService.getSystemHealth().then(h => h.checks.redis);
            break;
          case "external-apis":
            result = await healthService.getSystemHealth().then(h => h.checks.externalApis);
            break;
          case "system":
            result = await healthService.getSystemHealth().then(h => h.checks.system);
            break;
          default:
            reply.code(404);
            return {
              error: "Component not found",
              validComponents: ["database", "redis", "external-apis", "system"],
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
          duration: 0,
          error: error instanceof Error ? error.message : "Unknown error",
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
        const health = await healthService.getSystemHealth();
        
        // Prometheus-style metrics
        const metrics = [
          `# HELP bridge_watch_health_status Health check status (1=healthy, 0.5=degraded, 0=unhealthy)`,
          `# TYPE bridge_watch_health_status gauge`,
          `bridge_watch_health_status{component="database"} ${health.checks.database.status === "healthy" ? 1 : health.checks.database.status === "degraded" ? 0.5 : 0}`,
          `bridge_watch_health_status{component="redis"} ${health.checks.redis.status === "healthy" ? 1 : health.checks.redis.status === "degraded" ? 0.5 : 0}`,
          `bridge_watch_health_status{component="external_apis"} ${health.checks.externalApis.status === "healthy" ? 1 : health.checks.externalApis.status === "degraded" ? 0.5 : 0}`,
          `bridge_watch_health_status{component="system"} ${health.checks.system.status === "healthy" ? 1 : health.checks.system.status === "degraded" ? 0.5 : 0}`,
          `bridge_watch_health_status{component="overall"} ${health.status === "healthy" ? 1 : health.status === "degraded" ? 0.5 : 0}`,
          "",
          `# HELP bridge_watch_uptime_seconds Application uptime in seconds`,
          `# TYPE bridge_watch_uptime_seconds counter`,
          `bridge_watch_uptime_seconds ${health.uptime / 1000}`,
          "",
          `# HELP bridge_watch_health_check_duration_seconds Health check duration in seconds`,
          `# TYPE bridge_watch_health_check_duration_seconds gauge`,
          `bridge_watch_health_check_duration_seconds{component="database"} ${health.checks.database.duration / 1000}`,
          `bridge_watch_health_check_duration_seconds{component="redis"} ${health.checks.redis.duration / 1000}`,
          `bridge_watch_health_check_duration_seconds{component="external_apis"} ${health.checks.externalApis.duration / 1000}`,
          `bridge_watch_health_check_duration_seconds{component="system"} ${health.checks.system.duration / 1000}`,
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
