import { EventEmitter } from "events";
import { logger } from "../utils/logger.js";
import { getMetricsService } from "./metrics.service.js";
import { ingestionQueueManager } from "./ingestionQueueManager.service.js";

export type StreamStatus = "connecting" | "connected" | "reconnecting" | "closed" | "error";

export interface StreamCheckpoint {
  streamId: string;
  lastCursor: string | null;
  lastEventAt: string | null;
  updatedAt: string;
}

export interface StreamHealthMetrics {
  streamId: string;
  status: StreamStatus;
  reconnectCount: number;
  lastEventAt: string | null;
  gapDetected: boolean;
  gapSinceMs: number | null;
  uptimePct: number;
}

export interface HorizonStreamConfig {
  streamId: string;
  url: string;
  cursor?: string;
  gapThresholdMs?: number;
  maxReconnectAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  timeoutMs?: number;
}

/**
 * Supervises a single Horizon SSE streaming connection.
 * Handles reconnection with exponential back-off, cursor checkpointing,
 * gap detection, and stream-health metrics.
 */
export class HorizonStreamSupervisor extends EventEmitter {
  private readonly streamId: string;
  private readonly url: string;
  private readonly gapThresholdMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly timeoutMs: number;

  private status: StreamStatus = "connecting";
  private reconnectCount = 0;
  private lastEventAt: Date | null = null;
  private lastCursor: string | null;
  private gapDetected = false;
  private gapStartedAt: Date | null = null;
  private connectedAt: Date | null = null;
  private totalConnectedMs = 0;
  private startedAt: Date = new Date();
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private gapCheckTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(config: HorizonStreamConfig) {
    super();
    this.streamId = config.streamId;
    this.url = config.url;
    this.lastCursor = config.cursor ?? null;
    this.gapThresholdMs = config.gapThresholdMs ?? 30_000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 20;
    this.baseBackoffMs = config.baseBackoffMs ?? 1_000;
    this.maxBackoffMs = config.maxBackoffMs ?? 60_000;
    this.timeoutMs = config.timeoutMs ?? 120_000;
  }

  start(): void {
    this.closed = false;
    this.startedAt = new Date();
    this._connect();
    this._startGapCheck();
  }

