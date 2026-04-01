import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { webhookService, WebhookEventType, WebhookDeliveryStatus } from "../../services/webhook.service.js";

// =============================================================================
// TYPES
// =============================================================================

interface CreateEndpointBody {
  ownerAddress: string;
  url: string;
  name: string;
  description?: string;
  rateLimitPerMinute?: number;
  customHeaders?: Record<string, string>;
  eventTypes?: WebhookEventType[];
  isBatchDeliveryEnabled?: boolean;
  batchWindowMs?: number;
}

interface UpdateEndpointBody {
  url?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  rateLimitPerMinute?: number;
  customHeaders?: Record<string, string>;
  eventTypes?: WebhookEventType[];
  isBatchDeliveryEnabled?: boolean;
  batchWindowMs?: number;
}

interface EndpointParams {
  id: string;
}

interface DeliveryQuery {
  status?: WebhookDeliveryStatus;
  limit?: number;
}

interface BatchDeliveryBody {
  webhookEndpointId: string;
  eventType: WebhookEventType;
  events: Array<Record<string, any>>;
}

// =============================================================================
// ROUTES
// =============================================================================

export async function webhooksRoutes(server: FastifyInstance) {

  // ---------------------------------------------------------------------------
  // ENDPOINT MANAGEMENT
  // ---------------------------------------------------------------------------

  // Create a new webhook endpoint
  server.post<{ Body: CreateEndpointBody }>(
    "/endpoints",
    async (request: FastifyRequest<{ Body: CreateEndpointBody }>, reply: FastifyReply) => {
      try {
        const endpoint = await webhookService.createEndpoint(request.body);
        return reply.code(201).send(endpoint);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create endpoint";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // List all webhook endpoints (optionally filtered by owner)
  server.get<{ Querystring: { ownerAddress?: string } }>(
    "/endpoints",
    async (request: FastifyRequest<{ Querystring: { ownerAddress?: string } }>, reply: FastifyReply) => {
      try {
        const { ownerAddress } = request.query;
        const endpoints = await webhookService.listEndpoints(ownerAddress);
        return endpoints;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to list endpoints";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get a specific webhook endpoint
  server.get<{ Params: EndpointParams }>(
    "/endpoints/:id",
    async (request: FastifyRequest<{ Params: EndpointParams }>, reply: FastifyReply) => {
      const endpoint = await webhookService.getEndpoint(request.params.id);
      if (!endpoint) {
        return reply.code(404).send({ error: "Webhook endpoint not found" });
      }
      return endpoint;
    }
  );

  // Update a webhook endpoint
  server.patch<{ Params: EndpointParams; Body: UpdateEndpointBody }>(
    "/endpoints/:id",
    async (request: FastifyRequest<{ Params: EndpointParams; Body: UpdateEndpointBody }>, reply: FastifyReply) => {
      try {
        const endpoint = await webhookService.updateEndpoint(request.params.id, request.body);
        if (!endpoint) {
          return reply.code(404).send({ error: "Webhook endpoint not found" });
        }
        return endpoint;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update endpoint";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Delete a webhook endpoint
  server.delete<{ Params: EndpointParams }>(
    "/endpoints/:id",
    async (request: FastifyRequest<{ Params: EndpointParams }>, reply: FastifyReply) => {
      const deleted = await webhookService.deleteEndpoint(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: "Webhook endpoint not found" });
      }
      return reply.code(204).send();
    }
  );

  // ---------------------------------------------------------------------------
  // SECRET ROTATION
  // ---------------------------------------------------------------------------

  // Rotate the secret for a webhook endpoint
  server.post<{ Params: EndpointParams }>(
    "/endpoints/:id/rotate-secret",
    async (request: FastifyRequest<{ Params: EndpointParams }>, reply: FastifyReply) => {
      try {
        const newSecret = await webhookService.rotateSecret(request.params.id);
        return { secret: newSecret, message: "Secret rotated successfully" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to rotate secret";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // DELIVERY MANAGEMENT
  // ---------------------------------------------------------------------------

  // Queue a webhook delivery (for testing or manual triggers)
  server.post<{ Body: { webhookEndpointId: string; eventType: WebhookEventType; payload: Record<string, any> } }>(
    "/deliver",
    async (request: FastifyRequest<{ Body: { webhookEndpointId: string; eventType: WebhookEventType; payload: Record<string, any> } }>, reply: FastifyReply) => {
      try {
        const { webhookEndpointId, eventType, payload } = request.body;
        const delivery = await webhookService.queueDelivery({ webhookEndpointId, eventType, payload });
        return reply.code(202).send(delivery);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to queue delivery";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Queue a batch webhook delivery
  server.post<{ Body: BatchDeliveryBody }>(
    "/deliver/batch",
    async (request: FastifyRequest<{ Body: BatchDeliveryBody }>, reply: FastifyReply) => {
      try {
        const { webhookEndpointId, eventType, events } = request.body;
        const deliveries = await webhookService.queueBatchDelivery({ webhookEndpointId, eventType, events });
        return reply.code(202).send(deliveries);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to queue batch delivery";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get delivery status
  server.get<{ Params: { deliveryId: string } }>(
    "/deliveries/:deliveryId",
    async (request: FastifyRequest<{ Params: { deliveryId: string } }>, reply: FastifyReply) => {
      const delivery = await webhookService.getDelivery(request.params.deliveryId);
      if (!delivery) {
        return reply.code(404).send({ error: "Delivery not found" });
      }
      return delivery;
    }
  );

  // List deliveries for an endpoint
  server.get<{ Params: { endpointId: string }; Querystring: DeliveryQuery }>(
    "/endpoints/:endpointId/deliveries",
    async (request: FastifyRequest<{ Params: { endpointId: string }; Querystring: DeliveryQuery }>, reply: FastifyReply) => {
      try {
        const { status, limit } = request.query;
        const deliveries = await webhookService.listDeliveries(request.params.endpointId, status, limit);
        return deliveries;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to list deliveries";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get delivery logs
  server.get<{ Params: { deliveryId: string }; Querystring: { limit?: number } }>(
    "/deliveries/:deliveryId/logs",
    async (request: FastifyRequest<{ Params: { deliveryId: string }; Querystring: { limit?: number } }>, reply: FastifyReply) => {
      try {
        const logs = await webhookService.getDeliveryLogs(request.params.deliveryId, request.query.limit);
        return logs;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to get delivery logs";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get webhook history
  server.get<{ Params: { endpointId: string }; Querystring: { limit?: number } }>(
    "/endpoints/:endpointId/history",
    async (request: FastifyRequest<{ Params: { endpointId: string }; Querystring: { limit?: number } }>, reply: FastifyReply) => {
      try {
        const history = await webhookService.getWebhookHistory(request.params.endpointId, request.query.limit);
        return history;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to get webhook history";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // TESTING
  // ---------------------------------------------------------------------------

  // Send a test webhook to verify endpoint configuration
  server.post<{ Params: EndpointParams }>(
    "/endpoints/:id/test",
    async (request: FastifyRequest<{ Params: EndpointParams }>, reply: FastifyReply) => {
      try {
        const result = await webhookService.sendTestDelivery(request.params.id);
        if (result.success) {
          return {
            success: true,
            status: result.status,
            durationMs: result.durationMs,
            message: "Test webhook delivered successfully",
          };
        } else {
          return reply.code(502).send({
            success: false,
            durationMs: result.durationMs,
            error: result.error,
            message: "Test webhook delivery failed",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send test webhook";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // SIGNATURE VERIFICATION (utility endpoint for debugging)
  // ---------------------------------------------------------------------------

  // Verify a webhook signature
  server.post<{ Body: { payload: string; signature: string; timestamp: string; secret: string } }>(
    "/verify",
    async (request: FastifyRequest<{ Body: { payload: string; signature: string; timestamp: string; secret: string } }>, reply: FastifyReply) => {
      const { payload, signature, timestamp, secret } = request.body;
      const isValid = webhookService.verifySignature(payload, signature, timestamp, secret);
      return { valid: isValid };
    }
  );
}
