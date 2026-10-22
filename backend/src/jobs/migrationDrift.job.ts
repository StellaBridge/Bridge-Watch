import { Migrator } from "../database/migrator.js";
import { getMetricsService } from "../services/metrics.service.js";
import { logger } from "../utils/logger.js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let driftInterval: NodeJS.Timeout | null = null;

/** Refreshes `db_pending_migrations_count`, labeled by migration name. */
export async function checkMigrationDrift(): Promise<void> {
  const records = await new Migrator().status();
  const pending = records.filter((r) => r.status === "pending");
  const gauge = getMetricsService().dbPendingMigrationsCount;

  gauge.reset();
  for (const record of pending) {
    gauge.set({ migration: record.name }, 1);
  }
}

export function startMigrationDriftMonitor(): void {
  checkMigrationDrift().catch((err) => {
    logger.error({ error: err }, "Initial migration drift check failed");
  });

  driftInterval = setInterval(() => {
    checkMigrationDrift().catch((err) => {
      logger.error({ error: err }, "Scheduled migration drift check failed");
    });
  }, CHECK_INTERVAL_MS);
}

export function stopMigrationDriftMonitor(): void {
  if (driftInterval) {
    clearInterval(driftInterval);
    driftInterval = null;
  }
}
