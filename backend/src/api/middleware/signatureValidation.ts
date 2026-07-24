/**
 * Middleware for validating signed event federation payloads.
 *
 * Validates the x-event-signature header against the registered public key
 * for the claimed source.  Also enforces timestamp freshness to prevent
 * replay attacks.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { EventSourceKeyService } from "../../services/eventSourceKey.service.js";
import {
  validateSignedPayload,
  type SignedPayload,
} from "../../services/signatureValidation.service.js";
import { getDatabase } from "../../database/connection.js";

const sourceKeyService = new EventSourceKeyService();

interface SignatureValidationOptions {
  /** Maximum age of a signature in milliseconds (default 5 minutes). */
  maxAgeMs?: number;
}

function parseSignatureHeader(header: string | string[] | undefined): SignedPayload | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || typeof raw !== "string") return null;

  try {
    const parts = raw.split(",");
    if (parts.length < 4) return null;

    const sourceName = parts[0].split("=")[1]?.trim();
    const signature = parts[1].split("=")[1]?.trim();
    const signedAt = parts[2].split("=")[1]?.trim();
    const payload = parts.slice(3).join(",").split("=").slice(1).join("=").trim();

    if (!sourceName || !signature || !signedAt || !payload) return null;

    return { sourceName, signature, signedAt, payload };
  } catch {
    return null;
  }
}

async function logAuditEvent(
  sourceName: string,
  eventId: string,
  status: "accepted" | "rejected_signature" | "rejected_timestamp" | "rejected_unknown_source",
  errorMessage: string | null,
  timestampAgeMs: number | null,
): Promise<void> {
  try {
    const db = getDatabase();
    await db("event_federation_audit").insert({
      source_name: sourceName,
      event_id: eventId,
      status,
      error_message: errorMessage,
      timestamp_age_ms: timestampAgeMs,
      created_at: new Date(),
    });
  } catch {
    // Audit logging should not block request processing
  }
}

export function signatureValidationMiddleware(options: SignatureValidationOptions = {}) {
  return async function validateSignature(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const sigHeader = request.headers["x-event-signature"];
    const signedPayload = parseSignatureHeader(sigHeader);

    if (!signedPayload) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Missing or malformed x-event-signature header. Expected format: source=<name>,sig=<hex>,ts=<ISO-8601>,payload=<base64>",
      });
    }

    const sourceKey = await sourceKeyService.findActiveKey(signedPayload.sourceName);

    if (!sourceKey) {
      await logAuditEvent(
        signedPayload.sourceName,
        "unknown",
        "rejected_unknown_source",
        `No active key found for source: ${signedPayload.sourceName}`,
        null,
      );
      return reply.status(403).send({
        error: "Forbidden",
        message: `Unknown or inactive event source: ${signedPayload.sourceName}`,
      });
    }

    const result = validateSignedPayload(
      signedPayload,
      sourceKey.public_key,
      sourceKey.algorithm,
    );

    if (!result.valid) {
      const status = result.ageMs !== undefined && result.ageMs > (options.maxAgeMs ?? 300_000)
        ? "rejected_timestamp"
        : "rejected_signature";

      await logAuditEvent(
        signedPayload.sourceName,
        "unknown",
        status,
        result.error ?? "Signature validation failed",
        result.ageMs ?? null,
      );

      return reply.status(401).send({
        error: "Unauthorized",
        message: result.error ?? "Signature validation failed",
      });
    }

    await logAuditEvent(
      signedPayload.sourceName,
      "unknown",
      "accepted",
      null,
      result.ageMs ?? null,
    );

    (request as any).eventSourceName = signedPayload.sourceName;
    (request as any).signatureAgeMs = result.ageMs;
  };
}
