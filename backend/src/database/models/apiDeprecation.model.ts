import { getDatabase } from "../connection.js";

export interface ApiDeprecationRecord {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  status: 'active' | 'deprecated' | 'sunset';
  deprecation_date: Date;
  sunset_date: Date;
  replacement_endpoint?: string;
  migration_guide?: string;
  impact_score: number;
  active_client_count: number;
  last_used_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class ApiDeprecationModel {
  private db = getDatabase();
  private table = "api_deprecations";

  async insert(data: Omit<ApiDeprecationRecord, 'id' | 'created_at' | 'updated_at'>): Promise<ApiDeprecationRecord> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record = { ...data, id, created_at: now, updated_at: now };
    await this.db(this.table).insert(record);
    return record;
  }

  async getAll(): Promise<ApiDeprecationRecord[]> {
    return this.db(this.table).select();
  }

  async getByEndpoint(endpoint: string, method: string): Promise<ApiDeprecationRecord | undefined> {
    return this.db(this.table).where({ endpoint, method }).first();
  }

  async getDeprecated(): Promise<ApiDeprecationRecord[]> {
    return this.db(this.table)
      .whereIn('status', ['deprecated', 'sunset'])
      .orderBy('sunset_date', 'asc');
  }

  async getAtRisk(): Promise<ApiDeprecationRecord[]> {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return this.db(this.table)
      .where({ status: 'deprecated' })
      .where('sunset_date', '<=', thirtyDaysFromNow)
      .orderBy('sunset_date', 'asc');
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.db(this.table)
      .where({ id })
      .update({ last_used_at: new Date() });
  }

  async updateImpactScore(id: string, score: number, clientCount: number): Promise<void> {
    await this.db(this.table)
      .where({ id })
      .update({ impact_score: score, active_client_count: clientCount, updated_at: new Date() });
  }

  async update(id: string, data: Partial<Omit<ApiDeprecationRecord, 'id' | 'created_at'>>): Promise<void> {
    await this.db(this.table)
      .where({ id })
      .update({ ...data, updated_at: new Date() });
  }
}
