/**
 * Request ID Propagation Middleware (#1351)
 * 
 * Generates and propagates UUID request IDs across all services:
 * - API middleware generates UUID
 * - AsyncLocalStorage context for automatic logger inclusion
 * - BullMQ job data for worker tracing
 * - X-Request-ID header for outgoing HTTP calls and webhooks
 */

import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

// Global AsyncLocalStorage instance for request context
export const requestContext = new AsyncLocalStorage<RequestContext>();

interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: string;
  timestamp: Date;
}

/**
 * Express middleware to generate and attach request ID
 * Accepts existing X-Request-ID from client or generates new UUID
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Use existing request ID from header or generate new one
  const requestId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string) ||
    uuidv4();
  
  // Attach to request object
  (req as any).requestId = requestId;
  
  // Set response header for client tracing
  res.setHeader('X-Request-ID', requestId);
  
  // Create context for AsyncLocalStorage
  const context: RequestContext = {
    requestId,
    tenantId: (req as any).tenant?.id,
    userId: (req as any).user?.id,
    timestamp: new Date(),
  };
  
  // Run the rest of the request within this context
  requestContext.run(context, () => {
    next();
  });
}

/**
 * Get current request ID from AsyncLocalStorage context
 * Safe to call from any service/utility function
 */
export function getCurrentRequestId(): string | undefined {
  const context = requestContext.getStore();
  return context?.requestId;
}

/**
 * Get full request context from AsyncLocalStorage
 */
export function getCurrentContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Attach request ID to BullMQ job data for worker tracing
 * @param jobData - Original job data
 * @returns Job data with requestId attached
 */
export function attachRequestIdToJob<T extends Record<string, any>>(
  jobData: T
): T & { requestId: string } {
  const requestId = getCurrentRequestId() || uuidv4();
  
  return {
    ...jobData,
    requestId,
  };
}

/**
 * Add X-Request-ID header to outgoing HTTP requests
 * Use with axios, fetch, or any HTTP client
 * 
 * @example
 * const response = await axios.get('https://api.example.com/data', {
 *   headers: getRequestIdHeaders(),
 * });
 */
export function getRequestIdHeaders(): Record<string, string> {
  const requestId = getCurrentRequestId();
  
  if (!requestId) {
    return {};
  }
  
  return {
    'X-Request-ID': requestId,
    'X-Correlation-ID': requestId,
  };
}

/**
 * Middleware to log request details with requestId
 * Should be added after requestIdMiddleware
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req as any).requestId;
  const startTime = Date.now();
  
  // Log request start
  console.log({
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.get('user-agent'),
    ip: req.ip,
    event: 'request_start',
  });
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    console.log({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      event: 'request_end',
    });
  });
  
  next();
}
