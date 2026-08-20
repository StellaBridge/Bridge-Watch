import { describe, it, expect } from "vitest";
import { RpcCallError, classifyRpcError, toRpcError } from "../../../../src/services/ethereum/failover/errors.js";

describe("classifyRpcError", () => {
  it("returns the kind of an existing RpcCallError unchanged", () => {
    const err = new RpcCallError("timeout", "slow");
    expect(classifyRpcError(err)).toBe("timeout");
  });

  it("maps ethers.js server errors to transport failures", () => {
    const err = new Error("server error");
    (err as any).code = "SERVER_ERROR";
    expect(classifyRpcError(err)).toBe("transport");
  });

  it("maps ethers.js timeout codes to timeouts", () => {
    const err = new Error("operation timed out");
    (err as any).code = "TIMEOUT";
    expect(classifyRpcError(err)).toBe("timeout");
  });

  it("maps ethers.js call exceptions to application errors", () => {
    const err = new Error("execution reverted");
    (err as any).code = "CALL_EXCEPTION";
    expect(classifyRpcError(err)).toBe("application");
  });

  it("recognizes rate-limit messages", () => {
    expect(classifyRpcError(new Error("HTTP 429 too many requests"))).toBe("rate_limit");
    expect(classifyRpcError(new Error("rate limit exceeded"))).toBe("rate_limit");
  });

  it("recognizes timeout messages without a typed error", () => {
    expect(classifyRpcError(new Error("request timed out"))).toBe("timeout");
  });

  it("falls back to the supplied kind for unrecognized errors", () => {
    expect(classifyRpcError(new Error("weird error"), "invalid_data")).toBe("invalid_data");
  });
});

describe("toRpcError", () => {
  it("wraps an arbitrary error with the classified kind and cause", () => {
    const cause = new Error("socket hang up");
    const wrapped = toRpcError(cause, "transport", 1);
    expect(wrapped).toBeInstanceOf(RpcCallError);
    expect(wrapped.kind).toBe("transport");
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.providerIndex).toBe(1);
  });

  it("reuses existing RpcCallErrors and attaches the provider index", () => {
    const original = new RpcCallError("rate_limit", "slow down");
    const wrapped = toRpcError(original, "transport", 3);
    expect(wrapped).toBe(original);
    expect(wrapped.providerIndex).toBe(3);
  });

  it("marks application errors as non-retryable", () => {
    const wrapped = toRpcError(new Error("reverted"), "application");
    expect(wrapped.retryable).toBe(false);
  });
});