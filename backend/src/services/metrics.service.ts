import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "prom-client";
import { logger } from "../utils/logger.js";

/**
 * Metrics Collection Service
 * Provides Prometheus-compatible metrics for monitoring and alerting
 */
class MetricsService {
  private registry: Registry;
  private initialized = false;

  // HTTP Metrics
  public httpRequestsTotal: Counter;
  public httpRequestDuration: Histogram;
  public httpRequestSize: Histogram;
  public httpResponseSize: Histogram;
  public httpActiveConnections: Gauge;

  // Database Metrics
  public dbQueryDuration: Histogram;
  public dbConnectionsActive: Gauge;
  public dbConnectionsIdle: Gauge;
  public dbQueriesTotal: Counter;
  public dbQueryErrors: Counter;

  // Queue Metrics
  public queueJobsActive: Gauge;
  public queueJobsWaiting: Gauge;
  public queueJobsCompleted: Counter;
  public queueJobsFailed: Counter;
  public queueJobDuration: Histogram;

  // Business Metrics
  public bridgeVerificationsTotal: Counter;
  public bridgeVerificationSuccess: Counter;
  public bridgeVerificationFailure: Counter;
  public bridgeHealthScore: Gauge;
  public assetPriceGauge: Gauge;
  public liquidityTVL: Gauge;
  public alertsTriggered: Counter;
  public circuitBreakerTrips: Counter;

  // Cache Metrics
  public cacheHits: Counter;
  public cacheMisses: Counter;
  public cacheSize: Gauge;
  public cacheEvictions: Counter;

  // API Key Metrics
  public apiKeyRequests: Counter;
  public apiKeyRateLimitHits: Counter;

  // WebSocket Metrics
  public websocketConnections: Gauge;
  public websocketMessagesTotal: Counter;

  constructor() {
    this.registry = new Registry();
    
    // Initialize all metrics as undefined initially
    this.httpRequestsTotal = undefined as any;
    this.httpRequestDuration = undefined as any;
    this.httpRequestSize = undefined as any;
    this.httpResponseSize = undefined as any;
    this.httpActiveConnections = undefined as any;
    this.dbQueryDuration = undefined as any;
    this.dbConnectionsActive = undefined as any;
    this.dbConnectionsIdle = undefined as any;
    this.dbQueriesTotal = undefined as any;
    this.dbQueryErrors = undefined as any;
    this.queueJobsActive = undefined as any;
    this.queueJobsWaiting = undefined as any;
    this.queueJobsCompleted = undefined as any;
    this.queueJobsFailed = undefined as any;
    this.queueJobDuration = undefined as any;
    this.bridgeVerificationsTotal = undefined as any;
    this.bridgeVerificationSuccess = undefined as any;
    this.bridgeVerificationFailure = undefined as any;
    this.bridgeHealthScore = undefined as any;
    this.assetPriceGauge = undefined as any;
    this.liquidityTVL = undefined as any;
    this.alertsTriggered = undefined as any;
    this.circuitBreakerTrips = undefined as any;
    this.cacheHits = undefined as any;
    this.cacheMisses = undefined as any;
    this.cacheSize = undefined as any;
    this.cacheEvictions = undefined as any;
    this.apiKeyRequests = undefined as any;
    this.apiKeyRateLimitHits = undefined as any;
    this.websocketConnections = undefined as any;
    this.websocketMessagesTotal = undefined as any;
    
    this.initializeMetrics();
  }

