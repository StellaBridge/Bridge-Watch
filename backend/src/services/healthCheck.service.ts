import { logger } from "../utils/logger.js";
import { getConnection } from "../database/connection.js";
import Redis from "ioredis";
import { config } from "../config/index.js";

export interface HealthCheckResult {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  duration: number;
  details?: any;
  error?: string;
}

export interface SystemHealthResponse {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    externalApis: HealthCheckResult;
    system: HealthCheckResult;
  };
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

export interface LivenessResponse {
  status: "ok" | "error";
  timestamp: string;
}

export interface ReadinessResponse {
  status: "ready" | "not_ready";
  timestamp: string;
  checks: {
    database: boolean;
    redis: boolean;
  };
}

export class HealthCheckService {
  private startTime = Date.now();
  private redisClient: Redis;

  constructor() {
    this.redisClient = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  /**
   * Overall system health check
   */
  async getSystemHealth(): Promise<SystemHealthResponse> {
    const startTime = Date.now();
    logger.info("Performing comprehensive system health check");

    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkExternalApis(),
      this.checkSystemResources(),
    ]);

    const results = {
      database: this.getResult(checks[0]),
      redis: this.getResult(checks[1]),
      externalApis: this.getResult(checks[2]),
      system: this.getResult(checks[3]),
    };

    const summary = this.calculateSummary(results);
    const overallStatus = this.calculateOverallStatus(summary);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || "0.1.0",
      checks: results,
      summary,
    };
  }

  /**
   * Kubernetes liveness probe - simple check if process is running
   */
  async getLiveness(): Promise<LivenessResponse> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Kubernetes readiness probe - check if essential dependencies are ready
   */
  async getReadiness(): Promise<ReadinessResponse> {
    const startTime = Date.now();

    try {
      const [dbCheck, redisCheck] = await Promise.allSettled([
        this.checkDatabase(),
        this.checkRedis(),
      ]);

      const databaseReady = dbCheck.status === "fulfilled" && dbCheck.value.status === "healthy";
      const redisReady = redisCheck.status === "fulfilled" && redisCheck.value.status === "healthy";

      const isReady = databaseReady && redisReady;

      logger.info(
        {
          databaseReady,
          redisReady,
          duration: Date.now() - startTime,
        },
        `Readiness check: ${isReady ? "ready" : "not ready"}`
      );

      return {
        status: isReady ? "ready" : "not_ready",
        timestamp: new Date().toISOString(),
        checks: {
          database: databaseReady,
          redis: redisReady,
        },
      };
    } catch (error) {
      logger.error({ error }, "Readiness check failed");
      return {
        status: "not_ready",
        timestamp: new Date().toISOString(),
        checks: {
          database: false,
          redis: false,
        },
      };
    }
  }

  /**
   * Database connectivity check
   */
  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const connection = getConnection();
      await connection.raw("SELECT 1");

      // Check table count
      const tables = await connection.raw(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
          tableCount: parseInt(tables.rows[0]?.count || "0"),
          connection: "postgresql",
        },
      };
    } catch (error) {
      logger.error({ error }, "Database health check failed");
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown database error",
      };
    }
  }

  /**
   * Redis connectivity check
   */
  private async checkRedis(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      await this.redisClient.ping();
      
      // Get Redis info
      const info = await this.redisClient.info("memory");
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const usedMemory = memoryMatch ? parseInt(memoryMatch[1]) : 0;

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
          usedMemory,
          connection: "redis",
        },
      };
    } catch (error) {
      logger.error({ error }, "Redis health check failed");
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown Redis error",
      };
    }
  }

  /**
   * External API connectivity checks
   */
  private async checkExternalApis(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const apis = [
      { name: "Stellar Horizon", url: config.STELLAR_HORIZON_URL },
      { name: "Soroban RPC", url: config.SOROBAN_RPC_URL },
    ];

    const results = await Promise.allSettled(
      apis.map(async (api) => {
        try {
          const response = await fetch(api.url, {
            method: "GET",
            signal: AbortSignal.timeout(5000), // 5 second timeout
          });
          
          return {
            name: api.name,
            status: response.ok ? "healthy" : "unhealthy",
            statusCode: response.status,
            responseTime: Date.now() - startTime,
          };
        } catch (error) {
          return {
            name: api.name,
            status: "unhealthy",
            error: error instanceof Error ? error.message : "Unknown error",
            responseTime: Date.now() - startTime,
          };
        }
      })
    );

    const apiResults = results.map((result) =>
      result.status === "fulfilled" ? result.value : { name: "unknown", status: "unhealthy", error: "Promise rejected" }
    );

    const healthyCount = apiResults.filter((r) => r.status === "healthy").length;
    const overallStatus = healthyCount === apis.length ? "healthy" : healthyCount > 0 ? "degraded" : "unhealthy";

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      details: {
        apis: apiResults,
        healthyCount,
        totalCount: apis.length,
      },
    };
  }

  /**
   * System resource checks (disk space, memory usage)
   */
  private async checkSystemResources(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const memUsage = process.memoryUsage();
      const totalMemory = require("os").totalmem();
      const freeMemory = require("os").freemem();
      const usedMemory = totalMemory - freeMemory;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      // Get disk usage (simplified check)
      const fs = require("fs");
      const stats = fs.statSync(".");
      
      // Memory thresholds
      const memoryThreshold = 90; // 90% memory usage warning
      const status = memoryUsagePercent > memoryThreshold ? "degraded" : "healthy";

      return {
        status,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        details: {
          memory: {
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            systemUsagePercent: Math.round(memoryUsagePercent * 100) / 100,
          },
          disk: {
            path: process.cwd(),
            status: "accessible", // Simplified disk check
          },
          thresholds: {
            memoryWarning: memoryThreshold,
          },
        },
      };
    } catch (error) {
      logger.error({ error }, "System resource check failed");
      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : "Unknown system error",
      };
    }
  }

  /**
   * Helper to extract result from PromiseSettledResult
   */
  private getResult(result: PromiseSettledResult<HealthCheckResult>): HealthCheckResult {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      duration: 0,
      error: result.reason instanceof Error ? result.reason.message : "Unknown error",
    };
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    externalApis: HealthCheckResult;
    system: HealthCheckResult;
  }) {
    const values = Object.values(checks);
    return {
      total: values.length,
      healthy: values.filter((c) => c.status === "healthy").length,
      unhealthy: values.filter((c) => c.status === "unhealthy").length,
      degraded: values.filter((c) => c.status === "degraded").length,
    };
  }

  /**
   * Calculate overall system status
   */
  private calculateOverallStatus(summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  }): "healthy" | "unhealthy" | "degraded" {
    if (summary.unhealthy > 0) {
      return "unhealthy";
    }
    if (summary.degraded > 0) {
      return "degraded";
    }
    return "healthy";
  }

  /**
   * Cleanup Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}
