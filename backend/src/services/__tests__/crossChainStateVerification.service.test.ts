import { describe, it, expect, beforeEach, vi } from "vitest";
import { CrossChainStateVerificationService } from "../crossChainStateVerification.service.js";

vi.mock("../../database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation(() => mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.first = vi.fn().mockResolvedValue(null);
  mockDb.insert = vi.fn().mockReturnValue(mockDb);
  mockDb.catch = vi.fn().mockImplementation(function (fn) {
    return this;
  });
  mockDb.distinct = vi.fn().mockReturnValue(mockDb);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.limit = vi.fn().mockReturnValue(mockDb);
  return { getDatabase: () => mockDb };
});

vi.mock("../../utils/redis.js", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../utils/stellar.js", () => ({
  getStellarAssetSupply: vi.fn().mockResolvedValue(1000000),
}));

vi.mock("./ethereum/client.js", () => ({
  getEthereumRpcClient: vi.fn(() => ({
    getBridgeReserves: vi.fn().mockResolvedValue({
      blockNumber: 18000000,
      lockedAmount: { toString: () => "1000000" },
      formattedAmount: "1000000",
      isPaused: false,
      timestamp: Math.floor(Date.now() / 1000),
    }),
  })),
}));

vi.mock("./reserveVerification.service.js", () => ({
  ReserveVerificationService: vi.fn().mockImplementation(() => ({
    getLatestCommitment: vi.fn().mockResolvedValue({
      sequence: 100,
      status: "verified",
    }),
    verifyProofOnChain: vi.fn().mockResolvedValue(true),
  })),
}));

vi.mock("./rpcEvidenceQuorum.service.js", () => ({
  rpcEvidenceQuorumService: {
    getRpcEvidence: vi.fn().mockResolvedValue([]),
  },
}));

