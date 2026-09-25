/**
 * Tests for the EVM Reserve Attestation Worker (#1243)
 *
 * These tests cover the pure TypeScript logic (chain normalization, reserve
 * ratio computation, mismatch detection, leaf building, attestation refs)
 * without requiring a running Redis, database, or EVM RPC node.
 */

import { describe, it, expect } from "vitest";
import {
  computeReserveRatio,
  isReserveMismatch,
  toSupportedChainId,
  toReserveLeaf,
  buildAttestationRef,
  RESERVE_RATIO_THRESHOLD,
} from "../../src/workers/evmReserveAttestation.worker.js";

describe("toSupportedChainId", () => {
  it("accepts chains configured in the multi-provider EVM RPC client", () => {
    expect(toSupportedChainId("ethereum")).toBe("ethereum");
    expect(toSupportedChainId("polygon")).toBe("polygon");
    expect(toSupportedChainId("base")).toBe("base");
  });

  it("normalizes casing and whitespace", () => {
    expect(toSupportedChainId(" Ethereum ")).toBe("ethereum");
    expect(toSupportedChainId("BASE")).toBe("base");
  });

  it("returns null for chains without RPC provider config", () => {
    expect(toSupportedChainId("arbitrum")).toBeNull();
    expect(toSupportedChainId("solana")).toBeNull();
    expect(toSupportedChainId("")).toBeNull();
  });
});

describe("computeReserveRatio", () => {
  it("returns 1 when on-chain reserves exactly match committed reserves", () => {
    expect(computeReserveRatio(1_000_000n, 1_000_000n)).toBe(1);
  });

  it("drops below 1 when on-chain reserves are under-committed", () => {
    expect(computeReserveRatio(900_000n, 1_000_000n)).toBeCloseTo(0.9);
  });

  it("rises above 1 when reserves are over-collateralized", () => {
    expect(computeReserveRatio(1_500_000n, 1_000_000n)).toBeCloseTo(1.5);
  });

  it("returns null when no committed reserves exist", () => {
    expect(computeReserveRatio(1_000_000n, null)).toBeNull();
  });

  it("returns null for a zero committed total to avoid dividing by zero", () => {
    expect(computeReserveRatio(1_000_000n, 0n)).toBeNull();
  });
});

describe("isReserveMismatch", () => {
  it("flags ratios strictly below the 1.00 threshold", () => {
    expect(isReserveMismatch(0.99)).toBe(true);
    expect(isReserveMismatch(0.5)).toBe(true);
  });

  it("does not flag ratios at or above the threshold", () => {
    expect(isReserveMismatch(1.0)).toBe(false);
    expect(isReserveMismatch(1.25)).toBe(false);
  });

  it("does not flag an unknown ratio", () => {
    expect(isReserveMismatch(null)).toBe(false);
  });

  it("exposes the threshold constant at 1.0", () => {
    expect(RESERVE_RATIO_THRESHOLD).toBe(1.0);
  });
});

describe("toReserveLeaf", () => {
  it("scales fractional balances into integer micro-units", () => {
    const leaf = toReserveLeaf({ assetSymbol: "USDC", chainId: "ethereum", balance: 12.5 });
    expect(leaf.amount).toBe(12_500_000n);
    expect(leaf.assetId).toBe("USDC-ethereum");
    expect(leaf.chain).toBe("ethereum");
  });

  it("produces a unique nonce per leaf", () => {
    const a = toReserveLeaf({ assetSymbol: "USDC", chainId: "base", balance: 1 });
    const b = toReserveLeaf({ assetSymbol: "USDC", chainId: "base", balance: 1 });
    expect(a.nonce).not.toBe(b.nonce);
  });
});

describe("buildAttestationRef", () => {
  it("prefixes the chain and truncates the Merkle root", () => {
    const root = "a".repeat(64);
    expect(buildAttestationRef("ethereum", root)).toBe(`evm:ethereum:${"a".repeat(16)}`);
  });
});
