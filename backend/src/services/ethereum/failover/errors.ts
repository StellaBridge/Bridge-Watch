/**
 * Error taxonomy for EVM RPC calls.
 *
 * Failures are separated into distinct categories so that the failover state
 * machine can decide whether a provider deserves a health penalty, and whether
 * a failed call should be retried:
 *
 * - `transport`      - the RPC endpoint is unreachable or misbehaving at the
 *                      network layer (connection refused, DNS, bad gateway).
 * - `timeout`        - the request exceeded its deadline.
 * - `rate_limit`     - the provider throttled the request (HTTP 429).
 * - `provider_lag`   - the provider answered but its view of the chain is
 *                      behind the accepted head (a strong health signal).
 * - `invalid_data`   - the provider returned malformed or unsatisfying data.
 * - `application`    - the RPC application itself rejected the query (e.g.
 *                      `CALL_EXCEPTION`). This is a per-query outcome, NOT a
 *                      provider health signal, so it must never rotate.
 */

export type RpcErrorKind =
  | "transport"
  | "timeout"
  | "rate_limit"
  | "provider_lag"
  | "invalid_data"
  | "application";

export interface RpcErrorOptions {
  cause?: unknown;
  providerIndex?: number;
  retryable?: boolean;
}

/** Typed RPC error carrying the failure category for downstream decisioning. */
export class RpcCallError extends Error {
  readonly kind: RpcErrorKind;
  readonly retryable: boolean;
  providerIndex?: number;

  constructor(kind: RpcErrorKind, message: string, options: RpcErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "RpcCallError";
    this.kind = kind;
    this.retryable = options.retryable ?? kind !== "application";
    this.providerIndex = options.providerIndex;
  }
}

/** Mapping of ethers.js error codes to our taxonomy. */
const ETHERS_CODE_KIND: Record<string, RpcErrorKind> = {
  SERVER_ERROR: "transport",
  NETWORK_ERROR: "transport",
  TIMEOUT: "timeout",
  BAD_DATA: "invalid_data",
  CALL_EXCEPTION: "application",
  UNPREDICTABLE_GAS_LIMIT: "application",
  NONCE_EXPIRED: "application",
  REPLACEMENT_UNDERPRICED: "application",
  BUYER_REJECTED_ECDSA: "application",
};

const KIND_MESSAGE_HINTS: Array<{ kind: RpcErrorKind; hints: string[] }> = [
  { kind: "timeout", hints: ["timeout", "timed out"] },
  { kind: "rate_limit", hints: ["429", "rate limit", "too many requests", "throttl"] },
  { kind: "transport", hints: ["network", "connection", "socket", "fetch failed", "econnrefused", "ec2", "gateway"] },
];

/** Classify an arbitrary thrown value into a failure category. */
export function classifyRpcError(error: unknown, fallback: RpcErrorKind = "transport"): RpcErrorKind {
  if (error instanceof RpcCallError) return error.kind;

  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code in ETHERS_CODE_KIND) return ETHERS_CODE_KIND[code];
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  for (const { kind, hints } of KIND_MESSAGE_HINTS) {
    if (hints.some((hint) => lower.includes(hint))) return kind;
  }
  return fallback;
}

/**
 * Normalize an arbitrary thrown value into an `RpcCallError`.
 * Existing `RpcCallError`s are returned as-is (with the index attached).
 */
export function toRpcError(
  error: unknown,
  fallbackKind: RpcErrorKind = "transport",
  providerIndex?: number
): RpcCallError {
  if (error instanceof RpcCallError) {
    if (providerIndex !== undefined) error.providerIndex = providerIndex;
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new RpcCallError(classifyRpcError(error, fallbackKind), message, {
    cause: error,
    providerIndex,
  });
}