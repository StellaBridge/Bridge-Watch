import { describe, it, expect, beforeEach, vi } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  LedgerEntryService,
  LedgerEntryValidationError,
  LedgerEntryUpstreamError,
  type LedgerEntryInspectRequest,
} from "../../services/ledgerEntry.service.js";

vi.mock("../../config/index.js", () => ({
  config: {
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../services/stellar/soroban.client.js", () => ({
  SorobanRpcClient: vi.fn(),
  SorobanStateReadError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SorobanStateReadError";
    }
  },
}));

const createMockXdrKey = (type: string = "contractData"): string => {
  if (type === "contractData") {
    const key = StellarSdk.xdr.LedgerKey.contractData({
      contractId: StellarSdk.xdr.SCAddress.contractFromSourceAccount({
        networkId: StellarSdk.xdr.Hash.fromXDR(
          Buffer.from("7ac3f4cac0bef93446c5b3c03a63c6005f8c5e1b76fa5208e90c1d1b6f4c8e9f", "hex")
        ),
        salt: StellarSdk.xdr.Uint256.fromXDR(
          Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex")
        ),
      }),
      contractDataDurability: StellarSdk.xdr.ContractDataDurability.persistent(),
      key: StellarSdk.xdr.SCVal.scvType(StellarSdk.xdr.SCValType.scvTypeU64()),
    });
    return key.toXDR("base64");
  } else if (type === "account") {
    const key = StellarSdk.xdr.LedgerKey.account({
      accountId: StellarSdk.xdr.PublicKey.publicKeyTypeEd25519({
        ed25519: StellarSdk.xdr.Uint256.fromXDR(
          Buffer.from("0".repeat(64), "hex")
        ),
      }),
    });
    return key.toXDR("base64");
  }
  return "";
};

const createMockClient = () => ({
  getLedgerEntries: vi.fn(),
  getLatestLedger: vi.fn(),
});

