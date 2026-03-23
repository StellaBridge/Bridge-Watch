/**
 * Tests for Reserve Verification Worker – Merkle tree utilities
 *
 * These tests cover the pure TypeScript logic (tree building, proof
 * generation, verification) without requiring a running Redis, database,
 * or Soroban RPC node.
 */

import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  type ReserveLeaf,
  hashLeaf,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
} from "../../src/workers/reserveVerification.worker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLeaves(count: number): ReserveLeaf[] {
  return Array.from({ length: count }, (_, i) => ({
    assetId: `USDC-Ethereum`,
    amount: BigInt(1_000_000 * (i + 1)),
    chain: "Ethereum",
    nonce: `test-nonce-${i}`,
  }));
}

// ---------------------------------------------------------------------------
// hashLeaf
// ---------------------------------------------------------------------------

describe("hashLeaf", () => {
  it("produces a 32-byte Buffer", () => {
    const leaf: ReserveLeaf = {
      assetId: "USDC-Ethereum",
      amount: 1_000_000n,
      chain: "Ethereum",
      nonce: "abc123",
    };
    const hash = hashLeaf(leaf);
    expect(hash).toBeInstanceOf(Buffer);
    expect(hash.length).toBe(32);
  });

  it("is deterministic for the same input", () => {
    const leaf: ReserveLeaf = {
      assetId: "EURC-Ethereum",
      amount: 500_000n,
      chain: "Ethereum",
      nonce: "xyz789",
    };
    expect(hashLeaf(leaf).equals(hashLeaf(leaf))).toBe(true);
  });

  it("produces different hashes for different leaves", () => {
    const a: ReserveLeaf = { assetId: "USDC", amount: 100n, chain: "ETH", nonce: "1" };
    const b: ReserveLeaf = { assetId: "USDC", amount: 200n, chain: "ETH", nonce: "1" };
    expect(hashLeaf(a).equals(hashLeaf(b))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildMerkleTree
// ---------------------------------------------------------------------------

describe("buildMerkleTree", () => {
  it("throws on empty leaf list", () => {
    expect(() => buildMerkleTree([])).toThrow();
  });

  it("handles a single leaf (root equals leaf hash)", () => {
    const [leaf] = makeLeaves(1);
    const tree = buildMerkleTree([leaf!]);
    expect(tree.root.equals(hashLeaf(leaf!))).toBe(true);
    expect(tree.layers.length).toBe(1);
  });

  it("builds a 2-leaf tree correctly", () => {
    const leaves = makeLeaves(2);
    const tree = buildMerkleTree(leaves);

    const expectedRoot = crypto
      .createHash("sha256")
      .update(hashLeaf(leaves[0]!))
      .update(hashLeaf(leaves[1]!))
      .digest();

    expect(tree.root.equals(expectedRoot)).toBe(true);
    expect(tree.layers.length).toBe(2);
  });

  it("builds a 4-leaf tree with correct layer count", () => {
    const tree = buildMerkleTree(makeLeaves(4));
    // layers[0]=leaves, layers[1]=2 nodes, layers[2]=[root]
    expect(tree.layers.length).toBe(3);
    expect(tree.layers[0]!.length).toBe(4);
    expect(tree.layers[1]!.length).toBe(2);
    expect(tree.layers[2]!.length).toBe(1);
  });

  it("pads an odd number of leaves by duplicating the last", () => {
    const tree3 = buildMerkleTree(makeLeaves(3));
    const tree4 = buildMerkleTree([...makeLeaves(3), makeLeaves(3)[2]!]);
    // Both should produce the same root
    expect(tree3.root.equals(tree4.root)).toBe(true);
  });

  it("produces different roots for different leaf sets", () => {
    const treeA = buildMerkleTree(makeLeaves(4));
    const leavesB = makeLeaves(4);
    leavesB[2] = { ...leavesB[2]!, amount: 9_999_999n };
    const treeB = buildMerkleTree(leavesB);
    expect(treeA.root.equals(treeB.root)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateMerkleProof + verifyMerkleProof  (round-trip)
// ---------------------------------------------------------------------------

describe("Merkle proof round-trip", () => {
  const sizes = [1, 2, 3, 4, 5, 8, 16];

  for (const n of sizes) {
    it(`verifies all proofs for a ${n}-leaf tree`, () => {
      const leaves = makeLeaves(n);
      const tree = buildMerkleTree(leaves);

      for (let i = 0; i < n; i++) {
        const proof = generateMerkleProof(tree, i);
        const valid = verifyMerkleProof(
          proof.leafHash,
          proof.proofPath,
          proof.leafIndex,
          tree.root
        );
        expect(valid, `Leaf ${i} of ${n}-leaf tree should verify`).toBe(true);
      }
    });
  }

  it("rejects a tampered leaf hash", () => {
    const tree = buildMerkleTree(makeLeaves(4));
    const proof = generateMerkleProof(tree, 0);
    const tampered = crypto.randomBytes(32);
    expect(verifyMerkleProof(tampered, proof.proofPath, proof.leafIndex, tree.root)).toBe(false);
  });

  it("rejects a tampered proof path", () => {
    const tree = buildMerkleTree(makeLeaves(4));
    const proof = generateMerkleProof(tree, 1);
    const tamperedPath = proof.proofPath.map(() => crypto.randomBytes(32));
    expect(verifyMerkleProof(proof.leafHash, tamperedPath, proof.leafIndex, tree.root)).toBe(false);
  });

  it("rejects a wrong leaf index", () => {
    const tree = buildMerkleTree(makeLeaves(4));
    const proof = generateMerkleProof(tree, 0);
    // Using index 1 with leaf 0's hash and proof should fail
    expect(verifyMerkleProof(proof.leafHash, proof.proofPath, 1, tree.root)).toBe(false);
  });

  it("rejects a tampered root", () => {
    const tree = buildMerkleTree(makeLeaves(4));
    const proof = generateMerkleProof(tree, 2);
    const fakeRoot = crypto.randomBytes(32);
    expect(verifyMerkleProof(proof.leafHash, proof.proofPath, proof.leafIndex, fakeRoot)).toBe(false);
  });

  it("proof depth equals log2(next power of 2) of leaf count", () => {
    // 4-leaf tree → depth 2
    const tree4 = buildMerkleTree(makeLeaves(4));
    expect(generateMerkleProof(tree4, 0).proofPath.length).toBe(2);

    // 8-leaf tree → depth 3
    const tree8 = buildMerkleTree(makeLeaves(8));
    expect(generateMerkleProof(tree8, 0).proofPath.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Cross-check: TypeScript tree matches expected SHA-256 values
// ---------------------------------------------------------------------------

describe("SHA-256 correctness cross-check", () => {
  it("root of 2-leaf tree equals manual hash computation", () => {
    const leaves: ReserveLeaf[] = [
      { assetId: "USDC-Ethereum", amount: 1_000_000n, chain: "Ethereum", nonce: "n0" },
      { assetId: "USDC-Ethereum", amount: 2_000_000n, chain: "Ethereum", nonce: "n1" },
    ];

    const h0 = hashLeaf(leaves[0]!);
    const h1 = hashLeaf(leaves[1]!);
    const expectedRoot = crypto.createHash("sha256").update(h0).update(h1).digest();

    const tree = buildMerkleTree(leaves);
    expect(tree.root.equals(expectedRoot)).toBe(true);
  });

  it("manual proof verification matches verifyMerkleProof for 4-leaf tree", () => {
    const leaves = makeLeaves(4);
    const h = leaves.map(hashLeaf);

    const node01 = crypto.createHash("sha256").update(h[0]!).update(h[1]!).digest();
    const node23 = crypto.createHash("sha256").update(h[2]!).update(h[3]!).digest();
    const root = crypto.createHash("sha256").update(node01).update(node23).digest();

    // Proof for leaf index 2: siblings are [h3, node01]
    const validForIndex2 = verifyMerkleProof(h[2]!, [h[3]!, node01], 2, root);
    expect(validForIndex2).toBe(true);

    // Proof for leaf index 0: siblings are [h1, node23]
    const validForIndex0 = verifyMerkleProof(h[0]!, [h[1]!, node23], 0, root);
    expect(validForIndex0).toBe(true);
  });
});
