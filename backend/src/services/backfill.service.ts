import crypto from "crypto";
import { redis } from "../utils/redis.js";
import { config } from "../config/index.js";
import { AuditService } from "./audit.service.js";
import { TransactionService } from "./transaction.service.js";
import { getBackfillQueue } from "../jobs/backfill.queue.js";
import { logger } from "../utils/logger.js";

export type BackfillPriority = "normal" | "high";
export type BackfillJobStatus = "pending" | "running" | "completed" | "failed" | "paused" | "cancelled";

export interface BackfillJobState {
  id: string;
  type: "transactions";
  status: BackfillJobStatus;
  assetCode: string;
  assetIssuer: string;
  bridgeName?: string;
  operationTypes: string[];
  cursor: string;
  pageSize: number;
  chunkPages: number;
  requestedPages: number;
  pagesCompleted: number;
  pagesRemaining: number;
  recordsFetched: number;
  recordsStored: number;
  errorCount: number;
  priority: BackfillPriority;
  providerDelayMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackfillJobSummary extends BackfillJobState {
  errors: string[];
  progress: {
    percent: number;
  };
}

export interface BackfillRequest {
  assetCode: string;
  assetIssuer: string;
  bridgeName?: string;
  operationTypes?: string[];
  cursor?: string;
  pages?: number;
  pageSize?: number;
  chunkPages?: number;
  priority?: BackfillPriority;
}

export interface BackfillChunkPayload {
  jobId: string;
  assetCode: string;
  assetIssuer: string;
  bridgeName?: string;
  operationTypes: string[];
  cursor: string;
  pages: number;
  pageSize: number;
}

const JOB_KEY_PREFIX = "backfill:job:";
const JOB_LIST_KEY = "backfill:jobs";
const JOB_ERRORS_SUFFIX = ":errors";

export class BackfillService {
  private transactionService = new TransactionService();
  private auditService = AuditService.getInstance();
  private queue = getBackfillQueue();

  private getJobKey(jobId: string) {
    return `${JOB_KEY_PREFIX}${jobId}`;
  }

  private getErrorListKey(jobId: string) {
    return `${this.getJobKey(jobId)}${JOB_ERRORS_SUFFIX}`;
  }

  private normalizePageSize(pageSize?: number): number {
    return Math.min(Math.max(pageSize ?? config.BACKFILL_PAGE_SIZE, 1), 200);
  }

  private normalizeChunkPages(chunkPages?: number): number {
    return Math.max(chunkPages ?? config.BACKFILL_CHUNK_PAGES, 1);
  }

  private normalizeRequestedPages(pages?: number): number {
    return Math.max(pages ?? config.BACKFILL_DEFAULT_MAX_PAGES, 1);
  }

  private getPriorityValue(priority: BackfillPriority): number {
    return priority === "high" ? 1 : 10;
  }

  private async saveJobState(job: BackfillJobState): Promise<void> {
    await Promise.all([
      redis.set(this.getJobKey(job.id), JSON.stringify(job)),
      redis.sadd(JOB_LIST_KEY, job.id),
    ]);
  }

  private async loadJobState(jobId: string): Promise<BackfillJobState | null> {
    const raw = await redis.get(this.getJobKey(jobId));
    if (!raw) return null;

    return JSON.parse(raw) as BackfillJobState;
  }

  private async appendError(jobId: string, message: string): Promise<void> {
    await redis.rpush(this.getErrorListKey(jobId), message);
  }

  private async getErrorHistory(jobId: string): Promise<string[]> {
    return (await redis.lrange(this.getErrorListKey(jobId), 0, -1)) ?? [];
  }

  private computeProgress(state: BackfillJobState) {
    const percent = state.requestedPages === 0
      ? 100
      : Math.min(100, Math.round(((state.pagesCompleted / state.requestedPages) * 100))); 

    return { percent };
  }

