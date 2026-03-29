import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { validationService } from "../../services/validation.service.js";
import { createChildLogger } from "../../utils/logger.js";
import { config } from "../../config/index.js";

const validationAdminLogger = createChildLogger('validation-admin');

/**
 * Admin routes for data validation management and monitoring
 * These routes require admin API key authentication
 */

export async function validationAdminRoutes(server: FastifyInstance) {
  // Admin authentication middleware
  server.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.headers["x-api-key"] as string;
    
    if (!apiKey || !apiKey.startsWith(config.RATE_LIMIT_ADMIN_API_KEY_PREFIX)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Admin API key required for validation management",
      });
    }
  });

  // Get validation metrics
  server.get(
    "/metrics",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = validationService.getMetrics();
        
        return {
          success: true,
          data: {
            ...metrics,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Failed to get validation metrics");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve validation metrics",
        });
      }
    }
  );

  // Validate single item
  server.post<
    {
      Body: {
        data: any;
        dataType: string;
        operation?: "create" | "update";
        existingData?: any;
      };
    }
  >(
    "/validate",
    async (request, reply) => {
      try {
        const { data, dataType, operation = "create", existingData } = request.body;
        
        if (!data || !dataType) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Missing required fields: data, dataType",
          });
        }

        const context = {
          dataType,
          operation,
          isAdmin: true,
          existingData,
          correlationId: request.headers['x-correlation-id'] as string,
        };

        const result = await validationService.validate(
          data,
          dataType as any,
          context
        );

        validationAdminLogger.info({
          dataType,
          operation,
          isValid: result.isValid,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
        }, "Admin validation performed");

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Validation failed");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Validation failed",
        });
      }
    }
  );

  // Validate batch items
  server.post<
    {
      Body: {
        items: any[];
        dataType: string;
        batchSize?: number;
      };
    }
  >(
    "/validate/batch",
    async (request, reply) => {
      try {
        const { items, dataType, batchSize = 100 } = request.body;
        
        if (!items || !Array.isArray(items) || !dataType) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Missing required fields: items (array), dataType",
          });
        }

        if (items.length === 0) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Items array cannot be empty",
          });
        }

        if (items.length > 1000) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Batch size cannot exceed 1000 items",
          });
        }

        const context = {
          dataType,
          operation: "batch" as const,
          isAdmin: true,
          correlationId: request.headers['x-correlation-id'] as string,
          batchSize,
        };

        const result = await validationService.validateBatch(
          items,
          dataType as any,
          context
        );

        validationAdminLogger.info({
          dataType,
          totalItems: result.totalItems,
          validItems: result.validItems,
          invalidItems: result.invalidItems,
          dataQualityScore: result.summary.dataQualityScore,
        }, "Admin batch validation performed");

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Batch validation failed");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Batch validation failed",
        });
      }
    }
  );

  // Get validation configuration
  server.get(
    "/config",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validationConfig = {
          strictMode: config.VALIDATION_STRICT_MODE,
          adminBypass: config.VALIDATION_ADMIN_BYPASS,
          enabledTypes: ['asset', 'bridge', 'priceRecord', 'healthScore', 'liquiditySnapshot', 'alertRule'],
          logLevel: config.LOG_LEVEL,
        };

        return {
          success: true,
          data: validationConfig,
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Failed to get validation config");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve validation configuration",
        });
      }
    }
  );

  // Reset validation metrics
  server.post(
    "/metrics/reset",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        validationService.resetMetrics();
        
        validationAdminLogger.info("Validation metrics reset by admin");

        return {
          success: true,
          message: "Validation metrics reset successfully",
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Failed to reset validation metrics");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to reset validation metrics",
        });
      }
    }
  );

  // Get validation report
  server.get<
    {
      Querystring: {
        dataType?: string;
        timeRange?: number;
      };
    }
  >(
    "/report",
    async (request, reply) => {
      try {
        const { dataType, timeRange } = request.query;
        const metrics = validationService.getMetrics();

        // Generate validation report
        const report = {
          summary: {
            totalValidations: metrics.totalValidations,
            validationErrors: metrics.validationErrors,
            validationWarnings: metrics.validationWarnings,
            averageValidationTime: metrics.averageValidationTime,
            dataQualityScore: metrics.dataQualityScore,
          },
          dataType,
          timeRange,
          generatedAt: new Date().toISOString(),
          recommendations: [
            "Continue monitoring validation metrics",
            "Review any recurring validation errors",
            "Ensure data sources provide consistent data formats",
          ],
        };

        return {
          success: true,
          data: report,
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Failed to generate validation report");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to generate validation report",
        });
      }
    }
  );

  // Export validation data
  server.get<
    {
      Querystring: {
        format?: "json" | "csv";
      };
    }
  >(
    "/export",
    async (request, reply) => {
      try {
        const { format = "json" } = request.query;
        const metrics = validationService.getMetrics();

        if (format === "csv") {
          const headers = [
            "metric",
            "value",
            "timestamp",
          ].join(",");

          const rows = [
            `total_validations,${metrics.totalValidations},${metrics.timestamp}`,
            `validation_errors,${metrics.validationErrors},${metrics.timestamp}`,
            `validation_warnings,${metrics.validationWarnings},${metrics.timestamp}`,
            `average_validation_time,${metrics.averageValidationTime},${metrics.timestamp}`,
            `data_quality_score,${metrics.dataQualityScore},${metrics.timestamp}`,
          ];

          const csv = [headers, ...rows].join("\n");

          reply.header("Content-Type", "text/csv");
          reply.header("Content-Disposition", `attachment; filename="validation-metrics-${Date.now()}.csv"`);
          return csv;
        } else {
          reply.header("Content-Type", "application/json");
          reply.header("Content-Disposition", `attachment; filename="validation-metrics-${Date.now()}.json"`);
          return JSON.stringify({
            metrics,
            exportedAt: new Date().toISOString(),
          }, null, 2);
        }
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Failed to export validation data");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to export validation data",
        });
      }
    }
  );

  // Health check for validation system
  server.get(
    "/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = validationService.getMetrics();

        const isHealthy = metrics.totalValidations > 0 || metrics.validationErrors === 0;

        return {
          success: true,
          status: isHealthy ? "healthy" : "degraded",
          service: "validation-admin",
          timestamp: new Date().toISOString(),
          metrics: {
            totalValidations: metrics.totalValidations,
            validationErrors: metrics.validationErrors,
            dataQualityScore: metrics.dataQualityScore,
          },
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Validation admin health check failed");
        return reply.status(503).send({
          success: false,
          status: "unhealthy",
          service: "validation-admin",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  // Get validation rules for a data type
  server.get<
    {
      Params: {
        dataType: string;
      };
    }
  >(
    "/rules/:dataType",
    async (request, reply) => {
      try {
        const { dataType } = request.params;
        
        // Return information about validation rules for this data type
        const rulesInfo = {
          dataType,
          schemaValidation: true,
          customRules: [
            "consistency_checks",
            "duplicate_detection",
            "data_normalization",
          ],
          enabled: true,
        };

        return {
          success: true,
          data: rulesInfo,
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Failed to get validation rules");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Failed to retrieve validation rules",
        });
      }
    }
  );

  // Test validation on sample data
  server.post<
    {
      Body: {
        dataType: string;
        sampleData: any;
      };
    }
  >(
    "/test",
    async (request, reply) => {
      try {
        const { dataType, sampleData } = request.body;
        
        if (!dataType || !sampleData) {
          return reply.status(400).send({
            success: false,
            error: "Bad Request",
            message: "Missing required fields: dataType, sampleData",
          });
        }

        const context = {
          dataType,
          operation: "create" as const,
          isAdmin: true,
          correlationId: request.headers['x-correlation-id'] as string,
        };

        const result = await validationService.validate(
          sampleData,
          dataType as any,
          context
        );

        return {
          success: true,
          data: {
            testResult: result,
            passed: result.isValid,
            message: result.isValid 
              ? "Validation passed"
              : `Validation failed with ${result.errors.length} error(s) and ${result.warnings.length} warning(s)`,
          },
        };
      } catch (error) {
        validationAdminLogger.error({ err: error }, "Validation test failed");
        return reply.status(500).send({
          success: false,
          error: "Internal Server Error",
          message: "Validation test failed",
        });
      }
    }
  );

  validationAdminLogger.info("Validation admin routes registered");
}
