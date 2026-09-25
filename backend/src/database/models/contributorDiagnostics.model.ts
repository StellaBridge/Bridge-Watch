import { getDatabase } from "../connection.js";

export interface ContributorDiagnosticsRecord {
  id: string;
  contributor_id: string;
  contributor_name: string;
  diagnostic_type: 'performance' | 'code_quality' | 'testing' | 'documentation';
  status: 'healthy' | 'warning' | 'critical';
  metrics: Record<string, any>;
  score: number;
  last_updated: Date;
  recommendations: string[];
  created_at: Date;
  updated_at: Date;
}

export class ContributorDiagnosticsModel {
  private db = getDatabase();
  private table = "contributor_diagnostics";

  async insert(data: Omit<ContributorDiagnosticsRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ContributorDiagnosticsRecord> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record = { ...data, id, created_at: now, updated_at: now };
    await this.db(this.table).insert(record);
    return record;
  }

  async getByContributorId(contributor_id: string): Promise<ContributorDiagnosticsRecord[]> {
    return this.db(this.table)
      .where({ contributor_id })
      .orderBy('diagnostic_type', 'asc');
  }

  async getLatestByContributorId(contributor_id: string, diagnostic_type: string): Promise<ContributorDiagnosticsRecord | undefined> {
    return this.db(this.table)
      .where({ contributor_id, diagnostic_type })
      .orderBy('created_at', 'desc')
      .first();
  }

  async getCriticalIssues(): Promise<ContributorDiagnosticsRecord[]> {
    return this.db(this.table)
      .where({ status: 'critical' })
      .orderBy('updated_at', 'desc');
  }

  async getAllContributors(): Promise<ContributorDiagnosticsRecord[]> {
    return this.db(this.table).select();
  }

  async getAverageScoreByType(diagnostic_type: string): Promise<number> {
    const result = await this.db(this.table)
      .where({ diagnostic_type })
      .avg('score as average_score')
      .first();

    return result?.average_score ? parseFloat(String(result.average_score)) : 0;
  }

  async update(id: string, data: Partial<Omit<ContributorDiagnosticsRecord, 'id' | 'created_at'>>): Promise<void> {
    await this.db(this.table)
      .where({ id })
      .update({ ...data, updated_at: new Date() });
  }

  async getRecentUpdates(days: number = 7): Promise<ContributorDiagnosticsRecord[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.db(this.table)
      .where('updated_at', '>=', startDate)
      .orderBy('updated_at', 'desc');
  }

  async getHealthSummary(): Promise<{
    healthy: number;
    warning: number;
    critical: number;
    total: number;
  }> {
    const results = await this.db(this.table)
      .select('status')
      .count('* as count')
      .groupBy('status');

    const summary = { healthy: 0, warning: 0, critical: 0, total: 0 };
    for (const row of results) {
      const count = typeof row.count === 'number' ? row.count : parseInt(String(row.count));
      summary.total += count;
      if (row.status === 'healthy') summary.healthy = count;
      else if (row.status === 'warning') summary.warning = count;
      else if (row.status === 'critical') summary.critical = count;
    }
    return summary;
  }
}
