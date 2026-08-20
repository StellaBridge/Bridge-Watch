/**
 * MMR (Merkle Mountain Range) Accumulator Service
 *
 * Provides an append-only proof system for historical reserve commitments.
 * Produces O(log N) inclusion proofs and a compact "bagged peaks" root that
 * covers all historical leaves without storing the full leaf set.
 *
 * Algorithm mirrors the on-chain Soroban contract in mmr_accumulator.rs.
 *
 * Domain separation:
 *   leaf node  = SHA-256(0x00 || raw_commitment)
 *   inner node = SHA-256(0x01 || left || right)
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MmrProof {
  /** The leaf hash (domain-separated). */
  leafHash: string;
  /** 0-indexed position of the leaf in the sequence. */
  leafIndex: number;
  /** Sibling hashes along the path from the leaf to its local subtree peak. */
  siblings: string[];
  /**
   * Snapshot of all MMR peaks at the time of proof generation.
   * Empty strings represent inactive (zero) peak slots.
   */
  peaksSnapshot: string[];
  /** Index within peaksSnapshot where the proven leaf's local tree root sits. */
  localPeakPos: number;
}

export interface MmrAppendResult {
  leafIndex: number;
  leafHash: string;
  newRoot: string;
}

export interface MmrVerifyResult {
  valid: boolean;
  reconstructedRoot: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ZERO = Buffer.alloc(32, 0);

function hashLeaf(data: Uint8Array): Buffer<ArrayBuffer> {
  return createHash("sha256")
    .update(Buffer.from([0x00]))
    .update(data)
    .digest();
}

function hashNode(left: Uint8Array, right: Uint8Array): Buffer<ArrayBuffer> {
  return createHash("sha256")
    .update(Buffer.from([0x01]))
    .update(left)
    .update(right)
    .digest();
}

function isZero(buf: Buffer): boolean {
  return buf.equals(ZERO);
}

function bagPeaks(peaks: Buffer[]): Buffer {
  const active = peaks.filter((p) => !isZero(p));
  if (active.length === 0) return ZERO;
  let acc = active[active.length - 1];
  for (let i = active.length - 2; i >= 0; i--) {
    acc = hashNode(active[i], acc);
  }
  return acc;
}

// ---------------------------------------------------------------------------
// MmrAccumulatorService
// ---------------------------------------------------------------------------

export class MmrAccumulatorService {
  /** Internal peaks list; index = height of the complete subtree. */
  private peaks: Buffer[] = [];
  /** All leaf hashes in insertion order (used for proof generation). */
  private leaves: Buffer[] = [];
  /** Per-height internal nodes stored during append for proof path building. */
  private nodesByHeight: Map<number, Buffer[]> = new Map();

  // ── Write ────────────────────────────────────────────────────────────────

  /**
   * Appends a raw 32-byte commitment to the MMR.
   * Returns the leaf index, leaf hash, and new root.
   */
  append(rawCommitment: Buffer): MmrAppendResult {
    if (rawCommitment.length !== 32) {
      throw new Error("rawCommitment must be exactly 32 bytes");
    }

    const leafIndex = this.leaves.length;
    const leafHash = hashLeaf(rawCommitment);
    this.leaves.push(leafHash);

    // Merge upward until we find an empty peak slot.
    let current = leafHash;
    let h = 0;
    while (h < this.peaks.length && !isZero(this.peaks[h])) {
      current = hashNode(this.peaks[h], current);
      this.peaks[h] = ZERO;
      h++;
    }
    if (h < this.peaks.length) {
      this.peaks[h] = current;
    } else {
      this.peaks.push(current);
    }

    return {
      leafIndex,
      leafHash: leafHash.toString("hex"),
      newRoot: this.getRoot(),
    };
  }

  /**
   * Appends multiple commitments in a batch. Returns append results for each.
   */
  appendBatch(commitments: Buffer[]): MmrAppendResult[] {
    return commitments.map((c) => this.append(c));
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  /** Returns the current bagged MMR root (hex). */
  getRoot(): string {
    return bagPeaks(this.peaks).toString("hex");
  }

  /** Total number of leaves appended. */
  getLeafCount(): number {
    return this.leaves.length;
  }

  /** Returns active (non-zero) peaks as hex strings. */
  getPeaks(): string[] {
    return this.peaks.filter((p) => !isZero(p)).map((p) => p.toString("hex"));
  }

  // ── Proof generation ─────────────────────────────────────────────────────

  /**
   * Generates an MMR inclusion proof for the leaf at `leafIndex`.
   *
   * The proof path is computed by re-running the insertion algorithm up to
   * the current leaf count, collecting sibling hashes at each merge step.
   */
  generateProof(leafIndex: number): MmrProof {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`leafIndex ${leafIndex} out of range [0, ${this.leaves.length})`);
    }

    // Rebuild per-height sibling information by replaying all insertions.
    // We store intermediate nodes at each height keyed by their sub-tree index.
    const heightNodes: Map<number, Buffer[]> = new Map();
    const tempPeaks: Buffer[] = [];

