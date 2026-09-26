/**
 * Stablecoin Depeg Detection Service
 * Monitors stablecoin prices and detects depegging events with early warning
 */

import { getDatabase } from "../database/connection";
import { logger } from "../utils/logger";
import { redis } from "../utils/redis";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DepegSeverity = "warning" | "moderate" | "severe" | "critical";
export type DepegStatus = "active" | "recovering" | "resolved";

export interface DepegThresholds {
  warning: number; // 0.5% deviation
  moderate: number; // 1.0% deviation
  severe: number; // 2.0% deviation
  critical: number; // 5.0% deviation
}

export interface DepegEvent {
  id: string;
  symbol: string;
  peg_value: number;
  current_price: number;
  deviation_percent: number;
  severity: DepegSeverity;
  status: DepegStatus;
  sources: PriceSource[];
  trend: "worsening" | "improving" | "stable";
  detected_at: Date;
  resolved_at: Date | null;
  duration_seconds: number | null;
  max_deviation: number;
  recovery_time: number | null;
}

export interface PriceSource {
  name: string;
  price: number;
  timestamp: Date;
}

export interface DepegAnalysis {
  symbol: string;
  is_depegged: boolean;
  current_deviation: number;
  severity: DepegSeverity | null;
  trend: "worsening" | "improving" | "stable";
  time_in_depeg: number;
  sources: PriceSource[];
  historical_depegs: number;
  avg_recovery_time: number;
}

// ─── Depeg Detection Service ─────────────────────────────────────────────────

export class DepegService {
  private readonly STABLECOINS = ["USDC", "PYUSD", "EURC"];
  private readonly PEG_VALUES: Record<string, number> = {
    USDC: 1.0,
    PYUSD: 1.0,
    EURC: 1.07, // Approximate EUR/USD rate
  };

  private readonly THRESHOLDS: DepegThresholds = {
    warning: 0.005, // 0.5%
    moderate: 0.01, // 1.0%
    severe: 0.02, // 2.0%
    critical: 0.05, // 5.0%
  };

  private readonly CHECK_INTERVAL_MS = 10000; // 10 seconds
  private readonly TREND_WINDOW_MINUTES = 5;
  private readonly MIN_SOURCES_FOR_CRITICAL = 2; // Require 2+ sources to confirm critical depeg
  private readonly CONSECUTIVE_INTERVALS_FOR_CRITICAL = 3; // Require 3 consecutive confirmations
  private readonly DEVIATION_HISTORY_KEY_PREFIX = "depeg:deviation:"; // Track deviations per symbol

  /**
   * Monitor stablecoin for depeg with multi-source confidence weighting
   */
  async monitorStablecoin(symbol: string): Promise<DepegAnalysis> {
    try {
      // Get current prices from multiple sources
      const sources = await this.fetchPricesFromSources(symbol);

      if (sources.length === 0) {
        throw new Error(`No price sources available for ${symbol}`);
      }

      // Get peg value
      const pegValue = this.PEG_VALUES[symbol] || 1.0;

      // Calculate median price and MAD
      const { median: medianPrice, mad } = this.calculateMedianAndMAD(
        sources.map((s) => s.price),
      );

      // Calculate deviation using median (more resistant to outliers)
      const deviation = Math.abs(medianPrice - pegValue) / pegValue;

      // Determine if depegged
      const isDepegged = deviation >= this.THRESHOLDS.warning;

      // Get severity with multi-source confirmation for critical alerts
      const severity = this.calculateSeverity(deviation);
      const confirmedSeverity = await this.confirmSeverityWithMultipleSources(
        symbol,
        severity,
        deviation,
        sources.length,
      );

      // Analyze trend
      const trend = await this.analyzeTrend(symbol, deviation);

      // Get time in depeg
      const timeInDepeg = await this.getTimeInDepeg(symbol);

      // Get historical data
      const historicalDepegs = await this.getHistoricalDepegCount(symbol);
      const avgRecoveryTime = await this.getAverageRecoveryTime(symbol);

      const analysis: DepegAnalysis = {
        symbol,
        is_depegged: isDepegged,
        current_deviation: deviation,
        severity: confirmedSeverity,
        trend,
        time_in_depeg: timeInDepeg,
        sources,
        historical_depegs: historicalDepegs,
        avg_recovery_time: avgRecoveryTime,
      };

      // If depegged, create or update event
      if (isDepegged) {
        await this.handleDepegEvent(
          symbol,
          medianPrice,
          deviation,
          confirmedSeverity,
          sources,
          trend,
        );
      } else {
        // Check if recovering from depeg
        await this.checkRecovery(symbol);
      }

      return analysis;
    } catch (error) {
      logger.error({ error, symbol }, "Failed to monitor stablecoin");
      throw error;
    }
  }

