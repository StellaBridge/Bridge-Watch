/**
 * Configurable aggregation window functions for contract statistics and rollups.
 *
 * Pure and read-only: given a set of timestamped data points and a window
 * configuration, these helpers bucket the points into tumbling or sliding
 * windows and compute deterministic per-window aggregates. No I/O, no clock —
 * the same input always yields the same output, which keeps rollups reproducible.
 *
 * Windows are half-open intervals `[start, end)`, so a point landing exactly on
 * a boundary belongs to the later window (never double-counted).
 */

import type { TemporalPoint, TemporalWindowOptions } from "../temporal/types.js";
import { isPointInWindow } from "../temporal/temporalUtils.js";

export type WindowType = "tumbling" | "sliding";

export interface WindowConfig {
  /** Window length in milliseconds (> 0). */
  sizeMs: number;
  /**
   * Step between consecutive window starts in milliseconds (> 0). Defaults to
   * `sizeMs` (i.e. non-overlapping tumbling windows). For sliding windows use a
   * step smaller than `sizeMs`.
   */
  stepMs?: number;
  /** Epoch origin (ms) that window boundaries align to. Defaults to 0. */
  originMs?: number;
}

export interface DataPoint {
  /** Unix timestamp in milliseconds. */
  timestamp: number;
  value: number;
}

export interface TemporalDataPoint {
  /** Temporal point with clock provenance and uncertainty */
  temporal: TemporalPoint;
  value: number;
}

export interface AggregatedWindow {
  /** Inclusive window start (ms). */
  start: number;
  /** Exclusive window end (ms). */
  end: number;
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  /** Number of points with uncertain boundary placement */
  uncertainBoundaryCount?: number;
  /** Confidence score for this window (0-1) */
  confidence?: number;
}

function validateConfig(config: WindowConfig): Required<WindowConfig> {
  const { sizeMs } = config;
  const stepMs = config.stepMs ?? sizeMs;
  const originMs = config.originMs ?? 0;

  if (!Number.isFinite(sizeMs) || sizeMs <= 0) {
    throw new Error(`aggregationWindow: sizeMs must be a positive number, got ${sizeMs}`);
  }
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error(`aggregationWindow: stepMs must be a positive number, got ${stepMs}`);
  }
  if (!Number.isFinite(originMs)) {
    throw new Error(`aggregationWindow: originMs must be a finite number, got ${originMs}`);
  }
  return { sizeMs, stepMs, originMs };
}

/**
 * Start (ms) of the tumbling window that contains `timestamp`, aligned to the
 * configured origin. Exposed so callers can label points consistently.
 */
export function windowStartFor(timestamp: number, config: WindowConfig): number {
  const { sizeMs, originMs } = validateConfig(config);
  const offset = timestamp - originMs;
  return originMs + Math.floor(offset / sizeMs) * sizeMs;
}

function aggregate(points: DataPoint[], start: number, end: number): AggregatedWindow {
  let count = 0;
  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;
  for (const p of points) {
    if (p.timestamp >= start && p.timestamp < end) {
      count += 1;
      sum += p.value;
      min = min === null || p.value < min ? p.value : min;
      max = max === null || p.value > max ? p.value : max;
    }
  }
  return { start, end, count, sum, min, max, avg: count > 0 ? sum / count : null };
}

function aggregateTemporal(
  points: TemporalDataPoint[],
  start: number,
  end: number,
  options: TemporalWindowOptions
): AggregatedWindow {
  let count = 0;
  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;
  let uncertainBoundaryCount = 0;
  let totalConfidence = 0;

  for (const p of points) {
    const inWindow = isPointInWindow(p.temporal, start, end, options);
    if (inWindow) {
      count += 1;
      sum += p.value;
      min = min === null || p.value < min ? p.value : min;
      max = max === null || p.value > max ? p.value : max;
      
      // Track uncertainty at boundaries
      const uncertaintyRange = p.temporal.uncertainty.latestMs - p.temporal.uncertainty.earliestMs;
      if (uncertaintyRange > 1000) { // More than 1 second uncertainty
        uncertainBoundaryCount++;
      }
      
      totalConfidence += p.temporal.provenance.confidence;
    }
  }

  const confidence = count > 0 ? totalConfidence / count : 0;

  return {
    start,
    end,
    count,
    sum,
    min,
    max,
    avg: count > 0 ? sum / count : null,
    uncertainBoundaryCount,
    confidence,
  };
}

