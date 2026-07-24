import { sourceDecommissionService } from "../services/sourceDecommission.service.js";
import { distributedLockService } from "../services/distributedLock.service.js";
import { logger } from "../utils/logger.js";

const CHECK_INTERVAL_MS = Number(process.env.SOURCE_DECOMMISSION_CHECK_INTERVAL_MS) || 3_600_000; // 1 hour default

let decommissionCheckInterval: NodeJS.Timeout | null = null;

export async function runSourceDecommissionCheck(): Promise<number> {
  try {
    const updated = await sourceDecommissionService.refreshCompletionReadiness();
    if (updated > 0) {
      logger.info({ updated }, "Source decommission readiness check flagged sources ready to complete");
    }
    return updated;
  } catch (err) {
    logger.error({ error: err }, "Source decommission readiness check failed");
    return 0;
  }
}

const LOCK_KEY = "source-decommission";

function runLocked(): Promise<unknown> {
  return distributedLockService.withLock(LOCK_KEY, CHECK_INTERVAL_MS, runSourceDecommissionCheck);
}

export function startSourceDecommissionJob(): void {
  logger.info({ intervalMs: CHECK_INTERVAL_MS }, "Starting source decommission readiness job scheduler");

  runLocked().catch((err) => {
    logger.error({ error: err }, "Initial source decommission readiness check failed");
  });

  decommissionCheckInterval = setInterval(() => {
    runLocked().catch((err) => {
      logger.error({ error: err }, "Scheduled source decommission readiness check failed");
    });
  }, CHECK_INTERVAL_MS);
}

export function stopSourceDecommissionJob(): void {
  if (decommissionCheckInterval) {
    clearInterval(decommissionCheckInterval);
    decommissionCheckInterval = null;
    logger.info("Stopped source decommission readiness job scheduler");
  }
}
