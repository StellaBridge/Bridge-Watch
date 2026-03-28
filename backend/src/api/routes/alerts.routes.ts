import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AlertService } from "../../services/alert.service.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  getPaginationParams,
  formatPaginatedResponse,
} from "../../utils/pagination.js";
import {
  CreateAlertRuleSchema,
  UpdateAlertRuleSchema,
  BulkCreateAlertRulesSchema,
  BulkUpdateAlertRulesSchema,
  BulkDeleteAlertRulesSchema,
  AlertHistoryQuerySchema,
  DryRunAlertSchema,
} from "../validations/alert.schema.js";

const ruleIdParam = {
  type: "object",
  required: ["ruleId"],
  properties: { ruleId: { type: "string", format: "uuid" } },
};

const ownerBody = {
  type: "object",
  required: ["ownerAddress"],
  properties: { ownerAddress: { type: "string", description: "Wallet address of the rule owner" } },
};

const alertRuleResponse = {
  type: "object",
  properties: { rule: { $ref: "AlertRule#" } },
};

export async function alertsRoutes(server: FastifyInstance) {
  const alertService = new AlertService();

  server.addHook("preHandler", authMiddleware);

  server.get<{ Querystring: { owner: string } }>(
    "/rules",
    {
      schema: {
        tags: ["Alerts"],
        summary: "List alert rules for an owner",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["owner"],
          properties: { owner: { type: "string", description: "Owner wallet address" } },
        },
        response: {
          200: {
            type: "object",
            properties: { rules: { type: "array", items: { $ref: "AlertRule#" } } },
          },
          400: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { owner } = request.query;
      if (!owner) {
        return reply.status(400).send({ error: "owner query param required" });
      }
      const rules = await alertService.getRulesForOwner(owner);
      return { rules };
    },
  );

  server.post(
    "/rules",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Create an alert rule",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["ownerAddress", "name", "assetCode", "conditions"],
          properties: {
            ownerAddress: { type: "string" },
            name: { type: "string", example: "USDC health drop" },
            assetCode: { type: "string", example: "USDC" },
            conditions: { type: "array", items: { type: "object", additionalProperties: true } },
            conditionOp: { type: "string", enum: ["AND", "OR"], default: "AND" },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"], default: "medium" },
            cooldownSeconds: { type: "integer", default: 300 },
            webhookUrl: { type: "string", format: "uri" },
          },
        },
        response: { 201: alertRuleResponse, 400: { $ref: "Error#" } },
      },
    },
    async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
      const data = CreateAlertRuleSchema.parse(request.body);
      const { ownerAddress } = request.body as any;
      if (!ownerAddress) {
        return reply.status(400).send({ error: "ownerAddress required" });
      }
      const rule = await alertService.createRule(
        ownerAddress, data.name, data.assetCode, data.conditions,
        data.conditionOp, data.priority, data.cooldownSeconds, data.webhookUrl,
      );
      return reply.status(201).send({ rule });
    },
  );

  server.post(
    "/rules/bulk",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Bulk create alert rules",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["ownerAddress", "rules"],
          properties: {
            ownerAddress: { type: "string" },
            rules: { type: "array", items: { type: "object", additionalProperties: true } },
          },
        },
        response: {
          201: {
            type: "object",
            properties: { rules: { type: "array", items: { $ref: "AlertRule#" } } },
          },
          400: { $ref: "Error#" },
        },
      },
    },
    async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
      const { rules } = BulkCreateAlertRulesSchema.parse(request.body);
      const { ownerAddress } = request.body as any;
      if (!ownerAddress) {
        return reply.status(400).send({ error: "ownerAddress required" });
      }
      const createdRules = await alertService.bulkCreateRules(ownerAddress, rules);
      return reply.status(201).send({ rules: createdRules });
    },
  );

  server.get<{ Params: { ruleId: string } }>(
    "/rules/:ruleId",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Get a single alert rule",
        security: [{ ApiKeyAuth: [] }],
        params: ruleIdParam,
        response: { 200: alertRuleResponse, 404: { $ref: "Error#" } },
      },
    },
    async (request, reply) => {
      const rule = await alertService.getRule(request.params.ruleId);
      if (!rule) return reply.status(404).send({ error: "Rule not found" });
      return { rule };
    },
  );

  server.patch(
    "/rules/bulk",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Bulk update alert rules",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["ownerAddress", "updates"],
          properties: {
            ownerAddress: { type: "string" },
            updates: { type: "array", items: { type: "object", additionalProperties: true } },
          },
        },
        response: {
          200: {
            type: "object",
            properties: { rules: { type: "array", items: { $ref: "AlertRule#" } } },
          },
          400: { $ref: "Error#" },
        },
      },
    },
    async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
      const { updates } = BulkUpdateAlertRulesSchema.parse(request.body);
      const { ownerAddress } = request.body as any;
      if (!ownerAddress) {
        return reply.status(400).send({ error: "ownerAddress required" });
      }
      const updatedRules = await alertService.bulkUpdateRules(ownerAddress, updates);
      return { rules: updatedRules };
    },
  );

  server.patch(
    "/rules/:ruleId",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Update an alert rule",
        security: [{ ApiKeyAuth: [] }],
        params: ruleIdParam,
        body: {
          ...ownerBody,
          properties: {
            ...ownerBody.properties,
            name: { type: "string" },
            conditions: { type: "array", items: { type: "object", additionalProperties: true } },
            conditionOp: { type: "string", enum: ["AND", "OR"] },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
            cooldownSeconds: { type: "integer" },
            webhookUrl: { type: "string", format: "uri" },
          },
        },
        response: { 200: alertRuleResponse, 400: { $ref: "Error#" }, 404: { $ref: "Error#" } },
      },
    },
    async (
      request: FastifyRequest<{ Params: { ruleId: string }; Body: any }>,
      reply: FastifyReply,
    ) => {
      const data = UpdateAlertRuleSchema.parse(request.body);
      const { ownerAddress } = request.body as any;
      const { ruleId } = request.params;
      if (!ownerAddress) {
        return reply.status(400).send({ error: "ownerAddress required" });
      }
      const rule = await alertService.updateRule(ruleId, ownerAddress, data);
      if (!rule) return reply.status(404).send({ error: "Rule not found" });
      return { rule };
    },
  );

  server.delete<{ Params: { ruleId: string }; Body: { ownerAddress: string } }>(
    "/rules/:ruleId",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Delete an alert rule",
        security: [{ ApiKeyAuth: [] }],
        params: ruleIdParam,
        body: ownerBody,
        response: { 204: { type: "null" }, 400: { $ref: "Error#" }, 404: { $ref: "Error#" } },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params;
      const { ownerAddress } = request.body as any;
      if (!ownerAddress) {
        return reply.status(400).send({ error: "ownerAddress required" });
      }
      const ok = await alertService.deleteRule(ruleId, ownerAddress);
      if (!ok) return reply.status(404).send({ error: "Rule not found" });
      return reply.status(204).send();
    },
  );

  server.delete(
    "/rules/bulk",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Bulk delete alert rules",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["ownerAddress", "ruleIds"],
          properties: {
            ownerAddress: { type: "string" },
            ruleIds: { type: "array", items: { type: "string", format: "uuid" } },
          },
        },
        response: {
          200: {
            type: "object",
            properties: { deletedCount: { type: "integer" } },
          },
          400: { $ref: "Error#" },
        },
      },
    },
    async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
      const { ruleIds } = BulkDeleteAlertRulesSchema.parse(request.body);
      const { ownerAddress } = request.body as any;
      if (!ownerAddress) {
        return reply.status(400).send({ error: "ownerAddress required" });
      }
      const count = await alertService.bulkDeleteRules(ownerAddress, ruleIds);
      return { deletedCount: count };
    },
  );

  server.patch<{
    Params: { ruleId: string };
    Body: { ownerAddress: string; isActive: boolean };
  }>(
    "/rules/:ruleId/active",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Pause or resume an alert rule",
        security: [{ ApiKeyAuth: [] }],
        params: ruleIdParam,
        body: {
          type: "object",
          required: ["ownerAddress", "isActive"],
          properties: {
            ownerAddress: { type: "string" },
            isActive: { type: "boolean" },
          },
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" } } },
          400: { $ref: "Error#" },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params;
      const { ownerAddress, isActive } = request.body;
      if (!ownerAddress) {
        return reply.status(400).send({ error: "ownerAddress required" });
      }
      const ok = await alertService.setRuleActive(ruleId, ownerAddress, isActive);
      if (!ok) return reply.status(404).send({ error: "Rule not found" });
      return { success: true };
    },
  );

  server.get(
    "/history",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Get paginated alert history",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: { type: "array", items: { type: "object", additionalProperties: true } },
              total: { type: "integer" },
              page: { type: "integer" },
              limit: { type: "integer" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: any }>) => {
      const query = AlertHistoryQuerySchema.parse(request.query);
      const { limit, offset, page } = getPaginationParams(query);
      const events = await alertService.getRecentAlerts(limit);
      const total = events.length;
      return formatPaginatedResponse(events, total, page, limit);
    },
  );

  server.get<{
    Params: { assetCode: string };
    Querystring: { limit?: string };
  }>(
    "/history/:assetCode",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Get alert history for an asset",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["assetCode"],
          properties: { assetCode: { type: "string", example: "USDC" } },
        },
        querystring: {
          type: "object",
          properties: { limit: { type: "string", default: "50" } },
        },
        response: {
          200: {
            type: "object",
            properties: { events: { type: "array", items: { type: "object", additionalProperties: true } } },
          },
        },
      },
    },
    async (request) => {
      const { assetCode } = request.params;
      const limit = parseInt(request.query.limit ?? "50", 10);
      const events = await alertService.getAlertHistory(assetCode, limit);
      return { events };
    },
  );

  server.get<{ Querystring: { owner: string } }>(
    "/stats",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Get alert statistics for an owner",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["owner"],
          properties: { owner: { type: "string" } },
        },
        response: { 200: { type: "object", additionalProperties: true }, 400: { $ref: "Error#" } },
      },
    },
    async (request, reply) => {
      const { owner } = request.query;
      if (!owner) {
        return reply.status(400).send({ error: "owner query param required" });
      }
      const stats = await alertService.getAlertStats(owner);
      return stats;
    },
  );

  server.post(
    "/test",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Dry-run an alert rule against current metrics",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["rule", "metrics"],
          properties: {
            rule: { type: "object", additionalProperties: true },
            metrics: { type: "object", additionalProperties: true },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request: FastifyRequest<{ Body: any }>) => {
      const { rule, metrics } = DryRunAlertSchema.parse(request.body);
      const result = await alertService.dryRunAlert(rule as any, metrics);
      return result;
    },
  );

  server.get<{ Querystring: { limit?: string } }>(
    "/recent",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Get most recent alert events",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          properties: { limit: { type: "string", default: "100" } },
        },
        response: {
          200: {
            type: "object",
            properties: { events: { type: "array", items: { type: "object", additionalProperties: true } } },
          },
        },
      },
    },
    async (request) => {
      const limit = parseInt(request.query.limit ?? "100", 10);
      const events = await alertService.getRecentAlerts(limit);
      return { events };
    },
  );

  server.get<{
    Params: { ruleId: string };
    Querystring: { limit?: string };
  }>(
    "/rules/:ruleId/events",
    {
      schema: {
        tags: ["Alerts"],
        summary: "Get events fired by a specific rule",
        security: [{ ApiKeyAuth: [] }],
        params: ruleIdParam,
        querystring: {
          type: "object",
          properties: { limit: { type: "string", default: "50" } },
        },
        response: {
          200: {
            type: "object",
            properties: { events: { type: "array", items: { type: "object", additionalProperties: true } } },
          },
        },
      },
    },
    async (request) => {
      const { ruleId } = request.params;
      const limit = parseInt(request.query.limit ?? "50", 10);
      const events = await alertService.getAlertsForRule(ruleId, limit);
      return { events };
    },
  );
}
