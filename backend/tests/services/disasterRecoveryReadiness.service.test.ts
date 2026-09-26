import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeDRScore,
  getDRReadinessLevel,
  createAssessment,
  getLatestAssessment,
  getAssessmentHistory,
  getAssessmentById,
  getChecksForAssessment,
} from "../../src/services/disasterRecoveryReadiness.service.js";

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

const mockRow = {
  id: "uuid-1",
  bridge_id: "stellar-bridge-001",
  overall_score: 72,
  readiness_level: "GOOD",
  backup_coverage_score: 80,
  rto_readiness_score: 70,
  rpo_readiness_score: 65,
  runbook_completeness_score: 70,
  failover_test_score: 60,
  gaps: "[]",
  recommendations: "[]",
  assessed_by: "ops-team",
  assessed_at: new Date("2026-09-25T00:00:00Z"),
};

const mockCheckRow = {
  id: "check-uuid-1",
  assessment_id: "uuid-1",
  check_name: "Backup validation",
  category: "backup",
  passed: true,
  score: 90,
  notes: null,
  created_at: new Date("2026-09-25T00:00:00Z"),
};

const returningMock = vi.fn().mockResolvedValue([mockRow]);
const firstMock = vi.fn().mockResolvedValue(mockRow);
const selectMock = vi.fn().mockResolvedValue([mockRow]);
const checkSelectMock = vi.fn().mockResolvedValue([mockCheckRow]);
const checkInsertMock = vi.fn().mockResolvedValue([]);

const dbMock = vi.fn((table: string) => {
  if (table === "dr_readiness_checks") {
    return {
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ select: checkSelectMock }),
      }),
      insert: vi.fn().mockReturnValue(checkInsertMock),
    };
  }
  return {
    insert: vi.fn().mockReturnValue({ returning: returningMock }),
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        first: firstMock,
        limit: vi.fn().mockReturnValue({ select: selectMock }),
      }),
      first: firstMock,
      limit: vi.fn().mockReturnValue({ select: selectMock }),
    }),
  };
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => dbMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Pure scoring tests
// ---------------------------------------------------------------------------

