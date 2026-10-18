/**
 * RFC 6962 ("Certificate Transparency") binary Merkle tree.
 *
 * The transparency log commits to an ordered list of leaves. This module
 * provides the append-only primitives an offline verifier needs:
 *
 *   - the Merkle Tree Hash (root) of the first N leaves
 *   - inclusion proofs  (leaf i is committed by the size-N root)
 *   - consistency proofs (the size-M root is a prefix of the size-N root)
 *
 * Domain separation (RFC 6962 §2.1):
 *   empty tree = SHA-256("")
 *   leaf  hash = SHA-256(0x00 || leaf_data)
 *   inner hash = SHA-256(0x01 || left_hash || right_hash)
 *
 * Verification follows the iterative algorithm used by transparency-dev/merkle:
 * decompose the proof into `inner` (sibling on the path) and `border`
 * (left-spine) components, then chain. It is duplicated in
 * `backend/scripts/verify-evidence-bundle.mjs`.
 */

import { createHash } from "crypto";

const LEAF_PREFIX = Buffer.from([0x00]);
const INNER_PREFIX = Buffer.from([0x01]);

export function sha256(...parts: Buffer[]): Buffer {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}

export function hashLeaf(data: Buffer): Buffer {
  return sha256(LEAF_PREFIX, data);
}

export function hashChildren(left: Buffer, right: Buffer): Buffer {
  return sha256(INNER_PREFIX, left, right);
}

const toBuf = (h: Buffer | string): Buffer => (typeof h === "string" ? Buffer.from(h, "hex") : h);

/** Largest power of two strictly smaller than n (n >= 2). */
function splitPoint(n: number): number {
  let k = 1;
  while (k << 1 < n) k <<= 1;
  return k;
}

/**
 * Merkle Tree Hash of `leaves` (already leaf-level data, not yet hashed).
 * Returns the 32-byte root.
 */
export function merkleTreeHash(leaves: Buffer[]): Buffer {
  const n = leaves.length;
  if (n === 0) return sha256(Buffer.alloc(0));
  if (n === 1) return hashLeaf(leaves[0]);
  const k = splitPoint(n);
  return hashChildren(merkleTreeHash(leaves.slice(0, k)), merkleTreeHash(leaves.slice(k)));
}

export function merkleRootHex(leaves: Buffer[]): string {
  return merkleTreeHash(leaves).toString("hex");
}

/**
 * RFC 6962 §2.1.1 inclusion path for leaf `index` within the first `leaves`.
 * Ordered leaf-upward. Returns hex sibling hashes.
 */
export function inclusionProof(index: number, leaves: Buffer[]): string[] {
  const n = leaves.length;
  if (index < 0 || index >= n) throw new Error(`inclusionProof: index ${index} out of range [0, ${n})`);
  if (n === 1) return [];
  const k = splitPoint(n);
  if (index < k) {
    return [...inclusionProof(index, leaves.slice(0, k)), merkleTreeHash(leaves.slice(k)).toString("hex")];
  }
  return [...inclusionProof(index - k, leaves.slice(k)), merkleTreeHash(leaves.slice(0, k)).toString("hex")];
}

/**
 * RFC 6962 §2.1.2 consistency proof between tree sizes `m` and `n` (0 < m <= n).
 * Returns hex hashes.
 */
export function consistencyProof(m: number, leaves: Buffer[]): string[] {
  const n = leaves.length;
  if (m <= 0 || m > n) throw new Error(`consistencyProof: m ${m} out of range (0, ${n}]`);
  if (m === n) return [];
  return subProof(m, leaves, true).map((b) => b.toString("hex"));
}

function subProof(m: number, leaves: Buffer[], onPath: boolean): Buffer[] {
  const n = leaves.length;
  if (m === n) {
    // The old tree is exactly this subtree. Its root is only supplied when it is
    // not already derivable from the caller's context (i.e. not on the spine).
    return onPath ? [] : [merkleTreeHash(leaves)];
  }
  const k = splitPoint(n);
  if (m <= k) {
    return [...subProof(m, leaves.slice(0, k), onPath), merkleTreeHash(leaves.slice(k))];
  }
  return [...subProof(m - k, leaves.slice(k), false), merkleTreeHash(leaves.slice(0, k))];
}

// ── Variants over already-hashed leaves (the transparency log stores these) ─

/** Root of a tree whose leaf hashes are supplied directly (no re-hashing). */
export function rootFromLeafHashes(leafHashes: Array<Buffer | string>): Buffer {
  const hs = leafHashes.map(toBuf);
  const n = hs.length;
  if (n === 0) return sha256(Buffer.alloc(0));
  if (n === 1) return hs[0];
  const k = splitPoint(n);
  return hashChildren(rootFromLeafHashes(hs.slice(0, k)), rootFromLeafHashes(hs.slice(k)));
}

export function rootHexFromLeafHashes(leafHashes: Array<Buffer | string>): string {
  return rootFromLeafHashes(leafHashes).toString("hex");
}

export function inclusionProofFromLeafHashes(index: number, leafHashes: Array<Buffer | string>): string[] {
  const hs = leafHashes.map(toBuf);
  const n = hs.length;
  if (index < 0 || index >= n) throw new Error(`inclusionProof: index ${index} out of range [0, ${n})`);
  if (n === 1) return [];
  const k = splitPoint(n);
  if (index < k) {
    return [...inclusionProofFromLeafHashes(index, hs.slice(0, k)), rootFromLeafHashes(hs.slice(k)).toString("hex")];
  }
  return [...inclusionProofFromLeafHashes(index - k, hs.slice(k)), rootFromLeafHashes(hs.slice(0, k)).toString("hex")];
}