/** Non-overlapping windows covering the span of the data, in ascending order. */
export function aggregateTumbling(
  points: DataPoint[],
  config: WindowConfig,
): AggregatedWindow[] {
  const { sizeMs, originMs } = validateConfig(config);
  if (points.length === 0) return [];

  const timestamps = points.map((p) => p.timestamp);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  const firstStart = windowStartFor(minTs, { sizeMs, originMs });
  const windows: AggregatedWindow[] = [];
  for (let start = firstStart; start <= maxTs; start += sizeMs) {
    windows.push(aggregate(points, start, start + sizeMs));
  }
  return windows;
}

/** Overlapping windows advancing by `stepMs`, in ascending order. */
export function aggregateSliding(
  points: DataPoint[],
  config: WindowConfig,
): AggregatedWindow[] {
  const { sizeMs, stepMs, originMs } = validateConfig(config);
  if (points.length === 0) return [];

  const timestamps = points.map((p) => p.timestamp);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  const firstStart = windowStartFor(minTs, { sizeMs, originMs });
  const windows: AggregatedWindow[] = [];
  for (let start = firstStart; start <= maxTs; start += stepMs) {
    windows.push(aggregate(points, start, start + sizeMs));
  }
  return windows;
}

/** Dispatch to the tumbling or sliding aggregator. */
export function aggregateWindows(
  points: DataPoint[],
  type: WindowType,
  config: WindowConfig,
): AggregatedWindow[] {
  return type === "sliding"
    ? aggregateSliding(points, config)
    : aggregateTumbling(points, config);
}

// ─── Temporal-aware aggregation ─────────────────────────────────────────────────

/** Non-overlapping windows for temporal data points with uncertainty handling. */
export function aggregateTumblingTemporal(
  points: TemporalDataPoint[],
  config: WindowConfig,
  options: TemporalWindowOptions = {
    boundaryMode: "inclusive_start",
    uncertaintyMode: "strict",
    includeMissing: false,
  }
): AggregatedWindow[] {
  const { sizeMs, originMs } = validateConfig(config);
  if (points.length === 0) return [];

  const timestamps = points.map((p) => p.temporal.timestampMs);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  const firstStart = windowStartFor(minTs, { sizeMs, originMs });
  const windows: AggregatedWindow[] = [];
  for (let start = firstStart; start <= maxTs; start += sizeMs) {
    windows.push(aggregateTemporal(points, start, start + sizeMs, options));
  }
  return windows;
}

/** Overlapping windows for temporal data points with uncertainty handling. */
export function aggregateSlidingTemporal(
  points: TemporalDataPoint[],
  config: WindowConfig,
  options: TemporalWindowOptions = {
    boundaryMode: "inclusive_start",
    uncertaintyMode: "strict",
    includeMissing: false,
  }
): AggregatedWindow[] {
  const { sizeMs, stepMs, originMs } = validateConfig(config);
  if (points.length === 0) return [];

  const timestamps = points.map((p) => p.temporal.timestampMs);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  const firstStart = windowStartFor(minTs, { sizeMs, originMs });
  const windows: AggregatedWindow[] = [];
  for (let start = firstStart; start <= maxTs; start += stepMs) {
    windows.push(aggregateTemporal(points, start, start + sizeMs, options));
  }
  return windows;
}

/** Dispatch to the temporal tumbling or sliding aggregator. */
export function aggregateWindowsTemporal(
  points: TemporalDataPoint[],
  type: WindowType,
  config: WindowConfig,
  options?: TemporalWindowOptions
): AggregatedWindow[] {
  const opts = options || {
    boundaryMode: "inclusive_start",
    uncertaintyMode: "strict",
    includeMissing: false,
  };
  
  return type === "sliding"
    ? aggregateSlidingTemporal(points, config, opts)
    : aggregateTumblingTemporal(points, config, opts);
}
