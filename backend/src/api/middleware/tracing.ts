import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { logger } from "../../utils/logger.js";
import { config } from "../../config/index.js";

// ---------------------------------------------------------------------------
// Types and Interfaces
// ---------------------------------------------------------------------------

export interface TraceContext {
  requestId: string;
  correlationId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  ip?: string;
  startTime: number;
  tags: Record<string, any>;
}

export interface LogEntry {
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  timestamp: string;
  traceContext: TraceContext;
  error?: Error;
  metadata?: Record<string, any>;
  duration?: number;
  component?: string;
  action?: string;
}

export interface PerformanceMetrics {
  route: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: number;
  traceId: string;
  spanId: string;
  memoryUsage?: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
}

// ---------------------------------------------------------------------------
// Sensitive Data Masking
// ---------------------------------------------------------------------------

const SENSITIVE_FIELDS = [
  // Authentication
  'password', 'token', 'secret', 'key', 'auth', 'credential',
  // Personal Information
  'email', 'phone', 'ssn', 'socialSecurityNumber', 'creditCard',
  // Financial
  'account', 'routing', 'iban', 'swift', 'bic',
  // Health
  'medical', 'health', 'diagnosis', 'treatment',
  // API Keys and Secrets
  'apikey', 'api_key', 'private_key', 'public_key', 'certificate',
];

const SENSITIVE_PATTERNS = [
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Phone numbers (basic pattern)
  /\b\d{3}-\d{3}-\d{4}\b/g,
  // Credit card numbers (basic pattern)
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  // API keys with prefix (e.g. sk-*, pk-*, rk-*)
  /\b(?:sk|pk|rk|ak|api|key)-[a-zA-Z0-9_-]{6,}\b/g,
  // API keys (alphanumeric with underscores, 20+ chars)
  /\b[a-zA-Z0-9_]{20,}\b/g,
  // JWT tokens
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
];

export function maskSensitiveData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    let masked = data;
    
    // Apply pattern-based masking
    SENSITIVE_PATTERNS.forEach(pattern => {
      masked = masked.replace(pattern, '***MASKED***');
    });
    
    return masked;
  }

  if (typeof data === 'object') {
    if (data instanceof Error) {
      // Strip all sensitive fields from Error objects entirely (not just mask them)
      const safeEntries = Object.entries(data).filter(([key]) => {
        const lowerKey = key.toLowerCase();
        return !SENSITIVE_FIELDS.some(field => lowerKey.includes(field));
      });
      return {
        name: data.name,
        message: data.message,
        stack: data.stack,
        ...Object.fromEntries(safeEntries),
      };
    }

    if (Array.isArray(data)) {
      return data.map(item => maskSensitiveData(item));
    }

    const masked: any = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        masked[key] = '***MASKED***';
      } else {
        masked[key] = maskSensitiveData(value);
      }
    }
    
    return masked;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Trace Context Management
// ---------------------------------------------------------------------------

export class TraceManager {
  private static instance: TraceManager;
  private activeTraces = new Map<string, TraceContext>();

  static getInstance(): TraceManager {
    if (!TraceManager.instance) {
      TraceManager.instance = new TraceManager();
    }
    return TraceManager.instance;
  }

  createTraceContext(request: FastifyRequest): TraceContext {
    const requestId = this.generateId();
    const correlationId = this.getCorrelationId(request);
    const traceId = this.getTraceId(request);
    const spanId = this.generateId();

    const traceContext: TraceContext = {
      requestId,
      correlationId,
      traceId,
      spanId,
      parentSpanId: this.getParentSpanId(request),
      userId: this.getUserId(request),
      sessionId: this.getSessionId(request),
      userAgent: request.headers['user-agent'],
      ip: this.getClientIP(request),
      startTime: Date.now(),
      tags: {},
    };

    this.activeTraces.set(requestId, traceContext);
    return traceContext;
  }

  updateTraceContext(requestId: string, updates: Partial<TraceContext>): void {
    const context = this.activeTraces.get(requestId);
    if (context) {
      Object.assign(context, updates);
      this.activeTraces.set(requestId, context);
    }
  }

  getTraceContext(requestId: string): TraceContext | undefined {
    return this.activeTraces.get(requestId);
  }

  completeTrace(requestId: string): TraceContext | undefined {
    const context = this.activeTraces.get(requestId);
    if (context) {
      this.activeTraces.delete(requestId);
    }
    return context;
  }

