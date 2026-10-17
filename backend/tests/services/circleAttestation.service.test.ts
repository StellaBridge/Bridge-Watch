import { describe, it, expect, vi } from "vitest";
import { CircleAttestationService } from "../../src/services/circleAttestation.service.js";

// Mock the database connection
vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => ({
    insert: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  }),
}));

// Mock the schema drift service
vi.mock("../../src/services/schemaDrift.service.js", () => ({
  schemaDriftService: {
    checkDrift: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("CircleAttestationService", () => {
  const service = new CircleAttestationService();

  describe("fetchAttestation", () => {
    it("fetches a valid Verifiable Credential attestation envelope for USDC", async () => {
      const credential = await service.fetchAttestation("USDC");
      expect(credential).toBeDefined();
      expect(credential.credentialSubject.assetSymbol).toBe("USDC");
      expect(credential.issuer.id).toContain("circle");
      expect(credential.proof.signatureValue).toBeDefined();
    });

    it("returns fallback credential when live fetch fails", async () => {
      // The service generates a deterministic fallback when live fetch fails
      const credential = await service.fetchAttestation("XLM");
      expect(credential).toBeDefined();
      expect(credential.credentialSubject.assetSymbol).toBe("XLM");
    });

    it("normalizes asset symbol to uppercase", async () => {
      const credential = await service.fetchAttestation("usdc");
      expect(credential.credentialSubject.assetSymbol).toBe("USDC");
    });
  });

  describe("verifyCredential", () => {
    it("cryptographically verifies a valid Circle Verifiable Credential signature", async () => {
      const credential = await service.fetchAttestation("USDC");
      const result = service.verifyCredential(credential);

      expect(result.isValid).toBe(true);
      expect(result.rootCertificateChain.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it("fails verification if the signature value is corrupted", async () => {
      const credential = await service.fetchAttestation("USDC");
      credential.proof.signatureValue = "InvalidCorruptedBase64Signature==";

      const result = service.verifyCredential(credential);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("verification failed");
    });

    it("fails verification for invalid credential envelope", () => {
      const invalidCredential = {} as any;
      const result = service.verifyCredential(invalidCredential);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("fails verification when issuer public key is missing", async () => {
      const credential = await service.fetchAttestation("USDC");
      credential.issuer.publicKeyPem = "";

      const result = service.verifyCredential(credential);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Missing issuer public key");
    });

    it("passes verification with empty certificate chain (standalone key)", async () => {
      const credential = await service.fetchAttestation("USDC");
      credential.issuer.rootCertificateChain = [];

      const result = service.verifyCredential(credential);
      expect(result.isValid).toBe(true);
    });
  });

  describe("importAndVerifyAttestation", () => {
    it("imports and verifies an attestation", async () => {
      const result = await service.importAndVerifyAttestation("bridge-1", "USDC");
      expect(result).toBeDefined();
      expect(result.bridgeId).toBe("bridge-1");
      expect(result.assetSymbol).toBe("USDC");
      expect(result.isValid).toBeDefined();
    });
  });

  describe("getAttestationChain", () => {
    it("returns attestation chain for a bridge", async () => {
      const chain = await service.getAttestationChain("bridge-1", 5);
      expect(Array.isArray(chain)).toBe(true);
    });
  });
});
