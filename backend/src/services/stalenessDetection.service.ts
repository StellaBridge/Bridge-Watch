import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { STALENESS_RULES, type StalenessRule } from "../config/stalenessRules.js";
import { compareTemporalPoints, createTemporalPoint, nowAsTemporalPoint } from "../temporal/temporalUtils.js";
import type { ComparisonOptions } from "../temporal/types.js";

export type FreshnessStatus = "fresh" | "warning" | "stale" | "missing";
export type TrendDirection = "improving" | "stable" | "deteriorating" | "unknown";

export interface FreshnessSourceSnapshot {
  key: string;
  label: string;
  description: string;
  sourceType: "source" | "derived";
  status: FreshnessStatus;
  lastUpdated: string | null;
  ageMs: number | null;
  expectedIntervalMs: number;
  warnAfterMs: number;
  criticalAfterMs: number;
  trend: TrendDirection;
  recentIntervalsMs?: number[];
  history?: string[];
  error?: string;
  /** Temporal comparison mode used for freshness assessment */
  comparisonMode?: "strict" | "approximate" | "optimistic" | "pessimistic";
  /** Confidence in the freshness assessment (0-1) */
  confidence?: number;
}

export interface FreshnessSnapshot {
  status: FreshnessStatus;
  timestamp: string;
  sources: FreshnessSourceSnapshot[];
}

export interface FreshnessAlert {
  key: string;
  label: string;
  severity: "warning" | "critical";
  status: FreshnessStatus;
  message: string;
  lastUpdated: string | null;
  ageMs: number | null;
  thresholdMs: number;
  timestamp: string;
}

export class StalenessDetectionService {
  private readonly db = getDatabase();
  private readonly rules = STALENESS_RULES;

  async getSnapshot(options?: {
    includeHistory?: boolean;
    historyLimit?: number;
    comparisonMode?: ComparisonOptions["mode"];
  }): Promise<FreshnessSnapshot> {
    const includeHistory = options?.includeHistory ?? false;
    const historyLimit = Math.max(2, options?.historyLimit ?? 10);
    const comparisonMode = options?.comparisonMode ?? "approximate";

    const sources = await Promise.all(
      this.rules.map((rule) =>
        this.buildSourceSnapshot(rule, { includeHistory, historyLimit, comparisonMode })
      )
    );

    const statuses = sources.map((source) => source.status);
    const status = this.rollupStatus(statuses);

    return {
      status,
      timestamp: new Date().toISOString(),
      sources,
    };
  }

  async getSourceDetail(
    key: string,
    options?: { includeHistory?: boolean; historyLimit?: number }
  ): Promise<FreshnessSourceSnapshot | null> {
    const rule = this.rules.find((r) => r.key === key);
    if (!rule) return null;

    const includeHistory = options?.includeHistory ?? true;
    const historyLimit = Math.max(2, options?.historyLimit ?? 10);
    return this.buildSourceSnapshot(rule, { includeHistory, historyLimit });
  }

  async getAlerts(): Promise<FreshnessAlert[]> {
    const snapshot = await this.getSnapshot({ includeHistory: false });
    return this.buildAlerts(snapshot);
  }

  async runScheduledCheck(): Promise<{ snapshot: FreshnessSnapshot; alerts: FreshnessAlert[] }> {
    const snapshot = await this.getSnapshot({ includeHistory: false });
    const alerts = this.buildAlerts(snapshot);

    if (alerts.length > 0) {
      logger.warn({ alertCount: alerts.length, alerts }, "Staleness checks detected issues");
    } else {
      logger.info("Staleness checks are healthy");
    }

    return { snapshot, alerts };
  }

