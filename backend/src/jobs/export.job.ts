import { Queue } from "bullmq";
import { ExportJobPayload } from "../types/export.types.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const QUEUE_NAME = "export-queue";
const JOB_NAME = "process-export";

/**
 * Export job queue for BullMQ
 * Handles async processing of export requests
 */
export class ExportQueue extends Queue<ExportJobPayload> {
    private static instance: ExportQueue;

    private constructor() {
        super(QUEUE_NAME, {
            connection: {
                host: config.REDIS_HOST || "localhost",
                port: config.REDIS_PORT || 6379,
            },
            defaultJobOptions: {
                attempts: 3, // Retry attempts
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
                removeOnComplete: {
                    age: 3600, // Keep completed jobs for 1 hour
                    count: 100, // Keep last 100 completed jobs
                },
                removeOnFail: {
                    age: 86400, // Keep failed jobs for 24 hours
                },
            },
        });

        logger.info({}, "Export queue initialized");
    }

    /**
     * Get singleton instance of ExportQueue
     */
    public static getInstance(): ExportQueue {
        if (!ExportQueue.instance) {
            ExportQueue.instance = new ExportQueue();
        }
        return ExportQueue.instance;
    }

    /**
     * Add export job to the queue
     */
    public async addExportJob(payload: ExportJobPayload): Promise<void> {
        await this.add(JOB_NAME, payload, {
            jobId: `export-${payload.exportId}`,
        });

        logger.info({ exportId: payload.exportId }, "Export job added to queue");
    }

    /**
     * Close the queue connection
     */
    public async close(): Promise<void> {
        await super.close();
        logger.info({}, "Export queue connection closed");
    }
}

// Export singleton instance for convenience
export const exportQueue = ExportQueue.getInstance();
