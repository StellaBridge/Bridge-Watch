import { RpcCallError } from "./errors.js";

/** Raised when an RPC call exceeds its configured deadline. */
export class RpcTimeoutError extends RpcCallError {
  readonly durationMs: number;

  constructor(durationMs: number, message?: string) {
    super("timeout", message ?? `RPC request timed out after ${durationMs}ms`);
    this.name = "RpcTimeoutError";
    this.durationMs = durationMs;
  }
}

export interface TimeoutOptions {
  /** Invoked (synchronously) when the deadline elapses. */
  onTimeout?: () => void;
}

/**
 * Race a task against a hard deadline.
 *
 * Guarantees:
 * - The timeout timer is always cleared on settlement, so timers never leak.
 * - The underlying task receives an `AbortSignal` so cancellation propagates
 *   where the transport supports it (fetch, WebSocket, etc.).
 * - A task that settles *after* the deadline cannot produce an unhandled
 *   rejection or corrupt the caller's outcome.
 */
export async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  options: TimeoutOptions = {}
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const taskPromise = Promise.resolve().then(() => task(controller.signal));
  // Prevent a late-settling task from surfacing as an unhandled rejection.
  taskPromise.catch(() => {});

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      options.onTimeout?.();
      reject(new RpcTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    // Best-effort cancellation of the underlying work once the outcome is known.
    controller.abort();
  }
}