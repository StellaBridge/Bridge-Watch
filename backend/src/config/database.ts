import type { Knex } from "knex";
import { config } from "./index.js";
import { logger } from "../utils/logger.js";

/**
 * Pool timeout configuration.
 *
 * - `acquireTimeoutMillis: 30s` — fail fast when the pool is exhausted instead
 *   of letting workers hang indefinitely under heavy async load.
 * - `idleTimeoutMillis: 15s` — reclaim idle connections promptly.
 * - `createTimeoutMillis: 10s` — bound the time spent establishing a new
 *   backend connection.
 */
export const DB_POOL_ACQUIRE_TIMEOUT_MS = 30_000;
export const DB_POOL_IDLE_TIMEOUT_MS = 15_000;
export const DB_POOL_CREATE_TIMEOUT_MS = 10_000;

/**
 * Threshold after which a checked-out transaction/connection is considered
 * leaked. A warning with the acquisition stack trace is logged so hanging
 * workers holding transactions open can be identified.
 */
export const TRANSACTION_LEAK_WARNING_MS = 60_000;

/** Capture the current call stack for leak diagnostics. */
export function captureAcquisitionStack(): string {
  const stack = new Error("DB connection acquisition stack").stack;
  return stack ?? "stack unavailable";
}

/** Log a warning for a transaction held open longer than the leak threshold. */
export function logTransactionLeak(label: string, acquisitionStack: string, heldMs: number): void {
  logger.warn(
    { label, heldMs, thresholdMs: TRANSACTION_LEAK_WARNING_MS, acquisitionStack },
    `Possible DB connection leak: transaction "${label}" held open for ${heldMs}ms (threshold ${TRANSACTION_LEAK_WARNING_MS}ms).\nAcquisition stack:\n${acquisitionStack}`,
  );
}

/**
 * Wrap a Knex transaction handler with leak tracking. If the transaction is
 * still open after `TRANSACTION_LEAK_WARNING_MS`, a warning with the stack
 * trace captured at acquisition time is logged.
 */
export async function withLeakTrackedTransaction<T>(
  db: Knex,
  label: string,
  handler: (trx: Knex.Transaction) => Promise<T>,
  leakThresholdMs: number = TRANSACTION_LEAK_WARNING_MS,
): Promise<T> {
  const acquisitionStack = captureAcquisitionStack();
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    logTransactionLeak(label, acquisitionStack, Date.now() - startedAt);
  }, leakThresholdMs);
  // Don't keep the event loop alive just for leak monitoring.
  (timer as unknown as { unref?: () => void }).unref?.();
  try {
    return await db.transaction(handler);
  } finally {
    clearTimeout(timer);
  }
}

export const databaseConfig: Knex.Config = {
  client: "pg",
  connection: {
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    // Keep connections alive
    keepAlive: true,
  },
  pool: {
    min: 2,
    max: 20,
    // Reclaim idle connections after 15s
    idleTimeoutMillis: DB_POOL_IDLE_TIMEOUT_MS,
    // Fail if a connection cannot be acquired within 30s (pool exhaustion)
    acquireTimeoutMillis: DB_POOL_ACQUIRE_TIMEOUT_MS,
    // Bound backend connection establishment to 10s
    createTimeoutMillis: DB_POOL_CREATE_TIMEOUT_MS,
    // Validate connection before use
    afterCreate(conn: { query: (sql: string, cb: (err: Error | null) => void) => void }, done: (err: Error | null, conn: unknown) => void) {
      conn.query("SET timezone='UTC'", (err) => done(err, conn));
    },
  },
  migrations: {
    directory: "./src/database/migrations",
    tableName: "knex_migrations",
    extension: "ts",
    loadExtensions: [".ts", ".js"],
  },
  seeds: {
    directory: "./src/database/seeds",
    extension: "ts",
    loadExtensions: [".ts", ".js"],
  },
};
