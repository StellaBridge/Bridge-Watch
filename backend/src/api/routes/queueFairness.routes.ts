import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { queueFairnessService } from "../../services/queueFairness.service.js";
import { JobQueue } from "../../workers/queue.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendApiError } from "../utils/response.js";

/**
 * #1184 — Queue Priority Fairness Admin API.
 */
export async function queueFairnessRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authMiddleware({ requiredScopes: ["admin:queue-fairness"] }));

  server.get(
    "/policies",
    {
      schema: {
        tags: ["Queue Fairness"],
        summary: "Get all lane fairness policies",
        security: [{ ApiKeyAuth: [] }],
        response: { 200: { type: "object", properties: { policies: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const policies = await queueFairnessService.getAllPolicies();
      return reply.send({ policies });
    },
  );

  server.put(
    "/policies/:lane",
    {
      schema: {
        tags: ["Queue Fairness"],
        summary: "Update a lane fairness policy",
        security: [{ ApiKeyAuth: [] }],
        params: { type: "object", required: ["lane"], properties: { lane: { type: "string", enum: ["critical", "high", "medium", "low"] } } },
        body: {
          type: "object",
          properties: {
            weight: { type: "integer", minimum: 1, maximum: 100 },
            minSharePct: { type: "integer", minimum: 0, maximum: 100 },
            enabled: { type: "boolean" },
          },
        },
        response: { 200: { type: "object", properties: { policy: { type: "object" } } }, 400: { type: "object" } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lane } = request.params as { lane: "critical" | "high" | "medium" | "low" };
      const body = request.body as { weight?: number; minSharePct?: number; enabled?: boolean };

      const current = await queueFairnessService.getPolicy(lane);
      const updated = await queueFairnessService.upsertPolicy({
        laneName: lane,
        weight: body.weight ?? current.weight,
        minSharePct: body.minSharePct ?? current.minSharePct,
        enabled: body.enabled ?? current.enabled,
      });
      return reply.send({ policy: updated });
    },
  );

  server.get(
    "/status",
    {
      schema: {
        tags: ["Queue Fairness"],
        summary: "Get current fairness status across all lanes",
        security: [{ ApiKeyAuth: [] }],
        response: { 200: { type: "object", properties: { overall: { type: "string" }, byLane: { type: "array" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const fairness = await queueFairnessService.getOverallFairness();
      return reply.send(fairness);
    },
  );

  server.post(
    "/sample",
    {
      schema: {
        tags: ["Queue Fairness"],
        summary: "Record a manual fairness sample for a lane",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["laneName", "depth", "servedCount"],
          properties: {
            laneName: { type: "string", enum: ["critical", "high", "medium", "low"] },
            depth: { type: "integer", minimum: 0 },
            servedCount: { type: "integer", minimum: 0 },
            servedBytes: { type: "integer", minimum: 0 },
          },
        },
        response: { 200: { type: "object", properties: { assessment: { type: "object" } } }, 400: { type: "object" } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { laneName: string; depth: number; servedCount: number; servedBytes?: number };
      const sample = {
        laneName: body.laneName as "critical" | "high" | "medium" | "low",
        depth: body.depth,
        servedCount: body.servedCount,
        servedBytes: body.servedBytes,
        sampledAt: new Date().toISOString(),
      };
      const assessment = await queueFairnessService.recordSample(sample);
      return reply.send({ assessment });
    },
  );

  server.get(
    "/bullmq-counts",
    {
      schema: {
        tags: ["Queue Fairness"],
        summary: "Get BullMQ job counts per lane",
        security: [{ ApiKeyAuth: [] }],
        response: { 200: { type: "object" } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const counts = await JobQueue.getInstance().getJobCounts();
      return reply.send({ counts });
    },
  );

  server.post(
    "/governor/run",
    {
      schema: {
        tags: ["Queue Fairness"],
        summary: "Manually trigger the fairness governor",
        security: [{ ApiKeyAuth: [] }],
        response: { 200: { type: "object", properties: { ok: { type: "boolean" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await JobQueue.getInstance().runFairnessGovernor();
      return reply.send({ ok: true });
    },
  );
}