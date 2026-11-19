import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const serviceMocks = vi.hoisted(() => ({
  searchLabels: vi.fn(),
  lookupAddress: vi.fn(),
  lookupAddresses: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("../../services/addressLabel.service.js", () => ({
  addressLabelService: serviceMocks,
}));

vi.mock("../../utils/logger.js", () => ({ logger: loggerMocks }));

// Grants the scopes listed in `x-test-scopes`; no header means unauthenticated.
// `x-test-no-tenant` simulates a principal without a resolved tenant context.
vi.mock("../../api/middleware/auth.js", () => ({
  authMiddleware:
    (options: { requiredScopes?: string[] } = {}) =>
    async (request: any, reply: any) => {
      const header = request.headers["x-test-scopes"];
      if (typeof header !== "string") {
        return reply.status(401).send({ error: "Unauthorized" });
      }
      const granted = header.split(",").map((s: string) => s.trim()).filter(Boolean);
      const required = options.requiredScopes ?? [];
      if (!granted.includes("*") && !required.every((scope) => granted.includes(scope))) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      if (request.headers["x-test-no-tenant"] === undefined) {
        request.tenantContext = { tenantId: "key-1", actorId: "actor-1", actorType: "user", bypass: false };
      }
    },
}));

import { addressLabelsRoutes } from "../../api/routes/addressLabels.routes.js";

const PREFIX = "/api/v1/address-labels";
const READ = { "x-test-scopes": "address-labels:read" };
const WRITE = { "x-test-scopes": "address-labels:write" };
const LABEL_ID = "c0ffee00-1234-4abc-8def-0123456789ab";
const STELLAR_ADDRESS = "GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG";
const EVM_ADDRESS = "0x28c6c06298d514db089934071355e5743bf21d60";

function makeLabel(overrides: Record<string, unknown> = {}) {
  return {
    id: LABEL_ID,
    address: STELLAR_ADDRESS,
    chain: "stellar",
    label: "Bridge custody",
    category: "bridge_contract",
    notes: null,
    confidence: 100,
    source: "manual",
    isActive: true,
    ...overrides,
  };
}

describe("addressLabelsRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    serviceMocks.searchLabels.mockResolvedValue([makeLabel()]);
    serviceMocks.lookupAddress.mockResolvedValue(makeLabel());
    serviceMocks.lookupAddresses.mockResolvedValue(new Map([[STELLAR_ADDRESS, makeLabel()]]));
    serviceMocks.createLabel.mockImplementation(async (params) => makeLabel(params));
    serviceMocks.updateLabel.mockImplementation(async (id, patch) => makeLabel({ id, ...patch }));
    serviceMocks.deleteLabel.mockResolvedValue(undefined);

    app = Fastify();
    await app.register(addressLabelsRoutes, { prefix: PREFIX });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("authorization", () => {
    it("returns 401 without credentials", async () => {
      const res = await app.inject({ method: "GET", url: PREFIX });

      expect(res.statusCode).toBe(401);
      expect(serviceMocks.searchLabels).not.toHaveBeenCalled();
    });

    it.each([
      { method: "GET", url: PREFIX },
      { method: "GET", url: `${PREFIX}/lookup/${STELLAR_ADDRESS}` },
      { method: "POST", url: `${PREFIX}/bulk-lookup`, payload: { addresses: [STELLAR_ADDRESS] } },
    ] as const)("$method $url requires the address-labels:read scope", async (endpoint) => {
      const res = await app.inject({ ...endpoint, headers: WRITE });

      expect(res.statusCode).toBe(403);
      for (const fn of Object.values(serviceMocks)) expect(fn).not.toHaveBeenCalled();
    });

    it.each([
      { method: "POST", url: PREFIX, payload: { address: STELLAR_ADDRESS, label: "x" } },
      { method: "PATCH", url: `${PREFIX}/${LABEL_ID}`, payload: { label: "x" } },
      { method: "DELETE", url: `${PREFIX}/${LABEL_ID}` },
    ] as const)("$method $url requires the address-labels:write scope", async (endpoint) => {
      const res = await app.inject({ ...endpoint, headers: READ });

      expect(res.statusCode).toBe(403);
      for (const fn of Object.values(serviceMocks)) expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("GET /", () => {
    it("returns labels using the requested filters and paging", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${PREFIX}?category=exchange&chain=ethereum&query=binance&includeInactive=true&limit=25&offset=50`,
        headers: READ,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ labels: [makeLabel()] });
      expect(serviceMocks.searchLabels).toHaveBeenCalledWith({
        category: "exchange",
        chain: "ethereum",
        query: "binance",
        includeInactive: true,
        limit: 25,
        offset: 50,
      });
    });

    it("excludes inactive labels and leaves paging to the service by default", async () => {
      await app.inject({ method: "GET", url: `${PREFIX}?includeInactive=yes`, headers: READ });

      expect(serviceMocks.searchLabels).toHaveBeenCalledWith({
        category: undefined,
        chain: undefined,
        query: undefined,
        includeInactive: false,
        limit: undefined,
        offset: undefined,
      });
    });

    it("returns 400 and logs when the service rejects the filters", async () => {
      serviceMocks.searchLabels.mockRejectedValue(new Error('Unsupported chain "solana"'));

      const res = await app.inject({ method: "GET", url: `${PREFIX}?chain=solana`, headers: READ });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'Unsupported chain "solana"' });
      expect(loggerMocks.error).toHaveBeenCalled();
    });

    it("returns 400 when the service throws a non-Error value", async () => {
      serviceMocks.searchLabels.mockRejectedValue("search backend offline");

      const res = await app.inject({ method: "GET", url: PREFIX, headers: READ });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "search backend offline" });
    });
  });

  describe("GET /lookup/:address", () => {
    it("looks up a Stellar address by default", async () => {
      const res = await app.inject({ method: "GET", url: `${PREFIX}/lookup/${STELLAR_ADDRESS}`, headers: READ });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ label: makeLabel() });
      expect(serviceMocks.lookupAddress).toHaveBeenCalledWith(STELLAR_ADDRESS, "stellar");
    });

    it("looks up an EVM address on the requested chain", async () => {
      await app.inject({ method: "GET", url: `${PREFIX}/lookup/${EVM_ADDRESS}?chain=ethereum`, headers: READ });

      expect(serviceMocks.lookupAddress).toHaveBeenCalledWith(EVM_ADDRESS, "ethereum");
    });

    it("returns 404 when the address has no label", async () => {
      serviceMocks.lookupAddress.mockResolvedValue(null);

      const res = await app.inject({ method: "GET", url: `${PREFIX}/lookup/${STELLAR_ADDRESS}`, headers: READ });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "No label found for this address" });
    });
  });

  describe("POST /bulk-lookup", () => {
    it("returns labels keyed by address", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PREFIX}/bulk-lookup`,
        headers: READ,
        payload: { addresses: [STELLAR_ADDRESS, "GUNLABELED"], chain: "stellar" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ labels: { [STELLAR_ADDRESS]: makeLabel() } });
      expect(serviceMocks.lookupAddresses).toHaveBeenCalledWith([STELLAR_ADDRESS, "GUNLABELED"], "stellar");
    });

    it("accepts exactly 500 addresses", async () => {
      const addresses = Array.from({ length: 500 }, (_, i) => `G${i}`);

      const res = await app.inject({ method: "POST", url: `${PREFIX}/bulk-lookup`, headers: READ, payload: { addresses } });

      expect(res.statusCode).toBe(200);
      expect(serviceMocks.lookupAddresses).toHaveBeenCalledWith(addresses, undefined);
    });

    it.each([
      ["body is missing", undefined, "addresses must be a non-empty array"],
      ["addresses is empty", { addresses: [] }, "addresses must be a non-empty array"],
      ["addresses is not an array", { addresses: STELLAR_ADDRESS }, "addresses must be a non-empty array"],
      [
        "more than 500 addresses are sent",
        { addresses: Array.from({ length: 501 }, (_, i) => `G${i}`) },
        "addresses cannot exceed 500 entries per request",
      ],
    ])("returns 400 when %s", async (_label, payload, error) => {
      const res = await app.inject({ method: "POST", url: `${PREFIX}/bulk-lookup`, headers: READ, payload });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error });
      expect(serviceMocks.lookupAddresses).not.toHaveBeenCalled();
    });
  });

  describe("POST /", () => {
    it("labels a Stellar G-address on behalf of the acting user", async () => {
      const payload = {
        address: STELLAR_ADDRESS,
        label: "Bridge custody",
        category: "bridge_contract",
        notes: "Primary reserve account",
        confidence: 90,
        source: "manual",
      };

      const res = await app.inject({ method: "POST", url: PREFIX, headers: WRITE, payload });

      expect(res.statusCode).toBe(201);
      expect(res.json().label).toMatchObject({ address: STELLAR_ADDRESS, label: "Bridge custody" });
      expect(serviceMocks.createLabel).toHaveBeenCalledWith({
        ...payload,
        chain: undefined,
        performedBy: "actor-1",
      });
    });

    it("labels an EVM 0x address on an EVM chain", async () => {
      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        headers: WRITE,
        payload: { address: EVM_ADDRESS, chain: "ethereum", label: "Exchange hot wallet", category: "exchange" },
      });

      expect(res.statusCode).toBe(201);
      expect(serviceMocks.createLabel).toHaveBeenCalledWith(
        expect.objectContaining({ address: EVM_ADDRESS, chain: "ethereum" })
      );
    });

    it("attributes the label to 'unknown' when no tenant context is resolved", async () => {
      await app.inject({
        method: "POST",
        url: PREFIX,
        headers: { ...WRITE, "x-test-no-tenant": "1" },
        payload: { address: STELLAR_ADDRESS, label: "Bridge custody" },
      });

      expect(serviceMocks.createLabel).toHaveBeenCalledWith(expect.objectContaining({ performedBy: "unknown" }));
    });

    it.each([
      ["body is missing", undefined],
      ["address is missing", { label: "Bridge custody" }],
      ["label is missing", { address: STELLAR_ADDRESS }],
      ["address is blank", { address: "", label: "Bridge custody" }],
    ])("returns 400 when %s", async (_label, payload) => {
      const res = await app.inject({ method: "POST", url: PREFIX, headers: WRITE, payload });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "address and label are required" });
      expect(serviceMocks.createLabel).not.toHaveBeenCalled();
    });

    it.each([
      ['Unsupported chain "solana". Expected one of: stellar, ethereum, polygon, avalanche, bsc, other'],
      ["Confidence must be a number between 0 and 100"],
      [`Address "${STELLAR_ADDRESS}" on chain "stellar" is already labeled`],
    ])("returns 400 when the service rejects the payload: %s", async (message) => {
      serviceMocks.createLabel.mockRejectedValue(new Error(message));

      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        headers: WRITE,
        payload: { address: STELLAR_ADDRESS, label: "Bridge custody" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: message });
    });

    it("returns 400 when the service throws a non-Error value", async () => {
      serviceMocks.createLabel.mockRejectedValue("write failed");

      const res = await app.inject({
        method: "POST",
        url: PREFIX,
        headers: WRITE,
        payload: { address: STELLAR_ADDRESS, label: "Bridge custody" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "write failed" });
    });
  });

  describe("PATCH /:id", () => {
    it("updates a label on behalf of the acting user", async () => {
      const patch = { label: "Flagged custody", category: "suspicious", isActive: false };

      const res = await app.inject({ method: "PATCH", url: `${PREFIX}/${LABEL_ID}`, headers: WRITE, payload: patch });

      expect(res.statusCode).toBe(200);
      expect(res.json().label).toMatchObject(patch);
      expect(serviceMocks.updateLabel).toHaveBeenCalledWith(LABEL_ID, patch, "actor-1");
    });

    it("passes an empty patch when no body is sent", async () => {
      await app.inject({ method: "PATCH", url: `${PREFIX}/${LABEL_ID}`, headers: { ...WRITE, "x-test-no-tenant": "1" } });

      expect(serviceMocks.updateLabel).toHaveBeenCalledWith(LABEL_ID, {}, "unknown");
    });

    it("returns 404 when the label does not exist", async () => {
      serviceMocks.updateLabel.mockRejectedValue(new Error(`Address label ${LABEL_ID} not found`));

      const res = await app.inject({ method: "PATCH", url: `${PREFIX}/${LABEL_ID}`, headers: WRITE, payload: { label: "x" } });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when the service rejects the update", async () => {
      serviceMocks.updateLabel.mockRejectedValue(new Error("Confidence must be a number between 0 and 100"));

      const res = await app.inject({
        method: "PATCH",
        url: `${PREFIX}/${LABEL_ID}`,
        headers: WRITE,
        payload: { confidence: 150 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "Confidence must be a number between 0 and 100" });
    });

    it("returns 400 when the service throws a non-Error value", async () => {
      serviceMocks.updateLabel.mockRejectedValue("update failed");

      const res = await app.inject({ method: "PATCH", url: `${PREFIX}/${LABEL_ID}`, headers: WRITE, payload: { label: "x" } });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "update failed" });
    });
  });

  describe("DELETE /:id", () => {
    it("deletes a label on behalf of the acting user", async () => {
      const res = await app.inject({ method: "DELETE", url: `${PREFIX}/${LABEL_ID}`, headers: WRITE });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
      expect(serviceMocks.deleteLabel).toHaveBeenCalledWith(LABEL_ID, "actor-1");
    });

    it("attributes the deletion to 'unknown' when no tenant context is resolved", async () => {
      await app.inject({ method: "DELETE", url: `${PREFIX}/${LABEL_ID}`, headers: { ...WRITE, "x-test-no-tenant": "1" } });

      expect(serviceMocks.deleteLabel).toHaveBeenCalledWith(LABEL_ID, "unknown");
    });

    it("returns 404 when the label does not exist", async () => {
      serviceMocks.deleteLabel.mockRejectedValue(new Error(`Address label ${LABEL_ID} not found`));

      const res = await app.inject({ method: "DELETE", url: `${PREFIX}/${LABEL_ID}`, headers: WRITE });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when the service fails for another reason", async () => {
      serviceMocks.deleteLabel.mockRejectedValue("delete failed");

      const res = await app.inject({ method: "DELETE", url: `${PREFIX}/${LABEL_ID}`, headers: WRITE });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "delete failed" });
    });
  });
});
