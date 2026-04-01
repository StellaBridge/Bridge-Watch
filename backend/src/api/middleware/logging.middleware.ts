import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';

export interface RequestLogEntry {
  timestamp: string;
  correlationId: string;
  method: string;
  path: string;
  query?: Record<string, any>;
  headers: Record<string, string>;
  requestSize?: number;
  requestBody?: any;
  userId?: string;
  clientIp: string;
}

export interface ResponseLogEntry {
  timestamp: string;
  correlationId: string;
  statusCode: number;
  headers: Record<string, string>;
  responseSize?: number;
  responseBody?: any;
  duration: number;
  isSlow: boolean;
  slowThreshold: number;
}

const EXCLUDED_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-secret-token',
];

const SLOW_REQUEST_THRESHOLD_MS = parseInt(
  process.env.REQUEST_SLOW_THRESHOLD_MS || '1000',
  10
);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted = { ...headers };
  EXCLUDED_HEADERS.forEach((header) => {
    if (redacted[header]) {
      redacted[header] = '***REDACTED***';
    }
  });
  return redacted;
}

export function shouldLogRequestBody(path: string): boolean {
  // Don't log request body for health checks and metrics
  if (path.startsWith('/health') || path.startsWith('/ready') || path.startsWith('/live') || path.startsWith('/metrics')) {
    return false;
  }
  return config.LOG_REQUEST_BODY === true;
}

export function shouldLogResponseBody(path: string): boolean {
  // Don't log response body for health checks and metrics
  if (path.startsWith('/health') || path.startsWith('/ready') || path.startsWith('/live') || path.startsWith('/metrics')) {
    return false;
  }
  return config.LOG_RESPONSE_BODY === true;
}

export async function registerRequestLoggingMiddleware(
  server: FastifyInstance
): Promise<void> {
  // Store request start time for duration calculation
  server.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    (request as any).startTime = Date.now();
  });

  // Log responses and calculate duration
  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const traceContext = (request as any).traceContext;
      const correlationId = traceContext?.correlationId || 'unknown';
      const startTime = (request as any).startTime || Date.now();
      const duration = Date.now() - startTime;
      const isSlow = duration > SLOW_REQUEST_THRESHOLD_MS;

      const responseLogEntry: ResponseLogEntry = {
        timestamp: new Date().toISOString(),
        correlationId,
        statusCode: reply.statusCode,
        headers: redactHeaders(reply.getHeaders() as Record<string, string>),
        responseSize: reply.getHeader('content-length')
          ? parseInt(reply.getHeader('content-length') as string, 10)
          : undefined,
        duration,
        isSlow,
        slowThreshold: SLOW_REQUEST_THRESHOLD_MS,
      };

      // Note: Response body logging is not available in Fastify onResponse hook
      // as the response has already been sent to the client

      const logLevel = isSlow ? 'warn' : reply.statusCode >= 400 ? 'error' : 'info';
      if (logLevel === 'warn') {
        logger.warn(responseLogEntry, `${request.method} ${request.url} - ${reply.statusCode} (${duration}ms)`);
      } else if (logLevel === 'error') {
        logger.error(responseLogEntry, `${request.method} ${request.url} - ${reply.statusCode} (${duration}ms)`);
      } else {
        logger.info(responseLogEntry, `${request.method} ${request.url} - ${reply.statusCode} (${duration}ms)`);
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to log response');
    }
  });
}
