// @ts-nocheck
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface AlertNoiseAnalysisParams {
  accountId: string;
  alertRuleId: string;
  windowStart: Date;
  windowEnd: Date;
  sampleSize?: number;
}

export interface NoiseRecommendation {
  id?: string;
  analysisId: string;
  recommendationType: "threshold_adjustment" | "alert_suppression" | "correlation_filter" | "time_window_expansion";
  description: string;
  confidenceScore: number;
  expectedReductionPercent: number;
  parameters: Record<string, unknown>;
  status: "pending" | "acknowledged" | "applied" | "rejected" | "expired";
}

export class AlertNoiseReductionService {
  async analyzeAlertNoise(params: AlertNoiseAnalysisParams) {
    const database = getDatabase();
    const { accountId, alertRuleId, windowStart, windowEnd, sampleSize = 100 } = params;

    logger.info({ accountId, alertRuleId, windowStart, windowEnd }, "Starting alert noise analysis");

    try {
      const [analysis] = await database("alert_noise_reduction_analyses")
        .insert({
          account_id: accountId,
          alert_rule_id: alertRuleId,
          status: "pending",
          sample_size: sampleSize,
          analysis_window_start: windowStart,
          analysis_window_end: windowEnd,
        })
        .returning("*");

      const metrics = await this.calculateNoiseMetrics(alertRuleId, windowStart, windowEnd);

      const recommendations = await this.generateRecommendations(analysis.id, metrics);

      await database("alert_noise_reduction_analyses")
        .where("id", analysis.id)
        .update({
          status: "completed",
          false_positive_rate: metrics.falsePositiveRate,
          alert_fatigue_score: metrics.fatigueScore,
          total_alerts_fired: metrics.totalAlerts,
          confirmed_incidents: metrics.confirmedIncidents,
        });

      return {
        analysis,
        metrics,
        recommendations,
      };
    } catch (error) {
      logger.error({ accountId, alertRuleId, error }, "Alert noise analysis failed");
      throw error;
    }
  }

  private async calculateNoiseMetrics(
    alertRuleId: string,
    windowStart: Date,
    windowEnd: Date,
  ) {
    const database = getDatabase();
    const alertEvents = await database("alert_events")
      .where("alert_rule_id", alertRuleId)
      .whereBetween("created_at", [windowStart, windowEnd])
      .count("id as count")
      .first();

    const confirmedIncidents = await database("bridge_incidents")
      .where("alert_rule_id", alertRuleId)
      .whereBetween("created_at", [windowStart, windowEnd])
      .count("id as count")
      .first();

    const totalAlerts = Number(alertEvents?.count || 0);
    const incidents = Number(confirmedIncidents?.count || 0);
    const falsePositiveRate = totalAlerts > 0 ? (totalAlerts - incidents) / totalAlerts : 0;
    const fatigueScore = Math.min(totalAlerts / 100, 100);

    return {
      totalAlerts,
      confirmedIncidents: incidents,
      falsePositiveRate,
      fatigueScore,
    };
  }

  private async generateRecommendations(analysisId: string, metrics: Record<string, unknown>) {
    const database = getDatabase();
    const recommendations: NoiseRecommendation[] = [];

    const falsePositiveRate = metrics.falsePositiveRate as number;
    const fatigueScore = metrics.fatigueScore as number;

    if (falsePositiveRate > 0.5) {
      recommendations.push({
        analysisId,
        recommendationType: "threshold_adjustment",
        description: "Increase alert threshold to reduce false positives",
        confidenceScore: 0.85,
        expectedReductionPercent: Math.min(falsePositiveRate * 60, 80),
        parameters: { currentThreshold: 0.8, suggestedThreshold: 0.85 },
        status: "pending",
      });
    }

    if (fatigueScore > 70) {
      recommendations.push({
        analysisId,
        recommendationType: "alert_suppression",
        description: "Suppress duplicate alerts within a time window",
        confidenceScore: 0.9,
        expectedReductionPercent: 40,
        parameters: { suppressionWindow: 300, dedupKey: "rule_id:asset" },
        status: "pending",
      });
    }

    recommendations.push({
      analysisId,
      recommendationType: "correlation_filter",
      description: "Filter correlated alerts from the same incident",
      confidenceScore: 0.78,
      expectedReductionPercent: 25,
      parameters: { correlationThreshold: 0.7 },
      status: "pending",
    });

    if (recommendations.length > 0) {
      await database("alert_noise_recommendations").insert(
        recommendations.map((rec) => ({
          analysis_id: rec.analysisId,
          recommendation_type: rec.recommendationType,
          description: rec.description,
          confidence_score: rec.confidenceScore,
          expected_reduction_percent: rec.expectedReductionPercent,
          parameters: JSON.stringify(rec.parameters),
          status: rec.status,
        })),
      );
    }

    return recommendations;
  }

  async getAnalysis(analysisId: string) {
    const database = getDatabase();
    const analysis = await database("alert_noise_reduction_analyses").where("id", analysisId).first();
    if (!analysis) {
      throw new Error(`Analysis not found: ${analysisId}`);
    }

    const recommendations = await database("alert_noise_recommendations").where("analysis_id", analysisId);

    return { analysis, recommendations };
  }

  async applyRecommendation(recommendationId: string) {
    const database = getDatabase();
    logger.info({ recommendationId }, "Applying alert noise recommendation");

    const recommendation = await database("alert_noise_recommendations")
      .where("id", recommendationId)
      .first();

    if (!recommendation) {
      throw new Error(`Recommendation not found: ${recommendationId}`);
    }

    await database("alert_noise_recommendations")
      .where("id", recommendationId)
      .update({
        status: "applied",
        applied_at: new Date(),
      });

    return recommendation;
  }

  async listAnalyses(accountId: string, limit = 50, offset = 0) {
    const database = getDatabase();
    const analyses = await database("alert_noise_reduction_analyses")
      .where("account_id", accountId)
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset);

    const total = await database("alert_noise_reduction_analyses").where("account_id", accountId).count("id as count").first();

    return {
      analyses,
      pagination: { total: total?.count || 0, limit, offset },
    };
  }
}

export const alertNoiseReductionService = new AlertNoiseReductionService();
