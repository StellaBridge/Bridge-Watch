import { getDatabase } from "../connection.js";

export interface BackupVerificationRecord {
  id: string;
  backup_id: string;
  backup_name: string;
  verification_type: 'checksum' | 'restore_test' | 'integrity';
  status: 'pending' | 'in_progress' | 'passed' | 'failed';
  verification_date: Date;
  completion_date?: Date;
  result_details: Record<string, any>;
  error_message?: string;
  verified_file_count?: number;
  total_file_count?: number;
  duration_ms?: number;
  created_at: Date;
  updated_at: Date;
}

export class BackupVerificationModel {
  private db = getDatabase();
  private table = "backup_verifications";

  async insert(data: Omit<BackupVerificationRecord, 'id' | 'created_at' | 'updated_at'>): Promise<BackupVerificationRecord> {
    const id = crypto.randomUUID();
    const now = new Date();
    const record = { ...data, id, created_at: now, updated_at: now };
    await this.db(this.table).insert(record);
    return record;
  }

  async getByBackupId(backup_id: string): Promise<BackupVerificationRecord[]> {
    return this.db(this.table)
      .where({ backup_id })
      .orderBy('verification_date', 'desc');
  }

  async getLatestByBackupId(backup_id: string): Promise<BackupVerificationRecord | undefined> {
    return this.db(this.table)
      .where({ backup_id })
      .orderBy('verification_date', 'desc')
      .first();
  }

  async getPendingVerifications(): Promise<BackupVerificationRecord[]> {
    return this.db(this.table)
      .where({ status: 'pending' })
      .orderBy('verification_date', 'asc');
  }

  async getFailedVerifications(): Promise<BackupVerificationRecord[]> {
    return this.db(this.table)
      .where({ status: 'failed' })
      .orderBy('updated_at', 'desc');
  }

  async getRecentVerifications(days: number = 7): Promise<BackupVerificationRecord[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.db(this.table)
      .where('verification_date', '>=', startDate)
      .orderBy('verification_date', 'desc');
  }

  async update(id: string, data: Partial<Omit<BackupVerificationRecord, 'id' | 'created_at'>>): Promise<void> {
    await this.db(this.table)
      .where({ id })
      .update({ ...data, updated_at: new Date() });
  }

  async getStatsByBackupId(backup_id: string): Promise<{
    total: number;
    passed: number;
    failed: number;
    pending: number;
  }> {
    const results = await this.db(this.table)
      .where({ backup_id })
      .select('status')
      .count('* as count')
      .groupBy('status');

    const stats = { total: 0, passed: 0, failed: 0, pending: 0 };
    for (const row of results) {
      const count = typeof row.count === 'number' ? row.count : parseInt(String(row.count));
      stats.total += count;
      if (row.status === 'passed') stats.passed = count;
      else if (row.status === 'failed') stats.failed = count;
      else if (row.status === 'pending') stats.pending = count;
    }
    return stats;
  }
}