  listActiveTraces(): Array<[string, TraceContext]> {
    return Array.from(this.activeTraces.entries());
  }

  countActiveTraces(): number {
    return this.activeTraces.size;
  }

  private generateId(): string {
    return randomUUID().replace(/-/g, '');
  }

  private getCorrelationId(request: FastifyRequest): string {
    // Check for correlation ID in headers
    const correlationId = request.headers['x-correlation-id'] as string;
    if (correlationId) {
      return correlationId;
    }

    // Check for trace ID in headers (common alternative)
    const traceId = request.headers['x-trace-id'] as string;
    if (traceId) {
      return traceId;
    }

    // Generate new correlation ID
    return this.generateId();
  }

  private getTraceId(request: FastifyRequest): string {
    // Check for trace ID in headers
    const traceId = request.headers['x-trace-id'] as string;
    if (traceId) {
      return traceId;
    }

    // Use correlation ID as trace ID if no trace ID
    return this.getCorrelationId(request);
  }

  private getParentSpanId(request: FastifyRequest): string | undefined {
    return request.headers['x-parent-span-id'] as string | undefined;
  }

  private getUserId(request: FastifyRequest): string | undefined {
    // This would typically come from authentication middleware
    return (request as any).user?.id || request.headers['x-user-id'] as string;
  }

  private getSessionId(request: FastifyRequest): string | undefined {
    return request.headers['x-session-id'] as string;
  }

  private getClientIP(request: FastifyRequest): string {
    return request.ip || 
           request.headers['x-forwarded-for'] as string || 
           request.headers['x-real-ip'] as string || 
           'unknown';
  }
}

// ---------------------------------------------------------------------------
// Enhanced Logger with Trace Context
// ---------------------------------------------------------------------------

export class TracedLogger {
  private traceManager: TraceManager;

  constructor(traceManager: TraceManager) {
    this.traceManager = traceManager;
  }

