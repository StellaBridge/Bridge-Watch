import { beforeEach, describe, expect, it } from "vitest";
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
    expect(validated).not.toBeNull();
    expect(validated?.name).toBe("Integrator");
  });

  it("rejects validation when a required scope is missing", async () => {
    const created = await service.createKey({
      name: "Read only",
      scopes: ["jobs:read"],
      createdBy: "tester",
    });

    const validated = await service.validateKey(created.apiKey, ["jobs:trigger"]);
    expect(validated).toBeNull();
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
    expect(validated).toBeNull();
  });
});
