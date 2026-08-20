import { describe, it, expect } from "vitest";
import {
  ChainCircuit,
  type ChainCircuitEvent,
  type ChainCircuitConfig,
} from "../../../../src/services/ethereum/failover/chainCircuit.js";

interface FakeProvider {
  name: string;
  calls: number;
  getBlockNumber(): number;
}

function makeProvider(name: string, impl: () => number): FakeProvider {
  return {
    name,
    calls: 0,
    getBlockNumber() {
      this.calls += 1;
      return impl();
    },
  };
}

const transportError = () => {
  throw new Error("ECONNREFUSED");
};

function makeCircuit(
  providers: FakeProvider[],
  now = () => 0,
  onEvent?: (e: ChainCircuitEvent) => void,
  config?: Partial<ChainCircuitConfig>
) {
  return new ChainCircuit<FakeProvider>(providers, { now, onEvent, config });
}

describe("ChainCircuit - deterministic failover", () => {
  it("starts with the lowest-index provider active", () => {
    const circuit = makeCircuit([makeProvider("a", () => 1), makeProvider("b", () => 2)]);
    expect(circuit.getActiveIndex()).toBe(0);
    expect(circuit.snapshot().reason).toBe("ok");
  });

  it("fails over to the alternate and converges on it after a partition", async () => {
    const events: ChainCircuitEvent[] = [];
    const a = makeProvider("a", transportError);
    const b = makeProvider("b", () => 200);
    const circuit = makeCircuit([a, b], () => 0, (e) => events.push(e), { failureThreshold: 1 });

    // First call trips A; B wins via hedging and becomes active.
    await expect(
      circuit.execute((p) => p.getBlockNumber(), { hedge: true, blockHeight: (h) => h })
    ).resolves.toBe(200);

    expect(circuit.getActiveIndex()).toBe(1);
    expect(circuit.snapshot().providers[0].state).toBe("cooling_down");
    expect(circuit.snapshot().providers[0].reason).toBe("transport_error");
    expect(events.some((e) => e.type === "failover")).toBe(true);

    // Subsequent reads are served entirely by the healthy provider.
    await expect(
      circuit.execute((p) => p.getBlockNumber(), { hedge: true, blockHeight: (h) => h })
    ).resolves.toBe(200);
    expect(circuit.getActiveIndex()).toBe(1);
    expect(circuit.getLastAcceptedBlockHeight()).toBe(200);
  });

  it("keeps the active provider sticky when every provider is down", async () => {
    const events: ChainCircuitEvent[] = [];
    const a = makeProvider("a", transportError);
    const b = makeProvider("b", transportError);
    const circuit = makeCircuit([a, b], () => 0, (e) => events.push(e), { failureThreshold: 1 });

    await expect(circuit.execute((p) => p.getBlockNumber())).rejects.toThrow();
    await expect(circuit.execute((p) => p.getBlockNumber())).rejects.toThrow();
    expect(events.some((e) => e.type === "all_providers_down")).toBe(true);
    // No oscillation: the last active index is kept sticky while all are down.
    expect(circuit.getActiveIndex()).toBe(1);
  });
});

describe("ChainCircuit - header monotonicity", () => {
  it("never regresses the accepted block height", () => {
    const circuit = makeCircuit([makeProvider("a", () => 1)]);
    const lease = circuit.select();

    expect(circuit.acceptBlockHeight(lease, 100)).toBe(true);
    expect(circuit.getLastAcceptedBlockHeight()).toBe(100);

    // A current lease reporting a lower height is flagged as lag and refused.
    expect(circuit.acceptBlockHeight(lease, 50)).toBe(false);
    expect(circuit.getLastAcceptedBlockHeight()).toBe(100);
    expect(circuit.snapshot().providers[0].reason).toBe("provider_lag");
  });

  it("commits an equal height without changing the head", () => {
    const circuit = makeCircuit([makeProvider("a", () => 1)]);
    const lease = circuit.select();
    circuit.acceptBlockHeight(lease, 100);
    expect(circuit.acceptBlockHeight(lease, 100)).toBe(false);
    expect(circuit.getLastAcceptedBlockHeight()).toBe(100);
  });

  it("rejects a late response from a superseded generation even with a higher height", () => {
    const a = makeProvider("a", () => 1);
    const b = makeProvider("b", () => 2);
    const circuit = makeCircuit([a, b], () => 0, undefined, { failureThreshold: 1 });

    const staleLease = circuit.select();
    expect(staleLease.index).toBe(0);

    // Simulate a failover decision that supersedes the stale lease.
    circuit.recordFailure(0, "timeout");
    const currentLease = circuit.select();
    expect(currentLease.index).toBe(1);
    expect(staleLease.isCurrent()).toBe(false);

    // A late high height from the stale provider must not advance the head.
    expect(circuit.acceptBlockHeight(staleLease, 5000)).toBe(false);
    expect(circuit.getLastAcceptedBlockHeight()).toBe(0);

    // The current provider commits normally.
    expect(circuit.acceptBlockHeight(currentLease, 300)).toBe(true);
    expect(circuit.getLastAcceptedBlockHeight()).toBe(300);
  });
});