describe("LedgerEntryService", () => {
  let service: LedgerEntryService;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  describe("validateRequest", () => {
    beforeEach(() => {
      service = new LedgerEntryService(() => mockClient as any);
    });

    it("should accept valid request with keys array", () => {
      const request: LedgerEntryInspectRequest = {
        keys: [createMockXdrKey("account")],
      };

      const result = service.validateRequest(request);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it("should reject empty keys array", () => {
      const request: LedgerEntryInspectRequest = {
        keys: [],
      };

      expect(() => service.validateRequest(request)).toThrow(
        LedgerEntryValidationError
      );
      expect(() => service.validateRequest(request)).toThrow(
        "must be a non-empty array"
      );
    });

    it("should reject request without keys", () => {
      const request = {} as LedgerEntryInspectRequest;

      expect(() => service.validateRequest(request)).toThrow(
        LedgerEntryValidationError
      );
    });

    it("should reject more than 100 keys", () => {
      const keys = Array(101).fill(createMockXdrKey("account"));
      const request: LedgerEntryInspectRequest = { keys };

      expect(() => service.validateRequest(request)).toThrow(
        "at most 100 entries"
      );
    });

    it("should reject invalid ledger sequence", () => {
      const request: LedgerEntryInspectRequest = {
        keys: [createMockXdrKey("account")],
        ledgerSeq: -1,
      };

      expect(() => service.validateRequest(request)).toThrow(
        "must be a positive integer"
      );
    });

    it("should reject non-integer ledger sequence", () => {
      const request: LedgerEntryInspectRequest = {
        keys: [createMockXdrKey("account")],
        ledgerSeq: 1.5,
      };

      expect(() => service.validateRequest(request)).toThrow(
        "must be a positive integer"
      );
    });

    it("should reject empty key string", () => {
      const request: LedgerEntryInspectRequest = {
        keys: [""],
      };

      expect(() => service.validateRequest(request)).toThrow(
        "non-empty base64 XDR string"
      );
    });

    it("should reject excessively long key", () => {
      const request: LedgerEntryInspectRequest = {
        keys: ["a".repeat(8193)],
      };

      expect(() => service.validateRequest(request)).toThrow(
        "non-empty base64 XDR string"
      );
    });

    it("should reject non-string key", () => {
      const request = {
        keys: [123],
      } as any;

      expect(() => service.validateRequest(request)).toThrow(
        LedgerEntryValidationError
      );
    });

    it("should reject malformed base64 XDR", () => {
      const request: LedgerEntryInspectRequest = {
        keys: ["not-valid-base64!!!"],
      };

      expect(() => service.validateRequest(request)).toThrow(
        "must be a base64-encoded XDR LedgerKey"
      );
    });
  });

  describe("inspect", () => {
    beforeEach(() => {
      service = new LedgerEntryService(() => mockClient as any);
    });

    it("should inspect contract data entries", async () => {
      const keyXdr = createMockXdrKey("contractData");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [
          {
            key: keyXdr,
            xdr: Buffer.from("contractDataXdr").toString("base64"),
            liveUntilLedgerSeq: 50001000,
            lastModifiedLedgerSeq: 50000500,
          },
        ],
        latestLedger: 50001000,
      });

      const result = await service.inspect(request);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].key).toBe(keyXdr);
      expect(result.entries[0].liveUntilLedgerSeq).toBe(50001000);
      expect(result.entries[0].lastModifiedLedgerSeq).toBe(50000500);
    });

    it("should inspect account entries", async () => {
      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [
          {
            key: keyXdr,
            xdr: Buffer.from("accountXdr").toString("base64"),
            lastModifiedLedgerSeq: 50000600,
          },
        ],
        latestLedger: 50001000,
      });

      const result = await service.inspect(request);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].lastModifiedLedgerSeq).toBe(50000600);
    });

    it("should handle truncated XDR buffers", async () => {
      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      const longXdr = "x".repeat(1000);
      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [
          {
            key: keyXdr,
            xdr: longXdr,
          },
        ],
        latestLedger: 50001000,
      });

      const result = await service.inspect(request);

      expect(result.entries[0].entryXdrPreview.length).toBeLessThanOrEqual(512);
    });

    it("should track not found keys", async () => {
      const key1 = createMockXdrKey("account");
      const key2 = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [key1, key2] };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [
          {
            key: key1,
            xdr: Buffer.from("data").toString("base64"),
          },
        ],
        latestLedger: 50001000,
      });

      const result = await service.inspect(request);

      expect(result.notFoundKeys).toHaveLength(1);
      expect(result.notFoundKeys[0]).toBe(key2);
    });

    it("should handle missing entry data gracefully", async () => {
      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [
          {
            key: keyXdr,
            xdr: undefined,
            liveUntilLedgerSeq: undefined,
            lastModifiedLedgerSeq: undefined,
          },
        ],
        latestLedger: 50001000,
      });

      const result = await service.inspect(request);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].liveUntilLedgerSeq).toBeUndefined();
    });

    it("should include latest ledger sequence when provided", async () => {
      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [{ key: keyXdr, xdr: "data" }],
        latestLedger: 50001500,
      });

      const result = await service.inspect(request);

      expect(result.latestLedgerSeq).toBe(50001500);
    });

    it("should include specified ledger sequence in result", async () => {
      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = {
        keys: [keyXdr],
        ledgerSeq: 50000500,
      };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [{ key: keyXdr, xdr: "data" }],
        latestLedger: 50001000,
      });

      const result = await service.inspect(request);

      expect(result.ledgerSeq).toBe(50000500);
    });

    it("should throw LedgerEntryUpstreamError on RPC failure", async () => {
      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      mockClient.getLedgerEntries.mockRejectedValue(
        new Error("RPC timeout")
      );

      await expect(service.inspect(request)).rejects.toThrow(
        LedgerEntryUpstreamError
      );
    });

    it("should handle multiple entries in response", async () => {
      const key1 = createMockXdrKey("account");
      const key2 = createMockXdrKey("contractData");
      const request: LedgerEntryInspectRequest = { keys: [key1, key2] };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [
          { key: key1, xdr: "data1", lastModifiedLedgerSeq: 50000500 },
          { key: key2, xdr: "data2", liveUntilLedgerSeq: 50001000 },
        ],
        latestLedger: 50001000,
      });

      const result = await service.inspect(request);

      expect(result.entries).toHaveLength(2);
      expect(result.notFoundKeys).toHaveLength(0);
    });
  });

  describe("getLatestLedger", () => {
    beforeEach(() => {
      service = new LedgerEntryService(() => mockClient as any);
    });

    it("should return latest ledger sequence", async () => {
      mockClient.getLatestLedger.mockResolvedValue({
        sequence: 50001000,
        protocolVersion: 20,
        baseFeeRate: 100,
      });

      const result = await service.getLatestLedger();

      expect(result).toBeDefined();
    });

    it("should propagate SorobanStateReadError", async () => {
      const { SorobanStateReadError } = await import(
        "../../services/stellar/soroban.client.js"
      );
      mockClient.getLatestLedger.mockRejectedValue(
        new SorobanStateReadError("State read timeout")
      );

      await expect(service.getLatestLedger()).rejects.toThrow(
        SorobanStateReadError
      );
    });

    it("should wrap other errors as LedgerEntryUpstreamError", async () => {
      mockClient.getLatestLedger.mockRejectedValue(
        new Error("Network error")
      );

      await expect(service.getLatestLedger()).rejects.toThrow(
        LedgerEntryUpstreamError
      );
    });
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = LedgerEntryService.getInstance();
      const instance2 = LedgerEntryService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("withClient", () => {
    it("should create service with custom client factory", () => {
      const customClient = createMockClient();
      const customService = LedgerEntryService.withClient(() => customClient as any);

      expect(customService).toBeDefined();
    });

    it("should use provided client factory for requests", async () => {
      const customClient = createMockClient();
      const service = LedgerEntryService.withClient(() => customClient as any);

      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      customClient.getLedgerEntries.mockResolvedValue({
        entries: [{ key: keyXdr, xdr: "data" }],
        latestLedger: 50001000,
      });

      await service.inspect(request);

      expect(customClient.getLedgerEntries).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      service = new LedgerEntryService(() => mockClient as any);
    });

    it("should create LedgerEntryValidationError with proper name", () => {
      const error = new LedgerEntryValidationError("Test error");

      expect(error.name).toBe("LedgerEntryValidationError");
      expect(error.message).toBe("Test error");
    });

    it("should create LedgerEntryUpstreamError with cause", () => {
      const cause = new Error("Original error");
      const error = new LedgerEntryUpstreamError("Wrapped error", cause);

      expect(error.name).toBe("LedgerEntryUpstreamError");
      expect(error.cause).toBe(cause);
    });

    it("should handle null response entries gracefully", async () => {
      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: null,
        latestLedger: 50001000,
      });

      const result = await service.inspect(request);

      expect(result.entries).toHaveLength(0);
      expect(result.notFoundKeys).toHaveLength(1);
    });

    it("should handle response without latestLedger", async () => {
      const keyXdr = createMockXdrKey("account");
      const request: LedgerEntryInspectRequest = { keys: [keyXdr] };

      mockClient.getLedgerEntries.mockResolvedValue({
        entries: [{ key: keyXdr, xdr: "data" }],
      });

      const result = await service.inspect(request);

      expect(result.latestLedgerSeq).toBeUndefined();
    });
  });
});
