/**
 * Tests for Temporal Utilities
 */

import { describe, it, expect } from "@jest/globals";
import {
  createTemporalPoint,
  createMissingTemporalPoint,
  intervalsOverlap,
  intervalOverlap,
  mergeIntervals,
  intervalGap,
  compareTemporalPoints,
  isPointInWindow,
  analyzeLatency,
  assessTemporalQuality,
  isoToMs,
  msToIso,
  nowAsTemporalPoint,
} from "../temporalUtils.js";
import { clockRegistry } from "../clockRegistry.js";

describe("Temporal Point Creation", () => {
  it("should create a temporal point with clock provenance", () => {
    const timestampMs = Date.now();
    const point = createTemporalPoint(timestampMs, "stellar_ledger", {
      chain: "stellar",
      blockNumber: 12345,
    });

    expect(point.timestampMs).toBe(timestampMs);
    expect(point.temporal.provenance.source).toBe("stellar_ledger");
    expect(point.temporal.provenance.chain).toBe("stellar");
    expect(point.temporal.provenance.blockNumber).toBe(12345);
    expect(point.temporal.isMissing).toBe(false);
  });

  it("should create a missing temporal point", () => {
    const point = createMissingTemporalPoint("system_clock");

    expect(point.temporal.isMissing).toBe(true);
    expect(point.temporal.provenance.source).toBe("system_clock");
    expect(point.temporal.provenance.confidence).toBe(0);
  });

  it("should calculate uncertainty based on clock config", () => {
    const timestampMs = Date.now();
    const point = createTemporalPoint(timestampMs, "stellar_ledger", {
      chain: "stellar",
    });

    const config = clockRegistry.getConfig("stellar_ledger");
    expect(config).toBeDefined();
    expect(point.temporal.uncertainty.earliestMs).toBeLessThan(timestampMs);
    expect(point.temporal.uncertainty.latestMs).toBeGreaterThan(timestampMs);
  });
});