  /**
   * Fetch prices from multiple sources
   */
  private async fetchPricesFromSources(symbol: string): Promise<PriceSource[]> {
    const db = getDatabase();

    try {
      // Get recent prices from last minute
      const oneMinuteAgo = new Date(Date.now() - 60000);

      const prices = await db("prices")
        .where({ symbol })
        .where("time", ">=", oneMinuteAgo)
        .orderBy("time", "desc")
        .limit(10);

      return prices.map((p: any) => ({
        name: p.source,
        price: parseFloat(p.price),
        timestamp: p.time,
      }));
    } catch (error) {
      logger.error({ error, symbol }, "Failed to fetch prices");
      return [];
    }
  }

  /**
   * Calculate severity based on deviation
   */
  private calculateSeverity(deviation: number): DepegSeverity | null {
    if (deviation >= this.THRESHOLDS.critical) return "critical";
    if (deviation >= this.THRESHOLDS.severe) return "severe";
    if (deviation >= this.THRESHOLDS.moderate) return "moderate";
    if (deviation >= this.THRESHOLDS.warning) return "warning";
    return null;
  }

  /**
   * Analyze price trend
   */
  private async analyzeTrend(
    symbol: string,
    currentDeviation: number,
  ): Promise<"worsening" | "improving" | "stable"> {
    try {
      const key = `depeg:trend:${symbol}`;
      const historicalStr = await redis.get(key);

      if (!historicalStr) {
        // Store current deviation
        await redis.setex(
          key,
          this.TREND_WINDOW_MINUTES * 60,
          JSON.stringify([currentDeviation]),
        );
        return "stable";
      }

      const historical: number[] = JSON.parse(historicalStr);
      historical.push(currentDeviation);

      // Keep only last 30 data points
      if (historical.length > 30) {
        historical.shift();
      }

      // Store updated history
      await redis.setex(
        key,
        this.TREND_WINDOW_MINUTES * 60,
        JSON.stringify(historical),
      );

      // Calculate trend
      if (historical.length < 3) return "stable";

      const recent = historical.slice(-3);
      const increasing = recent.every(
        (val, i) => i === 0 || val >= recent[i - 1],
      );
      const decreasing = recent.every(
        (val, i) => i === 0 || val <= recent[i - 1],
      );

      if (increasing) return "worsening";
      if (decreasing) return "improving";
      return "stable";
    } catch (error) {
      logger.error({ error, symbol }, "Failed to analyze trend");
      return "stable";
    }
  }

