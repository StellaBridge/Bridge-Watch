import { ProviderCircuit, type ProviderCircuitConfig, type ProviderCircuitSnapshot } from "./circuit.js";
import { classifyRpcError, type RpcErrorKind } from "./errors.js";

export interface ChainCircuitConfig extends ProviderCircuitConfig {
  /** Enable request hedging for critical reads. */
  enableHedging: boolean;
}

export interface ChainCircuitEvent {
  type:
    | "failover"
    | "provider_failed"
    | "provider_recovered"
    | "block_regressed"
    | "hedge_issued"
    | "all_providers_down";
  index: number;
  fromIndex?: number;
  kind?: RpcErrorKind;
}

export interface ChainCircuitOptions {
  config?: Partial<ChainCircuitConfig>;
  /** Injected clock for deterministic tests. */
  now?: () => number;
  /** Emitted on every state transition worth observing. */
  onEvent?: (event: ChainCircuitEvent) => void;
}

/**
 * A per-request lease. Carries the provider selection snapshot so that late
 * completions can be recognized and refused before they mutate shared state.
 */
export interface CircuitLease<P> {
  readonly index: number;
  readonly generation: number;
  readonly provider: P;
  /** False when a newer generation has superseded this lease. */
  isCurrent(): boolean;
}

export interface ChainCircuitSnapshot {
  activeIndex: number;
  generation: number;
  lastAcceptedBlockHeight: number;
  lastAcceptedAt: number;
  providers: ProviderCircuitSnapshot[];
  /** Reason code of the active provider (for dashboards / alerting). */
  reason: string;
}

export interface ExecuteOptions<T> {
  /** Fire the request at an alternate provider in parallel. */
  hedge?: boolean;
  /** Extract a block height from the result to feed the monotonicity guard. */
  blockHeight?: (value: T) => number | undefined;
}

/**
 * Per-chain provider circuit.
 *
 * Owns the array of `ProviderCircuit`s for one chain and guarantees:
 *
 * - **Deterministic failover** - the active provider is always the lowest
 *   index that can serve; when all providers are down the previous active is
 *   kept sticky so callers converge instead of oscillating.
 * - **Generation tokens** - every lease carries a generation; a lease whose
 *   generation was superseded is a *late response* and can never update shared
 *   state (`lastAcceptedBlockHeight`).
 * - **Header monotonicity** - accepted block heights only ever advance.
 *   A current lease reporting a lower height is treated as provider lag and
 *   penalized.
 * - **Request hedging** - critical reads can race an alternate provider; the
 *   first success wins while every outcome is still reported to its circuit.
 *
 * All state transitions are synchronous (no awaits), so on Node's single
 * thread concurrent callers always observe a consistent snapshot.
 */
export class ChainCircuit<P> {
  private readonly providers: P[];
  private readonly circuits: ProviderCircuit[];
  private readonly config: ChainCircuitConfig;
  private readonly now: () => number;
  private readonly onEvent: (event: ChainCircuitEvent) => void;

  private generation = 0;
  private activeIndex = 0;
  private lastAcceptedBlockHeight = 0;
  private lastAcceptedAt = 0;
  private allProvidersDown = false;

  constructor(providers: P[], options: ChainCircuitOptions = {}) {
    if (providers.length === 0) throw new Error("ChainCircuit requires at least one provider");
    this.providers = providers;
    this.config = {
      failureThreshold: 3,
      unhealthThreshold: 6,
      cooldownMs: 15_000,
      healthDecayMs: 60_000,
      lagFailureWeight: 1,
      enableHedging: true,
      ...options.config,
    };
    this.now = options.now ?? Date.now;
    this.onEvent = options.onEvent ?? (() => {});
    this.circuits = providers.map((_, index) => new ProviderCircuit(index, this.config, this.now));
  }

  // ─── Introspection ────────────────────────────────────────────────────────

  get providerCount(): number {
    return this.providers.length;
  }

  getActiveIndex(): number {
    return this.activeIndex;
  }

  getGeneration(): number {
    return this.generation;
  }

  getLastAcceptedBlockHeight(): number {
    return this.lastAcceptedBlockHeight;
  }

  /** All providers in index order (used for lifecycle teardown). */
  allProviders(): P[] {
    return [...this.providers];
  }

  /** Full state, including per-provider recovery criteria and reason codes. */
  snapshot(): ChainCircuitSnapshot {
    const now = this.now();
    return {
      activeIndex: this.activeIndex,
      generation: this.generation,
      lastAcceptedBlockHeight: this.lastAcceptedBlockHeight,
      lastAcceptedAt: this.lastAcceptedAt,
      providers: this.circuits.map((circuit) => circuit.getSnapshot(now)),
      reason: this.circuits[this.activeIndex]?.getSnapshot(now).reason ?? "ok",
    };
  }