  private async buildSourceSnapshot(
    rule: StalenessRule,
    options: { includeHistory: boolean; historyLimit: number; comparisonMode?: ComparisonOptions["mode"] }
  ): Promise<FreshnessSourceSnapshot> {
    try {
      const timestamps = await this.getRecentTimestamps(rule, options.historyLimit);
      const latest = timestamps[0] ?? null;
      
      // Use temporal comparison for freshness assessment
      let ageMs: number | null = null;
      let confidence = 1.0;
      
      if (latest) {
        const latestTemporal = createTemporalPoint(latest.getTime(), "system_clock", {
          observedAt: Date.now(),
        });
        const nowTemporal = nowAsTemporalPoint();
        
        const comparison = compareTemporalPoints(latestTemporal, nowTemporal, {
          mode: options.comparisonMode || "approximate",
        });
        
        ageMs = Date.now() - latest.getTime();
        confidence = comparison.confidence;
      }
      
      const status = this.evaluateStatus(rule, ageMs);
      const trend = this.calculateTrend(rule, timestamps);
      const intervals = this.calculateIntervals(timestamps);

      return {
        key: rule.key,
        label: rule.label,
        description: rule.description,
        sourceType: rule.sourceType,
        status,
        lastUpdated: latest ? latest.toISOString() : null,
        ageMs,
        expectedIntervalMs: rule.expectedIntervalMs,
        warnAfterMs: rule.warnAfterMs,
        criticalAfterMs: rule.criticalAfterMs,
        trend,
        recentIntervalsMs: options.includeHistory ? intervals : undefined,
        history: options.includeHistory ? timestamps.map((t) => t.toISOString()) : undefined,
        comparisonMode: options.comparisonMode,
        confidence,
      };
    } catch (error) {
      logger.error({ error, rule: rule.key }, "Failed to evaluate freshness rule");
      return {
        key: rule.key,
        label: rule.label,
        description: rule.description,
        sourceType: rule.sourceType,
        status: "missing",
        lastUpdated: null,
        ageMs: null,
        expectedIntervalMs: rule.expectedIntervalMs,
        warnAfterMs: rule.warnAfterMs,
        criticalAfterMs: rule.criticalAfterMs,
        trend: "unknown",
        error: error instanceof Error ? error.message : "Unknown error",
        comparisonMode: options.comparisonMode,
        confidence: 0,
      };
    }
  }

  private async getRecentTimestamps(rule: StalenessRule, limit: number): Promise<Date[]> {
    const rows = await this.db(rule.table)
      .select(rule.timeColumn)
      .orderBy(rule.timeColumn, "desc")
      .limit(limit);

    return rows
      .map((row: Record<string, unknown>) => this.normalizeTimestamp(row[rule.timeColumn]))
      .filter((value): value is Date => value !== null);
  }

  private normalizeTimestamp(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private evaluateStatus(rule: StalenessRule, ageMs: number | null): FreshnessStatus {
    if (ageMs === null) return "missing";
    if (ageMs <= rule.warnAfterMs) return "fresh";
    if (ageMs <= rule.criticalAfterMs) return "warning";
    return "stale";
  }

  private calculateTrend(rule: StalenessRule, timestamps: Date[]): TrendDirection {
    if (timestamps.length < 2) return "unknown";

    const intervals = this.calculateIntervals(timestamps);
    if (intervals.length === 0) return "unknown";

    const latestInterval = intervals[0];
    const baseline = intervals.length > 1 ? intervals[1] : rule.expectedIntervalMs;

    if (latestInterval >= baseline * 1.2) return "deteriorating";
    if (latestInterval <= baseline * 0.8) return "improving";
    return "stable";
  }

  private calculateIntervals(timestamps: Date[]): number[] {
    const intervals: number[] = [];

    for (let i = 0; i < timestamps.length - 1; i += 1) {
      const delta = timestamps[i].getTime() - timestamps[i + 1].getTime();
      if (delta > 0) {
        intervals.push(delta);
      }
    }

    return intervals;
  }

  private rollupStatus(statuses: FreshnessStatus[]): FreshnessStatus {
    if (statuses.length === 0) return "missing";
    if (statuses.every((status) => status === "missing")) return "missing";
    if (statuses.includes("stale")) return "stale";
    if (statuses.includes("warning")) return "warning";
    return "fresh";
  }

  private buildAlerts(snapshot: FreshnessSnapshot): FreshnessAlert[] {
    const now = new Date().toISOString();

    return snapshot.sources
      .filter((source) => source.status === "warning" || source.status === "stale" || source.status === "missing")
      .map((source) => {
        const severity = source.status === "warning" ? "warning" : "critical";
        const thresholdMs = source.status === "warning" ? source.warnAfterMs : source.criticalAfterMs;
        const message = this.formatAlertMessage(source, thresholdMs);

        return {
          key: source.key,
          label: source.label,
          severity,
          status: source.status,
          message,
          lastUpdated: source.lastUpdated,
          ageMs: source.ageMs,
          thresholdMs,
          timestamp: now,
        };
      });
  }

  private formatAlertMessage(source: FreshnessSourceSnapshot, thresholdMs: number): string {
    if (!source.lastUpdated) {
      return `No recent updates detected for ${source.label}`;
    }

    const age = source.ageMs ?? 0;
    return `${source.label} last updated ${this.formatDuration(age)} ago (threshold ${this.formatDuration(thresholdMs)})`;
  }

  private formatDuration(ms: number): string {
    if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
    if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m`;
    return `${Math.round(ms / (60 * 60_000))}h`;
  }
}

export const stalenessDetectionService = new StalenessDetectionService();