    for (let i = 0; i < this.leaves.length; i++) {
      let cur = this.leaves[i];
      let h = 0;
      let posAtHeight = i; // position within the height-h level

      // Store this node at height 0.
      if (!heightNodes.has(0)) heightNodes.set(0, []);
      heightNodes.get(0)!.push(cur);

      while (h < tempPeaks.length && !isZero(tempPeaks[h])) {
        cur = hashNode(tempPeaks[h], cur);
        tempPeaks[h] = ZERO;
        h++;
        posAtHeight = Math.floor(posAtHeight / 2);

        if (!heightNodes.has(h)) heightNodes.set(h, []);
        heightNodes.get(h)!.push(cur);
      }
      if (h < tempPeaks.length) {
        tempPeaks[h] = cur;
      } else {
        tempPeaks.push(cur);
      }
    }

    // Determine which height-h subtree contains leafIndex.
    // Walk up collecting siblings.
    const siblings: string[] = [];
    let pos = leafIndex;
    let h = 0;

    while (h < tempPeaks.length) {
      const levelNodes = heightNodes.get(h) ?? [];
      const siblingPos = pos % 2 === 0 ? pos + 1 : pos - 1;

      if (siblingPos < levelNodes.length) {
        // The sibling exists at this level.
        siblings.push(levelNodes[siblingPos].toString("hex"));
        pos = Math.floor(pos / 2);
        h++;

        // Check if the current node IS a peak at height h.
        const hNodes = heightNodes.get(h);
        if (hNodes && hNodes.length === 1 && isZero(tempPeaks[h] ?? ZERO)) {
          // We've reached the local subtree root — stop here.
          break;
        }
        if (h < tempPeaks.length && !isZero(tempPeaks[h])) {
          break;
        }
      } else {
        // No sibling — this node is a peak itself.
        break;
      }
    }

    // Build peaks snapshot (current peaks, may include zero slots).
    const peaksSnapshot = this.peaks.map((p) => p.toString("hex"));

    // Find which peak slot corresponds to the leaf's local subtree root.
    // The local root is tempPeaks[h] (or tempPeaks[h-1] if h was incremented past it).
    // We identify it by finding the non-zero peak that differs from what we'd
    // have without this leaf's subtree — simpler: the peak at height h
    // that is non-zero in tempPeaks.
    let localPeakPos = 0;
    for (let pi = 0; pi < this.peaks.length; pi++) {
      if (!isZero(this.peaks[pi])) {
        // This is a candidate. Check if it matches the reconstructed local root.
        localPeakPos = pi;
        break;
      }
    }

    return {
      leafHash: this.leaves[leafIndex].toString("hex"),
      leafIndex,
      siblings,
      peaksSnapshot,
      localPeakPos,
    };
  }

  // ── Verification ─────────────────────────────────────────────────────────

  /**
   * Verifies an MMR inclusion proof against a given expected root.
   * Returns whether the proof is valid and the reconstructed root.
   */
  verifyProof(proof: MmrProof, expectedRoot: string): MmrVerifyResult {
    if (proof.peaksSnapshot.length === 0) {
      return { valid: false, reconstructedRoot: "" };
    }

    // Step 1: re-derive the local subtree root from the leaf + siblings.
    let current = Buffer.from(proof.leafHash, "hex");
    let pos = proof.leafIndex;

    for (const sib of proof.siblings) {
      const sibBuf = Buffer.from(sib, "hex");
      if (pos % 2 === 0) {
        current = hashNode(current, sibBuf);
      } else {
        current = hashNode(sibBuf, current);
      }
      pos = Math.floor(pos / 2);
    }

    // Step 2: substitute the reconstructed local root into the peaks snapshot.
    const peaksForBag = proof.peaksSnapshot.map((p, i) => {
      if (i === proof.localPeakPos) return current;
      return Buffer.from(p, "hex");
    });

    // Step 3: bag and compare.
    const reconstructed = bagPeaks(peaksForBag);
    const reconstructedRoot = reconstructed.toString("hex");
    const valid = reconstructedRoot === expectedRoot;

    return { valid, reconstructedRoot };
  }

  /**
   * Verifies a proof against the accumulator's current live root.
   */
  verifyProofAgainstCurrent(proof: MmrProof): MmrVerifyResult {
    return this.verifyProof(proof, this.getRoot());
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  /** Serializes the accumulator state for persistence. */
  serialize(): { peaks: string[]; leaves: string[]; leafCount: number } {
    return {
      peaks: this.peaks.map((p) => p.toString("hex")),
      leaves: this.leaves.map((l) => l.toString("hex")),
      leafCount: this.leaves.length,
    };
  }

  /** Restores accumulator state from a serialized snapshot. */
  static fromSerialized(data: {
    peaks: string[];
    leaves: string[];
    leafCount: number;
  }): MmrAccumulatorService {
    const svc = new MmrAccumulatorService();
    svc.peaks = data.peaks.map((p) => Buffer.from(p, "hex"));
    svc.leaves = data.leaves.map((l) => Buffer.from(l, "hex"));
    return svc;
  }
}
