import { getDatabase } from "../connection.js";

export interface HealthCheckDependencyRecord {
  id: string;
  health_check_id: string;
  dependent_check_id: string;
  dependency_type: 'blocking' | 'informational';
  failure_impact: string;
  created_at: Date;
  updated_at: Date;
}

export class HealthCheckDependencyModel {
  private db = getDatabase();
  private table = "health_check_dependencies";

  async insert(data: Omit<HealthCheckDependencyRecord, 'id' | 'created_at' | 'updated_at'>): Promise<HealthCheckDependencyRecord> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record = { ...data, id, created_at: now, updated_at: now };
    await this.db(this.table).insert(record);
    return record;
  }

  async getByHealthCheckId(health_check_id: string): Promise<HealthCheckDependencyRecord[]> {
    return this.db(this.table).where({ health_check_id });
  }

  async getDependents(health_check_id: string): Promise<HealthCheckDependencyRecord[]> {
    return this.db(this.table).where({ dependent_check_id: health_check_id });
  }

  async update(id: string, data: Partial<Omit<HealthCheckDependencyRecord, 'id' | 'created_at'>>): Promise<void> {
    await this.db(this.table)
      .where({ id })
      .update({ ...data, updated_at: new Date() });
  }

  async delete(id: string): Promise<void> {
    await this.db(this.table).where({ id }).del();
  }

  async getGraph(): Promise<HealthCheckDependencyRecord[]> {
    return this.db(this.table).select();
  }
}
