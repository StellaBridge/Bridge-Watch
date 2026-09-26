import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type DRReadinessLevel = "CRITICAL" | "POOR" | "FAIR" | "GOOD" | "EXCELLENT";

export interface DRFactors {
  backupCoverage: number;
  rtoReadiness: number;
  rpoReadiness: number;
  runbookCompleteness: number;
  failoverTestScore: number;
}

export interface DRReadinessAssessment {
  id: string;
  bridgeId: string;
  overallScore: number;
  readinessLevel: DRReadinessLevel;
  backupCoverageScore: number;
  rtoReadinessScore: number;
  rpoReadinessScore: number;
  runbookCompletenessScore: number;
  failoverTestScore: number;
  gaps: string[];
  recommendations: string[];
  assessedBy: string | null;
  assessedAt: string;
}

export interface DRReadinessCheck {
  id: string;
  assessmentId: string;
  checkName: string;
  category: string;
  passed: boolean;
  score: number;
  notes: string | null;
  createdAt: string;
}

export interface CreateAssessmentInput {
  bridgeId: string;
  factors: Partial<DRFactors>;
  checks?: Array<{ checkName: string; category: string; passed: boolean; score: number; notes?: string }>;
  assessedBy?: string;
}

const DR_WEIGHTS = {
  backupCoverage: 0.30,
  rtoReadiness: 0.20,
  rpoReadiness: 0.20,
  runbookCompleteness: 0.15,
  failoverTestScore: 0.15,
} as const;

export function computeDRScore(factors: Partial<DRFactors>): {
  score: number;
  level: DRReadinessLevel;
  resolved: DRFactors;
} {
  const resolved: DRFactors = {
    backupCoverage: factors.backupCoverage ?? 0,
    rtoReadiness: factors.rtoReadiness ?? 0,
    rpoReadiness: factors.rpoReadiness ?? 0,
    runbookCompleteness: factors.runbookCompleteness ?? 0,
    failoverTestScore: factors.failoverTestScore ?? 0,
  };

  const raw =
    resolved.backupCoverage * DR_WEIGHTS.backupCoverage +
    resolved.rtoReadiness * DR_WEIGHTS.rtoReadiness +
    resolved.rpoReadiness * DR_WEIGHTS.rpoReadiness +
    resolved.runbookCompleteness * DR_WEIGHTS.runbookCompleteness +
    resolved.failoverTestScore * DR_WEIGHTS.failoverTestScore;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const level = getDRReadinessLevel(score);

  return { score, level, resolved };
}

export function getDRReadinessLevel(score: number): DRReadinessLevel {
  if (score <= 20) return "CRITICAL";
  if (score <= 40) return "POOR";
  if (score <= 60) return "FAIR";
  if (score <= 80) return "GOOD";
  return "EXCELLENT";
}

function buildGapsAndRecommendations(resolved: DRFactors): { gaps: string[]; recommendations: string[] } {
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (resolved.backupCoverage < 60) {
    gaps.push("Insufficient backup coverage");
    recommendations.push("Increase backup frequency and coverage to at least 60% threshold");
  }
  if (resolved.rtoReadiness < 60) {
    gaps.push("RTO targets not achievable with current posture");
    recommendations.push("Review and exercise recovery time objectives; automate failover steps");
  }
  if (resolved.rpoReadiness < 60) {
    gaps.push("RPO targets at risk");
    recommendations.push("Reduce data replication lag and validate point-in-time recovery");
  }
  if (resolved.runbookCompleteness < 60) {
    gaps.push("Runbooks incomplete or outdated");
    recommendations.push("Update and peer-review all disaster recovery runbooks");
  }
  if (resolved.failoverTestScore < 60) {
    gaps.push("Failover not regularly tested");
    recommendations.push("Schedule quarterly failover drills and document outcomes");
  }

  return { gaps, recommendations };
}

