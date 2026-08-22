/**
 * Temporal Utilities
 * 
 * Core functions for creating temporal points, comparing intervals,
 * and handling temporal operations with explicit uncertainty.
 */

import type {
  ClockSource,
  ClockProvenance,
  TemporalInterval,
  TemporalMetadata,
  TemporalPoint,
  ComparisonOptions,
  ComparisonResult,
  TemporalWindowOptions,
  LatencyBreakdown,
  TemporalQuality,
} from "./types.js";
import { clockRegistry } from "./clockRegistry.js";

// ─── Temporal Point Creation ───────────────────────────────────────────────────

/**
 * Create a TemporalPoint from a timestamp with clock provenance.
 */
const DEFAULT_TEMPORAL_OPTIONS = {
  chain: undefined,
  provider: undefined,
  blockNumber: undefined,
  rawTimestamp: undefined,
  confidence: 1.0,
  observedAt: Date.now(),
};

export function createTemporalPoint(
  timestampMs: number,
  source: ClockSource,
  options: Partial<typeof DEFAULT_TEMPORAL_OPTIONS> = {}
): TemporalPoint {
  const opts = { ...DEFAULT_TEMPORAL_OPTIONS, ...options };
  const {
    chain,
    provider,
    blockNumber,
    rawTimestamp,
    confidence,
    observedAt,
  } = opts;

  const configKey = clockRegistry.makeKey(source, chain, provider);
  const config = clockRegistry.getConfig(configKey);

  const provenance: ClockProvenance = {
    source,
    precision: config?.precision || "approximate",
    chain,
    provider,
    blockNumber,
    rawTimestamp,
    confidence: Math.min(1.0, Math.max(0.0, confidence)),
  };

  const uncertainty = config
    ? clockRegistry.calculateUncertainty(timestampMs, config, observedAt)
    : { earliestMs: timestampMs - 5000, latestMs: timestampMs + 5000 };

  const observationLatencyMs = Math.max(0, observedAt - timestampMs);

  const temporal: TemporalMetadata = {
    provenance,
    uncertainty,
    observedAt,
    observationLatencyMs,
    isMissing: false,
  };

  return { timestampMs, temporal };
}

/**
 * Create a TemporalPoint for missing/invalid timestamps.
 */
export function createMissingTemporalPoint(
  source: ClockSource,
  options: {
    chain?: string;
    provider?: string;
    observedAt?: number;
  } = {}
): TemporalPoint {
  const { chain, provider, observedAt = Date.now() } = options;

  const provenance: ClockProvenance = {
    source,
    precision: "approximate",
    chain,
    provider,
    confidence: 0,
  };

  const uncertainty: TemporalInterval = {
    earliestMs: 0,
    latestMs: Number.MAX_SAFE_INTEGER,
  };

  const temporal: TemporalMetadata = {
    provenance,
    uncertainty,
    observedAt,
    observationLatencyMs: 0,
    isMissing: true,
    notes: ["Timestamp is missing or invalid"],
  };

  return { timestampMs: 0, temporal };
}

// ─── Interval Operations ───────────────────────────────────────────────────────

/**
 * Check if two intervals overlap.
 */
export function intervalsOverlap(a: TemporalInterval, b: TemporalInterval): boolean {
  return a.earliestMs < b.latestMs && b.earliestMs < a.latestMs;
}

/**
 * Calculate the overlap between two intervals.
 */
export function intervalOverlap(a: TemporalInterval, b: TemporalInterval): TemporalInterval | null {
  const earliestMs = Math.max(a.earliestMs, b.earliestMs);
  const latestMs = Math.min(a.latestMs, b.latestMs);

  if (earliestMs >= latestMs) return null;

  return { earliestMs, latestMs };
}

/**
 * Merge two intervals into their union.
 */
export function mergeIntervals(a: TemporalInterval, b: TemporalInterval): TemporalInterval {
  return {
    earliestMs: Math.min(a.earliestMs, b.earliestMs),
    latestMs: Math.max(a.latestMs, b.latestMs),
  };
}

/**
 * Calculate the gap between two intervals.
 */
export function intervalGap(a: TemporalInterval, b: TemporalInterval): number {
  if (intervalsOverlap(a, b)) return 0;
  return Math.abs(a.earliestMs - b.latestMs);
}

// ─── Temporal Comparisons ──────────────────────────────────────────────────────

/**
 * Compare two TemporalPoints with explicit comparison mode.
 */
const DEFAULT_COMPARISON_OPTIONS = {
  mode: "strict" as const,
  minConfidence: 0.7,
  maxClockSkewMs: 5000,
};

