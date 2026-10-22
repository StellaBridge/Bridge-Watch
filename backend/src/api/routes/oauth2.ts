import type { FastifyInstance } from "fastify";
import { ApiKeyService } from "../../services/apiKey.service.js";
import { OAuth2Service } from "../../services/oauth2.service.js";
import { logger } from "../../utils/logger.js";

interface TokenRequestBody {
  grant_type: string;
  client_id: string;
  client_secret: string;
  scope?: string;
  refresh_token?: string;
}

interface RefreshTokenRequestBody {
  grant_type: string;
  refresh_token: string;
  client_id?: string;
  client_secret?: string;
}

interface RevokeTokenRequestBody {
  token: string;
  token_type_hint?: "access_token" | "refresh_token";
  client_id?: string;
  client_secret?: string;
}

function isValidClientId(clientId: string): boolean {
  if (clientId.length !== 35) return false;
  if (!clientId.startsWith("bw_")) return false;
  const hex = clientId.substring(3);
  return hex.length === 32 && /^[a-f0-9]+$/.test(hex);
}

function isValidClientSecret(clientSecret: string): boolean {
  if (clientSecret.length !== 68) return false;
  if (!clientSecret.startsWith("bws_")) return false;
  const hex = clientSecret.substring(4);
  return hex.length === 64 && /^[a-f0-9]+$/.test(hex);
}

