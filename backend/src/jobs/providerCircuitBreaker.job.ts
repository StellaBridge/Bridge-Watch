import { providerCircuitBreakerService } from "../services/providerCircuitBreaker.service.js";
import { distributedLockService } from "../services/distributedLock.service.js";
import { logger } from "../utils/logger.js";

const PROBE_SWEEP_INTERVAL_MS = Number(process.env.PROVIDER_BREAKER_PROBE_INTERVAL_MS) || 30_000; // 30s default

let probeSweepInterval: NodeJS.Timeout | null = null;

export async function runRecoveryProbeSweep(): Promise<number> {
  try {
    const probed = await providerCircuitBreakerService.runRecoveryProbeSweep();
    if (probed > 0) {
      logger.info({ probed }, "Provider circuit breaker recovery probe sweep transitioned breakers to half-open");
    }
    return probed;
  } catch (err) {
    logger.error({ error: err }, "Provider circuit breaker recovery probe sweep failed");
    return 0;
  }
}

const LOCK_KEY = "provider-circuit-breaker-sweep";

function runLocked(): Promise<unknown> {
  return distributedLockService.withLock(LOCK_KEY, PROBE_SWEEP_INTERVAL_MS, runRecoveryProbeSweep);
}

export function startProviderCircuitBreakerJob(): void {
  logger.info({ intervalMs: PROBE_SWEEP_INTERVAL_MS }, "Starting provider circuit breaker recovery probe job");

  probeSweepInterval = setInterval(() => {
    runLocked().catch((err) => {
      logger.error({ error: err }, "Scheduled provider circuit breaker probe sweep failed");
    });
  }, PROBE_SWEEP_INTERVAL_MS);
}

export function stopProviderCircuitBreakerJob(): void {
  if (probeSweepInterval) {
    clearInterval(probeSweepInterval);
    probeSweepInterval = null;
    logger.info("Stopped provider circuit breaker recovery probe job");
  }
}
