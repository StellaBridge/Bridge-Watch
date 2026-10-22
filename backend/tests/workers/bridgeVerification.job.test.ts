import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import { processBridgeVerification } from "../../src/workers/bridgeVerification.job.js";

const mocks = vi.hoisted(() => ({
  verifySupply: vi.fn(),
  recordBridgeVerification: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  },
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    BRIDGE_SUPPLY_MISMATCH_THRESHOLD: 1,
  },
  SUPPORTED_ASSETS: [
    { code: "XLM", issuer: "" },
    { code: "USDC", issuer: "GA...USDC" },
    { code: "EURC", issuer: "GA...EURC" },
    { code: "BTC", issuer: "GA...BTC" },
  ],
}));

vi.mock("../../src/services/bridge.service.js", () => ({
  BridgeService: vi.fn(() => ({
    verifySupply: mocks.verifySupply,
  })),
}));

vi.mock("../../src/services/metrics.service.js", () => ({
  getMetricsService: vi.fn(() => ({
    recordBridgeVerification: mocks.recordBridgeVerification,
  })),
}));

const job = { id: "bridge-verify-1" } as unknown as Job;

const healthyResult = (asset: string) => ({
  asset,
  isFlagged: false,
  errorStatus: null,
  mismatchPercentage: 0.02,
  match: true,
});

describe("bridgeVerification job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySupply.mockImplementation(async (code: string) => healthyResult(code));
  });

  it("verifies supply only for the bridged Phase 1 assets (USDC and EURC)", async () => {
    await processBridgeVerification(job);

    expect(mocks.verifySupply).toHaveBeenCalledTimes(2);
    expect(mocks.verifySupply).toHaveBeenNthCalledWith(1, "USDC");
    expect(mocks.verifySupply).toHaveBeenNthCalledWith(2, "EURC");
    expect(mocks.verifySupply).not.toHaveBeenCalledWith("XLM");
    expect(mocks.verifySupply).not.toHaveBeenCalledWith("BTC");
  });

  it("records a successful metric and an info log when supply matches", async () => {
    await processBridgeVerification(job);

    expect(mocks.recordBridgeVerification).toHaveBeenCalledWith(
      "stellar-bridge",
      "Stellar Bridge",
      "USDC",
      true,
      undefined
    );
    expect(mocks.recordBridgeVerification).toHaveBeenCalledWith(
      "stellar-bridge",
      "Stellar Bridge",
      "EURC",
      true,
      undefined
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  it("flags a supply mismatch as a critical error with the configured threshold", async () => {
    mocks.verifySupply.mockImplementation(async (code: string) => ({
      asset: code,
      isFlagged: code === "USDC",
      errorStatus: null,
      mismatchPercentage: 4.5,
      match: false,
    }));

    await processBridgeVerification(job);

    expect(mocks.recordBridgeVerification).toHaveBeenCalledWith(
      "stellar-bridge",
      "Stellar Bridge",
      "USDC",
      false,
      "supply_mismatch"
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ asset: "USDC" }),
      expect.stringContaining("CRITICAL: Bridge supply mismatch exceeds threshold of 1%")
    );
    // The mismatch on USDC must not stop EURC from being verified and recorded.
    expect(mocks.recordBridgeVerification).toHaveBeenCalledWith(
      "stellar-bridge",
      "Stellar Bridge",
      "EURC",
      true,
      undefined
    );
  });

  it("records the fetch error as a failed verification and logs a warning, not a critical error", async () => {
    mocks.verifySupply.mockImplementation(async (code: string) => ({
      asset: code,
      isFlagged: false,
      errorStatus: "horizon timeout",
      mismatchPercentage: 0,
      match: false,
    }));

    await processBridgeVerification(job);

    expect(mocks.recordBridgeVerification).toHaveBeenCalledWith(
      "stellar-bridge",
      "Stellar Bridge",
      "USDC",
      false,
      "horizon timeout"
    );
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      { asset: "USDC", error: "horizon timeout" },
      "Bridge verification skipped or failed due to fetch error."
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("records an exception metric and keeps verifying the remaining assets when one throws", async () => {
    const failure = new Error("unexpected parse error");
    mocks.verifySupply.mockImplementation(async (code: string) => {
      if (code === "USDC") throw failure;
      return healthyResult(code);
    });

    await expect(processBridgeVerification(job)).resolves.toBeUndefined();

    expect(mocks.recordBridgeVerification).toHaveBeenCalledWith(
      "stellar-bridge",
      "Stellar Bridge",
      "USDC",
      false,
      "exception"
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { error: failure, asset: "USDC" },
      "Unexpected failure during bridge verification job"
    );
    expect(mocks.verifySupply).toHaveBeenCalledWith("EURC");
    expect(mocks.recordBridgeVerification).toHaveBeenCalledWith(
      "stellar-bridge",
      "Stellar Bridge",
      "EURC",
      true,
      undefined
    );
  });

  it("completes without throwing when every verification fails", async () => {
    mocks.verifySupply.mockRejectedValue(new Error("rpc down"));

    await expect(processBridgeVerification(job)).resolves.toBeUndefined();

    expect(mocks.recordBridgeVerification).toHaveBeenCalledTimes(2);
    expect(mocks.recordBridgeVerification).toHaveBeenNthCalledWith(
      1,
      "stellar-bridge",
      "Stellar Bridge",
      "USDC",
      false,
      "exception"
    );
    expect(mocks.recordBridgeVerification).toHaveBeenNthCalledWith(
      2,
      "stellar-bridge",
      "Stellar Bridge",
      "EURC",
      false,
      "exception"
    );
  });
});