export async function oauth2Routes(server: FastifyInstance) {
  const apiKeyService = new ApiKeyService();
  const oauth2Service = new OAuth2Service();

  // POST /oauth2/token - Issue access token (client_credentials) or refresh access token (refresh_token)
  server.post<{ Body: TokenRequestBody }>(
    "/token",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
      schema: {
        description: "OAuth2 Client Credentials Flow - Issue access token or refresh access token",
        tags: ["OAuth2"],
        body: {
          type: "object",
          required: ["grant_type", "client_id", "client_secret"],
          properties: {
            grant_type: {
              type: "string",
              enum: ["client_credentials", "refresh_token"],
              description: "Must be 'client_credentials' or 'refresh_token'",
              maxLength: 50,
            },
            client_id: {
              type: "string",
              description: "OAuth2 client identifier",
              maxLength: 100,
            },
            client_secret: {
              type: "string",
              description: "OAuth2 client secret",
              maxLength: 200,
            },
            scope: {
              type: "string",
              description: "Space-separated list of requested scopes (optional)",
              maxLength: 500,
            },
            refresh_token: {
              type: "string",
              description: "Refresh token (required for refresh_token grant)",
              maxLength: 500,
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              access_token: { type: "string" },
              refresh_token: { type: "string" },
              token_type: { type: "string" },
              expires_in: { type: "number" },
              refresh_expires_in: { type: "number" },
              scope: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              error_description: { type: "string" },
            },
          },
          401: {
            type: "object",
            properties: {
              error: { type: "string" },
              error_description: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { grant_type, client_id, client_secret, scope, refresh_token } = request.body;

      if (grant_type === "refresh_token") {
        // Handle refresh token grant
        if (!refresh_token) {
          return reply.code(400).send({
            error: "invalid_request",
            error_description: "Missing refresh_token",
          });
        }

        try {
          const tokenPair = await oauth2Service.refreshAccessToken(refresh_token);
          if (!tokenPair) {
            return reply.code(401).send({
              error: "invalid_grant",
              error_description: "Invalid or revoked refresh token",
            });
          }

          logger.info(
            { event: "oauth2_token_refreshed" },
            "OAuth2 access token refreshed"
          );

          return reply.code(200).send({
            access_token: tokenPair.accessToken,
            refresh_token: tokenPair.refreshToken,
            token_type: tokenPair.tokenType,
            expires_in: tokenPair.expiresIn,
            refresh_expires_in: tokenPair.refreshExpiresIn,
            scope: "granted",
          });
        } catch (error) {
          logger.error(
            { error: error instanceof Error ? error.message : String(error), event: "oauth2_refresh_error" },
            "OAuth2 token refresh failed"
          );
          return reply.code(500).send({
            error: "server_error",
            error_description: "Failed to refresh access token",
          });
        }
      }

      if (grant_type !== "client_credentials") {
        return reply.code(400).send({
          error: "unsupported_grant_type",
          error_description: "Supported grant types: 'client_credentials', 'refresh_token'",
        });
      }

      if (!client_id || !client_secret) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: "Missing client_id or client_secret",
        });
      }

      if (!isValidClientId(client_id)) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: "Invalid client_id format",
        });
      }

      if (!isValidClientSecret(client_secret)) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: "Invalid client_secret format",
        });
      }

      try {
        const apiKey = await apiKeyService.validateOAuth2ClientCredentials(
          client_id,
          client_secret
        );

        if (!apiKey) {
          logger.warn(
            { event: "oauth2_invalid_credentials" },
            "OAuth2 token request failed: invalid credentials"
          );
          return reply.code(401).send({
            error: "invalid_client",
            error_description: "Invalid client credentials",
          });
        }

        const requestedScopes = scope
          ? scope
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 20)
          : [];

        const grantedScopes = requestedScopes.length > 0
          ? apiKey.scopes.filter((s) => requestedScopes.includes(s) || apiKey.scopes.includes("*"))
          : apiKey.scopes;

        if (requestedScopes.length > 0 && grantedScopes.length === 0) {
          return reply.code(400).send({
            error: "invalid_scope",
            error_description: "Requested scopes are not authorized for this client",
          });
        }

        // Issue token pair with refresh token
        const tokenPair = await oauth2Service.issueTokenPair(
          client_id,
          apiKey.id,
          grantedScopes
        );

        logger.info(
          { event: "oauth2_token_issued" },
          "OAuth2 token pair issued"
        );

        return reply.code(200).send({
          access_token: tokenPair.accessToken,
          refresh_token: tokenPair.refreshToken,
          token_type: tokenPair.tokenType,
          expires_in: tokenPair.expiresIn,
          refresh_expires_in: tokenPair.refreshExpiresIn,
          scope: grantedScopes.join(" "),
        });
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error), event: "oauth2_token_error" },
          "OAuth2 token issuance failed"
        );
        return reply.code(500).send({
          error: "server_error",
          error_description: "Failed to issue access token",
        });
      }
    }
  );

  // POST /oauth2/revoke - Revoke a token (RFC 7009)
  server.post<{ Body: RevokeTokenRequestBody }>(
    "/revoke",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute",
        },
      },
      schema: {
        description: "OAuth2 Token Revocation (RFC 7009)",
        tags: ["OAuth2"],
        body: {
          type: "object",
          required: ["token"],
          properties: {
            token: {
              type: "string",
              description: "The token to revoke (access or refresh token)",
              maxLength: 500,
            },
            token_type_hint: {
              type: "string",
              enum: ["access_token", "refresh_token"],
              description: "Hint about the type of token to revoke",
            },
            client_id: {
              type: "string",
              description: "Client identifier (optional if authenticated via other means)",
              maxLength: 100,
            },
            client_secret: {
              type: "string",
              description: "Client secret (optional if authenticated via other means)",
              maxLength: 200,
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {},
          },
        },
      },
    },
    async (request, reply) => {
      const { token, token_type_hint, client_id, client_secret } = request.body;

      if (!token) {
        // Per RFC 7009, the endpoint should return 200 even if token is invalid
        return reply.code(200).send({});
      }

      try {
        // If client credentials provided, validate them
        if (client_id && client_secret) {
          if (!isValidClientId(client_id) || !isValidClientSecret(client_secret)) {
            return reply.code(401).send({ error: "invalid_client" });
          }
          const apiKey = await apiKeyService.validateOAuth2ClientCredentials(client_id, client_secret);
          if (!apiKey) {
            return reply.code(401).send({ error: "invalid_client" });
          }
        }

        if (token_type_hint === "refresh_token" || (!token_type_hint && token.length > 200)) {
          // Likely a refresh token - revoke it
          await oauth2Service.revokeRefreshToken(token);
        } else {
          // For access tokens, we'd need a blacklist mechanism
          // This is a simplified implementation - in production you'd add to a revoked access token list
          logger.info({ event: "oauth2_token_revoked", tokenType: token_type_hint || "access_token" }, "Token revoked");
        }

        return reply.code(200).send({});
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error), event: "oauth2_revoke_error" },
          "OAuth2 token revocation failed"
        );
        // Per RFC 7009, return 200 even on error
        return reply.code(200).send({});
      }
    }
  );
}