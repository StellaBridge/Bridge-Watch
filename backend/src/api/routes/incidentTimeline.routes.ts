import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { incidentTimelineService } from "../../services/incidentTimeline.service.js";
import { authMiddleware } from "../middleware/auth.js";

const eventSchema = z.object({
  type: z.string().min(1, "Event type is required"),
  deploymentId: z.string().uuid("deploymentId must be a valid UUID").optional().nullable(),
  actor: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
  occurredAt: z.string().optional().nullable(),
});

export async function incidentTimelineRoutes(server: FastifyInstance) {
  // GET timeline for an incident
  server.get<{ Params: { id: string } }>(
    "/:id/timeline",
    {
      schema: {
        tags: ["Incidents"],
        summary: "Get timeline for an incident",
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        response: {
          200: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
    },
    async (request, reply) => {
      try {
        const events = await incidentTimelineService.getTimeline(request.params.id);
        return reply.status(200).send(events);
      } catch (error: any) {
        server.log.error(error, "Failed to get incident timeline");
        return reply.status(500).send({ error: "Failed to retrieve incident timeline" });
      }
    }
  );

  // POST add timeline event (Protected: Admin or Operator)
  server.post<{ Params: { id: string }; Body: z.infer<typeof eventSchema> }>(
    "/:id/timeline",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin", "operator"] }),
      schema: {
        tags: ["Incidents"],
        summary: "Add an event to an incident timeline",
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        body: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string" },
            deploymentId: { type: "string", format: "uuid" },
            actor: { type: "string" },
            metadata: { type: "object", additionalProperties: true },
            occurredAt: { type: "string" },
          },
        },
        response: { 201: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      const parsed = eventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid event payload",
          details: parsed.error.format(),
        });
      }

      try {
        const event = await incidentTimelineService.addEvent(request.params.id, parsed.data);
        return reply.status(201).send(event);
      } catch (error: any) {
        server.log.error(error, "Failed to add incident timeline event");
        const status = error.message?.includes("Deployment with ID") ? 404 : 400;
        return reply.status(status).send({ error: error.message || "Failed to add timeline event" });
      }
    }
  );

  // GET timeline events for a contract deployment
  server.get<{ Params: { deploymentId: string } }>(
    "/deployments/:deploymentId/timeline",
    {
      schema: {
        tags: ["Incidents"],
        summary: "Get incident timeline events for a contract deployment",
        params: {
          type: "object",
          properties: { deploymentId: { type: "string", format: "uuid" } },
          required: ["deploymentId"],
        },
        response: {
          200: { type: "array", items: { type: "object", additionalProperties: true } },
        },
      },
    },
    async (request, reply) => {
      try {
        const events = await incidentTimelineService.getEventsByDeployment(
          request.params.deploymentId
        );
        return reply.status(200).send(events);
      } catch (error: any) {
        server.log.error(error, "Failed to get deployment incident timeline");
        return reply.status(500).send({ error: "Failed to retrieve deployment incident timeline" });
      }
    }
  );

  // DELETE a timeline event (Protected: Admin or Operator)
  server.delete<{ Params: { eventId: string } }>(
    "/events/:eventId",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin", "operator"] }),
      schema: {
        tags: ["Incidents"],
        summary: "Delete an incident timeline event",
        params: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"] },
        response: { 200: { type: "object", properties: { success: { type: "boolean" } } } },
      },
    },
    async (request, reply) => {
      try {
        const success = await incidentTimelineService.deleteEvent(request.params.eventId);
        if (!success) {
          return reply.status(404).send({ error: "Timeline event not found" });
        }
        return reply.status(200).send({ success: true });
      } catch (error: any) {
        server.log.error(error, "Failed to delete timeline event");
        return reply.status(500).send({ error: "Failed to delete timeline event" });
      }
    }
  );
}
