import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { validationService, type ValidationContext } from "../../services/validation.service.js";
import { createChildLogger } from "../../utils/logger.js";
import { config } from "../../config/index.js";

const validationLogger = createChildLogger('validation-middleware');

/**
 * Validation middleware for Fastify
 * Validates incoming request data before processing
 */

// Data type mapping for routes
const routeDataTypes: Record<string, string> = {
  '/api/v1/assets': 'asset',
  '/api/v1/bridges': 'bridge',
  '/api/v1/alert-rules': 'alertRule',
};

/**
 * Get data type from route path
 */
function getDataTypeFromPath(path: string): string | undefined {
  for (const [routePrefix, dataType] of Object.entries(routeDataTypes)) {
    if (path.startsWith(routePrefix)) {
      return dataType;
    }
  }
  return undefined;
}

/**
 * Check if user is admin based on API key
 */
function isAdmin(request: FastifyRequest): boolean {
  const apiKey = request.headers['x-api-key'] as string;
  return !!apiKey && apiKey.startsWith(config.RATE_LIMIT_ADMIN_API_KEY_PREFIX);
}

/**
 * Register validation middleware
 */
export async function registerValidation(server: FastifyInstance): Promise<void> {
  
  // Pre-validation hook - validates request body before route handler
  server.addHook('preValidation', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip validation for certain methods
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return;
    }

    // Skip validation if explicitly disabled for this route
    if ((request as any).skipValidation) {
      return;
    }

    const dataType = getDataTypeFromPath(request.url);
    if (!dataType) {
      // No validation schema for this route
      return;
    }

    // Skip if no body to validate
    if (!request.body) {
      return;
    }

    const startTime = Date.now();
    
    try {
      const context: ValidationContext = {
        dataType,
        operation: request.method === 'POST' ? 'create' : 'update',
        isAdmin: isAdmin(request),
        correlationId: request.headers['x-correlation-id'] as string,
      };

      // Validate the request body
      const result = await validationService.validate(
        request.body,
        dataType as any,
        context
      );

      // Attach validation result to request for use in route handler
      (request as any).validationResult = result;

      // Log validation results
      const validationTime = Date.now() - startTime;
      validationLogger.info({
        path: request.url,
        method: request.method,
        dataType,
        isValid: result.isValid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        validationTime,
        correlationId: context.correlationId,
      }, 'Request validation completed');

      // If validation failed and not admin bypass, return error
      if (!result.isValid && !result.metadata.bypassUsed) {
        return reply.status(400).send({
          success: false,
          error: 'Validation Failed',
          message: 'Request data failed validation',
          details: {
            errors: result.errors,
            warnings: result.warnings,
            dataType,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // If normalized data is available, use it
      if (result.normalizedData) {
        (request as any).normalizedBody = result.normalizedData;
      }

    } catch (error) {
      validationLogger.error({
        err: error,
        path: request.url,
        method: request.method,
      }, 'Validation middleware error');

      // In strict mode, fail on validation errors
      if (config.VALIDATION_STRICT_MODE) {
        return reply.status(500).send({
          success: false,
          error: 'Validation Error',
          message: 'An error occurred during validation',
          timestamp: new Date().toISOString(),
        });
      }

      // In non-strict mode, log warning and continue
      validationLogger.warn({
        path: request.url,
        method: request.method,
      }, 'Validation error ignored (non-strict mode)');
    }
  });

  // Post-validation hook - logs validation warnings
  server.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: string) => {
    const validationResult = (request as any).validationResult;
    
    if (validationResult && validationResult.warnings.length > 0) {
      // Add validation warnings to response headers
      reply.header('X-Validation-Warnings', validationResult.warnings.length.toString());
      
      // If response is JSON, we could optionally include warnings
      // This is typically done in the route handler, not middleware
    }

    return payload;
  });

  validationLogger.info('Validation middleware registered');
}

/**
 * Middleware options decorator
 * Allows routes to skip validation or configure validation behavior
 */
export function skipValidation() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (request: FastifyRequest, reply: FastifyReply, ...args: any[]) {
      (request as any).skipValidation = true;
      return originalMethod.apply(this, [request, reply, ...args]);
    };
    
    return descriptor;
  };
}

/**
 * Get validation result from request
 */
export function getValidationResult(request: FastifyRequest) {
  return (request as any).validationResult;
}

/**
 * Get normalized body from request
 */
export function getNormalizedBody(request: FastifyRequest) {
  return (request as any).normalizedBody || request.body;
}

/**
 * Helper to create validation middleware for specific data types
 */
export function createValidationMiddleware(dataType: string, options: ValidationOptions = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (options.skipMethods?.includes(request.method)) {
      return;
    }

    if (!request.body) {
      return;
    }

    const context: ValidationContext = {
      dataType,
      operation: request.method === 'POST' ? 'create' : 'update',
      isAdmin: isAdmin(request),
      correlationId: request.headers['x-correlation-id'] as string,
    };

    const result = await validationService.validate(
      request.body,
      dataType as any,
      context
    );

    (request as any).validationResult = result;

    if (!result.isValid && !result.metadata.bypassUsed && !options.allowInvalid) {
      return reply.status(400).send({
        success: false,
        error: 'Validation Failed',
        message: 'Request data failed validation',
        details: {
          errors: result.errors,
          warnings: result.warnings,
          dataType,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (result.normalizedData && options.useNormalizedData !== false) {
      (request as any).normalizedBody = result.normalizedData;
    }
  };
}

interface ValidationOptions {
  skipMethods?: string[];
  allowInvalid?: boolean;
  useNormalizedData?: boolean;
}

/**
 * Batch validation helper for bulk operations
 */
export async function validateBatch(
  items: any[],
  dataType: string,
  request: FastifyRequest
): Promise<any> {
  const context: ValidationContext = {
    dataType,
    operation: 'batch',
    isAdmin: isAdmin(request),
    correlationId: request.headers['x-correlation-id'] as string,
  };

  const result = await validationService.validateBatch(
    items,
    dataType as any,
    context
  );

  return result;
}
