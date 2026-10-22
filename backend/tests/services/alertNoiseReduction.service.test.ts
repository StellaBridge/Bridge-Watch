import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { AlertNoiseReductionService } from "../../src/services/alertNoiseReduction.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function qb(options: {
  firstValue?: unknown;
  returningValue?: unknown[];
  thenValue?: unknown[];
} = {}) {
  const { firstValue = null, returningValue = [], thenValue = [] } = options;
  const builder: Record<string, unknown> = {};
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockResolvedValue(returningValue);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.whereBetween = vi.fn().mockReturnValue(builder);
  builder.count = vi.fn().mockReturnValue(builder);
  builder.first = vi.fn().mockResolvedValue(firstValue);
  builder.update = vi.fn().mockResolvedValue(1);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.offset = vi.fn().mockReturnValue(builder);
  builder.then = (resolve: (value: unknown) => void) => resolve(thenValue);
  return builder;
}

const baseParams = {
  accountId: "acct-1",
  alertRuleId: "rule-1",
  windowStart: new Date("2026-01-01T00:00:00Z"),
  windowEnd: new Date("2026-01-08T00:00:00Z"),
};

function mockDbForAnalysis(opts: {
  totalAlerts?: number;
  incidents?: number;
  analysisId?: string;
}) {
  const { totalAlerts = 10, incidents = 2, analysisId = "analysis-1" } = opts;
  const analysisRow = { id: analysisId, status: "pending" };
  const db = vi.fn((table: string) => {
    if (table === "alert_noise_reduction_analyses") return qb({ returningValue: [analysisRow] });
    if (table === "alert_events") return qb({ firstValue: { count: String(totalAlerts) } });
    if (table === "bridge_incidents") return qb({ firstValue: { count: String(incidents) } });
    return qb();
  });
  vi.mocked(getDatabase).mockReturnValue(db as never);
  return { db, analysisRow };
}

describe("AlertNoiseReductionService", () => {
  let service: AlertNoiseReductionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AlertNoiseReductionService();
  });

  describe("analyzeAlertNoise", () => {
    it("recommends a threshold adjustment when the false positive rate is high", async () => {
      mockDbForAnalysis({ totalAlerts: 10, incidents: 2 });
      const { metrics, recommendations } = await service.analyzeAlertNoise(baseParams);
      expect(metrics).toMatchObject({
        totalAlerts: 10,
        confirmedIncidents: 2,
        falsePositiveRate: 0.8,
        fatigueScore: 0.1,
      });
      expect(recommendations.map((r) => r.recommendationType)).toEqual(
        expect.arrayContaining(["threshold_adjustment", "correlation_filter"]),
      );
      const threshold = recommendations.find((r) => r.recommendationType === "threshold_adjustment");
      expect(threshold?.expectedReductionPercent).toBeCloseTo(48);
      expect(threshold?.status).toBe("pending");
    });

    it("skips the threshold adjustment when most alerts are confirmed", async () => {
      mockDbForAnalysis({ totalAlerts: 10, incidents: 9 });
      const { recommendations } = await service.analyzeAlertNoise(baseParams);
      expect(recommendations.map((r) => r.recommendationType)).toEqual(["correlation_filter"]);
    });

    it("recommends suppression when alert fatigue is severe", async () => {
      mockDbForAnalysis({ totalAlerts: 8000, incidents: 1000 });
      const { metrics, recommendations } = await service.analyzeAlertNoise(baseParams);
      expect(metrics.fatigueScore).toBe(80);
      expect(recommendations.map((r) => r.recommendationType)).toEqual(
        expect.arrayContaining(["alert_suppression"]),
      );
    });

    it("reports zero rates when no alerts fired in the window", async () => {
      mockDbForAnalysis({ totalAlerts: 0, incidents: 0 });
      const { metrics } = await service.analyzeAlertNoise(baseParams);
      expect(metrics).toMatchObject({ totalAlerts: 0, falsePositiveRate: 0, fatigueScore: 0 });
    });

    it("rethrows on database failure", async () => {
      const failing = vi.fn(() => {
        throw new Error("db down");
      });
      vi.mocked(getDatabase).mockReturnValue(failing as never);
      await expect(service.analyzeAlertNoise(baseParams)).rejects.toThrow("db down");
    });
  });
  describe("getAnalysis", () => {
    it("returns the analysis with its recommendations", async () => {
      const analysis = { id: "analysis-1", status: "completed" };
      const recommendations = [{ id: "rec-1" }];
      const db = vi.fn((table: string) => {
        if (table === "alert_noise_reduction_analyses") return qb({ firstValue: analysis });
        return qb({ thenValue: recommendations });
      });
      vi.mocked(getDatabase).mockReturnValue(db as never);
      await expect(service.getAnalysis("analysis-1")).resolves.toEqual({
        analysis,
        recommendations,
      });
    });

    it("throws when the analysis does not exist", async () => {
      vi.mocked(getDatabase).mockReturnValue((vi.fn(() => qb({ firstValue: null })) as never));
      await expect(service.getAnalysis("missing")).rejects.toThrow("Analysis not found: missing");
    });
  });

  describe("applyRecommendation", () => {
    it("marks a pending recommendation as applied", async () => {
      const recommendation = { id: "rec-1", status: "pending" };
      const builder = qb({ firstValue: recommendation });
      vi.mocked(getDatabase).mockReturnValue((vi.fn(() => builder) as never));
      await expect(service.applyRecommendation("rec-1")).resolves.toEqual(recommendation);
      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "applied", applied_at: expect.any(Date) }),
      );
    });

    it("throws when the recommendation does not exist", async () => {
      vi.mocked(getDatabase).mockReturnValue((vi.fn(() => qb({ firstValue: null })) as never));
      await expect(service.applyRecommendation("missing")).rejects.toThrow(
        "Recommendation not found: missing",
      );
    });
  });

  describe("listAnalyses", () => {
    it("returns analyses with pagination metadata", async () => {
      const rows = [{ id: "analysis-1" }, { id: "analysis-2" }];
      const db = vi.fn((table: string) => {
        expect(table).toBe("alert_noise_reduction_analyses");
        return qb({ thenValue: rows, firstValue: { count: "2" } });
      });
      vi.mocked(getDatabase).mockReturnValue(db as never);
      const result = await service.listAnalyses("acct-1", 10, 5);
      expect(result.analyses).toEqual(rows);
      expect(result.pagination).toEqual({ total: "2", limit: 10, offset: 5 });
    });
  });
});
