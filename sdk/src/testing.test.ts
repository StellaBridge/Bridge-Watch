import { describe, expect, it, vi } from "vitest";
import {
  createMockEvent,
  createMockScValString,
  createMockScValU64,
  createMockWatchSubscription,
  MockBridgeWatchClient,
  SCENARIO_PRESETS,
  createDeterministicFixture,
} from "./testing";

describe("SDK testing helpers", () => {
  it("creates mock string ScVal", () => {
    const value = createMockScValString("USDC");
    expect(value.switch().name).toContain("scv");
  });

  it("creates mock numeric ScVal", () => {
    const value = createMockScValU64(42);
    expect(value).toBeTruthy();
  });

  it("creates mock events", () => {
    const event = createMockEvent({ contractId: "abc" });
    expect(event.contractId).toBe("abc");
    expect(event.ledger).toBe(1000);
  });

  it("creates unsubscribe test stub", () => {
    const subscription = createMockWatchSubscription();
    expect(subscription.isClosed()).toBe(false);
    subscription.unsubscribe();
    expect(subscription.isClosed()).toBe(true);
  });
});

describe("MockBridgeWatchClient sandbox harness", () => {
  it("initializes with default HEALTHY scenario and connects", async () => {
    const client = new MockBridgeWatchClient();
    expect(client.getScenario()).toBe("HEALTHY");

    const health = await client.connect();
    expect(health.connected).toBe(true);
    expect(health.latestLedger).toBe(1000);

    const checkHealth = await client.getHealth();
    expect(checkHealth.connected).toBe(true);

    client.disconnect();
    const disconnectedHealth = await client.getHealth();
    expect(disconnectedHealth.connected).toBe(false);
  });

  it("switches scenarios and provides deterministic fixtures", () => {
    const client = new MockBridgeWatchClient({ scenario: "DEGRADED" });
    expect(client.getScenario()).toBe("DEGRADED");
    expect(client.getFixtureData().mismatchPercentage).toBe(0.5);

    client.setScenario("CRITICAL_MISMATCH");
    expect(client.getScenario()).toBe("CRITICAL_MISMATCH");
    expect(client.getFixtureData().status).toBe("down");
    expect(client.getFixtureData().mismatchPercentage).toBe(8.0);

    const fixture = createDeterministicFixture("EMERGENCY_PAUSED");
    expect(fixture.isPaused).toBe(true);
  });

  it("advances ledgers and increments sequence on transaction submission", async () => {
    const client = new MockBridgeWatchClient({ initialLedger: 5000 });
    expect(await client.getLatestLedger()).toBe(5000);

    client.advanceLedger(10);
    expect(await client.getLatestLedger()).toBe(5010);

    const sendRes = await client.sendTransaction({});
    expect(sendRes.status).toBe("SUCCESS");
    expect(await client.getLatestLedger()).toBe(5011);
  });

  it("rejects transactions when in EMERGENCY_PAUSED scenario", async () => {
    const client = new MockBridgeWatchClient({ scenario: "EMERGENCY_PAUSED" });

    await expect(client.simulateTransaction({})).rejects.toThrow(/paused/i);
    await expect(client.sendTransaction({})).rejects.toThrow(/paused/i);
    await expect(client.queryMethod({ method: "transfer" })).rejects.toThrow(/paused/i);
  });

  it("supports mock event streaming and emits custom events", async () => {
    const client = new MockBridgeWatchClient();
    const onEvent = vi.fn();

    const sub = client.subscribeToEvents({ onEvent });

    client.emitEvent({ type: "bridge_settlement", amount: "10000" });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "bridge_settlement", amount: "10000" })
    );

    sub.unsubscribe();
  });

  it("supports compatibility endpoints in offline sandbox", async () => {
    const client = new MockBridgeWatchClient();
    const contract = await client.getApiContract();
    expect(contract.endpoints).toContain("/api/v1/bridges");

    const capabilities = await client.getApiCapabilities();
    expect(capabilities.features).toContain("mock-sandbox");

    const versions = await client.getApiVersions();
    expect(versions.current).toBe("1.0.0");
  });
});
