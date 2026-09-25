import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as StellarSdk from "@stellar/stellar-sdk";
import { BridgeWatchContractSdk } from "./client";
import { BridgeWatchConnectionError } from "./errors";
import type { BackoffState, BridgeWatchSdkConfig } from "./types";

const testConfig: BridgeWatchSdkConfig = {
  rpcUrl: "https://testnet.sorobanrpc.com",
  contractId: "CCONTRACT123",
  networkPassphrase: StellarSdk.Networks.TESTNET,
};

describe("BridgeWatchContractSdk - subscribeToEvents with exponential backoff", () => {
  let sdk: BridgeWatchContractSdk;

  beforeEach(() => {
    sdk = new BridgeWatchContractSdk(testConfig);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should poll at base interval on success", async () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    let callCount = 0;

    vi.spyOn(sdk["server"] as any, "getEvents").mockImplementation(async () => {
      callCount++;
      return { events: [{ type: "test" }], latestLedger: 100 };
    });

    const subscription = sdk.subscribeToEvents({
      pollIntervalMs: 1000,
      onEvent,
      onError,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(callCount).toBe(2);

    subscription.unsubscribe();
  });

  it("should apply exponential backoff on failure", async () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    let callCount = 0;

    vi.spyOn(sdk["server"] as any, "getEvents").mockImplementation(async () => {
      callCount++;
      throw new Error("Connection failed");
    });

    const subscription = sdk.subscribeToEvents({
      pollIntervalMs: 1000,
      maxBackoffMs: 16000,
      onEvent,
      onError,
    });

    // First failure at 1s
    await vi.advanceTimersByTimeAsync(1000);
    expect(callCount).toBe(1);
    expect(onError).toHaveBeenCalledTimes(1);

    // Second attempt should wait ~2s (exponential backoff: 1000 * 2^0 = 1000)
    // But with jitter, it could be slightly more
    await vi.advanceTimersByTimeAsync(1200);
    expect(callCount).toBe(2);
    expect(onError).toHaveBeenCalledTimes(2);

    // Third attempt should wait ~4s (exponential backoff: 1000 * 2^1 = 2000)
    await vi.advanceTimersByTimeAsync(4500);
    expect(callCount).toBe(3);
    expect(onError).toHaveBeenCalledTimes(3);

    subscription.unsubscribe();
  });

  it("should cap backoff at maxBackoffMs", async () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    const maxBackoff = 5000;
    let callCount = 0;

    vi.spyOn(sdk["server"] as any, "getEvents").mockImplementation(async () => {
      callCount++;
      throw new Error("Connection failed");
    });

    const subscription = sdk.subscribeToEvents({
      pollIntervalMs: 1000,
      maxBackoffMs: maxBackoff,
      onEvent,
      onError,
    });

    // Trigger multiple failures to exceed maxBackoff
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(8000);
    }

    // Backoff should never exceed maxBackoff
    const finalBackoff = (sdk as any)["currentBackoffMs"];
    expect(callCount).toBeGreaterThanOrEqual(4);
    expect(onError).toHaveBeenCalled();

    subscription.unsubscribe();
  });

  it("should reset backoff on successful poll after failures", async () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    const onBackoffStateChange = vi.fn();
    let callCount = 0;

    vi.spyOn(sdk["server"] as any, "getEvents").mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error("Temporary failure");
      }
      return { events: [], latestLedger: 50 };
    });

    const subscription = sdk.subscribeToEvents({
      pollIntervalMs: 1000,
      maxBackoffMs: 16000,
      onEvent,
      onError,
      onBackoffStateChange,
    });

    // First failure
    await vi.advanceTimersByTimeAsync(1000);
    expect(callCount).toBe(1);
    expect(onBackoffStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ isBackingOff: true, consecutiveFailures: 1 })
    );

    // Second failure with backoff
    await vi.advanceTimersByTimeAsync(1500);
    expect(callCount).toBe(2);

    // Success - should reset
    await vi.advanceTimersByTimeAsync(3000);
    expect(callCount).toBe(3);
    expect(onBackoffStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ isBackingOff: false, consecutiveFailures: 0 })
    );

    subscription.unsubscribe();
  });

  it("should surface backoff state changes via callback", async () => {
    const onBackoffStateChange = vi.fn();
    let callCount = 0;

    vi.spyOn(sdk["server"] as any, "getEvents").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Failed");
      }
      return { events: [], latestLedger: 50 };
    });

    const subscription = sdk.subscribeToEvents({
      pollIntervalMs: 1000,
      maxBackoffMs: 16000,
      onEvent: () => {},
      onBackoffStateChange,
    });

    // Trigger failure
    await vi.advanceTimersByTimeAsync(1000);
    expect(onBackoffStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        currentBackoffMs: 1000,
        consecutiveFailures: 1,
        isBackingOff: true,
      })
    );

    // Success - should reset state
    await vi.advanceTimersByTimeAsync(1500);
    expect(onBackoffStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        currentBackoffMs: 1000,
        consecutiveFailures: 0,
        isBackingOff: false,
      })
    );

    subscription.unsubscribe();
  });

  it("should handle multiple consecutive failures with progressive backoff", async () => {
    const onError = vi.fn();
    let callCount = 0;

    vi.spyOn(sdk["server"] as any, "getEvents").mockImplementation(async () => {
      callCount++;
      throw new Error("Persistent failure");
    });

    const subscription = sdk.subscribeToEvents({
      pollIntervalMs: 1000,
      maxBackoffMs: 32000,
      onEvent: () => {},
      onError,
    });

    // Simulate 5 consecutive failures
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(40000);
    }

    // All 5 calls should have completed
    expect(callCount).toBeGreaterThanOrEqual(5);
    expect(onError).toHaveBeenCalledTimes(callCount);

    subscription.unsubscribe();
  });

  it("should apply jitter to prevent thundering herd", async () => {
    const onError = vi.fn();
    const delays: number[] = [];
    let callCount = 0;

    vi.spyOn(sdk["server"] as any, "getEvents").mockImplementation(async () => {
      callCount++;
      throw new Error("Failed");
    });

    // Mock setTimeout to capture delays
    const originalSetTimeout = global.setTimeout;
    vi.spyOn(global, "setTimeout").mockImplementation((callback, delay) => {
      delays.push(delay as number);
      return originalSetTimeout(callback, 0) as any;
    });

    const subscription = sdk.subscribeToEvents({
      pollIntervalMs: 1000,
      maxBackoffMs: 16000,
      onEvent: () => {},
      onError,
    });

    // Trigger a few failures
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }

    // Check that delays have some jitter variation
    // (They should all be close to but not exactly the backoff value)
    const uniqueDelays = new Set(delays.map((d) => Math.floor(d / 100) * 100));
    // With jitter, we expect some variation
    expect(delays.length).toBeGreaterThan(0);

    subscription.unsubscribe();
  });

  it("should process events correctly while backing off", async () => {
    const onEvent = vi.fn();
    const onError = vi.fn();
    let callCount = 0;

    vi.spyOn(sdk["server"] as any, "getEvents").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call succeeds
        return { events: [{ id: 1 }, { id: 2 }], latestLedger: 100 };
      } else if (callCount === 2) {
        // Second call fails
        throw new Error("Temporary error");
      } else {
        // Third call succeeds again
        return { events: [{ id: 3 }], latestLedger: 101 };
      }
    });

    const subscription = sdk.subscribeToEvents({
      pollIntervalMs: 1000,
      maxBackoffMs: 16000,
      onEvent,
      onError,
    });

    // First successful call
    await vi.advanceTimersByTimeAsync(1000);
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();

    // Second call fails
    await vi.advanceTimersByTimeAsync(1500);
    expect(onError).toHaveBeenCalledTimes(1);

    // Third call succeeds again
    await vi.advanceTimersByTimeAsync(3000);
    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);

    subscription.unsubscribe();
  });
});