export function compareTemporalPoints(
  a: TemporalPoint,
  b: TemporalPoint,
  options: Partial<typeof DEFAULT_COMPARISON_OPTIONS> = {}
): ComparisonResult {
  const opts = { ...DEFAULT_COMPARISON_OPTIONS, ...options };
  const { mode, minConfidence, maxClockSkewMs } = opts;

  // Handle missing timestamps
  if (a.temporal.isMissing || b.temporal.isMissing) {
    return {
      success: false,
      confidence: 0,
      warnings: ["One or both timestamps are missing"],
    };
  }

  const intervalA = a.temporal.uncertainty;
  const intervalB = b.temporal.uncertainty;

  const warnings: string[] = [];
  let clockSkewMs: number | undefined;

  if (mode === "strict") {
    return handleStrictComparison(intervalA, intervalB, maxClockSkewMs, warnings);
  }

  if (mode === "approximate") {
    return handleApproximateComparison(a, b, intervalA, intervalB, minConfidence, maxClockSkewMs, warnings);
  }

  if (mode === "optimistic") {
    return handleOptimisticComparison(intervalA, intervalB);
  }

  if (mode === "pessimistic") {
    return handlePessimisticComparison(intervalA, intervalB);
  }

  return {
    success: false,
    confidence: 0,
    warnings: ["Unknown comparison mode"],
  };
}

