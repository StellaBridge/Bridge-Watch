import { logger } from '../utils/logger.js';
import { ContributorDiagnosticsModel } from '../database/models/contributorDiagnostics.model.js';
import type { ContributorDiagnosticsRecord } from '../database/models/contributorDiagnostics.model.js';

export interface DiagnosticMetrics {
  performance?: {
    avg_pr_review_time: number;
    commit_frequency: number;
    average_pr_size: number;
  };
  code_quality?: {
    test_coverage: number;
    bug_escape_rate: number;
    code_review_comments: number;
  };
  testing?: {
    test_coverage_percentage: number;
    test_pass_rate: number;
    flaky_tests: number;
  };
  documentation?: {
    doc_update_frequency: number;
    comment_ratio: number;
    issue_documentation_rate: number;
  };
}

export class ContributorDiagnosticsService {
  private model: ContributorDiagnosticsModel;

  constructor() {
    this.model = new ContributorDiagnosticsModel();
  }

  async recordDiagnostics(
    contributor_id: string,
    contributor_name: string,
    diagnostic_type: 'performance' | 'code_quality' | 'testing' | 'documentation',
    metrics: DiagnosticMetrics[keyof DiagnosticMetrics] & Record<string, any>,
    score: number,
    recommendations: string[]
  ): Promise<ContributorDiagnosticsRecord> {
    try {
      const status = this.calculateStatus(score);
      logger.info({ contributor_id, diagnostic_type, score, status }, 'Recording contributor diagnostics');

      const record = await this.model.insert({
        contributor_id,
        contributor_name,
        diagnostic_type,
        status,
        metrics,
        score,
        last_updated: new Date(),
        recommendations,
      });

      return record;
    } catch (error) {
      logger.error({ error, contributor_id, diagnostic_type }, 'Failed to record diagnostics');
      throw new Error(`Failed to record diagnostics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private calculateStatus(score: number): 'healthy' | 'warning' | 'critical' {
    if (score >= 7) return 'healthy';
    if (score >= 4) return 'warning';
    return 'critical';
  }

  async getContributorDiagnostics(contributor_id: string): Promise<ContributorDiagnosticsRecord[]> {
    try {
      return await this.model.getByContributorId(contributor_id);
    } catch (error) {
      logger.error({ error, contributor_id }, 'Failed to get contributor diagnostics');
      throw new Error(`Failed to get contributor diagnostics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getLatestDiagnostic(
    contributor_id: string,
    diagnostic_type: string
  ): Promise<ContributorDiagnosticsRecord | undefined> {
    try {
      return await this.model.getLatestByContributorId(contributor_id, diagnostic_type);
    } catch (error) {
      logger.error({ error, contributor_id, diagnostic_type }, 'Failed to get latest diagnostic');
      throw new Error(`Failed to get latest diagnostic: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCriticalIssues(): Promise<ContributorDiagnosticsRecord[]> {
    try {
      return await this.model.getCriticalIssues();
    } catch (error) {
      logger.error({ error }, 'Failed to get critical issues');
      throw new Error(`Failed to get critical issues: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDashboardOverview(): Promise<{
    total_contributors: number;
    healthy_contributors: number;
    warning_contributors: number;
    critical_contributors: number;
    average_score: number;
    top_issues: ContributorDiagnosticsRecord[];
  }> {
    try {
      const all = await this.model.getAllContributors();
      const summary = await this.model.getHealthSummary();
      const critical = await this.model.getCriticalIssues();

      const unique_contributors = new Set(all.map(d => d.contributor_id)).size;
      const total_score = all.reduce((sum, d) => sum + d.score, 0);
      const average_score = all.length > 0 ? Math.round((total_score / all.length) * 10) / 10 : 0;

      return {
        total_contributors: unique_contributors,
        healthy_contributors: summary.healthy,
        warning_contributors: summary.warning,
        critical_contributors: summary.critical,
        average_score,
        top_issues: critical.slice(0, 5),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get dashboard overview');
      throw new Error(`Failed to get dashboard overview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTypeAverages(): Promise<{
    performance_avg: number;
    code_quality_avg: number;
    testing_avg: number;
    documentation_avg: number;
  }> {
    try {
      const performance_avg = await this.model.getAverageScoreByType('performance');
      const code_quality_avg = await this.model.getAverageScoreByType('code_quality');
      const testing_avg = await this.model.getAverageScoreByType('testing');
      const documentation_avg = await this.model.getAverageScoreByType('documentation');

      return {
        performance_avg: Math.round(performance_avg * 10) / 10,
        code_quality_avg: Math.round(code_quality_avg * 10) / 10,
        testing_avg: Math.round(testing_avg * 10) / 10,
        documentation_avg: Math.round(documentation_avg * 10) / 10,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get type averages');
      throw new Error(`Failed to get type averages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getRecentUpdates(days: number = 7): Promise<ContributorDiagnosticsRecord[]> {
    try {
      return await this.model.getRecentUpdates(days);
    } catch (error) {
      logger.error({ error }, 'Failed to get recent updates');
      throw new Error(`Failed to get recent updates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
