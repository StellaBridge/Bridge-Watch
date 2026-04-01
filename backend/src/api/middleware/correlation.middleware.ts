import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';

export interface TraceContext {
  correlationId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  userId?: string;
  sessionId?: string;
  clientIp: string;
  timestamp: string;
  traceparent?: string;
  tracestate?: string;
  jaegerTraceId?: string;
  jaegerSpanId?: string;
  jaegerParentSpanId?: string;
  datadogTraceId?: string;
  datadogSpanId?: string;
}

class TraceManager {
  private static instance: TraceManager;
  private traceContextMap: Map<string, TraceContext> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly MAX_CONTEXT_AGE_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      this.traceContextMap.forEach((context, key) => {
        const contextAge = now - new Date(context.timestamp).getTime();
        if (contextAge > this.MAX_CONTEXT_AGE_MS) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach((key) => this.traceContextMap.delete(key));
    }, 60000); // Run cleanup every minute
  }

  static getInstance(): TraceManager {
    if (!TraceManager.instance) {
      TraceManager.instance = new TraceManager();
    }
    return TraceManager.instance;
  }

  createTraceContext(request: FastifyRequest): TraceContext {
    const headers = request.headers;
    const clientIp = request.ip || 'unknown';
    const timestamp = new Date().toISOString();

    // Try to extract correlation ID from various header formats
    let correlationId = 
      (headers['x-correlation-id'] as string) ||
      (headers['x-request-id'] as string) ||
      (headers['traceparent'] as string)?.split('-')[1] ||
      (headers['x-trace-id'] as string) ||
      (headers['dd-trace-id'] as string);

    // Generate new correlation ID if not provided
    if (!correlationId) {
      correlationId = uuidv4();
    }

    const traceId = uuidv4();
    const spanId = uuidv4();
    const parentSpanId = (headers['x-parent-span-id'] as string) || undefined;

    const traceContext: TraceContext = {
      correlationId,
      traceId,
      spanId,
      parentSpanId,
      clientIp,
      timestamp,
      traceparent: `00-${traceId}-${spanId}-01`,
      jaegerTraceId: traceId,
      jaegerSpanId: spanId,
      jaegerParentSpanId: parentSpanId,
      datadogTraceId: traceId,
      datadogSpanId: spanId,
    };

    // Store trace context for retrieval
    const requestId = `${correlationId}-${Date.now()}`;
    this.traceContextMap.set(requestId, traceContext);

    // Attach to request for use in handlers
    (request as any).traceContext = traceContext;
    (request as any).requestId = requestId;

    return traceContext;
  }

  updateTraceContext(requestId: string, updates: Partial<TraceContext>): void {
    const existing = this.traceContextMap.get(requestId);
    if (existing) {
      this.traceContextMap.set(requestId, { ...existing, ...updates });
    }
  }

  getTraceContext(requestId: string): TraceContext | undefined {
    return this.traceContextMap.get(requestId);
  }

  completeTrace(requestId: string): TraceContext | undefined {
    const context = this.traceContextMap.get(requestId);
    this.traceContextMap.delete(requestId);
    return context;
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  propagateTraceContext(
    headers: Record<string, string>,
    format: 'w3c' | 'jaeger' | 'datadog' = 'w3c'
  ): Record<string, string> {
    const propagated = { ...headers };

    if (format === 'w3c') {
      // W3C Trace Context format
      if (headers['traceparent']) {
        propagated['traceparent'] = headers['traceparent'];
      }
      if (headers['tracestate']) {
        propagated['tracestate'] = headers['tracestate'];
      }
    } else if (format === 'jaeger') {
      // Jaeger format
      if (headers['x-trace-id']) {
        propagated['x-trace-id'] = headers['x-trace-id'];
      }
      if (headers['x-span-id']) {
        propagated['x-span-id'] = headers['x-span-id'];
      }
      if (headers['x-parent-span-id']) {
        propagated['x-parent-span-id'] = headers['x-parent-span-id'];
      }
    } else if (format === 'datadog') {
      // Datadog format
      if (headers['dd-trace-id']) {
        propagated['dd-trace-id'] = headers['dd-trace-id'];
      }
      if (headers['dd-span-id']) {
        propagated['dd-span-id'] = headers['dd-span-id'];
      }
    }

    // Always propagate correlation ID
    if (headers['x-correlation-id']) {
      propagated['x-correlation-id'] = headers['x-correlation-id'];
    }

    return propagated;
  }
}

export async function registerCorrelationMiddleware(
  server: FastifyInstance
): Promise<void> {
  const traceManager = TraceManager.getInstance();

  server.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      const traceContext = traceManager.createTraceContext(request);
      logger.debug(
        { correlationId: traceContext.correlationId, traceId: traceContext.traceId },
        'Trace context created'
      );
    } catch (error) {
      logger.warn({ error }, 'Failed to create trace context, continuing with defaults');
    }
  });
}

export function getTraceManager(): TraceManager {
  return TraceManager.getInstance();
}
