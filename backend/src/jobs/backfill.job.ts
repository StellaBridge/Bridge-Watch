import type { Job } from "bullmq";
import { BackfillService } from "../services/backfill.service.js";
import { getBackfillQueue } from "./backfill.queue.js";
import { logger } from "../utils/logger.js";

export interface BackfillChunkJobData {
  jobId: string;
  assetCode: string;
  assetIssuer: string;
  bridgeName?: string;
  operationTypes: string[];
  cursor: string;
  pages: number;
  pageSize: number;
}

export async function initBackfillJob(): Promise<void> {
  const queue = getBackfillQueue();
  const backfillService = new BackfillService();

  queue.initWorker(
    async (job: Job<BackfillChunkJobData>) => {
      if (job.name !== "backfill-chunk") {
        throw new Error(`Unsupported backfill job type: ${job.name}`);
      }
      await backfillService.processBackfillChunk(job.data);
    },
    async (job: Job | undefined, error: Error) => {
      if (!job || job.name !== "backfill-chunk") return;
      const attempts = job.attemptsMade ?? 0;
      const maxAttempts = (job.opts?.attempts as number) ?? 1;
      if (attempts >= maxAttempts) {
        await backfillService.markJobFailed((job.data as BackfillChunkJobData).jobId, error.message);
      }
    },
  );

  logger.info("Backfill job system initialized");
}