  private createLogEntry(
    level: LogEntry['level'],
    message: string,
    requestId: string,
    error?: Error,
    metadata?: Record<string, any>,
    duration?: number,
    component?: string,
    action?: string
  ): LogEntry {
    const traceContext = this.traceManager.getTraceContext(requestId);
    
    if (!traceContext) {
      // Fallback logging without trace context
      return {
        level,
        message,
        timestamp: new Date().toISOString(),
        traceContext: {
          requestId: 'unknown',
          correlationId: 'unknown',
          traceId: 'unknown',
          spanId: 'unknown',
          startTime: Date.now(),
          tags: {},
        },
        error,
        metadata: maskSensitiveData(metadata),
        duration,
        component,
        action,
      };
    }

    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      traceContext,
      error,
      metadata: maskSensitiveData(metadata),
      duration,
      component,
      action,
    };
  }

  trace(message: string, requestId: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry('trace', message, requestId, undefined, metadata);
    this.writeLog(entry);
  }

  debug(message: string, requestId: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry('debug', message, requestId, undefined, metadata);
    this.writeLog(entry);
  }

  info(message: string, requestId: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry('info', message, requestId, undefined, metadata);
    this.writeLog(entry);
  }

  warn(message: string, requestId: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry('warn', message, requestId, undefined, metadata);
    this.writeLog(entry);
  }

  error(message: string, requestId: string, error?: Error, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry('error', message, requestId, error, metadata);
    this.writeLog(entry);
  }

  fatal(message: string, requestId: string, error?: Error, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry('fatal', message, requestId, error, metadata);
    this.writeLog(entry);
  }

  performance(message: string, requestId: string, duration: number, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry('info', message, requestId, undefined, metadata, duration, 'performance');
    this.writeLog(entry);
  }

  private writeLog(entry: LogEntry): void {
    const logData = {
      level: entry.level,
      message: entry.message,
      timestamp: entry.timestamp,
      requestId: entry.traceContext.requestId,
      correlationId: entry.traceContext.correlationId,
      traceId: entry.traceContext.traceId,
      spanId: entry.traceContext.spanId,
      parentSpanId: entry.traceContext.parentSpanId,
      userId: entry.traceContext.userId,
      sessionId: entry.traceContext.sessionId,
      userAgent: entry.traceContext.userAgent,
      ip: entry.traceContext.ip,
      duration: entry.duration,
      component: entry.component,
      action: entry.action,
      tags: entry.traceContext.tags,
      metadata: entry.metadata,
      ...(entry.error && {
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack,
        },
      }),
    };

    // Use Pino logger with structured data
    switch (entry.level) {
      case 'trace':
        logger.trace(logData);
        break;
      case 'debug':
        logger.debug(logData);
        break;
      case 'info':
        logger.info(logData);
        break;
      case 'warn':
        logger.warn(logData);
        break;
      case 'error':
        logger.error(logData);
        break;
      case 'fatal':
        logger.fatal(logData);
        break;
    }

    if (config.NODE_ENV === "test") {
      if (entry.level === "error" || entry.level === "fatal") {
        console.error(entry.message);
      } else {
        console.log(entry.message);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Request Tracing Middleware
// ---------------------------------------------------------------------------

export async function registerTracing(server: FastifyInstance): Promise<void> {
  const traceManager = TraceManager.getInstance();
  const tracedLogger = new TracedLogger(traceManager);

  // Add trace context to request object
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const traceContext = traceManager.createTraceContext(request);
    
    // Add trace context to request for use in other middleware/routes
    (request as any).traceContext = traceContext;
    (request as any).tracedLogger = tracedLogger;

    // Add trace headers to response
    reply.header('X-Request-ID', traceContext.requestId);
    reply.header('X-Correlation-ID', traceContext.correlationId);
    reply.header('X-Trace-ID', traceContext.traceId);
    reply.header('X-Span-ID', traceContext.spanId);

    // Log request start
    tracedLogger.info('Request started', traceContext.requestId, {
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: traceContext.ip,
    });
  });

  // Add timing and response logging
  server.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const traceContext = (request as any).traceContext as TraceContext;
    if (!traceContext) return;

    const duration = Date.now() - traceContext.startTime;

    // Update trace context with response info
    traceManager.updateTraceContext(traceContext.requestId, {
      tags: {
        ...traceContext.tags,
        statusCode: reply.statusCode,
        responseSize: reply.raw.getHeader('content-length'),
      },
    });

    // Log request completion
    tracedLogger.info('Request completed', traceContext.requestId, {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      responseSize: reply.raw.getHeader('content-length'),
    });

    if (reply.statusCode >= 400) {
      tracedLogger.error('Request error', traceContext.requestId, undefined, {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration,
      });
    }

    // Performance logging for slow requests
    if (duration > config.REQUEST_SLOW_THRESHOLD_MS) {
      tracedLogger.performance('Slow request detected', traceContext.requestId, duration, {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        threshold: config.REQUEST_SLOW_THRESHOLD_MS,
      });
    }

    // Clean up trace context
    traceManager.completeTrace(traceContext.requestId);
  });

  // Error logging with trace context
  server.addHook("onError", async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    const traceContext = (request as any).traceContext as TraceContext;
    if (!traceContext) return;

    tracedLogger.error('Request error', traceContext.requestId, error, {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
    });

    // Update trace context with error info
    traceManager.updateTraceContext(traceContext.requestId, {
      tags: {
        ...traceContext.tags,
        error: error.name,
        errorMessage: error.message,
      },
    });
  });

  logger.info("Request tracing middleware registered");
}

// ---------------------------------------------------------------------------
// Performance Monitoring
// ---------------------------------------------------------------------------

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 10000;

  addMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getMetrics(timeRange?: number): PerformanceMetrics[] {
    if (!timeRange) {
      return this.metrics;
    }

    const cutoff = Date.now() - timeRange;
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }

  getAverageResponseTime(route?: string): number {
    const relevantMetrics = route 
      ? this.metrics.filter(m => m.route === route)
      : this.metrics;
    
    if (relevantMetrics.length === 0) return 0;
    
    const total = relevantMetrics.reduce((sum, m) => sum + m.duration, 0);
    return total / relevantMetrics.length;
  }

  getSlowRequests(threshold: number = 1000): PerformanceMetrics[] {
    return this.metrics.filter(m => m.duration > threshold);
  }

  getErrorRate(timeRange?: number): number {
    const relevantMetrics = this.getMetrics(timeRange);
    if (relevantMetrics.length === 0) return 0;
    
    const errorCount = relevantMetrics.filter(m => m.statusCode >= 400).length;
    return (errorCount / relevantMetrics.length) * 100;
  }
}

export const performanceMonitor = new PerformanceMonitor();