  /**
   * Handle depeg event
   */
  private async handleDepegEvent(
    symbol: string,
    currentPrice: number,
    deviation: number,
    severity: DepegSeverity | null,
    sources: PriceSource[],
    trend: "worsening" | "improving" | "stable",
  ): Promise<void> {
    const db = getDatabase();

    try {
      // Check if there's an active depeg event
      const activeEvent = await db("depeg_events")
        .where({ symbol, status: "active" })
        .first();

      if (activeEvent) {
        // Update existing event
        const maxDeviation = Math.max(activeEvent.max_deviation, deviation);
        const durationSeconds = Math.floor(
          (Date.now() - new Date(activeEvent.detected_at).getTime()) / 1000,
        );

        await db("depeg_events")
          .where({ id: activeEvent.id })
          .update({
            current_price: currentPrice,
            deviation_percent: deviation,
            severity,
            sources: JSON.stringify(sources),
            trend,
            max_deviation: maxDeviation,
            duration_seconds: durationSeconds,
          });

        // Send rapid alert if severity increased
        if (
          severity &&
          this.getSeverityLevel(severity) >
            this.getSeverityLevel(activeEvent.severity)
        ) {
          await this.sendRapidAlert(symbol, deviation, severity, trend);
        }
      } else {
        // Create new depeg event
        const eventId = `depeg_${symbol}_${Date.now()}`;

        await db("depeg_events").insert({
          id: eventId,
          symbol,
          peg_value: this.PEG_VALUES[symbol] || 1.0,
          current_price: currentPrice,
          deviation_percent: deviation,
          severity,
          status: "active",
          sources: JSON.stringify(sources),
          trend,
          detected_at: new Date(),
          resolved_at: null,
          duration_seconds: 0,
          max_deviation: deviation,
          recovery_time: null,
        });

        // Send initial alert
        await this.sendRapidAlert(symbol, deviation, severity, trend);

        logger.warn({ symbol, deviation, severity }, "Depeg detected");
      }
    } catch (error) {
      logger.error({ error, symbol }, "Failed to handle depeg event");
    }
  }

  /**
   * Check if stablecoin is recovering
   */
  private async checkRecovery(symbol: string): Promise<void> {
    const db = getDatabase();

    try {
      const activeEvent = await db("depeg_events")
        .where({ symbol, status: "active" })
        .first();

      if (activeEvent) {
        // Mark as recovering
        await db("depeg_events").where({ id: activeEvent.id }).update({
          status: "recovering",
        });

        // Wait for confirmation before marking as resolved
        setTimeout(async () => {
          const analysis = await this.monitorStablecoin(symbol);

          if (!analysis.is_depegged) {
            const recoveryTime = Math.floor(
              (Date.now() - new Date(activeEvent.detected_at).getTime()) / 1000,
            );

            await db("depeg_events").where({ id: activeEvent.id }).update({
              status: "resolved",
              resolved_at: new Date(),
              recovery_time: recoveryTime,
            });

            logger.info({ symbol, recoveryTime }, "Depeg resolved");
          }
        }, 60000); // Wait 1 minute for confirmation
      }
    } catch (error) {
      logger.error({ error, symbol }, "Failed to check recovery");
    }
  }

  /**
   * Send rapid alert
   */
  private async sendRapidAlert(
    symbol: string,
    deviation: number,
    severity: DepegSeverity | null,
    trend: string,
  ): Promise<void> {
    logger.warn(
      {
        symbol,
        deviation: `${(deviation * 100).toFixed(2)}%`,
        severity,
        trend,
      },
      "DEPEG ALERT",
    );

    // In production, send to alert service, webhooks, etc.
  }