describe("Interval Operations", () => {
  it("should detect overlapping intervals", () => {
    const a = { earliestMs: 1000, latestMs: 2000 };
    const b = { earliestMs: 1500, latestMs: 2500 };

    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it("should detect non-overlapping intervals", () => {
    const a = { earliestMs: 1000, latestMs: 2000 };
    const b = { earliestMs: 2500, latestMs: 3500 };

    expect(intervalsOverlap(a, b)).toBe(false);
  });

  it("should calculate interval overlap", () => {
    const a = { earliestMs: 1000, latestMs: 2000 };
    const b = { earliestMs: 1500, latestMs: 2500 };

    const overlap = intervalOverlap(a, b);
    expect(overlap).toEqual({ earliestMs: 1500, latestMs: 2000 });
  });

  it("should return null for non-overlapping intervals", () => {
    const a = { earliestMs: 1000, latestMs: 2000 };
    const b = { earliestMs: 2500, latestMs: 3500 };

    expect(intervalOverlap(a, b)).toBeNull();
  });

  it("should merge intervals", () => {
    const a = { earliestMs: 1000, latestMs: 2000 };
    const b = { earliestMs: 1500, latestMs: 3000 };

    const merged = mergeIntervals(a, b);
    expect(merged).toEqual({ earliestMs: 1000, latestMs: 3000 });
  });

  it("should calculate gap between intervals", () => {
    const a = { earliestMs: 1000, latestMs: 2000 };
    const b = { earliestMs: 2500, latestMs: 3500 };

    expect(intervalGap(a, b)).toBe(500);
  });

  it("should return 0 gap for overlapping intervals", () => {
    const a = { earliestMs: 1000, latestMs: 2000 };
    const b = { earliestMs: 1500, latestMs: 2500 };

    expect(intervalGap(a, b)).toBe(0);
  });
});

describe("Temporal Comparisons", () => {
  it("should compare points in strict mode", () => {
    const a = createTemporalPoint(1000, "system_clock");
    const b = createTemporalPoint(2000, "system_clock");

    const result = compareTemporalPoints(a, b, { mode: "strict" });

    expect(result.success).toBe(true);
    expect(result.result).toBe("before");
    expect(result.confidence).toBe(1.0);
  });

  it("should detect concurrent intervals in strict mode", () => {
    const a = createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" });
    const b = createTemporalPoint(1050, "stellar_ledger", { chain: "stellar" });

    const result = compareTemporalPoints(a, b, { mode: "strict" });

    expect(result.success).toBe(false);
    expect(result.result).toBe("concurrent");
  });

  it("should compare points in approximate mode", () => {
    const a = createTemporalPoint(1000, "system_clock");
    const b = createTemporalPoint(2000, "system_clock");

    const result = compareTemporalPoints(a, b, { mode: "approximate" });

    expect(result.success).toBe(true);
    expect(result.result).toBe("before");
  });

  it("should compare points in optimistic mode", () => {
    const a = createTemporalPoint(1000, "system_clock");
    const b = createTemporalPoint(2000, "system_clock");

    const result = compareTemporalPoints(a, b, { mode: "optimistic" });

    expect(result.success).toBe(true);
    expect(result.result).toBe("before");
  });

  it("should compare points in pessimistic mode", () => {
    const a = createTemporalPoint(1000, "system_clock");
    const b = createTemporalPoint(2000, "system_clock");

    const result = compareTemporalPoints(a, b, { mode: "pessimistic" });

    expect(result.success).toBe(true);
    expect(result.result).toBe("before");
  });

  it("should handle missing timestamps", () => {
    const a = createTemporalPoint(1000, "system_clock");
    const b = createMissingTemporalPoint("system_clock");

    const result = compareTemporalPoints(a, b, { mode: "strict" });

    expect(result.success).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.warnings).toContain("One or both timestamps are missing");
  });
});

describe("Window Inclusion", () => {
  it("should check if point is in window with inclusive_start", () => {
    const point = createTemporalPoint(1500, "system_clock");
    const inWindow = isPointInWindow(point, 1000, 2000, {
      boundaryMode: "inclusive_start",
      uncertaintyMode: "strict",
      includeMissing: false,
    });

    expect(inWindow).toBe(true);
  });

  it("should check if point is in window with inclusive_end", () => {
    const point = createTemporalPoint(1900, "system_clock");
    const inWindow = isPointInWindow(point, 1000, 2000, {
      boundaryMode: "inclusive_end",
      uncertaintyMode: "strict",
      includeMissing: false,
    });

    expect(inWindow).toBe(true);
  });

  it("should exclude point at boundary with exclusive_both", () => {
    const point = createTemporalPoint(1000, "system_clock");
    const inWindow = isPointInWindow(point, 1000, 2000, {
      boundaryMode: "exclusive_both",
      uncertaintyMode: "strict",
      includeMissing: false,
    });

    expect(inWindow).toBe(false);
  });

  it("should handle missing timestamps based on includeMissing", () => {
    const point = createMissingTemporalPoint("system_clock");
    
    const inWindow1 = isPointInWindow(point, 1000, 2000, {
      boundaryMode: "inclusive_start",
      uncertaintyMode: "strict",
      includeMissing: true,
    });

    const inWindow2 = isPointInWindow(point, 1000, 2000, {
      boundaryMode: "inclusive_start",
      uncertaintyMode: "strict",
      includeMissing: false,
    });

    expect(inWindow1).toBe(true);
    expect(inWindow2).toBe(false);
  });
});

describe("Latency Analysis", () => {
  it("should analyze latency breakdown", () => {
    const source = createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" });
    const destination = createTemporalPoint(5000, "evm_block", { chain: "ethereum" });

    const breakdown = analyzeLatency(source, destination, 30000);

    expect(breakdown.totalLatencyMs).toBe(4000);
    expect(breakdown.networkDelayMs).toBeGreaterThanOrEqual(0);
    expect(breakdown.clockSkewMs).toBeGreaterThanOrEqual(0);
    expect(breakdown.processingDelayMs).toBeGreaterThanOrEqual(0);
    expect(breakdown.confidence).toBeGreaterThan(0);
  });

  it("should handle negative latency (clock skew)", () => {
    const source = createTemporalPoint(5000, "stellar_ledger", { chain: "stellar" });
    const destination = createTemporalPoint(1000, "evm_block", { chain: "ethereum" });

    const breakdown = analyzeLatency(source, destination, 30000);

    expect(breakdown.totalLatencyMs).toBe(-4000);
    expect(breakdown.clockSkewMs).toBeGreaterThan(0);
    expect(breakdown.confidence).toBe(0);
  });
});

describe("Temporal Quality Assessment", () => {
  it("should assess quality of valid points", () => {
    const points = [
      createTemporalPoint(1000, "system_clock"),
      createTemporalPoint(2000, "system_clock"),
      createTemporalPoint(3000, "system_clock"),
    ];

    const quality = assessTemporalQuality(points);

    expect(quality.score).toBeGreaterThan(0.7);
    expect(quality.clockSyncStatus).toBe("synchronized");
    expect(quality.freshnessStatus).toBe("fresh");
    expect(quality.isSufficient).toBe(true);
  });

  it("should assess quality with missing points", () => {
    const points = [
      createTemporalPoint(1000, "system_clock"),
      createMissingTemporalPoint("system_clock"),
      createTemporalPoint(3000, "system_clock"),
    ];

    const quality = assessTemporalQuality(points);

    expect(quality.score).toBeLessThan(1.0);
    expect(quality.isSufficient).toBe(false);
  });

  it("should handle empty point array", () => {
    const quality = assessTemporalQuality([]);

    expect(quality.score).toBe(0);
    expect(quality.clockSyncStatus).toBe("unknown");
    expect(quality.freshnessStatus).toBe("unknown");
    expect(quality.isSufficient).toBe(false);
  });
});

describe("Utility Functions", () => {
  it("should convert ISO string to milliseconds", () => {
    const iso = "2024-01-01T00:00:00.000Z";
    const ms = isoToMs(iso);

    expect(ms).toBe(new Date(iso).getTime());
  });

  it("should convert milliseconds to ISO string", () => {
    const ms = 1704067200000; // 2024-01-01T00:00:00.000Z
    const iso = msToIso(ms);

    expect(iso).toBe(new Date(ms).toISOString());
  });

  it("should create temporal point for current time", () => {
    const now = nowAsTemporalPoint();

    expect(now.temporal.provenance.source).toBe("system_clock");
    expect(now.temporal.isMissing).toBe(false);
    expect(now.timestampMs).toBeCloseTo(Date.now(), -2); // Within 100ms
  });
});