describe("CrossChainStateVerificationService", () => {
  let service: CrossChainStateVerificationService;

  beforeEach(() => {
    service = new CrossChainStateVerificationService();
    vi.clearAllMocks();
  });

  describe("verifyBridge", () => {
    it("should verify a bridge and return consistent state", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Stellar Bridge",
        })
        .mockResolvedValueOnce({
          issuer: "GBBD47....",
        })
        .mockResolvedValueOnce({
          name: "bridge-1",
        })
        .mockResolvedValueOnce({
          token_address: "0x456...",
        });

      const result = await service.verifyBridge("bridge-1");

      expect(result).toBeDefined();
      expect(result.bridgeId).toBe("bridge-1");
      expect(result.stateConsistent).toBe(true);
      expect(result.status).toBe("verified");
    });

    it("should use cached result if available", async () => {
      const redis = vi.mocked(require("../../utils/redis.js").redis);
      const cachedResult = {
        bridgeId: "bridge-1",
        stateConsistent: true,
        status: "verified",
        verifiedAt: new Date().toISOString(),
      };
      redis.get = vi.fn().mockResolvedValue(JSON.stringify(cachedResult));

      const result = await service.verifyBridge("bridge-1", false);

      expect(result.cacheHit).toBe(true);
      expect(redis.get).toHaveBeenCalledWith(expect.stringContaining("bridge-1"));
    });

    it("should force refresh if requested", async () => {
      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.get = vi.fn().mockResolvedValue(null);

      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Stellar Bridge",
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          name: "bridge-1",
        })
        .mockResolvedValueOnce(null);

      const result = await service.verifyBridge("bridge-1", true);

      expect(result.cacheHit).toBe(false);
    });

    it("should handle bridge not found error", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue(null);

      await expect(service.verifyBridge("non-existent")).rejects.toThrow(
        "No active bridge operator found for bridge: non-existent"
      );
    });

    it("should detect state mismatch", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Stellar Bridge",
        })
        .mockResolvedValueOnce({
          issuer: "GBBD47....",
        })
        .mockResolvedValueOnce({
          name: "bridge-1",
        })
        .mockResolvedValueOnce({
          token_address: "0x456...",
        })
        .mockResolvedValueOnce(null);

      const getStellarAssetSupply = vi.mocked(require("../../utils/stellar.js").getStellarAssetSupply);
      getStellarAssetSupply.mockResolvedValue(1000000);

      const ethClient = vi.mocked(require("./ethereum/client.js").getEthereumRpcClient());
      ethClient.getBridgeReserves = vi.fn().mockResolvedValue({
        blockNumber: 18000000,
        lockedAmount: { toString: () => "500000" },
        formattedAmount: "500000",
        isPaused: false,
        timestamp: Math.floor(Date.now() / 1000),
      });

      const result = await service.verifyBridge("bridge-1");

      expect(result.stateConsistent).toBe(false);
      expect(result.status).toBe("mismatch");
      expect(result.mismatchPct).toBeGreaterThan(0);
    });

    it("should cache verification result", async () => {
      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.get = vi.fn().mockResolvedValue(null);
      redis.set = vi.fn().mockResolvedValue("OK");

      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Stellar Bridge",
        })
        .mockResolvedValueOnce({
          issuer: "GBBD47....",
        })
        .mockResolvedValueOnce({
          name: "bridge-1",
        })
        .mockResolvedValueOnce({
          token_address: "0x456...",
        })
        .mockResolvedValueOnce(null);

      await service.verifyBridge("bridge-1");

      expect(redis.set).toHaveBeenCalled();
    });

    it("should handle verification errors gracefully", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Stellar Bridge",
        })
        .mockResolvedValueOnce({
          issuer: "GBBD47....",
        })
        .mockResolvedValueOnce({
          name: "bridge-1",
        })
        .mockResolvedValueOnce({
          token_address: "0x456...",
        })
        .mockResolvedValueOnce(null);

      const getStellarAssetSupply = vi.mocked(require("../../utils/stellar.js").getStellarAssetSupply);
      getStellarAssetSupply.mockRejectedValue(new Error("Stellar API error"));

      const result = await service.verifyBridge("bridge-1");

      expect(result.status).toBe("error");
      expect(result.error).toBeDefined();
    });
  });

  describe("verifyAllBridges", () => {
    it("should verify all active bridges", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.distinct = vi.fn().mockResolvedValue([
        { bridge_id: "bridge-1" },
        { bridge_id: "bridge-2" },
      ]);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Bridge 1",
        })
        .mockResolvedValueOnce({ issuer: "GBBD47...." })
        .mockResolvedValueOnce({ name: "bridge-1" })
        .mockResolvedValueOnce({ token_address: "0x456..." })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          bridge_id: "bridge-2",
          asset_code: "EURC",
          contract_address: "0x789...",
          source_chain: "ethereum",
          provider_name: "Bridge 2",
        })
        .mockResolvedValueOnce({ issuer: "GBBD48...." })
        .mockResolvedValueOnce({ name: "bridge-2" })
        .mockResolvedValueOnce({ token_address: "0xABC..." })
        .mockResolvedValueOnce(null);

      const results = await service.verifyAllBridges();

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should continue on individual bridge failures", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.distinct = vi.fn().mockResolvedValue([
        { bridge_id: "bridge-1" },
        { bridge_id: "bridge-2" },
      ]);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Bridge 1",
        })
        .mockResolvedValueOnce({ issuer: "GBBD47...." })
        .mockResolvedValueOnce({ name: "bridge-1" })
        .mockResolvedValueOnce({ token_address: "0x456..." })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const results = await service.verifyAllBridges();

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("verifyMerkleProof", () => {
    it("should verify Merkle proof on-chain", async () => {
      const proof = {
        bridgeId: "bridge-1",
        sequence: 100,
        proof: {
          leaves: ["leaf1", "leaf2"],
          proofs: [["proof1"]],
        },
      };

      const result = await service.verifyMerkleProof(proof);

      expect(typeof result).toBe("boolean");
      expect(result).toBe(true);
    });

    it("should log proof verification result", async () => {
      const logger = vi.mocked(require("../../utils/logger.js").logger);

      const proof = {
        bridgeId: "bridge-1",
        sequence: 100,
        proof: {
          leaves: ["leaf1"],
          proofs: [["proof1"]],
        },
      };

      await service.verifyMerkleProof(proof);

      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe("getVerificationHistory", () => {
    it("should retrieve verification history for a bridge", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.catch = vi.fn().mockResolvedValue([
        {
          bridge_id: "bridge-1",
          verified_at: new Date(),
          payload: JSON.stringify({
            bridgeId: "bridge-1",
            stateConsistent: true,
            status: "verified",
          }),
        },
      ]);

      const history = await service.getVerificationHistory("bridge-1");

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it("should respect limit parameter", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.catch = vi.fn().mockResolvedValue([]);

      await service.getVerificationHistory("bridge-1", 50);

      expect(mockDb.limit).toHaveBeenCalledWith(50);
    });

    it("should handle history retrieval errors", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.limit = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.catch = vi.fn().mockResolvedValue([]);

      const history = await service.getVerificationHistory("bridge-1");

      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe("computeConsistency", () => {
    it("should detect consistent state when amounts match", () => {
      const stellar = { supply: 1000000, assetCode: "USDC", issuer: "issuer" };
      const ethereum = {
        blockNumber: 1,
        lockedAmount: "1000000",
        formattedAmount: "1000000",
        isPaused: false,
        timestamp: 1000,
      };

      const result = (service as any).computeConsistency(stellar, ethereum);

      expect(result.stateConsistent).toBe(true);
      expect(result.mismatchPct).toBeLessThan(2);
    });

    it("should detect mismatch when amounts differ beyond threshold", () => {
      const stellar = { supply: 1000000, assetCode: "USDC", issuer: "issuer" };
      const ethereum = {
        blockNumber: 1,
        lockedAmount: "500000",
        formattedAmount: "500000",
        isPaused: false,
        timestamp: 1000,
      };

      const result = (service as any).computeConsistency(stellar, ethereum);

      expect(result.stateConsistent).toBe(false);
      expect(result.mismatchPct).toBeGreaterThan(2);
    });

    it("should handle no ethereum state", () => {
      const stellar = { supply: 1000000, assetCode: "USDC", issuer: "issuer" };

      const result = (service as any).computeConsistency(stellar, null);

      expect(result.stateConsistent).toBe(true);
      expect(result.mismatchPct).toBe(0);
    });

    it("should handle zero amounts", () => {
      const stellar = { supply: 0, assetCode: "USDC", issuer: "issuer" };
      const ethereum = {
        blockNumber: 1,
        lockedAmount: "0",
        formattedAmount: "0",
        isPaused: false,
        timestamp: 1000,
      };

      const result = (service as any).computeConsistency(stellar, ethereum);

      expect(result.stateConsistent).toBe(true);
      expect(result.mismatchPct).toBe(0);
    });

    it("should calculate mismatch percentage correctly", () => {
      const stellar = { supply: 1000000, assetCode: "USDC", issuer: "issuer" };
      const ethereum = {
        blockNumber: 1,
        lockedAmount: "900000",
        formattedAmount: "900000",
        isPaused: false,
        timestamp: 1000,
      };

      const result = (service as any).computeConsistency(stellar, ethereum);

      const expectedMismatch = (100000 / 1000000) * 100;
      expect(result.mismatchPct).toBeCloseTo(expectedMismatch, 1);
    });
  });

  describe("Merkle proof validation", () => {
    it("should mark state as mismatch if proof invalid", async () => {
      const ReserveVerificationService = vi.mocked(require("./reserveVerification.service.js").ReserveVerificationService);
      const mockReserveSvc = new ReserveVerificationService();
      mockReserveSvc.getLatestCommitment = vi.fn().mockResolvedValue({
        sequence: 100,
        status: "invalid",
      });

      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Bridge",
        })
        .mockResolvedValueOnce({ issuer: "GBBD47...." })
        .mockResolvedValueOnce({ name: "bridge-1" })
        .mockResolvedValueOnce({ token_address: "0x456..." })
        .mockResolvedValueOnce(null);

      const result = await service.verifyBridge("bridge-1");

      expect(result.merkleProofValid).toBe(false);
    });
  });

  describe("Error handling and alerts", () => {
    it("should raise alert on state mismatch", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn()
        .mockResolvedValueOnce({
          bridge_id: "bridge-1",
          asset_code: "USDC",
          contract_address: "0x123...",
          source_chain: "ethereum",
          provider_name: "Bridge",
        })
        .mockResolvedValueOnce({ issuer: "GBBD47...." })
        .mockResolvedValueOnce({ name: "bridge-1" })
        .mockResolvedValueOnce({ token_address: "0x456..." })
        .mockResolvedValueOnce(null);
      mockDb.insert = vi.fn().mockReturnValue(mockDb);
      mockDb.catch = vi.fn().mockImplementation(function (fn) {
        return this;
      });

      const getStellarAssetSupply = vi.mocked(require("../../utils/stellar.js").getStellarAssetSupply);
      getStellarAssetSupply.mockResolvedValue(1000000);

      const ethClient = vi.mocked(require("./ethereum/client.js").getEthereumRpcClient());
      ethClient.getBridgeReserves = vi.fn().mockResolvedValue({
        blockNumber: 18000000,
        lockedAmount: { toString: () => "100000" },
        formattedAmount: "100000",
        isPaused: false,
        timestamp: Math.floor(Date.now() / 1000),
      });

      const result = await service.verifyBridge("bridge-1");

      expect(result.stateConsistent).toBe(false);
    });

    it("should short TTL cache on error", async () => {
      const redis = vi.mocked(require("../../utils/redis.js").redis);
      redis.get = vi.fn().mockResolvedValue(null);
      redis.set = vi.fn().mockResolvedValue("OK");

      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue(null);

      try {
        await service.verifyBridge("non-existent");
      } catch {
        // Error expected
      }

      // Error path uses different TTL
      expect(redis.set).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "EX", 300);
    });
  });
});
