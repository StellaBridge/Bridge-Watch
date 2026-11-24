import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../test/utils";
import CrossChainVerification from "./CrossChainVerification";

const mocks = vi.hoisted(() => ({
  getCrossChainVerifications: vi.fn().mockResolvedValue({
    count: 1, verified: 1, mismatches: 0, errors: 0,
    results: [{ bridgeId: "bridge-1", bridgeName: "StellarX", sourceChain: "ethereum", verifiedAt: "2026-01-01T00:00:00Z", ethereum: { blockNumber: 42, lockedAmount: "12", formattedAmount: "12", isPaused: false, timestamp: 1 }, stellar: { supply: 12, assetCode: "USDC", issuer: "GISSUER" }, merkleProofValid: true, proofDepth: 3, proofLeafHash: "abc", leafCount: 8, latestCommitmentSequence: 7, stateConsistent: true, mismatchPct: 0.01, mismatchThreshold: 1, status: "verified", cacheHit: false, freshnessSeconds: 0 }],
  }),
  triggerCrossChainVerification: vi.fn().mockResolvedValue({}),
}));
vi.mock("../services/api", () => mocks);

describe("CrossChainVerification", () => {
  it("renders the summary and expands a verification result", async () => {
    render(<CrossChainVerification />);
    expect(await screen.findByRole("heading", { name: "Cross-Chain State Verification" })).toBeInTheDocument();
    expect(await screen.findByText("StellarX")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /StellarX/ }));
    expect(screen.getByText("Reserve Commitment")).toBeInTheDocument();
    expect(screen.getAllByText("Valid").length).toBeGreaterThan(0);
  });

  it("can refresh and request a re-verification", async () => {
    render(<CrossChainVerification />);
    await screen.findByText("StellarX");
    fireEvent.click(screen.getByRole("button", { name: "Refresh all" }));
    expect(mocks.getCrossChainVerifications).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /StellarX/ }));
    fireEvent.click(screen.getByRole("button", { name: "Re-verify" }));
    await waitFor(() => expect(mocks.triggerCrossChainVerification).toHaveBeenCalledWith("bridge-1"));
  });
});
