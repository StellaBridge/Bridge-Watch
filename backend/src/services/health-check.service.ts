import { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger.js';
import { getDatabase } from '../database/connection.js';
import * as os from 'os';
import * as fs from 'fs';

let redis: any = null;

// Lazy load Redis to avoid import errors if not configured
async function getRedis() {
  if (redis === null) {
    try {
      const redisModule = await import('../config/redis.js');
      redis = redisModule.createRedisClient();
    } catch (error) {
      logger.warn('Redis module not available');
      redis = undefined;
    }
  }
  return redis;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  value?: number;
  threshold?: number;
  responseTime?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: HealthCheck;
    redis: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
  };
}

const HEALTH_CHECK_MEMORY_THRESHOLD = parseInt(
  process.env.HEALTH_CHECK_MEMORY_THRESHOLD || '90',
  10
);

const HEALTH_CHECK_DISK_THRESHOLD = parseInt(
  process.env.HEALTH_CHECK_DISK_THRESHOLD || '80',
  10
);

const startTime = Date.now();

export class HealthCheckService {
  private static instance: HealthCheckService;

  private constructor() {}

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  private async checkDatabase(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      const database = getDatabase();
      await database.raw('SELECT 1');
      const responseTime = Date.now() - start;

      return {
        status: 'healthy',
        message: 'Database connection successful',
        responseTime,
      };
    } catch (error) {
      logger.warn({ error }, 'Database health check failed');
      return {
        status: 'unhealthy',
        message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    try {
      const redisClient = await getRedis();
      if (!redisClient) {
        return {
          status: 'degraded',
          message: 'Redis not configured',
        };
      }
      const start = Date.now();
      await redisClient.ping();
      const responseTime = Date.now() - start;

      return {
        status: 'healthy',
        message: 'Redis connection successful',
        responseTime,
      };
    } catch (error) {
      logger.warn({ error }, 'Redis health check failed');
      return {
        status: 'unhealthy',
        message: `Redis connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private getMemoryUsage(): HealthCheck {
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const usagePercent = (usedMemory / totalMemory) * 100;

      const status =
        usagePercent > HEALTH_CHECK_MEMORY_THRESHOLD
          ? 'unhealthy'
          : usagePercent > HEALTH_CHECK_MEMORY_THRESHOLD * 0.9
          ? 'degraded'
          : 'healthy';

      return {
        status,
        message: `Memory usage: ${usagePercent.toFixed(2)}%`,
        value: usagePercent,
        threshold: HEALTH_CHECK_MEMORY_THRESHOLD,
      };
    } catch (error) {
      logger.warn({ error }, 'Memory health check failed');
      return {
        status: 'degraded',
        message: 'Unable to determine memory usage',
      };
    }
  }

  private getDiskUsage(): HealthCheck {
    try {
      const stats = fs.statfsSync('/');
      const totalSpace = stats.blocks * stats.bsize;
      const freeSpace = stats.bfree * stats.bsize;
      const usedSpace = totalSpace - freeSpace;
      const usagePercent = (usedSpace / totalSpace) * 100;

      const status =
        usagePercent > HEALTH_CHECK_DISK_THRESHOLD
          ? 'unhealthy'
          : usagePercent > HEALTH_CHECK_DISK_THRESHOLD * 0.9
          ? 'degraded'
          : 'healthy';

      return {
        status,
        message: `Disk usage: ${usagePercent.toFixed(2)}%`,
        value: usagePercent,
        threshold: HEALTH_CHECK_DISK_THRESHOLD,
      };
    } catch (error) {
      logger.warn({ error }, 'Disk health check failed');
      return {
        status: 'degraded',
        message: 'Unable to determine disk usage',
      };
    }
  }

  async getHealth(): Promise<HealthStatus> {
    const [database, redis, memory, disk] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      Promise.resolve(this.getMemoryUsage()),
      Promise.resolve(this.getDiskUsage()),
    ]);

    const checks = { database, redis, memory, disk };
    const statuses = Object.values(checks).map((c) => c.status);
    const status =
      statuses.includes('unhealthy')
        ? 'unhealthy'
        : statuses.includes('degraded')
        ? 'degraded'
        : 'healthy';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: process.env.npm_package_version || '0.1.0',
      checks,
    };
  }

  async getReadiness(): Promise<HealthStatus> {
    return this.getHealth();
  }

  async getLiveness(): Promise<HealthStatus> {
    // Liveness check is simpler - just check if process is running
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: process.env.npm_package_version || '0.1.0',
      checks: {
        database: { status: 'healthy', message: 'Process is running' },
        redis: { status: 'healthy', message: 'Process is running' },
        memory: { status: 'healthy', message: 'Process is running' },
        disk: { status: 'healthy', message: 'Process is running' },
      },
    };
  }
}

export async function registerHealthCheckRoutes(
  server: FastifyInstance
): Promise<void> {
  const healthCheckService = HealthCheckService.getInstance();

  server.get('/health', async (request, reply) => {
    const health = await healthCheckService.getHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    reply.code(statusCode).send(health);
  });

  server.get('/ready', async (request, reply) => {
    const health = await healthCheckService.getReadiness();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    reply.code(statusCode).send(health);
  });

  server.get('/live', async (request, reply) => {
    const health = await healthCheckService.getLiveness();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    reply.code(statusCode).send(health);
  });
}
