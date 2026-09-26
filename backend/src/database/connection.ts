import knex, { type Knex } from "knex";
import {
  databaseConfig,
  captureAcquisitionStack,
  logTransactionLeak,
  TRANSACTION_LEAK_WARNING_MS,
} from "../config/database.js";
import { logger } from "../utils/logger.js";

let db: Knex | undefined;

/**
 * Patch a Knex instance so every `trx` acquired via `db.transaction()` is
 * monitored for leaks. If the transaction stays open longer than
 * `TRANSACTION_LEAK_WARNING_MS` (60s), a warning with the acquisition stack
 * trace is logged. The timer is cleared on commit/rollback.
 */
function attachTransactionLeakTracking(instance: Knex): Knex {
  const originalTransaction = instance.transaction.bind(instance);
  (instance as unknown as { transaction: (...args: unknown[]) => Promise<unknown> }).transaction = ((
    ...args: unknown[]
  ) => {
    const acquisitionStack = captureAcquisitionStack();
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      logTransactionLeak("knex.transaction", acquisitionStack, Date.now() - startedAt);
    }, TRANSACTION_LEAK_WARNING_MS);
    (timer as unknown as { unref?: () => void }).unref?.();

    const clear = () => clearTimeout(timer);
    // Knex supports both `trx.transaction(handler)` and `trx.transaction()` forms.
    const maybeHandler = args[0];
    if (typeof maybeHandler === "function") {
      const handler = maybeHandler as (trx: Knex.Transaction) => Promise<unknown>;
      return (originalTransaction as (...a: unknown[]) => Promise<unknown>)(
        async (trx: Knex.Transaction) => {
          // Clear the timer when the transaction settles.
          try {
            return await handler(trx);
          } finally {
            clear();
          }
        },
        ...args.slice(1),
      ).finally(clear);
    }
    const promise = (originalTransaction as (...a: unknown[]) => Promise<unknown>)(...args);
    if (promise && typeof (promise as Promise<unknown>).finally === "function") {
      return (promise as Promise<unknown>).finally(clear);
    }
    clear();
    return promise;
  }) as Knex["transaction"];
  return instance;
}

export function getDatabase(): Knex {
  if (!db) {
    db = attachTransactionLeakTracking(knex(databaseConfig));
    logger.info("Database connection initialized");
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    db = undefined; // Reset so the next getDatabase() call creates a fresh pool
    logger.info("Database connection closed");
  }
}