function handleStrictComparison(
  intervalA: TemporalInterval,
  intervalB: TemporalInterval,
  maxClockSkewMs: number,
  warnings: string[]
): ComparisonResult {
  if (intervalsOverlap(intervalA, intervalB)) {
    return {
      success: false,
      result: "concurrent",
      confidence: 0,
      warnings: ["Intervals overlap in strict mode"],
    };
  }

  const result = intervalA.latestMs <= intervalB.earliestMs ? "before" : "after";
  const clockSkewMs = Math.abs(intervalA.earliestMs - intervalB.earliestMs);

  if (clockSkewMs > maxClockSkewMs) {
    warnings.push(`Clock skew exceeds threshold: ${clockSkewMs}ms`);
  }

  return {
    success: true,
    result,
    confidence: 1.0,
    clockSkewMs,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function handleApproximateComparison(
  a: TemporalPoint,
  b: TemporalPoint,
  intervalA: TemporalInterval,
  intervalB: TemporalInterval,
  minConfidence: number,
  maxClockSkewMs: number,
  warnings: string[]
): ComparisonResult {
  const overlap = intervalOverlap(intervalA, intervalB);
  const avgConfidence = (a.temporal.provenance.confidence + b.temporal.provenance.confidence) / 2;

  if (overlap && avgConfidence < minConfidence) {
    return {
      success: false,
      result: "concurrent",
      confidence: avgConfidence,
      warnings: ["Low confidence with interval overlap"],
    };
  }

  const result = a.timestampMs < b.timestampMs ? "before" : "after";
  const clockSkewMs = Math.abs(a.timestampMs - b.timestampMs);

  if (clockSkewMs > maxClockSkewMs) {
    warnings.push(`Clock skew exceeds threshold: ${clockSkewMs}ms`);
  }

  return {
    success: true,
    result,
    confidence: avgConfidence,
    clockSkewMs,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function handleOptimisticComparison(
  intervalA: TemporalInterval,
  intervalB: TemporalInterval
): ComparisonResult {
  const result = intervalA.earliestMs < intervalB.earliestMs ? "before" : "after";
  const clockSkewMs = Math.abs(intervalA.earliestMs - intervalB.earliestMs);

  return {
    success: true,
    result,
    confidence: 0.5,
    clockSkewMs,
  };
}

function handlePessimisticComparison(
  intervalA: TemporalInterval,
  intervalB: TemporalInterval
): ComparisonResult {
  const result = intervalA.latestMs < intervalB.latestMs ? "before" : "after";
  const clockSkewMs = Math.abs(intervalA.latestMs - intervalB.latestMs);

  return {
    success: true,
    result,
    confidence: 0.5,
    clockSkewMs,
  };
}

const DEFAULT_WINDOW_OPTIONS = {
  boundaryMode: "inclusive_start" as const,
  uncertaintyMode: "strict" as const,
  includeMissing: false,
};

/**
 * Check if a TemporalPoint falls within a time window.
 */
export function isPointInWindow(
  point: TemporalPoint,
  windowStartMs: number,
  windowEndMs: number,
  options: Partial<typeof DEFAULT_WINDOW_OPTIONS> = {}
): boolean {
  const opts = { ...DEFAULT_WINDOW_OPTIONS, ...options };
  const { boundaryMode, uncertaintyMode, includeMissing } = opts;

  if (point.temporal.isMissing) {
    return includeMissing;
  }

  const interval = point.temporal.uncertainty;

  let testInterval: TemporalInterval;

  switch (uncertaintyMode) {
    case "strict":
      // Use the full uncertainty interval
      testInterval = interval;
      break;
    case "lenient":
      // Use the point estimate only
      testInterval = { earliestMs: point.timestampMs, latestMs: point.timestampMs };
      break;
    case "expand":
      // Expand the window to include the uncertainty
      testInterval = {
        earliestMs: Math.min(interval.earliestMs, windowStartMs),
        latestMs: Math.max(interval.latestMs, windowEndMs),
      };
      break;
  }

  switch (boundaryMode) {
    case "inclusive_start":
      return testInterval.earliestMs >= windowStartMs && testInterval.earliestMs < windowEndMs;
    case "inclusive_end":
      return testInterval.latestMs > windowStartMs && testInterval.latestMs <= windowEndMs;
    case "inclusive_both":
      return testInterval.earliestMs >= windowStartMs && testInterval.latestMs <= windowEndMs;
    case "exclusive_both":
      return testInterval.earliestMs > windowStartMs && testInterval.latestMs < windowEndMs;
  }
}

// ─── Latency Analysis ─────────────────────────────────────────────────────────

/**
 * Break down latency into components, distinguishing network delay from clock skew.
 */
export function analyzeLatency(
  sourcePoint: TemporalPoint,
  destinationPoint: TemporalPoint,
  expectedNetworkDelayMs: number = 1000
): LatencyBreakdown {
  const totalLatencyMs = destinationPoint.timestampMs - sourcePoint.timestampMs;

  if (totalLatencyMs < 0) {
    return {
      totalLatencyMs,
      networkDelayMs: 0,
      clockSkewMs: Math.abs(totalLatencyMs),
      processingDelayMs: 0,
      confidence: 0,
    };
  }

  // Estimate clock skew from uncertainty intervals
  const sourceUncertainty = sourcePoint.temporal.uncertainty;
  const destUncertainty = destinationPoint.temporal.uncertainty;

  const sourceRange = sourceUncertainty.latestMs - sourceUncertainty.earliestMs;
  const destRange = destUncertainty.latestMs - destUncertainty.earliestMs;

  // Clock skew estimate based on uncertainty ranges
  const clockSkewMs = (sourceRange + destRange) / 2;

  // Network delay estimate (total minus clock skew and processing)
  const processingDelayMs = Math.min(
    sourcePoint.temporal.observationLatencyMs,
    destinationPoint.temporal.observationLatencyMs
  );

  const networkDelayMs = Math.max(0, totalLatencyMs - clockSkewMs - processingDelayMs);

  // Confidence based on how well the breakdown matches expectations
  let confidence: number;
  if (networkDelayMs > expectedNetworkDelayMs * 10) {
    confidence = 0.3;
  } else if (networkDelayMs < expectedNetworkDelayMs * 0.1) {
    confidence = 0.5;
  } else {
    confidence = 0.8;
  }

  return {
    totalLatencyMs,
    networkDelayMs,
    clockSkewMs,
    processingDelayMs,
    confidence,
  };
}

// ─── Temporal Quality Assessment ───────────────────────────────────────────────

/**
 * Assess the quality of temporal data for a set of points.
 */
export function assessTemporalQuality(points: TemporalPoint[]): TemporalQuality {
  if (points.length === 0) {
    return {
      score: 0,
      clockSyncStatus: "unknown",
      freshnessStatus: "unknown",
      isSufficient: false,
    };
  }

  const validPoints = points.filter(p => !p.temporal.isMissing);
  const missingCount = points.length - validPoints.length;

  // Calculate average confidence
  const avgConfidence = validPoints.reduce((sum, p) => sum + p.temporal.provenance.confidence, 0) / validPoints.length;

  // Assess clock synchronization
  const clockSyncStatus = assessClockSync(validPoints);

  // Assess freshness based on observation latency
  const avgLatency = validPoints.reduce((sum, p) => sum + p.temporal.observationLatencyMs, 0) / validPoints.length;
  let freshnessStatus: "fresh" | "stale" | "unknown";
  if (avgLatency < 5000) {
    freshnessStatus = "fresh";
  } else if (avgLatency < 30000) {
    freshnessStatus = "stale";
  } else {
    freshnessStatus = "unknown";
  }

  // Overall score
  const missingPenalty = (missingCount / points.length) * 0.5;
  const score = Math.max(0, avgConfidence - missingPenalty);

  const isSufficient = score > 0.7 && clockSyncStatus !== "unknown" && freshnessStatus !== "unknown";

  return {
    score,
    clockSyncStatus,
    freshnessStatus,
    isSufficient,
  };
}

function assessClockSync(points: TemporalPoint[]): "synchronized" | "drifting" | "unknown" {
  if (points.length < 2) return "unknown";

  // Check for consistent clock sources
  const sources = new Set(points.map(p => p.temporal.provenance.source));
  if (sources.size > 1) return "drifting";

  // Check for significant timestamp gaps that suggest clock issues
  const sortedPoints = [...points].sort((a, b) => a.timestampMs - b.timestampMs);
  let hasDrift = false;

  for (let i = 1; i < sortedPoints.length; i++) {
    const gap = sortedPoints[i].timestampMs - sortedPoints[i - 1].timestampMs;
    const expectedGap = 5000; // Default 5 second expectation

    if (Math.abs(gap - expectedGap) > expectedGap * 2) {
      hasDrift = true;
      break;
    }
  }

  return hasDrift ? "drifting" : "synchronized";
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Convert ISO-8601 string to Unix milliseconds.
 */
export function isoToMs(isoString: string): number {
  return new Date(isoString).getTime();
}

/**
 * Convert Unix milliseconds to ISO-8601 string.
 */
export function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Get current time as a TemporalPoint with system clock provenance.
 */
export function nowAsTemporalPoint(): TemporalPoint {
  return createTemporalPoint(Date.now(), "system_clock", {
    observedAt: Date.now(),
  });
}