export function consistencyProofFromLeafHashes(m: number, leafHashes: Array<Buffer | string>): string[] {
  const hs = leafHashes.map(toBuf);
  const n = hs.length;
  if (m <= 0 || m > n) throw new Error(`consistencyProof: m ${m} out of range (0, ${n}]`);
  if (m === n) return [];
  return subProofLeafHashes(m, hs, true).map((b) => b.toString("hex"));
}

function subProofLeafHashes(m: number, hs: Buffer[], onPath: boolean): Buffer[] {
  const n = hs.length;
  if (m === n) return onPath ? [] : [rootFromLeafHashes(hs)];
  const k = splitPoint(n);
  if (m <= k) {
    return [...subProofLeafHashes(m, hs.slice(0, k), onPath), rootFromLeafHashes(hs.slice(k))];
  }
  return [...subProofLeafHashes(m - k, hs.slice(k), false), rootFromLeafHashes(hs.slice(0, k))];
}

// ── Verification (no tree, proof material only) ────────────────────────────

const bitLen = (x: number): number => (x === 0 ? 0 : Math.floor(Math.log2(x)) + 1);
const onesCount = (x: number): number => {
  let c = 0;
  while (x > 0) {
    c += x & 1;
    x = Math.floor(x / 2);
  }
  return c;
};
const trailingZeros = (x: number): number => {
  if (x === 0) return 0;
  let c = 0;
  while ((x & 1) === 0) {
    c += 1;
    x = Math.floor(x / 2);
  }
  return c;
};

/** [inner, border] decomposition of an inclusion proof for `index` in `size`. */
function decompose(index: number, size: number): [number, number] {
  const inner = bitLen(index ^ (size - 1));
  const border = onesCount(Math.floor(index / 2 ** inner));
  return [inner, border];
}

function chainInner(seed: Buffer, proof: Buffer[], index: number): Buffer {
  let acc = seed;
  for (let i = 0; i < proof.length; i++) {
    acc = (Math.floor(index / 2 ** i) & 1) === 0 ? hashChildren(acc, proof[i]) : hashChildren(proof[i], acc);
  }
  return acc;
}

function chainInnerRight(seed: Buffer, proof: Buffer[], index: number): Buffer {
  let acc = seed;
  for (let i = 0; i < proof.length; i++) {
    if ((Math.floor(index / 2 ** i) & 1) === 1) acc = hashChildren(proof[i], acc);
  }
  return acc;
}

function chainBorderRight(seed: Buffer, proof: Buffer[]): Buffer {
  let acc = seed;
  for (const h of proof) acc = hashChildren(h, acc);
  return acc;
}

/** Reconstruct the size-`treeSize` root implied by an inclusion proof. */
export function rootFromInclusionProof(
  leafHash: Buffer | string,
  index: number,
  treeSize: number,
  proof: Array<Buffer | string>,
): Buffer {
  if (index >= treeSize) throw new Error("rootFromInclusionProof: index >= treeSize");
  const path = proof.map(toBuf);
  const [inner, border] = decompose(index, treeSize);
  if (path.length !== inner + border) {
    throw new Error(`rootFromInclusionProof: wrong proof size ${path.length}, want ${inner + border}`);
  }
  let res = chainInner(toBuf(leafHash), path.slice(0, inner), index);
  res = chainBorderRight(res, path.slice(inner));
  return res;
}

export function verifyInclusionProof(
  leafHash: Buffer | string,
  index: number,
  treeSize: number,
  proof: Array<Buffer | string>,
  root: Buffer | string,
): boolean {
  try {
    return rootFromInclusionProof(leafHash, index, treeSize, proof).equals(toBuf(root));
  } catch {
    return false;
  }
}

export function verifyConsistencyProof(
  m: number,
  n: number,
  proof: Array<Buffer | string>,
  rootM: Buffer | string,
  rootN: Buffer | string,
): boolean {
  try {
    const r1 = toBuf(rootM);
    const r2 = toBuf(rootN);
    const path = proof.map(toBuf);

    if (m > n) return false;
    if (m === n) return path.length === 0 && r1.equals(r2);
    if (m === 0) return path.length === 0;
    if (path.length === 0) return false;

    const [decomposedInner, border] = decompose(m - 1, n);
    let inner = decomposedInner;
    const shift = trailingZeros(m);
    inner -= shift;

    let seed: Buffer;
    let start: number;
    if (m === 1 << shift) {
      seed = r1;
      start = 0;
    } else {
      seed = path[0];
      start = 1;
    }
    if (path.length !== start + inner + border) return false;

    const rest = path.slice(start);
    const mask = Math.floor((m - 1) / 2 ** shift);

    let h1 = chainInnerRight(seed, rest.slice(0, inner), mask);
    h1 = chainBorderRight(h1, rest.slice(inner));
    if (!h1.equals(r1)) return false;

    let h2 = chainInner(seed, rest.slice(0, inner), mask);
    h2 = chainBorderRight(h2, rest.slice(inner));
    return h2.equals(r2);
  } catch {
    return false;
  }
}
