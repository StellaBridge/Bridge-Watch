import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { FailureSimulatorService } from "../../services/failureSimulator.service.js";
import { logger } from "../../utils/logger.js";
import { sendApiError } from "../utils/response.js";

const simulatorService = new FailureSimulatorService();

const failureModeSchema = z.enum([
  "timeout",
  "error",
  "latency",
  "partial_failure",
  "connection_refused",
]);

const createScenarioBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  targetService: z.string().min(1).max(200),
  failureMode: failureModeSchema,
  latencyMs: z.number().int().positive().optional().nullable(),
  errorRate: z.number().min(0).max(1).optional().nullable(),
  timeoutMs: z.number().int().positive().optional().nullable(),
  errorMessage: z.string().max(500).optional().nullable(),
});

const updateScenarioBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  targetService: z.string().min(1).max(200).optional(),
  failureMode: failureModeSchema.optional(),
  latencyMs: z.number().int().positive().optional().nullable(),
  errorRate: z.number().min(0).max(1).optional().nullable(),
  timeoutMs: z.number().int().positive().optional().nullable(),
  errorMessage: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
});

const listScenariosQuerySchema = z.object({
  targetService: z.string().optional(),
  enabledOnly: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const listRunsQuerySchema = z.object({
  scenarioId: z.string().uuid().optional(),
  status: z
    .enum(["pending", "running", "completed", "cancelled", "failed"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const startRunBodySchema = z.object({
  triggeredBy: z.string().max(200).optional().nullable(),
  trigger: z.enum(["manual", "scheduled", "ci"]).optional().default("manual"),
  durationMs: z.number().int().positive().optional().nullable(),
});

const completeRunBodySchema = z.object({
  observations: z.record(z.unknown()).optional().default({}),
});

const cancelRunBodySchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

const setEnabledBodySchema = z.object({
  enabled: z.boolean(),
});

const runEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

export async function failureSimulatorRoutes(server: FastifyInstance) {
  // Scenarios

  server.get(
    "/scenarios",
    async (
      request: FastifyRequest<{ Querystring: z.infer<typeof listScenariosQuerySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const query = listScenariosQuerySchema.parse(request.query);
        return await simulatorService.listScenarios(query);
      } catch (error) {
        logger.error(error, "Failed to list failure simulator scenarios");
        return sendApiError(reply, 500, "Failed to list failure simulator scenarios");
      }
    }
  );

  server.get(
    "/scenarios/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const scenario = await simulatorService.getScenario(request.params.id);
        if (!scenario) {
          return sendApiError(reply, 404, "Scenario not found");
        }
        return { scenario };
      } catch (error) {
        logger.error(error, "Failed to get failure simulator scenario");
        return sendApiError(reply, 500, "Failed to get failure simulator scenario");
      }
    }
  );

  server.post(
    "/scenarios",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin:write"] }),
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof createScenarioBodySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const body = createScenarioBodySchema.parse(request.body);
        const scenario = await simulatorService.createScenario(body);
        reply.status(201);
        return { scenario };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Invalid failure")) {
          return sendApiError(reply, 400, error.message);
        }
        if (error instanceof Error && error.message.includes("required")) {
          return sendApiError(reply, 400, error.message);
        }
        logger.error(error, "Failed to create failure simulator scenario");
        return sendApiError(reply, 500, "Failed to create failure simulator scenario");
      }
    }
  );

  server.patch(
    "/scenarios/:id",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin:write"] }),
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof updateScenarioBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = updateScenarioBodySchema.parse(request.body);
        const scenario = await simulatorService.updateScenario(request.params.id, body);
        if (!scenario) {
          return sendApiError(reply, 404, "Scenario not found");
        }
        return { scenario };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Invalid failure")) {
          return sendApiError(reply, 400, error.message);
        }
        logger.error(error, "Failed to update failure simulator scenario");
        return sendApiError(reply, 500, "Failed to update failure simulator scenario");
      }
    }
  );

  server.delete(
    "/scenarios/:id",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin:write"] }),
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const deleted = await simulatorService.deleteScenario(request.params.id);
        if (!deleted) {
          return sendApiError(reply, 404, "Scenario not found");
        }
        return { success: true };
      } catch (error) {
        logger.error(error, "Failed to delete failure simulator scenario");
        return sendApiError(reply, 500, "Failed to delete failure simulator scenario");
      }
    }
  );

  server.patch(
    "/scenarios/:id/enabled",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin:write"] }),
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof setEnabledBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { enabled } = setEnabledBodySchema.parse(request.body);
        const scenario = await simulatorService.setEnabled(request.params.id, enabled);
        if (!scenario) {
          return sendApiError(reply, 404, "Scenario not found");
        }
        return { scenario };
      } catch (error) {
        logger.error(error, "Failed to update scenario enabled state");
        return sendApiError(reply, 500, "Failed to update scenario enabled state");
      }
    }
  );

  // Runs

  server.get(
    "/runs",
    async (
      request: FastifyRequest<{ Querystring: z.infer<typeof listRunsQuerySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const query = listRunsQuerySchema.parse(request.query);
        return await simulatorService.listRuns(query);
      } catch (error) {
        logger.error(error, "Failed to list failure simulator runs");
        return sendApiError(reply, 500, "Failed to list failure simulator runs");
      }
    }
  );

  server.get(
    "/runs/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const run = await simulatorService.getRun(request.params.id);
        if (!run) {
          return sendApiError(reply, 404, "Run not found");
        }
        return { run };
      } catch (error) {
        logger.error(error, "Failed to get failure simulator run");
        return sendApiError(reply, 500, "Failed to get failure simulator run");
      }
    }
  );

  server.post(
    "/scenarios/:id/runs",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin:write"] }),
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof startRunBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = startRunBodySchema.parse(request.body ?? {});
        const run = await simulatorService.startRun(request.params.id, body);
        if (!run) {
          return sendApiError(reply, 404, "Scenario not found");
        }
        reply.status(201);
        return { run };
      } catch (error) {
        logger.error(error, "Failed to start failure simulator run");
        return sendApiError(reply, 500, "Failed to start failure simulator run");
      }
    }
  );

  server.post(
    "/runs/:id/complete",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin:write"] }),
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof completeRunBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = completeRunBodySchema.parse(request.body ?? {});
        const run = await simulatorService.completeRun(request.params.id, body.observations);
        if (!run) {
          return sendApiError(reply, 404, "Run not found or not in running state");
        }
        return { run };
      } catch (error) {
        logger.error(error, "Failed to complete failure simulator run");
        return sendApiError(reply, 500, "Failed to complete failure simulator run");
      }
    }
  );

  server.post(
    "/runs/:id/cancel",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin:write"] }),
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof cancelRunBodySchema>;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = cancelRunBodySchema.parse(request.body ?? {});
        const run = await simulatorService.cancelRun(request.params.id, body.reason ?? undefined);
        if (!run) {
          return sendApiError(reply, 404, "Run not found or not cancellable");
        }
        return { run };
      } catch (error) {
        logger.error(error, "Failed to cancel failure simulator run");
        return sendApiError(reply, 500, "Failed to cancel failure simulator run");
      }
    }
  );

  server.get(
    "/runs/:id/events",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: z.infer<typeof runEventsQuerySchema>;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { limit } = runEventsQuerySchema.parse(request.query);
        const events = await simulatorService.getRunEvents(request.params.id, limit);
        return { runId: request.params.id, events };
      } catch (error) {
        logger.error(error, "Failed to get run events");
        return sendApiError(reply, 500, "Failed to get run events");
      }
    }
  );
}
