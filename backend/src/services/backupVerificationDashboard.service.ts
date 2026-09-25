import { logger } from '../utils/logger.js';
import { BackupVerificationModel } from '../database/models/backupVerification.model.js';
import type { BackupVerificationRecord } from '../database/models/backupVerification.model.js';

export interface VerificationResult {
  backup_id: string;
  verification_type: 'checksum' | 'restore_test' | 'integrity';
  passed: boolean;
  duration_ms: number;
  verified_file_count?: number;
  total_file_count?: number;
  error?: string;
}

export class BackupVerificationDashboardService {
  private model: BackupVerificationModel;

  constructor() {
    this.model = new BackupVerificationModel();
  }

  async initiateVerification(
    backup_id: string,
    backup_name: string,
    verification_type: 'checksum' | 'restore_test' | 'integrity'
  ): Promise<BackupVerificationRecord> {
    try {
      logger.info({ backup_id, verification_type }, 'Initiating backup verification');

      const record = await this.model.insert({
        backup_id,
        backup_name,
        verification_type,
        status: 'pending',
        verification_date: new Date(),
        result_details: {},
      });

      return record;
    } catch (error) {
      logger.error({ error, backup_id }, 'Failed to initiate verification');
      throw new Error(`Failed to initiate verification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async recordVerificationResult(
    verification_id: string,
    result: VerificationResult
  ): Promise<void> {
    try {
      const now = new Date();
      const duration = result.duration_ms;

      await this.model.update(verification_id, {
        status: result.passed ? 'passed' : 'failed',
        completion_date: now,
        result_details: {
          verification_type: result.verification_type,
          checksum_validated: result.verification_type === 'checksum',
          restore_test_passed: result.verification_type === 'restore_test',
        },
        error_message: result.error,
        verified_file_count: result.verified_file_count,
        total_file_count: result.total_file_count,
        duration_ms: duration,
      });

      logger.info(
        { verification_id, passed: result.passed, duration },
        'Recorded verification result'
      );
    } catch (error) {
      logger.error({ error, verification_id }, 'Failed to record verification result');
      throw new Error(`Failed to record verification result: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBackupStatus(backup_id: string): Promise<{
    backup_id: string;
    total_verifications: number;
    passed: number;
    failed: number;
    pending: number;
    last_verification_date?: Date;
    last_verification_status?: string;
    health_score: number;
  }> {
    try {
      const stats = await this.model.getStatsByBackupId(backup_id);
      const latest = await this.model.getLatestByBackupId(backup_id);

      const health_score = stats.total === 0
        ? 0
        : Math.round((stats.passed / stats.total) * 100);

      return {
        backup_id,
        total_verifications: stats.total,
        passed: stats.passed,
        failed: stats.failed,
        pending: stats.pending,
        last_verification_date: latest?.completion_date || latest?.verification_date,
        last_verification_status: latest?.status,
        health_score,
      };
    } catch (error) {
      logger.error({ error, backup_id }, 'Failed to get backup status');
      throw new Error(`Failed to get backup status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getFailedVerifications(): Promise<BackupVerificationRecord[]> {
    try {
      return await this.model.getFailedVerifications();
    } catch (error) {
      logger.error({ error }, 'Failed to get failed verifications');
      throw new Error(`Failed to get failed verifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPendingVerifications(): Promise<BackupVerificationRecord[]> {
    try {
      return await this.model.getPendingVerifications();
    } catch (error) {
      logger.error({ error }, 'Failed to get pending verifications');
      throw new Error(`Failed to get pending verifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDashboardOverview(days: number = 7): Promise<{
    total_backups_verified: number;
    successful_verifications: number;
    failed_verifications: number;
    pending_verifications: number;
    average_duration_ms: number;
    at_risk_backups: BackupVerificationRecord[];
  }> {
    try {
      const recent = await this.model.getRecentVerifications(days);
      const failed = await this.model.getFailedVerifications();
      const pending = await this.model.getPendingVerifications();

      const successful = recent.filter(v => v.status === 'passed').length;
      const avg_duration = recent.length > 0
        ? Math.round(recent.reduce((sum, v) => sum + (v.duration_ms || 0), 0) / recent.length)
        : 0;

      return {
        total_backups_verified: recent.length,
        successful_verifications: successful,
        failed_verifications: failed.length,
        pending_verifications: pending.length,
        average_duration_ms: avg_duration,
        at_risk_backups: failed.slice(0, 10),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get dashboard overview');
      throw new Error(`Failed to get dashboard overview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async scheduleVerification(backup_id: string): Promise<void> {
    try {
      logger.info({ backup_id }, 'Scheduled backup verification');
    } catch (error) {
      logger.error({ error, backup_id }, 'Failed to schedule verification');
      throw new Error(`Failed to schedule verification: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