  /**
   * Get time in depeg
   */
  private async getTimeInDepeg(symbol: string): Promise<number> {
    const db = getDatabase();

    try {
      const activeEvent = await db("depeg_events")
        .where({ symbol, status: "active" })
        .first();

      if (!activeEvent) return 0;

      return Math.floor(
        (Date.now() - new Date(activeEvent.detected_at).getTime()) / 1000,
      );
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get historical depeg count
   */
  private async getHistoricalDepegCount(symbol: string): Promise<number> {
    const db = getDatabase();

    try {
      const result = await db("depeg_events")
        .where({ symbol })
        .count("* as count")
        .first();

      return parseInt(result?.count as string) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get average recovery time
   */
  private async getAverageRecoveryTime(symbol: string): Promise<number> {
    const db = getDatabase();

    try {
      const result = await db("depeg_events")
        .where({ symbol, status: "resolved" })
        .whereNotNull("recovery_time")
        .avg("recovery_time as avg")
        .first();

      return parseInt(result?.avg as string) || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate median and median absolute deviation (MAD)
   */
  private calculateMedianAndMAD(prices: number[]): { median: number; mad: number } {
    if (prices.length === 0) {
      return { median: 0, mad: 0 };
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const n = sorted.length;
    const median =
      n % 2 === 0
        ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        : sorted[Math.floor(n / 2)];

    // Calculate median absolute deviation
    const deviations = sorted.map((p) => Math.abs(p - median));
    const sortedDeviations = deviations.sort((a, b) => a - b);
    const madIndex = Math.floor(sortedDeviations.length / 2);
    const mad =
      sortedDeviations.length % 2 === 0
        ? (sortedDeviations[madIndex - 1] + sortedDeviations[madIndex]) / 2
        : sortedDeviations[madIndex];

    return { median, mad };
  }

  /**
   * Confirm severity with multiple independent sources
   * Only triggers CRITICAL_DEPEG if 2+ sources confirm for 3 consecutive intervals
   */
  private async confirmSeverityWithMultipleSources(
    symbol: string,
    severity: DepegSeverity | null,
    deviation: number,
    sourceCount: number,
  ): Promise<DepegSeverity | null> {
    // If not critical, return as-is
    if (severity !== "critical") {
      return severity;
    }

    // If fewer than minimum sources, downgrade to severe
    if (sourceCount < this.MIN_SOURCES_FOR_CRITICAL) {
      logger.warn(
        {
          symbol,
          deviation: `${(deviation * 100).toFixed(2)}%`,
          sourceCount,
          minRequired: this.MIN_SOURCES_FOR_CRITICAL,
        },
        "Critical depeg requires multiple sources — downgrading to severe",
      );
      return "severe";
    }

    // Track consecutive confirmations
    const key = `${this.DEVIATION_HISTORY_KEY_PREFIX}${symbol}`;
    const historyStr = await redis.get(key);
    let history: Array<{ deviation: number; timestamp: number }> = [];

    if (historyStr) {
      try {
        history = JSON.parse(historyStr);
      } catch {
        history = [];
      }
    }

    // Add current reading
    history.push({ deviation, timestamp: Date.now() });

    // Keep only recent readings (last 3 intervals)
    history = history.slice(-this.CONSECUTIVE_INTERVALS_FOR_CRITICAL);

    // Store updated history
    await redis.setex(key, 300, JSON.stringify(history));

    // Check if we have enough consecutive confirmations
    const consecutiveConfirmations = history.filter(
      (h) => Math.abs(h.deviation - this.THRESHOLDS.critical) < 0.001 ||
        h.deviation > this.THRESHOLDS.critical,
    ).length;

    if (
      consecutiveConfirmations < this.CONSECUTIVE_INTERVALS_FOR_CRITICAL
    ) {
      logger.warn(
        {
          symbol,
          deviation: `${(deviation * 100).toFixed(2)}%`,
          consecutiveConfirmations,
          required: this.CONSECUTIVE_INTERVALS_FOR_CRITICAL,
        },
        "Critical depeg requires consecutive confirmations — downgrading to severe",
      );
      return "severe";
    }

    // Critical depeg confirmed by multiple sources and consecutive intervals
    return "critical";
  }

  /**
   * Get severity level for comparison
   */
  private getSeverityLevel(severity: DepegSeverity): number {
    const levels: Record<DepegSeverity, number> = {
      warning: 1,
      moderate: 2,
      severe: 3,
      critical: 4,
    };
    return levels[severity] || 0;
  }

  /**
   * Get all active depegs
   */
  async getActiveDepegs(): Promise<DepegEvent[]> {
    const db = getDatabase();

    try {
      const events = await db("depeg_events")
        .whereIn("status", ["active", "recovering"])
        .orderBy("detected_at", "desc");

      return events.map((e: any) => ({
        ...e,
        sources: JSON.parse(e.sources || "[]"),
      }));
    } catch (error) {
      logger.error({ error }, "Failed to get active depegs");
      return [];
    }
  }

  /**
   * Get depeg history
   */
  async getDepegHistory(
    symbol?: string,
    limit: number = 50,
  ): Promise<DepegEvent[]> {
    const db = getDatabase();

    try {
      let query = db("depeg_events");

      if (symbol) {
        query = query.where({ symbol });
      }

      const events = await query.orderBy("detected_at", "desc").limit(limit);

      return events.map((e: any) => ({
        ...e,
        sources: JSON.parse(e.sources || "[]"),
      }));
    } catch (error) {
      logger.error({ error }, "Failed to get depeg history");
      return [];
    }
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

export const depegService = new DepegService();