  /** Reset all provider health to pristine (used by tests and operator tooling). */
  reset(): void {
    for (const circuit of this.circuits) {
      circuit.recordSuccess();
    }
    this.recomputeActive(this.now());
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  /** Lease the active provider for a new request. */
  select(): CircuitLease<P> {
    this.recomputeActive(this.now());
    return this.leaseFor(this.activeIndex);
  }

  /** Lease the best alternate provider for hedging, or `null` when none can serve. */
  selectHedge(excludeIndex: number): CircuitLease<P> | null {
    if (!this.config.enableHedging) return null;
    const now = this.now();
    for (let index = 0; index < this.circuits.length; index++) {
      if (index === excludeIndex) continue;
      if (this.circuits[index].canServe(now)) return this.leaseFor(index);
    }
    return null;
  }

  // ─── Settlement ───────────────────────────────────────────────────────────

  /** Record a successful call against the lease's provider. */
  recordSuccess(lease: CircuitLease<P>): void {
    this.circuits[lease.index].recordSuccess();
    this.onEvent({ type: "provider_recovered", index: lease.index });
  }

  /** Record a failed call; triggers a deterministic failover decision. */
  recordFailure(index: number, kind: RpcErrorKind): void {
    const wasActive = index === this.activeIndex;
    this.circuits[index].recordFailure(kind);
    this.onEvent({ type: "provider_failed", index, kind });
    if (wasActive) {
      this.onEvent({ type: "failover", index, fromIndex: this.activeIndex });
    }
    this.recomputeActive(this.now());
  }

  /**
   * Feed an observed block height into the monotonicity guard.
   *
   * Returns `true` when the height was committed as the new accepted head.
   * Heights never regress: a late response (superseded generation) is ignored,
   * and a current lease reporting a *lower* height is flagged as provider lag.
   */
  acceptBlockHeight(lease: CircuitLease<P>, height: number): boolean {
    if (!Number.isFinite(height) || height <= 0) {
      this.recordSuccess(lease);
      return false;
    }

    if (height > this.lastAcceptedBlockHeight) {
      if (!lease.isCurrent()) {
        // Late response from a superseded provider: valid data, but it must not
        // move the accepted head forward on behalf of the current rotation.
        this.recordSuccess(lease);
        return false;
      }
      this.lastAcceptedBlockHeight = height;
      this.lastAcceptedAt = this.now();
      this.recordSuccess(lease);
      return true;
    }

    if (height < this.lastAcceptedBlockHeight && lease.isCurrent()) {
      this.recordFailure(lease.index, "provider_lag");
      this.onEvent({ type: "block_regressed", index: lease.index, kind: "provider_lag" });
      return false;
    }

    this.recordSuccess(lease);
    return false;
  }

  // ─── Execution ────────────────────────────────────────────────────────────

  /**
   * Execute `fn` against the active provider (and, when `hedge` is set, an
   * alternate in parallel). The first success wins; every outcome is reported
   * to its provider circuit so health and failover stay accurate. Late results
   * from superseded leases never touch shared state.
   */
  async execute<T>(fn: (provider: P) => Promise<T>, options: ExecuteOptions<T> = {}): Promise<T> {
    const primary = this.select();
    const hedgeLease = options.hedge ? this.selectHedge(primary.index) : null;

    // Promise.resolve() converts synchronous throws into rejections so a
    // throwing provider cannot blow up the selection bookkeeping below.
    const run = (lease: CircuitLease<P>): Promise<T> => Promise.resolve().then(() => fn(lease.provider));

    const attempts = [{ lease: primary, result: run(primary) }];
    if (hedgeLease) {
      this.onEvent({ type: "hedge_issued", index: hedgeLease.index });
      attempts.push({ lease: hedgeLease, result: run(hedgeLease) });
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let pending = attempts.length;

      const handleSuccess = (lease: CircuitLease<P>, value: T): void => {
        const height = options.blockHeight ? options.blockHeight(value) : undefined;
        if (height !== undefined) {
          this.acceptBlockHeight(lease, height);
        } else {
          this.recordSuccess(lease);
        }
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      const handleFailure = (index: number, error: unknown): void => {
        this.recordFailure(index, classifyRpcError(error));
        pending -= 1;
        if (pending === 0 && !settled) {
          settled = true;
          reject(error);
        }
      };

      for (const attempt of attempts) {
        attempt.result.then(
          (value) => handleSuccess(attempt.lease, value),
          (error) => handleFailure(attempt.lease.index, error)
        );
      }
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private leaseFor(index: number): CircuitLease<P> {
    const generation = this.generation;
    return {
      index,
      generation,
      provider: this.providers[index],
      isCurrent: () => this.generation === generation && this.activeIndex === index,
    };
  }

  /**
   * Deterministically converge on the active provider: the lowest index that
   * can serve wins; when nobody can serve, the current active is kept sticky to
   * prevent oscillation between equally-bad providers.
   */
  private recomputeActive(now: number): void {
    for (let index = 0; index < this.circuits.length; index++) {
      if (this.circuits[index].canServe(now)) {
        this.allProvidersDown = false;
        this.setActive(index);
        return;
      }
    }
    if (!this.allProvidersDown) {
      this.allProvidersDown = true;
      this.onEvent({ type: "all_providers_down", index: this.activeIndex });
    }
  }

  private setActive(index: number): void {
    if (index !== this.activeIndex) {
      this.generation += 1;
      this.activeIndex = index;
    }
  }
}