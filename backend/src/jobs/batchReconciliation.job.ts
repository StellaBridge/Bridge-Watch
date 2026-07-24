import { SUPPORTED_ASSETS } from "../config/index.js";
import { ReconciliationService } from "../services/reconciliation.service.js";
import { distributedLockService } from "../services/distributedLock.service.js";
import { logger } from "../utils/logger.js";

const RECONCILIATION_INTERVAL_MS = Number(process.env.RECONCILIATION_INTERVAL_MS) || 600000; // 10 min default

export interface BatchReconciliationReport {
  jobId: string;
  startedAt: string;
  finishedAt: string;
  totalAssets: number;
  successCount: number;
  mismatchCount: number;
  failureCount: number;
  mismatches: Array<{ assetCode: string; mismatchPercentage: number | null; runId: string }>;
  errors: Array<{ assetCode: string; error: string }>;
}

let reconciliationInterval: NodeJS.Timeout | null = null;
const reconciliationService = new ReconciliationService();

export async function runBatchReconciliation(): Promise<BatchReconciliationReport> {
  const jobId = `batch-recon-${Date.now()}`;
  const startedAt = new Date().toISOString();

  logger.info({ jobId, assetCount: SUPPORTED_ASSETS.length }, "Starting batch reconciliation run");

  const mismatches: BatchReconciliationReport["mismatches"] = [];
  const errors: BatchReconciliationReport["errors"] = [];
  let successCount = 0;

  for (const asset of SUPPORTED_ASSETS) {
    const assetCode = asset.code;
    let runId: string | null = null;

    try {
      const run = await reconciliationService.startRun({ assetCode, jobId });
      runId = run.id;

      const latest = await reconciliationService.getLatestRun(assetCode);

      if (!latest) {
        await reconciliationService.finishRun({
          id: runId,
          status: "failed",
          error: "No baseline data found",
        });
        errors.push({ assetCode, error: "No baseline data found" });
        continue;
      }

      const isMismatch = latest.status === "mismatch";
      const status = isMismatch ? "mismatch" : "success";

      await reconciliationService.finishRun({
        id: runId,
        status,
        stellarSupply: latest.stellarSupply,
        reportedSupply: latest.reportedSupply,
        mismatchPercentage: latest.mismatchPercentage,
      });

      if (isMismatch) {
        mismatches.push({
          assetCode,
          mismatchPercentage: latest.mismatchPercentage,
          runId,
        });
        logger.warn({ assetCode, mismatchPercentage: latest.mismatchPercentage, runId }, "Reconciliation mismatch detected");
      } else {
        successCount++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ assetCode, jobId, error: message }, "Reconciliation run failed for asset");
      errors.push({ assetCode, error: message });

      if (runId) {
        try {
          await reconciliationService.finishRun({ id: runId, status: "failed", error: message });
        } catch (finishErr) {
          logger.error({ assetCode, finishErr }, "Failed to mark reconciliation run as failed");
        }
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const report: BatchReconciliationReport = {
    jobId,
    startedAt,
    finishedAt,
    totalAssets: SUPPORTED_ASSETS.length,
    successCount,
    mismatchCount: mismatches.length,
    failureCount: errors.length,
    mismatches,
    errors,
  };

  logger.info(
    { jobId, successCount, mismatchCount: mismatches.length, failureCount: errors.length },
    "Batch reconciliation run complete"
  );

  return report;
}

const LOCK_KEY = "batch-reconciliation";

function runLocked(): Promise<unknown> {
  return distributedLockService.withLock(LOCK_KEY, RECONCILIATION_INTERVAL_MS, runBatchReconciliation);
}

export function startBatchReconciliationJob(): void {
  logger.info({ intervalMs: RECONCILIATION_INTERVAL_MS }, "Starting batch reconciliation job scheduler");

  runLocked().catch((err) => {
    logger.error({ error: err }, "Initial batch reconciliation run failed");
  });

  reconciliationInterval = setInterval(() => {
    runLocked().catch((err) => {
      logger.error({ error: err }, "Scheduled batch reconciliation run failed");
    });
  }, RECONCILIATION_INTERVAL_MS);
}

export function stopBatchReconciliationJob(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
    logger.info("Stopped batch reconciliation job scheduler");
  }
}
