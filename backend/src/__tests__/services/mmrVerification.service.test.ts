import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { MmrAccumulatorService, type MmrProof } from "../../services/mmrAccumulator.service.js";

function leafHash(data: Buffer): string {
  return createHash("sha256").update(Buffer.from([0x00])).update(data).digest("hex");
}

describe("MmrAccumulatorService verification", () => {
  it("verifies an MMR leaf inclusion proof with valid peaks", () => {
    const service = new MmrAccumulatorService();
    const commitment = Buffer.alloc(32, 0x11);
    service.append(commitment);

    const proof = service.generateProof(0);
    const result = service.verifyProofAgainstCurrent(proof);

    expect(result.valid).toBe(true);
    expect(result.reconstructedRoot).toBe(service.getRoot());
  });

  it("rejects a proof when leaf data is mutated", () => {
    const service = new MmrAccumulatorService();
    service.append(Buffer.alloc(32, 0x22));
    const proof = service.generateProof(0);
    const mutated: MmrProof = { ...proof, leafHash: leafHash(Buffer.alloc(32, 0x23)) };

    expect(service.verifyProofAgainstCurrent(mutated).valid).toBe(false);
  });

  it("rejects a proof with tampered peak hashes", () => {
    const service = new MmrAccumulatorService();
    service.append(Buffer.alloc(32, 0x31));
    service.append(Buffer.alloc(32, 0x32));
    const proof = service.generateProof(0);
    const tampered: MmrProof = {
      ...proof,
      peaksSnapshot: proof.peaksSnapshot.map((peak) => "ff".repeat(32)),
    };

    expect(service.verifyProofAgainstCurrent(tampered).valid).toBe(false);
  });

  it("bags peaks against reference domain-separated hashes", () => {
    const commitment = Buffer.alloc(32, 0x44);
    const expectedLeaf = createHash("sha256")
      .update(Buffer.from([0x00]))
      .update(commitment)
      .digest("hex");
    const service = new MmrAccumulatorService();

    const append = service.append(commitment);

    expect(append.leafHash).toBe(expectedLeaf);
    expect(append.newRoot).toBe(expectedLeaf);
  });

  it("bags two peaks with the reference inner-node hash", () => {
    const service = new MmrAccumulatorService();
    const first = Buffer.alloc(32, 0x51);
    const second = Buffer.alloc(32, 0x52);
    const firstAppend = service.append(first);
    service.append(second);

    const secondLeaf = leafHash(second);
    const expectedRoot = createHash("sha256")
      .update(Buffer.from([0x01]))
      .update(Buffer.from(firstAppend.leafHash, "hex"))
      .update(Buffer.from(secondLeaf, "hex"))
      .digest("hex");

    expect(service.getRoot()).toBe(expectedRoot);
  });

  it("handles out-of-bounds leaf index requests", () => {
    const service = new MmrAccumulatorService();
    service.append(Buffer.alloc(32, 0x61));

    expect(() => service.generateProof(-1)).toThrow(/out of range/);
    expect(() => service.generateProof(1)).toThrow(/out of range/);
  });
});
