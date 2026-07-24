/**
 * Event Federation HTTP routes.
 *
 * GET /api/v1/event-federation/health
 *   Returns a full FederationHealth snapshot.
 *
 * GET /api/v1/event-federation/replay
 *   Query-string: chain?, since?, fromBlock?, limit?
 *   Returns up to `limit` buffered FederatedEvents matching the filters.
 *
 * GET /api/v1/event-federation/sources
 *   Returns per-source liveness data.
 *
 * POST /api/v1/event-federation/events
 *   Submit a signed federated event from a registered source.
 *   Requires x-event-signature header with cryptographic proof.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getEventFederationService } from "../../services/eventFederation/index.js";
import { signatureValidationMiddleware } from "../middleware/signatureValidation.js";
import {
  validateSignedPayload,
  type SignedPayload,
} from "../../services/signatureValidation.service.js";
import { EventSourceKeyService } from "../../services/eventSourceKey.service.js";
import { getDatabase } from "../../database/connection.js";

const sourceKeyService = new EventSourceKeyService();

export async function eventFederationRoutes(server: FastifyInstance) {
  // ─── Health ────────────────────────────────────────────────────────────────

  server.get(
    "/health",
    {
      schema: {
        tags: ["Event Federation"],
        summary: "Federation health snapshot",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["healthy", "degraded", "offline"] },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    chain: { type: "string" },
                    status: { type: "string" },
                    lastEventAt: { type: ["string", "null"] },
                    gapMs: { type: ["number", "null"] },
                    eventsReceived: { type: "number" },
                    errorsCount: { type: "number" },
                    reconnectCount: { type: "number" },
                  },
                },
              },
              totalEventsProcessed: { type: "number" },
              dedupRejectedCount: { type: "number" },
              replayBufferSize: { type: "number" },
              uptimeMs: { type: "number" },
              checkedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      return getEventFederationService().health();
    },
  );

  // ─── Sources ───────────────────────────────────────────────────────────────

  server.get(
    "/sources",
    {
      schema: {
        tags: ["Event Federation"],
        summary: "Per-source liveness",
        response: {
          200: {
            type: "object",
            properties: {
              sources: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              checkedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      const health = getEventFederationService().health();
      return { sources: health.sources, checkedAt: health.checkedAt };
    },
  );

  // ─── Replay ────────────────────────────────────────────────────────────────

  server.get(
    "/replay",
    {
      schema: {
        tags: ["Event Federation"],
        summary: "Catch-up replay of recent federated events",
        querystring: {
          type: "object",
          properties: {
            chain: { type: "string" },
            since: { type: "string", format: "date-time" },
            fromBlock: { type: "number" },
            limit: { type: "number", minimum: 1, maximum: 1000, default: 200 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              events: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
              count: { type: "number" },
              cursor: { type: ["string", "null"] },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          chain?: string;
          since?: string;
          fromBlock?: number;
          limit?: number;
        };
      }>,
      _reply: FastifyReply,
    ) => {
      const { chain, since, fromBlock, limit = 200 } = request.query;
      const events = getEventFederationService().replay({
        chain,
        since,
        fromBlock,
        limit,
      });

      const cursor =
        events.length > 0 ? events[events.length - 1].sourceId : null;

      return {
        events,
        count: events.length,
        cursor,
        timestamp: new Date().toISOString(),
      };
    },
  );

  // ─── Submit signed event ───────────────────────────────────────────────────

  server.post(
    "/events",
    {
      preHandler: [signatureValidationMiddleware()],
      schema: {
        tags: ["Event Federation"],
        summary: "Submit a signed federated event from a registered source",
        security: [{ xEventSignature: [] }],
        body: {
          type: "object",
          required: ["event", "payload", "signature", "signedAt", "sourceName"],
          properties: {
            event: {
              type: "object",
              required: ["id", "chain", "type", "blockNumber", "timestamp", "sourceId"],
              properties: {
                id: { type: "string" },
                chain: { type: "string" },
                type: { type: "string" },
                blockNumber: { type: "number" },
                timestamp: { type: "string", format: "date-time" },
                from: { type: "string" },
                to: { type: "string" },
                assetCode: { type: "string" },
                amount: { type: "string" },
                sourceId: { type: "string" },
                raw: { type: "object" },
              },
            },
            payload: { type: "string" },
            signature: { type: "string" },
            signedAt: { type: "string", format: "date-time" },
            sourceName: { type: "string" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              accepted: { type: "boolean" },
              eventId: { type: "string" },
              reason: { type: "string" },
              timestampAgeMs: { type: "number" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          401: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
          403: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          event: {
            id: string;
            chain: string;
            type: string;
            blockNumber: number;
            timestamp: string;
            from?: string;
            to?: string;
            assetCode?: string;
            amount?: string;
            sourceId: string;
            raw?: Record<string, unknown>;
          };
          payload: string;
          signature: string;
          signedAt: string;
          sourceName: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { event, payload, signature, signedAt, sourceName } = request.body;

      const sourceKey = await sourceKeyService.findActiveKey(sourceName);
      if (!sourceKey) {
        return reply.status(403).send({
          error: "Forbidden",
          message: `Unknown or inactive event source: ${sourceName}`,
        });
      }

      const signedPayload: SignedPayload = {
        payload,
        signature,
        signedAt,
        sourceName,
      };

      const validation = validateSignedPayload(
        signedPayload,
        sourceKey.public_key,
        sourceKey.algorithm,
      );

      if (!validation.valid) {
        const db = getDatabase();
        await db("event_federation_audit").insert({
          source_name: sourceName,
          event_id: event.id,
          status: validation.error?.includes("expired") || validation.error?.includes("future")
            ? "rejected_timestamp"
            : "rejected_signature",
          error_message: validation.error,
          timestamp_age_ms: validation.ageMs ?? null,
          created_at: new Date(),
        });

        return reply.status(401).send({
          error: "Unauthorized",
          message: validation.error ?? "Signature validation failed",
        });
      }

      let parsedPayload: Record<string, unknown>;
      try {
        parsedPayload = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Invalid payload JSON",
        });
      }

      const eventId = `${event.chain}:${event.type}:${event.sourceId}`;

      const db = getDatabase();
      await db("event_federation_audit").insert({
        source_name: sourceName,
        event_id: eventId,
        status: "accepted",
        error_message: null,
        timestamp_age_ms: validation.ageMs ?? null,
        created_at: new Date(),
      });

      const federatedEvent = {
        id: eventId,
        chain: event.chain,
        type: event.type as any,
        blockNumber: event.blockNumber,
        timestamp: event.timestamp,
        from: event.from,
        to: event.to,
        assetCode: event.assetCode,
        amount: event.amount,
        sourceId: event.sourceId,
        raw: parsedPayload as Record<string, unknown>,
      };

      const service = getEventFederationService();
      (service as any)._ingest(federatedEvent);

      return reply.status(201).send({
        accepted: true,
        eventId,
        timestampAgeMs: validation.ageMs,
      });
    },
  );
}
