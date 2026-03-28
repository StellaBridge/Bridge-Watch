import type { FastifyRequest, FastifyReply } from "fastify";
import { ApiKeyService } from "../../services/apiKey.service.js";

interface AuthOptions {
  requiredScopes?: string[];
}

const apiKeyService = new ApiKeyService();

function normalizeApiKeyHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

/**
 * API key authentication middleware.
 * For public endpoints this is optional; for admin endpoints it is required.
 */
export function authMiddleware(options: AuthOptions = {}) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const apiKey = normalizeApiKeyHeader(request.headers["x-api-key"]);

    if (!apiKey) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Missing API key. Provide it via the x-api-key header.",
      });
    }

    try {
      const validated = await apiKeyService.validateKey(
        apiKey,
        options.requiredScopes ?? [],
        request.ip
      );

      if (!validated) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Invalid API key or missing required scope.",
        });
      }

      request.apiKeyAuth = validated;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to validate API key";
      const statusCode = message.includes("rate limit") ? 429 : 403;
      return reply.status(statusCode).send({
        error: statusCode === 429 ? "Too Many Requests" : "Forbidden",
        message,
      });
    }
  };
}