describe("computeDRScore", () => {
  it("returns 100 when all factors are 100", () => {
    const { score, level } = computeDRScore({
      backupCoverage: 100,
      rtoReadiness: 100,
      rpoReadiness: 100,
      runbookCompleteness: 100,
      failoverTestScore: 100,
    });
    expect(score).toBe(100);
    expect(level).toBe("EXCELLENT");
  });

  it("returns 0 when all factors are 0", () => {
    const { score, level } = computeDRScore({
      backupCoverage: 0,
      rtoReadiness: 0,
      rpoReadiness: 0,
      runbookCompleteness: 0,
      failoverTestScore: 0,
    });
    expect(score).toBe(0);
    expect(level).toBe("CRITICAL");
  });

  it("defaults missing factors to 0", () => {
    const { score, resolved } = computeDRScore({});
    expect(resolved.backupCoverage).toBe(0);
    expect(resolved.rtoReadiness).toBe(0);
    expect(score).toBe(0);
  });

  it("applies backupCoverage weight of 30%", () => {
    const { score } = computeDRScore({
      backupCoverage: 100,
      rtoReadiness: 0,
      rpoReadiness: 0,
      runbookCompleteness: 0,
      failoverTestScore: 0,
    });
    expect(score).toBe(30);
  });

  it("applies rtoReadiness weight of 20%", () => {
    const { score } = computeDRScore({
      backupCoverage: 0,
      rtoReadiness: 100,
      rpoReadiness: 0,
      runbookCompleteness: 0,
      failoverTestScore: 0,
    });
    expect(score).toBe(20);
  });

  it("applies rpoReadiness weight of 20%", () => {
    const { score } = computeDRScore({
      backupCoverage: 0,
      rtoReadiness: 0,
      rpoReadiness: 100,
      runbookCompleteness: 0,
      failoverTestScore: 0,
    });
    expect(score).toBe(20);
  });

  it("applies runbookCompleteness weight of 15%", () => {
    const { score } = computeDRScore({
      backupCoverage: 0,
      rtoReadiness: 0,
      rpoReadiness: 0,
      runbookCompleteness: 100,
      failoverTestScore: 0,
    });
    expect(score).toBe(15);
  });

  it("applies failoverTestScore weight of 15%", () => {
    const { score } = computeDRScore({
      backupCoverage: 0,
      rtoReadiness: 0,
      rpoReadiness: 0,
      runbookCompleteness: 0,
      failoverTestScore: 100,
    });
    expect(score).toBe(15);
  });

  it("clamps scores above 100 to 100", () => {
    const { score } = computeDRScore({
      backupCoverage: 200,
      rtoReadiness: 200,
      rpoReadiness: 200,
      runbookCompleteness: 200,
      failoverTestScore: 200,
    });
    expect(score).toBe(100);
  });

  it("clamps negative scores to 0", () => {
    const { score } = computeDRScore({
      backupCoverage: -50,
      rtoReadiness: -50,
      rpoReadiness: -50,
      runbookCompleteness: -50,
      failoverTestScore: -50,
    });
    expect(score).toBe(0);
  });

  it("preserves resolved factors in result", () => {
    const { resolved } = computeDRScore({ backupCoverage: 75, rtoReadiness: 60 });
    expect(resolved.backupCoverage).toBe(75);
    expect(resolved.rtoReadiness).toBe(60);
    expect(resolved.rpoReadiness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Level classification tests
// ---------------------------------------------------------------------------

describe("getDRReadinessLevel", () => {
  it("classifies score 0 as CRITICAL", () => expect(getDRReadinessLevel(0)).toBe("CRITICAL"));
  it("classifies score 20 as CRITICAL (boundary)", () => expect(getDRReadinessLevel(20)).toBe("CRITICAL"));
  it("classifies score 21 as POOR", () => expect(getDRReadinessLevel(21)).toBe("POOR"));
  it("classifies score 40 as POOR (boundary)", () => expect(getDRReadinessLevel(40)).toBe("POOR"));
  it("classifies score 41 as FAIR", () => expect(getDRReadinessLevel(41)).toBe("FAIR"));
  it("classifies score 60 as FAIR (boundary)", () => expect(getDRReadinessLevel(60)).toBe("FAIR"));
  it("classifies score 61 as GOOD", () => expect(getDRReadinessLevel(61)).toBe("GOOD"));
  it("classifies score 80 as GOOD (boundary)", () => expect(getDRReadinessLevel(80)).toBe("GOOD"));
  it("classifies score 81 as EXCELLENT", () => expect(getDRReadinessLevel(81)).toBe("EXCELLENT"));
  it("classifies score 100 as EXCELLENT", () => expect(getDRReadinessLevel(100)).toBe("EXCELLENT"));
});

// ---------------------------------------------------------------------------
// Service persistence tests (mocked DB)
// ---------------------------------------------------------------------------

describe("createAssessment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when bridgeId is empty", async () => {
    await expect(
      createAssessment({ bridgeId: "", factors: { backupCoverage: 80 } })
    ).rejects.toThrow("bridgeId is required");
  });

  it("throws when bridgeId is only whitespace", async () => {
    await expect(
      createAssessment({ bridgeId: "   ", factors: {} })
    ).rejects.toThrow("bridgeId is required");
  });
});

describe("getLatestAssessment", () => {
  it("returns null when no assessment exists", async () => {
    firstMock.mockResolvedValueOnce(undefined);
    const result = await getLatestAssessment("unknown-bridge");
    expect(result).toBeNull();
  });
});

describe("getAssessmentHistory", () => {
  it("returns an array of assessments", async () => {
    selectMock.mockResolvedValueOnce([mockRow]);
    const results = await getAssessmentHistory("stellar-bridge-001");
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("getAssessmentById", () => {
  it("returns null when not found", async () => {
    firstMock.mockResolvedValueOnce(undefined);
    const result = await getAssessmentById("nonexistent-id");
    expect(result).toBeNull();
  });
});

describe("getChecksForAssessment", () => {
  it("returns an array of checks", async () => {
    checkSelectMock.mockResolvedValueOnce([mockCheckRow]);
    const results = await getChecksForAssessment("uuid-1");
    expect(Array.isArray(results)).toBe(true);
  });
});