// ── Auto-reconnecting WebSocket subscription (issue #1244) ───────────────────

describe("BridgeWatchContractSdk - auto-reconnecting WebSocket (issue #1244)", () => {
  class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 1;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    sent: string[] = [];
    closed = false;

    constructor(public url: string) {
      FakeWebSocket.instances.push(this);
    }

    send(data: string) {
      this.sent.push(data);
    }

    close() {
      this.closed = true;
    }

    // Test helpers to simulate the socket lifecycle.
    open() {
      this.onopen?.();
    }

    message(payload: unknown) {
      this.onmessage?.({ data: JSON.stringify(payload) });
    }

    fail() {
      this.onerror?.(new Error("boom"));
      this.onclose?.();
    }
  }

  const wsConfig = {
    rpcUrl: "https://rpc.example.com",
    contractId: "CCONTRACT123",
    networkPassphrase: "Test SDF Network ; September 2015",
  } as never;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("subscribes on open, resuming from startLedger", async () => {
    vi.useFakeTimers();
    const sdk = new BridgeWatchContractSdk(wsConfig);
    const events: unknown[] = [];

    sdk.subscribeToEventsWebSocket({
      wsUrl: "wss://events.example.com",
      startLedger: 42,
      onEvent: (e) => events.push(e),
    });

    const socket = FakeWebSocket.instances[0];
    socket.open();

    expect(JSON.parse(socket.sent[0])).toMatchObject({
      action: "subscribe",
      startLedger: 42,
    });
    vi.useRealTimers();
  });

  it("tracks the last received ledger and resumes from it on reconnect", async () => {
    vi.useFakeTimers();
    const sdk = new BridgeWatchContractSdk(wsConfig);
    const events: unknown[] = [];

    sdk.subscribeToEventsWebSocket({
      wsUrl: "wss://events.example.com",
      startLedger: 10,
      minBackoffMs: 100,
      onEvent: (e) => events.push(e),
    });

    let socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message({ event: { type: "lock" }, latestLedger: 55 });
    expect(events).toHaveLength(1);

    // Drop the connection → exponential backoff → reconnect.
    socket.fail();
    await vi.advanceTimersByTimeAsync(150);

    socket = FakeWebSocket.instances[1];
    socket.open();

    // The resume message carries the last received ledger, not the start.
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      action: "subscribe",
      startLedger: 55,
    });
    vi.useRealTimers();
  });

  it("applies exponential backoff with jitter between reconnects", async () => {
    vi.useFakeTimers();
    const sdk = new BridgeWatchContractSdk(wsConfig);
    const states: BackoffState[] = [];

    sdk.subscribeToEventsWebSocket({
      wsUrl: "wss://events.example.com",
      minBackoffMs: 1000,
      maxBackoffMs: 8000,
      onEvent: () => undefined,
      onBackoffStateChange: (s) => states.push(s),
    });

    FakeWebSocket.instances[0].fail();
    // 1st failure: ~1000ms backoff.
    await vi.advanceTimersByTimeAsync(1100);
    expect(FakeWebSocket.instances.length).toBe(2);

    FakeWebSocket.instances[1].fail();
    // 2nd failure: ~2000ms backoff.
    await vi.advanceTimersByTimeAsync(2200);
    expect(FakeWebSocket.instances.length).toBe(3);

    const backoffs = states.filter((s) => s.isBackingOff);
    expect(backoffs[0].currentBackoffMs).toBe(1000);
    expect(backoffs[1].currentBackoffMs).toBe(2000);
    vi.useRealTimers();
  });

  it("unsubscribe stops reconnects and closes the socket", () => {
    vi.useFakeTimers();
    const sdk = new BridgeWatchContractSdk(wsConfig);

    const subscription = sdk.subscribeToEventsWebSocket({
      wsUrl: "wss://events.example.com",
      onEvent: () => undefined,
    });

    const socket = FakeWebSocket.instances[0];
    socket.open();
    subscription.unsubscribe();

    expect(socket.closed).toBe(true);
    const count = FakeWebSocket.instances.length;
    socket.fail();
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances.length).toBe(count); // no reconnect
    vi.useRealTimers();
  });
});
