/**
 * Admin routes for managing event federation source keys.
 *
 * POST   /api/v1/admin/event-source-keys          — Register a new source key
 * GET    /api/v1/admin/event-source-keys          — List all source keys
 * POST   /api/v1/admin/event-source-keys/rotate   — Rotate a source's key
 * DELETE /api/v1/admin/event-source-keys/:sourceName — Deactivate a source key
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { EventSourceKeyService } from "../../services/eventSourceKey.service.js";
import { generateKeyPairSync } from "crypto";

const sourceKeyService = new EventSourceKeyService();

function generateEd25519KeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

function generateEcdsaKeyPair(curve: "prime256v1" | "secp256k1"): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: curve,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export async function eventSourceKeyRoutes(server: FastifyInstance) {
  server.post(
    "/",
    {
      schema: {
        tags: ["Event Source Keys"],
        summary: "Register a new event source with auto-generated keypair",
        body: {
          type: "object",
          required: ["sourceName"],
          properties: {
            sourceName: { type: "string", minLength: 1 },
            algorithm: { type: "string", enum: ["ed25519", "secp256k1", "p256"], default: "ed25519" },
            publicKey: { type: "string", description: "Override auto-generated key with provided PEM public key" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string" },
              sourceName: { type: "string" },
              publicKey: { type: "string" },
              algorithm: { type: "string" },
              privateKey: { type: "string", description: "Return once on creation — store securely" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { sourceName: string; algorithm?: string; publicKey?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sourceName, algorithm = "ed25519", publicKey: providedKey } = request.body;

      const existing = await sourceKeyService.findActiveKey(sourceName);
      if (existing) {
        return reply.status(409).send({
          error: "Conflict",
          message: `Active key already exists for source: ${sourceName}`,
        });
      }

      let publicKey = providedKey;
      let privateKey: string | undefined;

      if (!publicKey) {
        if (algorithm === "secp256k1") {
          const kp = generateEcdsaKeyPair("secp256k1");
          publicKey = kp.publicKey;
          privateKey = kp.privateKey;
        } else if (algorithm === "p256") {
          const kp = generateEcdsaKeyPair("prime256v1");
          publicKey = kp.publicKey;
          privateKey = kp.privateKey;
        } else {
          const kp = generateEd25519KeyPair();
          publicKey = kp.publicKey;
          privateKey = kp.privateKey;
        }
      }

      const record = await sourceKeyService.create({
        source_name: sourceName,
        public_key: publicKey,
        algorithm: algorithm as any,
        is_active: true,
        rotated_at: null,
      });

      return reply.status(201).send({
        id: record.id,
        sourceName: record.source_name,
        publicKey: record.public_key,
        algorithm: record.algorithm,
        ...(privateKey ? { privateKey } : {}),
      });
    },
  );

  server.get(
    "/",
    {
      schema: {
        tags: ["Event Source Keys"],
        summary: "List all event source keys",
        response: {
          200: {
            type: "object",
            properties: {
              keys: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    sourceName: { type: "string" },
                    publicKey: { type: "string" },
                    algorithm: { type: "string" },
                    isActive: { type: "boolean" },
                    rotatedAt: { type: ["string", "null"] },
                    createdAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      const keys = await sourceKeyService.list();
      return {
        keys: keys.map((k) => ({
          id: k.id,
          sourceName: k.source_name,
          publicKey: k.public_key,
          algorithm: k.algorithm,
          isActive: k.is_active,
          rotatedAt: k.rotated_at?.toISOString() ?? null,
          createdAt: k.created_at.toISOString(),
        })),
      };
    },
  );

  server.post(
    "/rotate",
    {
      schema: {
        tags: ["Event Source Keys"],
        summary: "Rotate a source's signing key",
        body: {
          type: "object",
          required: ["sourceName"],
          properties: {
            sourceName: { type: "string" },
            publicKey: { type: "string", description: "New PEM public key (auto-generated if omitted)" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              sourceName: { type: "string" },
              newPublicKey: { type: "string" },
              algorithm: { type: "string" },
              privateKey: { type: "string", description: "Return once — store securely" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { sourceName: string; publicKey?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { sourceName, publicKey: providedKey } = request.body;

      const existing = await sourceKeyService.findActiveKey(sourceName);
      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: `No active key found for source: ${sourceName}`,
        });
      }

      let publicKey = providedKey;
      let privateKey: string | undefined;

      if (!publicKey) {
        if (existing.algorithm === "secp256k1") {
          const kp = generateEcdsaKeyPair("secp256k1");
          publicKey = kp.publicKey;
          privateKey = kp.privateKey;
        } else if (existing.algorithm === "p256") {
          const kp = generateEcdsaKeyPair("prime256v1");
          publicKey = kp.publicKey;
          privateKey = kp.privateKey;
        } else {
          const kp = generateEd25519KeyPair();
          publicKey = kp.publicKey;
          privateKey = kp.privateKey;
        }
      }

      const rotated = await sourceKeyService.rotate(sourceName, publicKey, existing.algorithm);

      return {
        sourceName: rotated.source_name,
        newPublicKey: rotated.public_key,
        algorithm: rotated.algorithm,
        ...(privateKey ? { privateKey } : {}),
      };
    },
  );

  server.delete(
    "/:sourceName",
    {
      schema: {
        tags: ["Event Source Keys"],
        summary: "Deactivate an event source key",
        params: {
          type: "object",
          required: ["sourceName"],
          properties: {
            sourceName: { type: "string" },
          },
        },
        response: {
          204: { type: "null" },
          404: {
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
      request: FastifyRequest<{ Params: { sourceName: string } }>,
      reply: FastifyReply,
    ) => {
      const { sourceName } = request.params;

      const existing = await sourceKeyService.findActiveKey(sourceName);
      if (!existing) {
        return reply.status(404).send({
          error: "Not Found",
          message: `No active key found for source: ${sourceName}`,
        });
      }

      await sourceKeyService.deactivate(sourceName);
      return reply.status(204).send();
    },
  );
}
