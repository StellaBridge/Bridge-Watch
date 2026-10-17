/**
 * @deprecated This file has been consolidated into health.service.ts
 * 
 * Please update your imports:
 * - import { HealthCheckService } from './health.service.js'
 * 
 * This file will be removed in a future version.
 * Consolidated as part of issue #1401 to eliminate duplicate health check services.
 */

export { HealthCheckService } from './health.service.js';
export type {
  HealthCheckResult,
  SystemHealthResponse,
  LivenessResponse,
  ReadinessResponse,
} from './health.service.js';
