import type { RpcErrorKind } from "./errors.js";

export type ProviderHealthState = "healthy" | "degraded" | "cooling_down" | "unhealthy";

export type ProviderReasonCode =
  | "ok"
  | "transport_error"
  | "timeout"
  | "rate_limit"
  | "provider_lag"
  | "invalid_data"
  | "consecutive_failures"
  | "health_decay"
  | "cooldown_elapsed";

export interface ProviderCircuitConfig {
  /** Consecutive failures before the provider enters a cooldown. */
  failureThreshold: number;
  /** Consecutive failures before the provider is considered unhealthy. */
  unhealthThreshold: number;
  /** How long a provider is excluded from rotation after a failure burst (ms). */
  cooldownMs: number;
  /** Idle time after which a healthy provider decays to `degraded` (ms). */
  healthDecayMs: number;
  /** Failure credit granted for a `provider_lag` incident. */
  lagFailureWeight: number;
}

export const DEFAULT_CIRCUIT_CONFIG: ProviderCircuitConfig = {
  failureThreshold: 3,
  unhealthThreshold: 6,
  cooldownMs: 15_000,
  healthDecayMs: 60_000,
  lagFailureWeight: 1,
};

export interface ProviderCircuitSnapshot {
  index: number;
  state: ProviderHealthState;
  reason: ProviderReasonCode;
  consecutiveFailures: number;
  lastSuccessAt: number;
  lastFailureAt: number;
  cooldownUntil: number;
  /** Recovery criteria: failures still tolerated before the next cooldown. */
  failuresToRecover: number;
  /** Recovery criteria: ms until the provider is eligible again (0 if eligible). */
  recoveryEtaMs: number;
  /** Whether the provider may currently serve requests. */
  ready: boolean;
}

const REASON_BY_KIND: Record<RpcErrorKind, ProviderReasonCode> = {
  transport: "transport_error",
  timeout: "timeout",
  rate_limit: "rate_limit",
  provider_lag: "provider_lag",
  invalid_data: "invalid_data",
  application: "ok",
};

/**
 * Per-provider health state machine.
 *
 * A provider starts `healthy`. Failures accumulate a penalty until the
 * configured thresholds trip a cooldown (`cooling_down`) or `unhealthy`.
 * Successful calls reset the penalty. Idle healthy providers decay to
 * `degraded` so rotation naturally prefers recently-verified providers.
 *
 * The state is computed on demand from counters plus the current time, which
 * keeps every transition deterministic and trivially unit-testable.
 */
export class ProviderCircuit {
  readonly index: number;

  private readonly config: ProviderCircuitConfig;
  private readonly now: () => number;
  private consecutiveFailures = 0;
  private lastSuccessAt = 0;
  private lastFailureAt = 0;
  private cooldownUntil = 0;
  private reason: ProviderReasonCode = "ok";

  constructor(index: number, config?: Partial<ProviderCircuitConfig>, now: () => number = Date.now) {
    this.index = index;
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
    this.now = now;
  }

  /** Record a successful call. Clears all accumulated penalty. */
  recordSuccess(): ProviderCircuitSnapshot {
    this.consecutiveFailures = 0;
    this.cooldownUntil = 0;
    this.lastSuccessAt = this.now();
    this.reason = "ok";
    return this.getSnapshot();
  }

  /**
   * Record a failed call.
   *
   * `application` failures are per-query outcomes (e.g. `CALL_EXCEPTION`) and
   * do NOT penalize provider health. `provider_lag` and `invalid_data` are
   * strong signals and trip an immediate cooldown.
   */
  recordFailure(kind: RpcErrorKind, weight = 1): ProviderCircuitSnapshot {
    if (kind === "application") return this.getSnapshot();

    const now = this.now();
    this.lastFailureAt = now;
    this.reason = REASON_BY_KIND[kind] ?? "transport_error";
    this.consecutiveFailures += kind === "provider_lag" ? this.config.lagFailureWeight : weight;

    if (kind === "provider_lag" || kind === "invalid_data" || this.consecutiveFailures >= this.config.failureThreshold) {
      this.cooldownUntil = now + this.config.cooldownMs;
    }
    return this.getSnapshot();
  }

  /** Whether the provider may currently serve requests. */
  canServe(now: number = this.now()): boolean {
    return this.getSnapshot(now).ready;
  }

  getState(now: number = this.now()): ProviderHealthState {
    return this.getSnapshot(now).state;
  }

  getSnapshot(now: number = this.now()): ProviderCircuitSnapshot {
    const state = this.evaluate(now);
    return {
      index: this.index,
      state: state.state,
      reason: state.reason,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      cooldownUntil: this.cooldownUntil,
      failuresToRecover: Math.max(0, this.config.failureThreshold - this.consecutiveFailures),
      recoveryEtaMs: Math.max(0, this.cooldownUntil - now),
      ready: state.state === "healthy" || state.state === "degraded",
    };
  }

  private evaluate(now: number): { state: ProviderHealthState; reason: ProviderReasonCode } {
    if (this.cooldownUntil > now) {
      return { state: "cooling_down", reason: this.reason };
    }
    if (this.consecutiveFailures >= this.config.unhealthThreshold) {
      return { state: "unhealthy", reason: "consecutive_failures" };
    }
    if (this.cooldownUntil > 0) {
      // Cooldown elapsed: the provider is eligible again and awaiting a probe.
      return { state: "degraded", reason: "cooldown_elapsed" };
    }
    if (this.consecutiveFailures > 0) {
      return { state: "degraded", reason: this.reason };
    }
    if (this.lastSuccessAt > 0 && now - this.lastSuccessAt > this.config.healthDecayMs) {
      return { state: "degraded", reason: "health_decay" };
    }
    return { state: "healthy", reason: "ok" };
  }
}