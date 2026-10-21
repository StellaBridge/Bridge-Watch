import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContributorDiagnosticsService } from "../../src/services/contributorDiagnostics.service.js";
import type { ContributorDiagnosticsRecord } from "../../src/database/models/contributorDiagnostics.model.js";

const modelMocks = vi.hoisted(() => ({
  insert: vi.fn(),
  getByContributorId: vi.fn(),
  getLatestByContributorId: vi.fn(),
  getCriticalIssues: vi.fn(),
  getAllContributors: vi.fn(),
  getHealthSummary: vi.fn(),
  getAverageScoreByType: vi.fn(),
  getRecentUpdates: vi.fn(),
}));

vi.mock("../../src/database/models/contributorDiagnostics.model.js", () => ({
  ContributorDiagnosticsModel: vi.fn(() => modelMocks),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function record(
  overrides: Partial<ContributorDiagnosticsRecord> = {},
): ContributorDiagnosticsRecord {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    id: "diag-1",
    contributor_id: "user-1",
    contributor_name: "Ada",
    diagnostic_type: "performance",
    status: "healthy",
    metrics: { avg_pr_review_time: 4 },
    score: 9,
    last_updated: now,
    recommendations: ["Keep it up"],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("ContributorDiagnosticsService", () => {
  let service: ContributorDiagnosticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContributorDiagnosticsService();
  });

  describe("recordDiagnostics", () => {
    it.each([
      [9, "healthy"],
      [7, "healthy"],
      [5, "warning"],
      [4, "warning"],
      [2, "critical"],
      [0, "critical"],
    ])("maps score %i to status %s", async (score, status) => {
      modelMocks.insert.mockResolvedValue(record({ score, status: status as never }));
      const result = await service.recordDiagnostics(
        "user-1",
        "Ada",
        "performance",
        { avg_pr_review_time: 4 },
        score,
        ["Ship it"],
      );
      expect(modelMocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          contributor_id: "user-1",
          diagnostic_type: "performance",
          status,
          score,
        }),
      );
      expect(result.status).toBe(status);
    });

    it("wraps model failures with context", async () => {
      modelMocks.insert.mockRejectedValue(new Error("db down"));
      await expect(
        service.recordDiagnostics("user-1", "Ada", "testing", { test_pass_rate: 1 }, 8, []),
      ).rejects.toThrow("Failed to record diagnostics: db down");
    });
  });
  describe("getContributorDiagnostics", () => {
    it("returns every diagnostic for a contributor", async () => {
      modelMocks.getByContributorId.mockResolvedValue([record(), record({ id: "diag-2" })]);
      await expect(service.getContributorDiagnostics("user-1")).resolves.toHaveLength(2);
      expect(modelMocks.getByContributorId).toHaveBeenCalledWith("user-1");
    });

    it("wraps lookup failures", async () => {
      modelMocks.getByContributorId.mockRejectedValue(new Error("boom"));
      await expect(service.getContributorDiagnostics("user-1")).rejects.toThrow(
        "Failed to get contributor diagnostics: boom",
      );
    });
  });

  describe("getLatestDiagnostic", () => {
    it("delegates to the model with contributor and type", async () => {
      modelMocks.getLatestByContributorId.mockResolvedValue(record());
      const result = await service.getLatestDiagnostic("user-1", "performance");
      expect(modelMocks.getLatestByContributorId).toHaveBeenCalledWith("user-1", "performance");
      expect(result?.id).toBe("diag-1");
    });

    it("wraps lookup failures", async () => {
      modelMocks.getLatestByContributorId.mockRejectedValue(new Error("boom"));
      await expect(service.getLatestDiagnostic("user-1", "performance")).rejects.toThrow(
        "Failed to get latest diagnostic: boom",
      );
    });
  });

  describe("getCriticalIssues", () => {
    it("returns critical diagnostics", async () => {
      modelMocks.getCriticalIssues.mockResolvedValue([record({ status: "critical" })]);
      const issues = await service.getCriticalIssues();
      expect(issues).toHaveLength(1);
      expect(issues[0].status).toBe("critical");
    });

    it("wraps failures", async () => {
      modelMocks.getCriticalIssues.mockRejectedValue(new Error("boom"));
      await expect(service.getCriticalIssues()).rejects.toThrow(
        "Failed to get critical issues: boom",
      );
    });
  });

  describe("getDashboardOverview", () => {
    it("aggregates unique contributors, average score and top issues", async () => {
      modelMocks.getAllContributors.mockResolvedValue([
        record({ contributor_id: "user-1", score: 8 }),
        record({ contributor_id: "user-1", score: 6 }),
        record({ contributor_id: "user-2", score: 4 }),
      ]);
      modelMocks.getHealthSummary.mockResolvedValue({ healthy: 1, warning: 1, critical: 1 });
      modelMocks.getCriticalIssues.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => record({ id: `diag-${i}`, status: "critical" })),
      );
      const overview = await service.getDashboardOverview();
      expect(overview.total_contributors).toBe(2);
      expect(overview.average_score).toBe(6);
      expect(overview.healthy_contributors).toBe(1);
      expect(overview.top_issues).toHaveLength(5);
    });

    it("returns zeros when no diagnostics exist", async () => {
      modelMocks.getAllContributors.mockResolvedValue([]);
      modelMocks.getHealthSummary.mockResolvedValue({ healthy: 0, warning: 0, critical: 0 });
      modelMocks.getCriticalIssues.mockResolvedValue([]);
      const overview = await service.getDashboardOverview();
      expect(overview).toMatchObject({ total_contributors: 0, average_score: 0, top_issues: [] });
    });

    it("wraps aggregation failures", async () => {
      modelMocks.getAllContributors.mockRejectedValue(new Error("boom"));
      await expect(service.getDashboardOverview()).rejects.toThrow(
        "Failed to get dashboard overview: boom",
      );
    });
  });

  describe("getTypeAverages", () => {
    it("rounds each diagnostic-type average to one decimal", async () => {
      modelMocks.getAverageScoreByType
        .mockResolvedValueOnce(7.25)
        .mockResolvedValueOnce(6.04)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(0);
      await expect(service.getTypeAverages()).resolves.toEqual({
        performance_avg: 7.3,
        code_quality_avg: 6,
        testing_avg: 8,
        documentation_avg: 0,
      });
      expect(modelMocks.getAverageScoreByType).toHaveBeenCalledTimes(4);
    });

    it("wraps failures", async () => {
      modelMocks.getAverageScoreByType.mockRejectedValue(new Error("boom"));
      await expect(service.getTypeAverages()).rejects.toThrow(
        "Failed to get type averages: boom",
      );
    });
  });

  describe("getRecentUpdates", () => {
    it("defaults to a 7-day window", async () => {
      modelMocks.getRecentUpdates.mockResolvedValue([record()]);
      const updates = await service.getRecentUpdates();
      expect(modelMocks.getRecentUpdates).toHaveBeenCalledWith(7);
      expect(updates).toHaveLength(1);
    });

    it("wraps failures", async () => {
      modelMocks.getRecentUpdates.mockRejectedValue(new Error("boom"));
      await expect(service.getRecentUpdates(30)).rejects.toThrow(
        "Failed to get recent updates: boom",
      );
    });
  });
});
