import type { ChainCircuitConfig } from "./chainCircuit.js";

/** Failover tuning options accepted by `EthereumRpcClient`. */
export type FailoverOptions = Partial<ChainCircuitConfig>;

export type { ChainCircuitEvent, ChainCircuitSnapshot, CircuitLease, ExecuteOptions } from "./chainCircuit.js";
export type { ProviderCircuitConfig, ProviderCircuitSnapshot, ProviderHealthState, ProviderReasonCode } from "./circuit.js";
export type { RpcErrorKind, RpcErrorOptions } from "./errors.js";