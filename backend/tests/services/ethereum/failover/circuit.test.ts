import { describe, it, expect } from "vitest";
import { ProviderCircuit } from "../../../../src/services/ethereum/failover/circuit.js";

const CONFIG = {
  failureThreshold: 3,
  unhealthThreshold: 6,
  cooldownMs: 10_000,
  healthDecayMs: 60_000,
  lagFailureWeight: 1,
};

function makeCircuit(index = 0, config = CONFIG) {
  let now = 1_000_000;
  const circuit = new ProviderCircuit(index, config, () => now);
  return { circuit, advance: (ms: number) => (now += ms), now: () => now };
}

describe("ProviderCircuit", () => {
  it("starts healthy, ready, with full recovery headroom", () => {
    const { circuit } = makeCircuit();
    const snapshot = circuit.getSnapshot();
    expect(snapshot.state).toBe("healthy");
    expect(snapshot.ready).toBe(true);
    expect(snapshot.reason).toBe("ok");
    expect(snapshot.failuresToRecover).toBe(3);
    expect(snapshot.recoveryEtaMs).toBe(0);
  });

  it("degrades after a single failure and tracks recovery criteria", () => {
    const { circuit } = makeCircuit();
    const snapshot = circuit.recordFailure("transport");
    expect(snapshot.state).toBe("degraded");
    expect(snapshot.ready).toBe(true);
    expect(snapshot.reason).toBe("transport_error");
    expect(snapshot.consecutiveFailures).toBe(1);
    expect(snapshot.failuresToRecover).toBe(2);
  });

  it("trips a cooldown once the failure threshold is reached", () => {
    const { circuit, now } = makeCircuit();
    circuit.recordFailure("timeout");
    circuit.recordFailure("timeout");
    const snapshot = circuit.recordFailure("timeout");

    expect(snapshot.state).toBe("cooling_down");
    expect(snapshot.ready).toBe(false);
    expect(snapshot.cooldownUntil).toBe(now() + 10_000);
    expect(snapshot.recoveryEtaMs).toBe(10_000);
    expect(circuit.canServe()).toBe(false);
  });

  it("recovers to a degraded, eligible state once the cooldown elapses", () => {
    const { circuit, advance } = makeCircuit();
    circuit.recordFailure("transport");
    circuit.recordFailure("transport");
    circuit.recordFailure("transport");
    advance(10_001);

    const snapshot = circuit.getSnapshot();
    expect(snapshot.state).toBe("degraded");
    expect(snapshot.ready).toBe(true);
    expect(snapshot.reason).toBe("cooldown_elapsed");
    expect(snapshot.recoveryEtaMs).toBe(0);
  });

  it("becomes unhealthy at the unhealth threshold", () => {
    const { circuit, advance } = makeCircuit();
    for (let i = 0; i < 6; i++) circuit.recordFailure("timeout");
    advance(20_000); // cooldown elapsed but failures remain high

    const snapshot = circuit.getSnapshot();
    expect(snapshot.state).toBe("unhealthy");
    expect(snapshot.ready).toBe(false);
  });

  it("a successful call resets all accumulated penalty", () => {
    const { circuit } = makeCircuit();
    circuit.recordFailure("timeout");
    circuit.recordFailure("timeout");
    circuit.recordFailure("timeout");
    const snapshot = circuit.recordSuccess();

    expect(snapshot.state).toBe("healthy");
    expect(snapshot.ready).toBe(true);
    expect(snapshot.consecutiveFailures).toBe(0);
    expect(snapshot.failuresToRecover).toBe(3);
  });

  it("treats provider lag as an immediate cooldown even on the first failure", () => {
    const { circuit } = makeCircuit();
    const snapshot = circuit.recordFailure("provider_lag");
    expect(snapshot.state).toBe("cooling_down");
    expect(snapshot.ready).toBe(false);
    expect(snapshot.reason).toBe("provider_lag");
  });

  it("treats invalid data as an immediate cooldown", () => {
    const { circuit } = makeCircuit();
    const snapshot = circuit.recordFailure("invalid_data");
    expect(snapshot.state).toBe("cooling_down");
    expect(snapshot.reason).toBe("invalid_data");
  });

  it("ignores application errors - they are not provider health signals", () => {
    const { circuit } = makeCircuit();
    const snapshot = circuit.recordFailure("application");
    expect(snapshot.state).toBe("healthy");
    expect(snapshot.ready).toBe(true);
    expect(snapshot.consecutiveFailures).toBe(0);
  });

  it("decays a healthy provider to degraded after idle time", () => {
    const { circuit, advance } = makeCircuit();
    circuit.recordSuccess();
    advance(60_001);

    const snapshot = circuit.getSnapshot();
    expect(snapshot.state).toBe("degraded");
    expect(snapshot.reason).toBe("health_decay");
    expect(snapshot.ready).toBe(true);
  });

  it("a fresh success after decay restores full health", () => {
    const { circuit, advance } = makeCircuit();
    circuit.recordSuccess();
    advance(60_001);
    expect(circuit.getSnapshot().state).toBe("degraded");

    const snapshot = circuit.recordSuccess();
    expect(snapshot.state).toBe("healthy");
    expect(snapshot.reason).toBe("ok");
  });
});