describe("ChainCircuit - request hedging", () => {
  it("returns the fastest provider's result and reports both outcomes", async () => {
    const a = makeProvider("a", () => 10);
    const b = makeProvider("b", () => 20);
    const circuit = makeCircuit([a, b]);
    a.getBlockNumber = () => {
      a.calls += 1;
      return new Promise<number>((resolve) => setTimeout(() => resolve(1), 100));
    };
    b.getBlockNumber = () => {
      b.calls += 1;
      return Promise.resolve(2);
    };

    await expect(
      circuit.execute((p) => p.getBlockNumber(), { hedge: true })
    ).resolves.toBe(2);
    expect(a.calls + b.calls).toBe(2);
  });

  it("serves a request from the hedge when the primary fails", async () => {
    const a = makeProvider("a", transportError);
    const b = makeProvider("b", () => 7);
    const circuit = makeCircuit([a, b]);

    await expect(
      circuit.execute((p) => p.getBlockNumber(), { hedge: true, blockHeight: (h) => h })
    ).resolves.toBe(7);
  });

  it("does not issue a hedge when hedging is disabled", async () => {
    const events: ChainCircuitEvent[] = [];
    const a = makeProvider("a", () => 1);
    const b = makeProvider("b", () => 2);
    const circuit = makeCircuit([a, b], () => 0, (e) => events.push(e), { enableHedging: false });

    await circuit.execute((p) => p.getBlockNumber(), { hedge: true });
    expect(events.filter((e) => e.type === "hedge_issued")).toHaveLength(0);
  });
});

describe("ChainCircuit - fault injection", () => {
  it("handles a partition: a dead provider never poisons the chain", async () => {
    const a = makeProvider("a", transportError);
    const b = makeProvider("b", () => 100);
    const circuit = makeCircuit([a, b], () => 0, undefined, { failureThreshold: 1 });

    await expect(circuit.execute((p) => p.getBlockNumber(), { hedge: true })).resolves.toBe(100);
    const snapshot = circuit.snapshot();
    expect(snapshot.providers[0].ready).toBe(false);
    expect(snapshot.providers[1].ready).toBe(true);
    expect(snapshot.activeIndex).toBe(1);
  });

  it("survives a thundering herd: concurrent failures converge on one provider", async () => {
    const a = makeProvider("a", transportError);
    const b = makeProvider("b", () => 300);
    const circuit = makeCircuit([a, b], () => 0);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => circuit.execute((p) => p.getBlockNumber()))
    );

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    const snapshot = circuit.snapshot();
    expect(snapshot.activeIndex).toBe(1);
    expect(snapshot.providers[0].state).toBe("cooling_down");
    // The healthy provider took no damage and the dead one is quarantined.
    expect(snapshot.providers[1].ready).toBe(true);

    // Once the herd has settled, the healthy provider serves normally.
    await expect(circuit.execute((p) => p.getBlockNumber())).resolves.toBe(300);
  });

  it("bounds oscillation for a flapping provider to the cooldown window", async () => {
    let t = 0;
    const now = () => t;
    let flapping = true;
    const a = makeProvider("a", () => {
      if (flapping) throw new Error("timeout");
      return 1;
    });
    const b = makeProvider("b", () => 2);
    // A single failure trips a cooldown, so each flap forces exactly one rotation.
    const circuit = makeCircuit([a, b], now, undefined, { failureThreshold: 1, cooldownMs: 10_000 });

    for (let round = 0; round < 5; round++) {
      // Failure burst: the primary flaps, rotation moves to the backup and stays.
      flapping = true;
      await expect(circuit.execute((p) => p.getBlockNumber())).rejects.toThrow();
      expect(circuit.getActiveIndex()).toBe(1);

      await expect(circuit.execute((p) => p.getBlockNumber())).resolves.toBe(2);
      expect(circuit.getActiveIndex()).toBe(1); // no intra-window oscillation

      // Recovery window: cooldown elapses, rotation returns to the primary.
      flapping = false;
      t += 16_000;
      await expect(circuit.execute((p) => p.getBlockNumber())).resolves.toBe(1);
      expect(circuit.getActiveIndex()).toBe(0);
    }

    expect(circuit.getActiveIndex()).toBe(0);
  });
});

describe("ChainCircuit - error separation", () => {
  it("does not fail over on application errors", async () => {
    const a = makeProvider("a", () => {
      const err: any = new Error("execution reverted");
      err.code = "CALL_EXCEPTION";
      throw err;
    });
    const b = makeProvider("b", () => 2);
    const circuit = makeCircuit([a, b]);

    await expect(circuit.execute((p) => p.getBlockNumber())).rejects.toThrow();
    // The provider stays healthy - the failure is per-query, not per-provider.
    expect(circuit.getActiveIndex()).toBe(0);
    expect(circuit.snapshot().providers[0].state).toBe("healthy");
  });

  it("separates provider lag from transport failures in the snapshot", async () => {
    const a = makeProvider("a", () => 1);
    const circuit = makeCircuit([a]);
    const lease = circuit.select();

    circuit.acceptBlockHeight(lease, 100);
    circuit.recordFailure(0, "provider_lag");
    circuit.recordFailure(0, "transport");

    const snapshot = circuit.snapshot().providers[0];
    expect(snapshot.reason).toBe("transport_error");
    expect(snapshot.consecutiveFailures).toBe(2);
  });

  it("exposes recovery criteria and reason codes for every provider", async () => {
    const a = makeProvider("a", transportError);
    const b = makeProvider("b", () => 5);
    const circuit = makeCircuit([a, b], () => 0);
    await expect(circuit.execute((p) => p.getBlockNumber())).rejects.toThrow();

    const snapshot = circuit.snapshot();
    for (const provider of snapshot.providers) {
      expect(provider).toHaveProperty("state");
      expect(provider).toHaveProperty("reason");
      expect(provider).toHaveProperty("ready");
      expect(provider).toHaveProperty("failuresToRecover");
      expect(provider).toHaveProperty("recoveryEtaMs");
    }
  });
});