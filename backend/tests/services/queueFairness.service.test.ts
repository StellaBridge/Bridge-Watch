import { describe, it, expect } from "vitest";

import {
  initDRRState,
  drrNextLane,
  totalEnabledWeight,
  computeIdealShares,
  assessLaneFairness,
  aggregateFairness,
  type LanePolicy,
  type LaneSample,
  type FairnessStatus,
  DEFAULT_LANE_POLICIES,
} from "../../src/services/queueFairness.service.js";

describe("Queue Fairness Core", () => {
  const policies: Record<string, LanePolicy> = {
    critical: { laneName: "critical", weight: 8, minSharePct: 10, enabled: true },
    high: { laneName: "high", weight: 4, minSharePct: 5, enabled: true },
    medium: { laneName: "medium", weight: 2, minSharePct: 5, enabled: true },
    low: { laneName: "low", weight: 1, minSharePct: 10, enabled: true },
  };

  describe("totalEnabledWeight", () => {
    it("sums weights of enabled lanes", () => {
      expect(totalEnabledWeight(policies)).toBe(15);
    });

    it("ignores disabled lanes", () => {
      const p = { ...policies, low: { ...policies.low, enabled: false } };
      expect(totalEnabledWeight(p)).toBe(14);
    });
  });

  describe("computeIdealShares", () => {
    it("computes proportional shares", () => {
      const shares = computeIdealShares(policies);
      // total weight = 15
      expect(shares.critical).toBeCloseTo(53.33, 1);
      expect(shares.high).toBeCloseTo(26.67, 1);
      expect(shares.medium).toBeCloseTo(13.33, 1);
      expect(shares.low).toBeCloseTo(6.67, 1);
    });

    it("returns zero for disabled lanes", () => {
      const p = { ...policies, low: { ...policies.low, enabled: false } };
      const shares = computeIdealShares(p);
      expect(shares.low).toBe(0);
    });
  });

  describe("drrNextLane", () => {
    it("serves highest deficit lane", () => {
      const state = initDRRState(1);
      const depths = { critical: 10, high: 5, medium: 2, low: 1 };

      // First call: all get +weight, critical has highest (8)
      const lane1 = drrNextLane(state, depths, policies);
      expect(lane1).toBe("critical");
      expect(state.deficits.critical).toBe(8 - 1); // 7 after serving

      // Second call: critical +8=15, high +4=4, etc. critical still highest
      const lane2 = drrNextLane(state, depths, policies);
      expect(lane2).toBe("critical");
    });

    it("respects depth zero - skips empty lanes", () => {
      const state = initDRRState(1);
      const depths = { critical: 0, high: 10, medium: 5, low: 2 };
      const lane = drrNextLane(state, depths, policies);
      expect(lane).toBe("high");
    });

    it.skip("cycles fairly over time with tracked depths", () => {
      const state = initDRRState(1);
      let depths = { critical: 100, high: 100, medium: 100, low: 100 };
      const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

      for (let i = 0; i < 150; i++) {
        const lane = drrNextLane(state, depths, policies);
        counts[lane]++;
        // Decrement virtual depth to simulate work being done
        if (depths[lane] > 0) depths[lane]--;
      }

      // Proportional to weights (8:4:2:1 = 15 total)
      expect(counts.critical).toBeGreaterThan(70);
      expect(counts.high).toBeGreaterThan(35);
      expect(counts.medium).toBeGreaterThan(15);
      expect(counts.low).toBeGreaterThan(5);
    });
  });

  describe("assessLaneFairness", () => {
    it("healthy when no backlog", () => {
      const sample: LaneSample = { laneName: "low", depth: 0, servedCount: 0, sampledAt: "now" };
      const result = assessLaneFairness(sample, policies.low, 6.67);
      expect(result.status).toBe("healthy");
    });

    it("starved when backlog but nothing served", () => {
      const sample: LaneSample = { laneName: "low", depth: 100, servedCount: 0, sampledAt: "now" };
      const result = assessLaneFairness(sample, policies.low, 6.67);
      expect(result.status).toBe("starved");
    });

    it("unfair when share below minimum", () => {
      const sample: LaneSample = { laneName: "low", depth: 90, servedCount: 5, sampledAt: "now" }; // ~5.3% share
      const result = assessLaneFairness(sample, policies.low, 6.67);
      expect(result.status).toBe("unfair");
    });

    it("degraded when share significantly below ideal", () => {
      const sample: LaneSample = { laneName: "high", depth: 80, servedCount: 5, sampledAt: "now" }; // ~5.9% share, ideal ~26.7%
      const result = assessLaneFairness(sample, policies.high, 26.67);
      expect(result.status).toBe("degraded");
    });

    it("healthy when share meets minimum", () => {
      const sample: LaneSample = { laneName: "low", depth: 10, servedCount: 5, sampledAt: "now" }; // ~33% share
      const result = assessLaneFairness(sample, policies.low, 6.67);
      expect(result.status).toBe("healthy");
    });
  });

  describe("aggregateFairness", () => {
    it("returns starved if any lane starved", () => {
      const assessments = [
        { laneName: "critical" as const, status: "healthy" as FairnessStatus, reason: "", sharePct: 50, minSharePct: 10, depth: 0, servedCount: 10 },
        { laneName: "low" as const, status: "starved" as FairnessStatus, reason: "", sharePct: 0, minSharePct: 10, depth: 100, servedCount: 0 },
      ];
      expect(aggregateFairness(assessments)).toBe("starved");
    });

    it("returns unfair if any lane unfair (no starved)", () => {
      const assessments = [
        { laneName: "critical" as const, status: "healthy" as FairnessStatus, reason: "", sharePct: 50, minSharePct: 10, depth: 0, servedCount: 10 },
        { laneName: "low" as const, status: "unfair" as FairnessStatus, reason: "", sharePct: 5, minSharePct: 10, depth: 90, servedCount: 5 },
      ];
      expect(aggregateFairness(assessments)).toBe("unfair");
    });

    it("returns degraded if any degraded (no unfair/starved)", () => {
      const assessments = [
        { laneName: "critical" as const, status: "healthy" as FairnessStatus, reason: "", sharePct: 50, minSharePct: 10, depth: 0, servedCount: 10 },
        { laneName: "high" as const, status: "degraded" as FairnessStatus, reason: "", sharePct: 10, minSharePct: 5, depth: 80, servedCount: 5 },
      ];
      expect(aggregateFairness(assessments)).toBe("degraded");
    });

    it("returns healthy if all healthy", () => {
      const assessments = [
        { laneName: "critical" as const, status: "healthy" as FairnessStatus, reason: "", sharePct: 50, minSharePct: 10, depth: 0, servedCount: 10 },
        { laneName: "high" as const, status: "healthy" as FairnessStatus, reason: "", sharePct: 30, minSharePct: 5, depth: 0, servedCount: 10 },
      ];
      expect(aggregateFairness(assessments)).toBe("healthy");
    });
  });
});