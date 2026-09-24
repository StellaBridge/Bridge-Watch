import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
});

const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

vi.mock("../../src/services/contractInstanceDiscovery.service.js", () => {
  const contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  const ContractDiscoveryValidationError = class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ContractDiscoveryValidationError";
    }
  };
  const ContractDiscoveryUpstreamError = class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ContractDiscoveryUpstreamError";
    }
  };
  return {
    ContractDiscoveryValidationError,
    ContractDiscoveryUpstreamError,
    contractInstanceDiscoveryService: {
      discover: vi.fn().mockImplementation(async (req: { contractIds: string[] }) => ({
        discovered: 1,
        instances: req.contractIds.map((contractId: string) => ({
          contractId,
          exists: true,
          lastModifiedLedgerSeq: 999,
        })),
      })),
      listKnownContractIds: vi.fn().mockResolvedValue([contractId]),
    },
  };
});

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: "key-1",
        name: "tester",
        scopes: [],
        rateLimitPerMinute: 120,
        source: "api-key",
      },
    });
    listKeys = vi.fn().mockResolvedValue([]);
  }
  return { ApiKeyService: MockApiKeyService };
});

vi.mock("../../src/services/oauth2.service.js", () => {
  class MockOAuth2Service {
    verifyToken = vi.fn().mockReturnValue({ valid: false });
    extractScopesFromToken = vi.fn().mockReturnValue([]);
  }
  return { OAuth2Service: MockOAuth2Service };
});

import { contractInstanceDiscoveryRoutes } from "../../src/api/routes/contractInstanceDiscovery.routes.js";

describe("Contract instance discovery routes (#1198)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(contractInstanceDiscoveryRoutes, {
      prefix: "/api/v1/soroban-contracts",
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("POST /discover returns instances", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/soroban-contracts/discover",
      headers: { "x-api-key": "bootstrap-secret", "content-type": "application/json" },
      payload: JSON.stringify({ contractIds: [CONTRACT_ID] }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("discovered", 1);
    expect(body.instances[0]).toHaveProperty("exists", true);
  });

  it("GET /known returns contract IDs", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/soroban-contracts/known",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body).contractIds)).toBe(true);
  });

  it("GET /:contractId returns single instance", async () => {
    const res = await server.inject({
      method: "GET",
      url: `/api/v1/soroban-contracts/${CONTRACT_ID}`,
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).instance).toHaveProperty("exists", true);
  });

  it("POST /discover returns 401 without auth", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/soroban-contracts/discover",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ contractIds: [CONTRACT_ID] }),
    });
    expect(res.statusCode).toBe(401);
  });
});
