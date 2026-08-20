import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout, RpcTimeoutError } from "../../../../src/services/ethereum/failover/timeout.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolves with the task result before the deadline", async () => {
    const result = await withTimeout(async () => 42, 1000);
    expect(result).toBe(42);
  });

  it("rejects with an RpcTimeoutError when the deadline elapses", async () => {
    vi.useFakeTimers();
    let caught: unknown;
    const result = withTimeout(() => new Promise<never>(() => {}), 500);
    result.catch((error) => {
      caught = error;
    });

    await vi.advanceTimersByTimeAsync(501);

    expect(caught).toBeInstanceOf(RpcTimeoutError);
    expect((caught as Error).message).toContain("500");
  });

  it("does not leak its timer when the task settles first", async () => {
    vi.useFakeTimers();
    const result = withTimeout(async () => "ok", 1000);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not leak its timer when the task times out", async () => {
    vi.useFakeTimers();
    const result = withTimeout(() => new Promise<never>(() => {}), 500);
    result.catch(() => {});

    await vi.advanceTimersByTimeAsync(501);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts the underlying task signal on timeout", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const result = withTimeout((signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise<never>(() => {});
    }, 500);
    result.catch(() => {});

    await vi.advanceTimersByTimeAsync(501);

    expect(aborted).toBe(true);
  });

  it("invokes the onTimeout callback exactly once", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const result = withTimeout(() => new Promise<never>(() => {}), 500, { onTimeout });
    result.catch(() => {});

    await vi.advanceTimersByTimeAsync(501);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("ignores a late-settling task without surfacing an unhandled rejection", async () => {
    vi.useFakeTimers();
    let rejectLate: (error: Error) => void;
    const late = new Promise<never>((_, reject) => {
      rejectLate = reject;
    });
    let caught: unknown;
    const result = withTimeout(() => late, 500);
    result.catch((error) => {
      caught = error;
    });

    await vi.advanceTimersByTimeAsync(501);
    expect(caught).toBeInstanceOf(RpcTimeoutError);

    // The task settles after the timeout already won; its rejection is
    // swallowed internally rather than surfacing as an unhandled rejection.
    rejectLate!(new Error("too slow"));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});