  private initializeMetrics() {
    if (this.initialized) {
      return;
    }

    // Collect default Node.js metrics (CPU, memory, event loop, etc.)
    collectDefaultMetrics({ register: this.registry });

    // HTTP Metrics
    this.httpRequestsTotal = new Counter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestSize = new Histogram({
      name: "http_request_size_bytes",
      help: "HTTP request size in bytes",
      labelNames: ["method", "route"],
      buckets: [100, 1000, 10000, 100000, 1000000],
      registers: [this.registry],
    });

    this.httpResponseSize = new Histogram({
      name: "http_response_size_bytes",
      help: "HTTP response size in bytes",
      labelNames: ["method", "route"],
      buckets: [100, 1000, 10000, 100000, 1000000],
      registers: [this.registry],
    });

    this.httpActiveConnections = new Gauge({
      name: "http_active_connections",
      help: "Number of active HTTP connections",
      registers: [this.registry],
    });

    // Database Metrics
    this.dbQueryDuration = new Histogram({
      name: "db_query_duration_seconds",
      help: "Database query duration in seconds",
      labelNames: ["operation", "table"],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.dbConnectionsActive = new Gauge({
      name: "db_connections_active",
      help: "Number of active database connections",
      registers: [this.registry],
    });

    this.dbConnectionsIdle = new Gauge({
      name: "db_connections_idle",
      help: "Number of idle database connections",
      registers: [this.registry],
    });

    this.dbQueriesTotal = new Counter({
      name: "db_queries_total",
      help: "Total number of database queries",
      labelNames: ["operation", "table"],
      registers: [this.registry],
    });

    this.dbQueryErrors = new Counter({
      name: "db_query_errors_total",
      help: "Total number of database query errors",
      labelNames: ["operation", "table", "error_type"],
      registers: [this.registry],
    });

    // Queue Metrics
    this.queueJobsActive = new Gauge({
      name: "queue_jobs_active",
      help: "Number of active queue jobs",
      labelNames: ["queue_name", "job_type"],
      registers: [this.registry],
    });

    this.queueJobsWaiting = new Gauge({
      name: "queue_jobs_waiting",
      help: "Number of waiting queue jobs",
      labelNames: ["queue_name", "job_type"],
      registers: [this.registry],
    });

    this.queueJobsCompleted = new Counter({
      name: "queue_jobs_completed_total",
      help: "Total number of completed queue jobs",
      labelNames: ["queue_name", "job_type"],
      registers: [this.registry],
    });

    this.queueJobsFailed = new Counter({
      name: "queue_jobs_failed_total",
      help: "Total number of failed queue jobs",
      labelNames: ["queue_name", "job_type", "error_type"],
      registers: [this.registry],
    });

    this.queueJobDuration = new Histogram({
      name: "queue_job_duration_seconds",
      help: "Queue job processing duration in seconds",
      labelNames: ["queue_name", "job_type"],
      buckets: [1, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.registry],
    });

    // Business Metrics
    this.bridgeVerificationsTotal = new Counter({
      name: "bridge_verifications_total",
      help: "Total number of bridge verifications",
      labelNames: ["bridge_id", "bridge_name", "asset"],
      registers: [this.registry],
    });

    this.bridgeVerificationSuccess = new Counter({
      name: "bridge_verification_success_total",
      help: "Total number of successful bridge verifications",
      labelNames: ["bridge_id", "bridge_name", "asset"],
      registers: [this.registry],
    });

    this.bridgeVerificationFailure = new Counter({
      name: "bridge_verification_failure_total",
      help: "Total number of failed bridge verifications",
      labelNames: ["bridge_id", "bridge_name", "asset", "reason"],
      registers: [this.registry],
    });

    this.bridgeHealthScore = new Gauge({
      name: "bridge_health_score",
      help: "Bridge health score (0-100)",
      labelNames: ["bridge_id", "bridge_name"],
      registers: [this.registry],
    });

    this.assetPriceGauge = new Gauge({
      name: "asset_price_usd",
      help: "Current asset price in USD",
      labelNames: ["symbol", "source"],
      registers: [this.registry],
    });

    this.liquidityTVL = new Gauge({
      name: "liquidity_tvl_usd",
      help: "Total Value Locked in USD",
      labelNames: ["symbol", "dex", "chain"],
      registers: [this.registry],
    });

    this.alertsTriggered = new Counter({
      name: "alerts_triggered_total",
      help: "Total number of alerts triggered",
      labelNames: ["alert_type", "priority", "bridge_id"],
      registers: [this.registry],
    });

    this.circuitBreakerTrips = new Counter({
      name: "circuit_breaker_trips_total",
      help: "Total number of circuit breaker trips",
      labelNames: ["bridge_id", "reason"],
      registers: [this.registry],
    });

    // Cache Metrics
    this.cacheHits = new Counter({
      name: "cache_hits_total",
      help: "Total number of cache hits",
      labelNames: ["cache_key"],
      registers: [this.registry],
    });

    this.cacheMisses = new Counter({
      name: "cache_misses_total",
      help: "Total number of cache misses",
      labelNames: ["cache_key"],
      registers: [this.registry],
    });

    this.cacheSize = new Gauge({
      name: "cache_size_bytes",
      help: "Current cache size in bytes",
      labelNames: ["cache_name"],
      registers: [this.registry],
    });

    this.cacheEvictions = new Counter({
      name: "cache_evictions_total",
      help: "Total number of cache evictions",
      labelNames: ["cache_name", "reason"],
      registers: [this.registry],
    });

    // API Key Metrics
    this.apiKeyRequests = new Counter({
      name: "api_key_requests_total",
      help: "Total number of API key requests",
      labelNames: ["api_key_id", "tier"],
      registers: [this.registry],
    });

    this.apiKeyRateLimitHits = new Counter({
      name: "api_key_rate_limit_hits_total",
      help: "Total number of rate limit hits per API key",
      labelNames: ["api_key_id", "tier"],
      registers: [this.registry],
    });

    // WebSocket Metrics
    this.websocketConnections = new Gauge({
      name: "websocket_connections_active",
      help: "Number of active WebSocket connections",
      registers: [this.registry],
    });

    this.websocketMessagesTotal = new Counter({
      name: "websocket_messages_total",
      help: "Total number of WebSocket messages",
      labelNames: ["type", "direction"],
      registers: [this.registry],
    });

    this.initialized = true;
    logger.info("Metrics service initialized");
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics as JSON
   */
  async getMetricsJSON(): Promise<any> {
    return this.registry.getMetricsAsJSON();
  }

  /**
   * Get registry for custom metric registration
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.registry.resetMetrics();
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    requestSize?: number,
    responseSize?: number
  ) {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
    this.httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    
    if (requestSize !== undefined) {
      this.httpRequestSize.observe({ method, route }, requestSize);
    }
    
    if (responseSize !== undefined) {
      this.httpResponseSize.observe({ method, route }, responseSize);
    }
  }

  /**
   * Record database query metrics
   */
  recordDbQuery(
    operation: string,
    table: string,
    duration: number,
    error?: { type: string }
  ) {
    this.dbQueriesTotal.inc({ operation, table });
    this.dbQueryDuration.observe({ operation, table }, duration);
    
    if (error) {
      this.dbQueryErrors.inc({ operation, table, error_type: error.type });
    }
  }

  /**
   * Record queue job metrics
   */
  recordQueueJob(
    queueName: string,
    jobType: string,
    duration: number,
    success: boolean,
    errorType?: string
  ) {
    if (success) {
      this.queueJobsCompleted.inc({ queue_name: queueName, job_type: jobType });
    } else {
      this.queueJobsFailed.inc({
        queue_name: queueName,
        job_type: jobType,
        error_type: errorType || "unknown",
      });
    }
    
    this.queueJobDuration.observe({ queue_name: queueName, job_type: jobType }, duration);
  }

  /**
   * Record bridge verification
   */
  recordBridgeVerification(
    bridgeId: string,
    bridgeName: string,
    asset: string,
    success: boolean,
    reason?: string
  ) {
    this.bridgeVerificationsTotal.inc({ bridge_id: bridgeId, bridge_name: bridgeName, asset });
    
    if (success) {
      this.bridgeVerificationSuccess.inc({ bridge_id: bridgeId, bridge_name: bridgeName, asset });
    } else {
      this.bridgeVerificationFailure.inc({
        bridge_id: bridgeId,
        bridge_name: bridgeName,
        asset,
        reason: reason || "unknown",
      });
    }
  }
}

// Singleton instance
let metricsServiceInstance: MetricsService | null = null;

export function getMetricsService(): MetricsService {
  if (!metricsServiceInstance) {
    metricsServiceInstance = new MetricsService();
  }
  return metricsServiceInstance;
}

export { MetricsService };
