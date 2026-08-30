/**
 * Database Connection Pool Models
 * Defines TypeScript interfaces for pool snapshots, events, and controls
 */

/**
 * Represents a snapshot of database connection pool metrics at a point in time
 */
export interface PoolSnapshot {
  id: bigint;
  timestamp: Date;
  pool_id: string;
  active_connections: number;
  idle_connections: number;
  waiting_requests: number;
  max_connections: number;
  min_connections: number;
  acquired_total?: number;
  released_total?: number;
  avg_acquire_ms?: number;
  avg_query_ms?: number;
  error_count?: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Represents a significant event in the connection pool lifecycle
 */
export interface PoolEvent {
  id: bigint;
  timestamp: Date;
  pool_id: string;
  event_type: PoolEventType;
  severity: EventSeverity;
  details?: Record<string, any>;
  message?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Types of pool events
 */
export enum PoolEventType {
  WAITING_REQUESTS = "WAITING_REQUESTS",
  POOL_NEAR_EXHAUSTION = "POOL_NEAR_EXHAUSTION",
  POOL_EXHAUSTED = "POOL_EXHAUSTED",
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
  ACQUISITION_ERROR = "ACQUISITION_ERROR",
  ACQUIRE_SPIKE = "ACQUIRE_SPIKE",
  ERROR_SPIKE = "ERROR_SPIKE",
  POOL_RECOVERED = "POOL_RECOVERED",
  HEALTH_CHECK_FAILED = "HEALTH_CHECK_FAILED",
  CONTROL_ACTION = "CONTROL_ACTION",
}

/**
 * Severity levels for pool events
 */
export enum EventSeverity {
  INFO = "info",
  WARNING = "warning",
  CRITICAL = "critical",
}

/**
 * Represents an operator action taken on the connection pool
 */
export interface PoolControl {
  id: bigint;
  timestamp: Date;
  pool_id: string;
  action: ControlAction;
  actor_id: string; // User ID or API key ID
  parameters?: Record<string, any>;
  result: ControlResult;
  error_message?: string;
  audit_id?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Types of control actions operators can perform
 */
export enum ControlAction {
  SET_MAX_CONNECTIONS = "set_max_connections",
  SET_MIN_CONNECTIONS = "set_min_connections",
  EVICT_IDLE = "evict_idle",
  DRAIN_POOL = "drain_pool",
  RESET_STATS = "reset_stats",
}

/**
 * Result of a control action
 */
export enum ControlResult {
  SUCCESS = "success",
  FAILED = "failed",
  PENDING = "pending",
}

/**
 * Request to perform a control action
 */
export interface ControlActionRequest {
  pool_id: string;
  action: ControlAction;
  parameters?: Record<string, any>;
}

/**
 * Response from a control action
 */
export interface ControlActionResponse {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Dashboard metrics query options
 */
export interface MetricsQueryOptions {
  range?: string; // "1h", "24h", "7d", etc.
  resolution?: string; // "1m", "5m", "1h", etc.
  pool_id?: string;
}

/**
 * Dashboard events query options
 */
export interface EventsQueryOptions {
  range?: string; // "24h", "7d", "30d", etc.
  event_type?: PoolEventType;
  severity?: EventSeverity;
  pool_id?: string;
  limit?: number;
  offset?: number;
}

/**
 * Aggregated pool metrics for dashboard display
 */
export interface AggregatedPoolMetrics {
  bucket: Date;
  avg_active: number;
  avg_idle: number;
  avg_waiting: number;
  max_active: number;
  max_waiting: number;
  min_active: number;
  pool_id: string;
}

/**
 * Current pool health status
 */
export interface PoolHealthStatus {
  pool_id: string;
  is_healthy: boolean;
  current_utilization: number; // percentage
  active_connections: number;
  idle_connections: number;
  waiting_requests: number;
  max_connections: number;
  recent_errors: number;
  last_heartbeat: Date;
  recommended_actions: string[];
}
