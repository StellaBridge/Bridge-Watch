import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiKeyService } from "../../src/services/apiKey.service.js";

describe("ApiKeyService", () => {
  let service: ApiKeyService;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
    service = new ApiKeyService();
  });

  it("creates and validates an API key", async () => {
    const created = await service.createKey({
      name: "Integrator",
      scopes: ["jobs:read"],
      createdBy: "tester",
    });

    expect(created.apiKey.startsWith("bwk_live_")).toBe(true);

    const validated = await service.validateKey(created.apiKey, ["jobs:read"], "127.0.0.1");
    expect(validated.ok).toBe(true);
    expect(validated.ok && validated.result.name).toBe("Integrator");
  });

  it("distinguishes an insufficient scope from an invalid key", async () => {
    const created = await service.createKey({
      name: "Read only",
      scopes: ["jobs:read"],
      createdBy: "tester",
    });

    const wrongScope = await service.validateKey(created.apiKey, ["jobs:trigger"]);
    expect(wrongScope).toEqual({ ok: false, reason: "insufficient_scope" });

    const wrongKey = await service.validateKey("bwk_live_does-not-exist", ["jobs:read"]);
    expect(wrongKey).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("rotates and revokes keys", async () => {
    const created = await service.createKey({
      name: "Rotate me",
      scopes: ["admin:api-keys"],
      createdBy: "tester",
    });

    const rotated = await service.rotateKey(created.key.id, "tester");
    expect(rotated.apiKey).not.toBe(created.apiKey);

    const revoked = await service.revokeKey(created.key.id, "tester");
    expect(revoked.revokedAt).not.toBeNull();

    const validated = await service.validateKey(rotated.apiKey, ["admin:api-keys"]);
    expect(validated).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("lists all keys", async () => {
    await service.createKey({ name: "Key 1", scopes: ["jobs:read"], createdBy: "tester" });
    await service.createKey({ name: "Key 2", scopes: ["jobs:write"], createdBy: "tester" });

    const keys = await service.listKeys();
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys.some((k) => k.name === "Key 1")).toBe(true);
    expect(keys.some((k) => k.name === "Key 2")).toBe(true);
  });

  it("extends key expiration", async () => {
    const created = await service.createKey({
      name: "Expiring key",
      scopes: ["jobs:read"],
      createdBy: "tester",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const newExpiry = new Date(Date.now() + 172800000).toISOString();
    const extended = await service.extendKeyExpiration(created.key.id, newExpiry, "tester");
    expect(extended.expiresAt).toBe(newExpiry);
  });

  it("rejects validation of expired keys", async () => {
    const created = await service.createKey({
      name: "Expired key",
      scopes: ["jobs:read"],
      createdBy: "tester",
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });

    const validated = await service.validateKey(created.apiKey, ["jobs:read"]);
    expect(validated).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("rejects validation of revoked keys", async () => {
    const created = await service.createKey({
      name: "Revoked key",
      scopes: ["jobs:read"],
      createdBy: "tester",
    });

    await service.revokeKey(created.key.id, "tester");
    const validated = await service.validateKey(created.apiKey, ["jobs:read"]);
    expect(validated).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("normalizes scopes to lowercase", async () => {
    const created = await service.createKey({
      name: "Scopes test",
      scopes: ["Jobs:Read", "JOBS:WRITE"],
      createdBy: "tester",
    });

    expect(created.key.scopes).toEqual(["jobs:read", "jobs:write"]);
  });

  it("sets default rate limit when not specified", async () => {
    const created = await service.createKey({
      name: "Rate limit test",
      scopes: ["jobs:read"],
      createdBy: "tester",
    });

    expect(created.key.rateLimitPerMinute).toBeGreaterThan(0);
  });

  it("validates bootstrap token as admin key", async () => {
    const validated = await service.validateKey("bootstrap-secret", ["admin:api-keys"]);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.result.source).toBe("bootstrap");
    }
  });

  it("tracks usage count on validation", async () => {
    const created = await service.createKey({
      name: "Usage test",
      scopes: ["jobs:read"],
      createdBy: "tester",
    });

    await service.validateKey(created.apiKey, ["jobs:read"], "192.168.1.1");
    await service.validateKey(created.apiKey, ["jobs:read"], "192.168.1.2");

    const keys = await service.listKeys();
    const key = keys.find((k) => k.id === created.key.id);
    expect(key?.usageCount).toBeGreaterThanOrEqual(2);
    expect(key?.lastUsedIp).toBeTruthy();
  });

  it("creates OAuth-enabled key with client credentials", async () => {
    const created = await service.createKey({
      name: "OAuth key",
      scopes: ["jobs:read"],
      createdBy: "tester",
      enableOAuth: true,
    });

    expect(created.clientId).toBeTruthy();
    expect(created.clientSecret).toBeTruthy();
    expect(created.key.oauthEnabled).toBe(true);
  });
});