  public async createTransactionBackfill(request: BackfillRequest): Promise<{ jobId: string; status: BackfillJobStatus }> {
    const jobId = crypto.randomUUID();
    const pageSize = this.normalizePageSize(request.pageSize);
    const chunkPages = this.normalizeChunkPages(request.chunkPages);
    const requestedPages = this.normalizeRequestedPages(request.pages);
    const initialCursor = request.cursor?.trim() ?? "";
    const priority = request.priority ?? "normal";

    const state: BackfillJobState = {
      id: jobId,
      type: "transactions",
      status: "pending",
      assetCode: request.assetCode,
      assetIssuer: request.assetIssuer,
      bridgeName: request.bridgeName,
      operationTypes: request.operationTypes ?? [],
      cursor: initialCursor,
      pageSize,
      chunkPages,
      requestedPages,
      pagesCompleted: 0,
      pagesRemaining: requestedPages,
      recordsFetched: 0,
      recordsStored: 0,
      errorCount: 0,
      priority,
      providerDelayMs: config.BACKFILL_PROVIDER_DELAY_MS,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveJobState(state);
    await this.auditService.log({
      action: "data.created",
      actorId: "system",
      actorType: "system",
      resourceType: "backfill_job",
      resourceId: jobId,
      metadata: {
        assetCode: state.assetCode,
        assetIssuer: state.assetIssuer,
        requestedPages: state.requestedPages,
        chunkPages: state.chunkPages,
        priority: state.priority,
      },
      severity: "info",
    });

    const firstChunkPages = Math.min(chunkPages, requestedPages);
    await this.queue.addJob(
      "backfill-chunk",
      {
        jobId,
        assetCode: request.assetCode,
        assetIssuer: request.assetIssuer,
        bridgeName: request.bridgeName,
        operationTypes: state.operationTypes,
        cursor: initialCursor,
        pages: firstChunkPages,
        pageSize,
      },
      {
        priority: this.getPriorityValue(priority),
      },
    );

    return { jobId, status: state.status };
  }

  public async getJobStatus(jobId: string): Promise<BackfillJobSummary | null> {
    const state = await this.loadJobState(jobId);
    if (!state) return null;

    return {
      ...state,
      errors: await this.getErrorHistory(jobId),
      progress: this.computeProgress(state),
    };
  }

  public async listBackfillJobs(): Promise<BackfillJobSummary[]> {
    const ids = await redis.smembers(JOB_LIST_KEY);
    const jobs = await Promise.all(ids.map(async (id) => this.getJobStatus(id)));
    return jobs.filter((job): job is BackfillJobSummary => job !== null);
  }

  public async resumeBackfillJob(jobId: string): Promise<BackfillJobSummary | null> {
    const state = await this.loadJobState(jobId);
    if (!state) return null;
    if (state.status === "completed") return state as BackfillJobSummary;
    if (state.pagesRemaining <= 0) {
      state.status = "completed";
      state.updatedAt = new Date().toISOString();
      await this.saveJobState(state);
      return state as BackfillJobSummary;
    }

    state.status = "pending";
    state.updatedAt = new Date().toISOString();
    await this.saveJobState(state);
    await this.auditService.log({
      action: "data.updated",
      actorId: "system",
      actorType: "system",
      resourceType: "backfill_job",
      resourceId: jobId,
      metadata: {
        status: state.status,
        pagesRemaining: state.pagesRemaining,
      },
      severity: "info",
    });

    const nextPages = Math.min(state.chunkPages, state.pagesRemaining);
    await this.queue.addJob(
      "backfill-chunk",
      {
        jobId,
        assetCode: state.assetCode,
        assetIssuer: state.assetIssuer,
        bridgeName: state.bridgeName,
        operationTypes: state.operationTypes,
        cursor: state.cursor,
        pages: nextPages,
        pageSize: state.pageSize,
      },
      {
        priority: this.getPriorityValue(state.priority),
      },
    );

    return {
      ...state,
      errors: await this.getErrorHistory(jobId),
      progress: this.computeProgress(state),
    };
  }

  public async processBackfillChunk(payload: BackfillChunkPayload): Promise<void> {
    const state = await this.loadJobState(payload.jobId);
    if (!state) {
      throw new Error(`Backfill job not found: ${payload.jobId}`);
    }
    if (state.status === "completed" || state.status === "cancelled") {
      logger.info({ jobId: payload.jobId }, "Skipping chunk for completed or cancelled job");
      return;
    }

    state.status = "running";
    state.updatedAt = new Date().toISOString();
    await this.saveJobState(state);

    try {
      const fetchResult = await this.transactionService.backfillAssetTransactions(
        payload.assetCode,
        payload.assetIssuer,
        {
          bridgeName: payload.bridgeName,
          cursor: payload.cursor,
          operationTypes: payload.operationTypes,
          pages: payload.pages,
          pageSize: payload.pageSize,
        },
      );

      state.pagesCompleted += payload.pages;
      state.pagesRemaining = Math.max(state.pagesRemaining - payload.pages, 0);
      state.recordsFetched += fetchResult.fetched;
      state.recordsStored += fetchResult.stored;
      state.cursor = fetchResult.lastCursor ?? payload.cursor;
      state.updatedAt = new Date().toISOString();

      if (state.pagesRemaining <= 0 || !fetchResult.lastCursor) {
        state.status = "completed";
        await this.auditService.log({
          action: "data.updated",
          actorId: "system",
          actorType: "system",
          resourceType: "backfill_job",
          resourceId: state.id,
          metadata: { status: state.status },
          severity: "info",
        });
        await this.saveJobState(state);
        return;
      }

      await this.saveJobState(state);
      await this.sleep(state.providerDelayMs);

      const nextChunkPages = Math.min(state.chunkPages, state.pagesRemaining);
      await this.queue.addJob(
        "backfill-chunk",
        {
          jobId: state.id,
          assetCode: state.assetCode,
          assetIssuer: state.assetIssuer,
          bridgeName: state.bridgeName,
          operationTypes: state.operationTypes,
          cursor: state.cursor,
          pages: nextChunkPages,
          pageSize: state.pageSize,
        },
        {
          priority: this.getPriorityValue(state.priority),
        },
      );
    } catch (error) {
      state.errorCount += 1;
      state.updatedAt = new Date().toISOString();
      await this.appendError(state.id, String((error as Error).message ?? "unknown error"));
      await this.saveJobState(state);
      throw error;
    }
  }

  public async markJobFailed(jobId: string, failureMessage: string): Promise<void> {
    const state = await this.loadJobState(jobId);
    if (!state) return;

    state.status = "failed";
    state.errorCount += 1;
    state.updatedAt = new Date().toISOString();
    await this.appendError(jobId, failureMessage);
    await this.saveJobState(state);

    await this.auditService.log({
      action: "data.updated",
      actorId: "system",
      actorType: "system",
      resourceType: "backfill_job",
      resourceId: jobId,
      metadata: {
        status: state.status,
        error: failureMessage,
      },
      severity: "warning",
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