  stop(): void {
    this.closed = true;
    this.setStatus("closed");
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.gapCheckTimer) clearInterval(this.gapCheckTimer);
    this.abortController?.abort();
    this.removeAllListeners();
    logger.info({ streamId: this.streamId }, "Horizon stream supervisor stopped");
  }

  getCheckpoint(): StreamCheckpoint {
    return {
      streamId: this.streamId,
      lastCursor: this.lastCursor,
      lastEventAt: this.lastEventAt?.toISOString() ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  getHealthMetrics(): StreamHealthMetrics {
    const nowMs = Date.now();
    const uptimeMs =
      this.totalConnectedMs +
      (this.connectedAt ? nowMs - this.connectedAt.getTime() : 0);
    const totalMs = nowMs - this.startedAt.getTime();
    const uptimePct = totalMs > 0 ? Math.round((uptimeMs / totalMs) * 100) : 0;

    return {
      streamId: this.streamId,
      status: this.status,
      reconnectCount: this.reconnectCount,
      lastEventAt: this.lastEventAt?.toISOString() ?? null,
      gapDetected: this.gapDetected,
      gapSinceMs: this.gapStartedAt ? nowMs - this.gapStartedAt.getTime() : null,
      uptimePct,
    };
  }

  private async _connect(): Promise<void> {
    if (this.closed) return;

    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const streamUrl = this.lastCursor
      ? `${this.url}?cursor=${this.lastCursor}`
      : this.url;

    this.setStatus("connecting");
    logger.info({ streamId: this.streamId, url: streamUrl }, "Connecting to Horizon stream");

    const timeoutId = setTimeout(() => this.abortController?.abort(), this.timeoutMs);
    try {
      const response = await fetch(streamUrl, {
        headers: { Accept: "text/event-stream" },
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      this.setStatus("connected");
      this.connectedAt = new Date();
      this.reconnectCount = 0;
      this.gapDetected = false;
      this.gapStartedAt = null;
      logger.info({ streamId: this.streamId }, "Horizon stream connected");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          this._processLine(line.trim());
        }
      }

      if (this.connectedAt) {
        this.totalConnectedMs += Date.now() - this.connectedAt.getTime();
        this.connectedAt = null;
      }
    } catch (err: unknown) {
      if (this.closed) return;

      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg === "AbortError" || (err instanceof Error && err.name === "AbortError")) {
        return;
      }

      logger.warn({ streamId: this.streamId, error: errMsg }, "Horizon stream error");
      this.setStatus("error");
      this._scheduleReconnect();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private _processLine(line: string): void {
    if (!line || line.startsWith(":")) return; // keep-alive or comment

    if (line.startsWith("data:")) {
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") return;

      try {
        const event = JSON.parse(raw) as Record<string, unknown>;
        this.lastEventAt = new Date();
        this.gapDetected = false;
        this.gapStartedAt = null;

        // Update cursor from paging token or id
        if (typeof event.paging_token === "string") {
          this.lastCursor = event.paging_token;
        } else if (typeof event.id === "string") {
          this.lastCursor = event.id;
        }

    this.emit("event", event);
    this._recordEventMetric();

    void this._handleEventForReorg(event);
      } catch {
        // Non-JSON line, skip
      }
    }
  }

  private _lastKnownLedger: number | null = null;
  private _cursorHistory: Array<{ cursor: string; ledger: number; timestamp: number }> = [];
  private _reorgDetected = false;

  private async _handleEventForReorg(event: Record<string, unknown>): Promise<void> {
    const ledgerStr = event.ledger as string | undefined;
    if (!ledgerStr) return;

    const ledger = parseInt(ledgerStr, 10);
    if (isNaN(ledger)) return;

    this._cursorHistory.push({
      cursor: this.lastCursor ?? "",
      ledger,
      timestamp: Date.now(),
    });

    if (this._cursorHistory.length > 200) {
      this._cursorHistory.shift();
    }

    if (this._lastKnownLedger !== null && ledger < this._lastKnownLedger) {
      const rollbackAmount = this._lastKnownLedger - ledger;
      if (rollbackAmount > 0) {
        logger.warn(
          {
            streamId: this.streamId,
            lastLedger: this._lastKnownLedger,
            newLedger: ledger,
            rollbackAmount,
          },
          "Potential ledger re-org detected in stream"
        );

        this._reorgDetected = true;

        try {
          const rolledBack = await ingestionQueueManager.detectReorgAndRollback();
          if (rolledBack.length > 0) {
            logger.warn(
              { streamId: this.streamId, rolledBackCount: rolledBack.length },
              "Re-org rollback applied to buffered events"
            );
          }
        } catch (err) {
          logger.error(
            { streamId: this.streamId, err },
            "Failed to handle re-org rollback"
          );
        }
      }
    }

    this._lastKnownLedger = ledger;
  }

  public getReorgStatus(): { reorgDetected: boolean; ledgerRollbacks: number } {
    const rollbacks = this._cursorHistory.filter((_, i) => {
      if (i === 0) return false;
      return this._cursorHistory[i].ledger < this._cursorHistory[i - 1].ledger;
    });
    return {
      reorgDetected: this._reorgDetected,
      ledgerRollbacks: rollbacks.length,
    };
  }

  private _scheduleReconnect(): void {
    if (this.closed) return;
    if (this.reconnectCount >= this.maxReconnectAttempts) {
      logger.error(
        { streamId: this.streamId, attempts: this.reconnectCount },
        "Horizon stream max reconnect attempts reached — emitting outage alert"
      );
      this.emit("outage", { streamId: this.streamId, reconnectCount: this.reconnectCount });
      return;
    }

    const jitter = Math.random() * 0.3 * this.baseBackoffMs;
    const backoff = Math.min(
      this.baseBackoffMs * Math.pow(2, this.reconnectCount) + jitter,
      this.maxBackoffMs
    );
    this.reconnectCount += 1;
    this.setStatus("reconnecting");

    logger.info(
      { streamId: this.streamId, attempt: this.reconnectCount, backoffMs: Math.round(backoff) },
      "Scheduling Horizon stream reconnect"
    );

    this.reconnectTimer = setTimeout(() => {
      if (!this.closed) this._connect();
    }, backoff);
  }

  private _startGapCheck(): void {
    this.gapCheckTimer = setInterval(() => {
      if (this.closed || this.status !== "connected") return;
      if (!this.lastEventAt) return;

      const sinceLastEvent = Date.now() - this.lastEventAt.getTime();
      if (sinceLastEvent > this.gapThresholdMs && !this.gapDetected) {
        this.gapDetected = true;
        this.gapStartedAt = new Date();
        logger.warn(
          { streamId: this.streamId, sinceLastEventMs: sinceLastEvent },
          "Horizon stream gap detected — no events received"
        );
        this.emit("gap", { streamId: this.streamId, sinceLastEventMs: sinceLastEvent });
      }
    }, Math.min(this.gapThresholdMs / 2, 10_000));
  }

  private setStatus(status: StreamStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("statusChange", { streamId: this.streamId, status });
  }

  private _recordEventMetric(): void {
    try {
      const metrics = getMetricsService();
      if (metrics && metrics.websocketMessagesTotal) {
        metrics.websocketMessagesTotal.inc({ stream_id: this.streamId });
      }
    } catch {
      // metrics not critical
    }
  }
}

/**
 * Multi-stream manager — owns a pool of HorizonStreamSupervisor instances.
 */
export class HorizonStreamManager {
  private supervisors = new Map<string, HorizonStreamSupervisor>();

  add(config: HorizonStreamConfig): HorizonStreamSupervisor {
    if (this.supervisors.has(config.streamId)) {
      throw new Error(`Stream with id "${config.streamId}" already exists`);
    }
    const supervisor = new HorizonStreamSupervisor(config);
    this.supervisors.set(config.streamId, supervisor);
    supervisor.start();
    logger.info({ streamId: config.streamId }, "Horizon stream added to manager");
    return supervisor;
  }

  remove(streamId: string): boolean {
    const supervisor = this.supervisors.get(streamId);
    if (!supervisor) return false;
    supervisor.stop();
    this.supervisors.delete(streamId);
    logger.info({ streamId }, "Horizon stream removed from manager");
    return true;
  }

  get(streamId: string): HorizonStreamSupervisor | undefined {
    return this.supervisors.get(streamId);
  }

  list(): StreamHealthMetrics[] {
    return [...this.supervisors.values()].map((s) => s.getHealthMetrics());
  }

  checkpoints(): StreamCheckpoint[] {
    return [...this.supervisors.values()].map((s) => s.getCheckpoint());
  }

  stopAll(): void {
    for (const supervisor of this.supervisors.values()) {
      supervisor.stop();
    }
    this.supervisors.clear();
    logger.info("All Horizon stream supervisors stopped");
  }
}

// Singleton manager shared across the application
export const horizonStreamManager = new HorizonStreamManager();
