import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { eventSourceKeyRoutes } from "../../src/api/routes/eventSourceKeys.routes.js";

const repo = vi.hoisted(() => ({
  findActiveKey: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  rotate: vi.fn(),
  deactivate: vi.fn(),
}));

vi.mock("../../src/services/eventSourceKey.service.js", () => ({
  EventSourceKeyService: vi.fn(() => repo),
}));

const PREFIX = "/api/v1/admin/event-source-keys";

describe("Event source key routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await app.register(eventSourceKeyRoutes, { prefix: PREFIX });
    await app.ready();
  });

  describe("POST /", () => {
    it("generates an ed25519 keypair by default and returns the private key once", async () => {
      repo.findActiveKey.mockResolvedValue(null);
      repo.create.mockImplementation(async (data) => ({
        id: "k-1",
        source_name: data.source_name,
        public_key: data.public_key,
        algorithm: data.algorithm,
      }));

      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        payload: { sourceName: "horizon-feed" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe("k-1");
      expect(body.sourceName).toBe("horizon-feed");
      expect(body.algorithm).toBe("ed25519");
      expect(body.publicKey).toContain("BEGIN PUBLIC KEY");
      expect(body.privateKey).toContain("BEGIN PRIVATE KEY");
    });

    it("generates a secp256k1 keypair when requested", async () => {
      repo.findActiveKey.mockResolvedValue(null);
      repo.create.mockImplementation(async (data) => ({
        id: "k-2",
        source_name: data.source_name,
        public_key: data.public_key,
        algorithm: data.algorithm,
      }));

      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        payload: { sourceName: "eth-feed", algorithm: "secp256k1" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().algorithm).toBe("secp256k1");
      expect(res.json().privateKey).toContain("BEGIN PRIVATE KEY");
    });

    it("uses a provided public key and does not return a private key", async () => {
      repo.findActiveKey.mockResolvedValue(null);
      repo.create.mockImplementation(async (data) => ({
        id: "k-3",
        source_name: data.source_name,
        public_key: data.public_key,
        algorithm: data.algorithm,
      }));

      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        payload: { sourceName: "bring-your-own", publicKey: "PROVIDED-PEM" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().publicKey).toBe("PROVIDED-PEM");
      expect(res.json().privateKey).toBeUndefined();
    });

    it("returns 409 when an active key already exists for the source", async () => {
      repo.findActiveKey.mockResolvedValue({ id: "existing" });

      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        payload: { sourceName: "horizon-feed" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("Conflict");
      expect(repo.create).not.toHaveBeenCalled();
    });

    it("returns 400 for an unsupported algorithm", async () => {
      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        payload: { sourceName: "x", algorithm: "rsa" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when sourceName is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /", () => {
    it("lists keys with camelCase fields and ISO timestamps", async () => {
      const createdAt = new Date("2026-01-01T00:00:00.000Z");
      const rotatedAt = new Date("2026-02-01T00:00:00.000Z");
      repo.list.mockResolvedValue([
        {
          id: "k-1",
          source_name: "horizon-feed",
          public_key: "PEM",
          algorithm: "ed25519",
          is_active: true,
          rotated_at: rotatedAt,
          created_at: createdAt,
        },
        {
          id: "k-0",
          source_name: "old-feed",
          public_key: "PEM0",
          algorithm: "p256",
          is_active: false,
          rotated_at: null,
          created_at: createdAt,
        },
      ]);

      const res = await app.inject({ method: "GET", url: PREFIX });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        keys: [
          {
            id: "k-1",
            sourceName: "horizon-feed",
            publicKey: "PEM",
            algorithm: "ed25519",
            isActive: true,
            rotatedAt: "2026-02-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "k-0",
            sourceName: "old-feed",
            publicKey: "PEM0",
            algorithm: "p256",
            isActive: false,
            rotatedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });
    });
  });

  describe("POST /rotate", () => {
    it("returns 404 when no active key exists for the source", async () => {
      repo.findActiveKey.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/rotate`,
        payload: { sourceName: "ghost" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(repo.rotate).not.toHaveBeenCalled();
    });

    it("rotates to a generated key matching the existing algorithm", async () => {
      repo.findActiveKey.mockResolvedValue({ algorithm: "secp256k1" });
      repo.rotate.mockImplementation(async (name, key, algorithm) => ({
        source_name: name,
        public_key: key,
        algorithm,
      }));

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/rotate`,
        payload: { sourceName: "horizon-feed" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sourceName).toBe("horizon-feed");
      expect(body.algorithm).toBe("secp256k1");
      expect(body.newPublicKey).toContain("BEGIN PUBLIC KEY");
      expect(body.privateKey).toContain("BEGIN PRIVATE KEY");
      expect(repo.rotate).toHaveBeenCalledWith("horizon-feed", body.newPublicKey, "secp256k1");
    });

    it("rotates to a provided key without returning a private key", async () => {
      repo.findActiveKey.mockResolvedValue({ algorithm: "ed25519" });
      repo.rotate.mockImplementation(async (name, key, algorithm) => ({
        source_name: name,
        public_key: key,
        algorithm,
      }));

      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/rotate`,
        payload: { sourceName: "horizon-feed", publicKey: "NEW-PEM" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().newPublicKey).toBe("NEW-PEM");
      expect(res.json().privateKey).toBeUndefined();
    });
  });

  describe("DELETE /:sourceName", () => {
    it("deactivates an active key and returns 204", async () => {
      repo.findActiveKey.mockResolvedValue({ id: "k-1" });
      repo.deactivate.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "DELETE",
        url: `${PREFIX}/horizon-feed`,
      });

      expect(res.statusCode).toBe(204);
      expect(repo.deactivate).toHaveBeenCalledWith("horizon-feed");
    });

    it("returns 404 when no active key exists", async () => {
      repo.findActiveKey.mockResolvedValue(null);

      const res = await app.inject({
        method: "DELETE",
        url: `${PREFIX}/ghost`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Not Found");
      expect(repo.deactivate).not.toHaveBeenCalled();
    });
  });
});