function mapAssessmentRow(row: Record<string, unknown>): DRReadinessAssessment {
  return {
    id: row.id as string,
    bridgeId: row.bridge_id as string,
    overallScore: row.overall_score as number,
    readinessLevel: row.readiness_level as DRReadinessLevel,
    backupCoverageScore: row.backup_coverage_score as number,
    rtoReadinessScore: row.rto_readiness_score as number,
    rpoReadinessScore: row.rpo_readiness_score as number,
    runbookCompletenessScore: row.runbook_completeness_score as number,
    failoverTestScore: row.failover_test_score as number,
    gaps: Array.isArray(row.gaps) ? (row.gaps as string[]) : JSON.parse((row.gaps as string) || "[]"),
    recommendations: Array.isArray(row.recommendations)
      ? (row.recommendations as string[])
      : JSON.parse((row.recommendations as string) || "[]"),
    assessedBy: (row.assessed_by as string | null) ?? null,
    assessedAt:
      row.assessed_at instanceof Date ? row.assessed_at.toISOString() : String(row.assessed_at),
  };
}

function mapCheckRow(row: Record<string, unknown>): DRReadinessCheck {
  return {
    id: row.id as string,
    assessmentId: row.assessment_id as string,
    checkName: row.check_name as string,
    category: row.category as string,
    passed: row.passed as boolean,
    score: row.score as number,
    notes: (row.notes as string | null) ?? null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function createAssessment(input: CreateAssessmentInput): Promise<DRReadinessAssessment> {
  const db = getDatabase();
  const { bridgeId, factors, checks = [], assessedBy } = input;

  if (!bridgeId || bridgeId.trim() === "") {
    throw new Error("bridgeId is required");
  }

  const { score, level, resolved } = computeDRScore(factors);
  const { gaps, recommendations } = buildGapsAndRecommendations(resolved);

  const [row] = await db("dr_readiness_assessments")
    .insert({
      bridge_id: bridgeId,
      overall_score: score,
      readiness_level: level,
      backup_coverage_score: resolved.backupCoverage,
      rto_readiness_score: resolved.rtoReadiness,
      rpo_readiness_score: resolved.rpoReadiness,
      runbook_completeness_score: resolved.runbookCompleteness,
      failover_test_score: resolved.failoverTestScore,
      gaps: JSON.stringify(gaps),
      recommendations: JSON.stringify(recommendations),
      assessed_by: assessedBy ?? null,
    })
    .returning("*");

  if (checks.length > 0) {
    await db("dr_readiness_checks").insert(
      checks.map((c) => ({
        assessment_id: row.id,
        check_name: c.checkName,
        category: c.category,
        passed: c.passed,
        score: c.score,
        notes: c.notes ?? null,
      }))
    );
  }

  logger.info({ bridgeId, score, level }, "DR readiness assessment created");
  return mapAssessmentRow(row);
}

export async function getLatestAssessment(bridgeId: string): Promise<DRReadinessAssessment | null> {
  const db = getDatabase();
  const row = await db("dr_readiness_assessments")
    .where("bridge_id", bridgeId)
    .orderBy("assessed_at", "desc")
    .first<Record<string, unknown> | undefined>();

  return row ? mapAssessmentRow(row) : null;
}

export async function getAssessmentHistory(
  bridgeId: string,
  limit = 50
): Promise<DRReadinessAssessment[]> {
  const db = getDatabase();
  const rows = await db("dr_readiness_assessments")
    .where("bridge_id", bridgeId)
    .orderBy("assessed_at", "desc")
    .limit(limit)
    .select("*");

  return rows.map(mapAssessmentRow);
}

export async function getAssessmentById(id: string): Promise<DRReadinessAssessment | null> {
  const db = getDatabase();
  const row = await db("dr_readiness_assessments")
    .where("id", id)
    .first<Record<string, unknown> | undefined>();

  return row ? mapAssessmentRow(row) : null;
}

export async function getChecksForAssessment(assessmentId: string): Promise<DRReadinessCheck[]> {
  const db = getDatabase();
  const rows = await db("dr_readiness_checks")
    .where("assessment_id", assessmentId)
    .orderBy("category")
    .select("*");

  return rows.map(mapCheckRow);
}

export const disasterRecoveryReadinessService = {
  createAssessment,
  getLatestAssessment,
  getAssessmentHistory,
  getAssessmentById,
  getChecksForAssessment,
  computeDRScore,
  getDRReadinessLevel,
};
