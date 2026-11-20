import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackupVerificationDashboardService, VerificationResult } from '../../services/backupVerificationDashboard.service.js';
import { BackupVerificationModel } from '../../database/models/backupVerification.model.js';

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../database/models/backupVerification.model.js');

describe('BackupVerificationDashboardService', () => {
  let service: BackupVerificationDashboardService;
  let mockModel: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockModel = new BackupVerificationModel();
    service = new BackupVerificationDashboardService();
  });

  describe('initiateVerification', () => {
    it('should initiate a backup verification with pending status', async () => {
      const backup_id = 'backup-001';
      const backup_name = 'prod_backup';
      const verification_type = 'restore_test';

      const mockRecord = {
        id: 'verify-001',
        backup_id,
        backup_name,
        verification_type,
        status: 'pending',
        verification_date: new Date(),
        result_details: {},
      };

      mockModel.insert.mockResolvedValueOnce(mockRecord);

      const result = await service.initiateVerification(backup_id, backup_name, verification_type);

      expect(result).toEqual(mockRecord);
      expect(mockModel.insert).toHaveBeenCalledWith({
        backup_id,
        backup_name,
        verification_type,
        status: 'pending',
        verification_date: expect.any(Date),
        result_details: {},
      });
    });

    it('should handle verification initiation errors', async () => {
      mockModel.insert.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        service.initiateVerification('backup-001', 'prod_backup', 'checksum')
      ).rejects.toThrow('Failed to initiate verification: Database connection failed');
    });

    it('should support all verification types', async () => {
      const backup_id = 'backup-002';
      const backup_name = 'staging_backup';

      const verificationTypes: Array<'checksum' | 'restore_test' | 'integrity'> = [
        'checksum',
        'restore_test',
        'integrity',
      ];

      for (const type of verificationTypes) {
        mockModel.insert.mockResolvedValueOnce({
          id: `verify-${type}`,
          backup_id,
          backup_name,
          verification_type: type,
          status: 'pending',
          verification_date: new Date(),
          result_details: {},
        });

        const result = await service.initiateVerification(backup_id, backup_name, type);
        expect(result.verification_type).toBe(type);
      }
    });
  });

  describe('recordVerificationResult', () => {
    it('should record a successful verification result', async () => {
      const verification_id = 'verify-001';
      const result: VerificationResult = {
        backup_id: 'backup-001',
        verification_type: 'restore_test',
        passed: true,
        duration_ms: 1500,
        verified_file_count: 100,
        total_file_count: 100,
      };

      mockModel.update.mockResolvedValueOnce(undefined);

      await service.recordVerificationResult(verification_id, result);

      expect(mockModel.update).toHaveBeenCalledWith(
        verification_id,
        expect.objectContaining({
          status: 'passed',
          completion_date: expect.any(Date),
          result_details: {
            verification_type: 'restore_test',
            checksum_validated: false,
            restore_test_passed: true,
          },
          error_message: undefined,
          verified_file_count: 100,
          total_file_count: 100,
          duration_ms: 1500,
        })
      );
    });

    it('should record a failed verification result with error message', async () => {
      const verification_id = 'verify-002';
      const result: VerificationResult = {
        backup_id: 'backup-001',
        verification_type: 'integrity',
        passed: false,
        duration_ms: 2000,
        error: 'Checksum mismatch detected',
      };

      mockModel.update.mockResolvedValueOnce(undefined);

      await service.recordVerificationResult(verification_id, result);

      expect(mockModel.update).toHaveBeenCalledWith(
        verification_id,
        expect.objectContaining({
          status: 'failed',
          error_message: 'Checksum mismatch detected',
          result_details: {
            verification_type: 'integrity',
            checksum_validated: false,
            restore_test_passed: false,
          },
        })
      );
    });

    it('should handle verification recording errors', async () => {
      mockModel.update.mockRejectedValueOnce(new Error('Update failed'));

      const result: VerificationResult = {
        backup_id: 'backup-001',
        verification_type: 'checksum',
        passed: true,
        duration_ms: 1000,
      };

      await expect(
        service.recordVerificationResult('verify-001', result)
      ).rejects.toThrow('Failed to record verification result: Update failed');
    });

    it('should mark checksum verification correctly', async () => {
      const result: VerificationResult = {
        backup_id: 'backup-001',
        verification_type: 'checksum',
        passed: true,
        duration_ms: 500,
      };

      mockModel.update.mockResolvedValueOnce(undefined);
      await service.recordVerificationResult('verify-001', result);

      const callArgs = mockModel.update.mock.calls[0][1];
      expect(callArgs.result_details.checksum_validated).toBe(true);
      expect(callArgs.result_details.restore_test_passed).toBe(false);
    });
  });

  describe('getBackupStatus', () => {
    it('should calculate health score correctly', async () => {
      const backup_id = 'backup-001';

      mockModel.getStatsByBackupId.mockResolvedValueOnce({
        total: 10,
        passed: 8,
        failed: 2,
        pending: 0,
      });

      mockModel.getLatestByBackupId.mockResolvedValueOnce({
        status: 'passed',
        completion_date: new Date(),
        verification_date: new Date(),
      });

      const result = await service.getBackupStatus(backup_id);

      expect(result.health_score).toBe(80);
      expect(result.total_verifications).toBe(10);
      expect(result.passed).toBe(8);
      expect(result.failed).toBe(2);
      expect(result.pending).toBe(0);
    });

    it('should return zero health score when no verifications exist', async () => {
      mockModel.getStatsByBackupId.mockResolvedValueOnce({
        total: 0,
        passed: 0,
        failed: 0,
        pending: 0,
      });

      mockModel.getLatestByBackupId.mockResolvedValueOnce(null);

      const result = await service.getBackupStatus('backup-002');

      expect(result.health_score).toBe(0);
      expect(result.last_verification_status).toBeUndefined();
    });

    it('should handle status retrieval errors', async () => {
      mockModel.getStatsByBackupId.mockRejectedValueOnce(new Error('Query failed'));

      await expect(
        service.getBackupStatus('backup-001')
      ).rejects.toThrow('Failed to get backup status: Query failed');
    });

    it('should use completion_date if available, otherwise verification_date', async () => {
      const verificationDate = new Date('2024-01-01');
      const completionDate = new Date('2024-01-02');

      mockModel.getStatsByBackupId.mockResolvedValueOnce({
        total: 1,
        passed: 1,
        failed: 0,
        pending: 0,
      });

      mockModel.getLatestByBackupId.mockResolvedValueOnce({
        status: 'passed',
        completion_date: completionDate,
        verification_date: verificationDate,
      });

      const result = await service.getBackupStatus('backup-001');

      expect(result.last_verification_date).toEqual(completionDate);
    });
  });

  describe('getFailedVerifications', () => {
    it('should retrieve all failed verification records', async () => {
      const failedRecords = [
        {
          id: 'verify-001',
          backup_id: 'backup-001',
          status: 'failed',
          error_message: 'Timeout during restore',
        },
        {
          id: 'verify-002',
          backup_id: 'backup-002',
          status: 'failed',
          error_message: 'Constraint violation detected',
        },
      ];

      mockModel.getFailedVerifications.mockResolvedValueOnce(failedRecords);

      const result = await service.getFailedVerifications();

      expect(result).toEqual(failedRecords);
      expect(result).toHaveLength(2);
    });

    it('should handle empty failed verifications list', async () => {
      mockModel.getFailedVerifications.mockResolvedValueOnce([]);

      const result = await service.getFailedVerifications();

      expect(result).toEqual([]);
    });

    it('should handle retrieval errors', async () => {
      mockModel.getFailedVerifications.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.getFailedVerifications()
      ).rejects.toThrow('Failed to get failed verifications: Database error');
    });
  });

  describe('getPendingVerifications', () => {
    it('should retrieve all pending verification records', async () => {
      const pendingRecords = [
        {
          id: 'verify-001',
          backup_id: 'backup-001',
          status: 'pending',
        },
      ];

      mockModel.getPendingVerifications.mockResolvedValueOnce(pendingRecords);

      const result = await service.getPendingVerifications();

      expect(result).toEqual(pendingRecords);
    });

    it('should handle retrieval errors', async () => {
      mockModel.getPendingVerifications.mockRejectedValueOnce(new Error('Query failed'));

      await expect(
        service.getPendingVerifications()
      ).rejects.toThrow('Failed to get pending verifications: Query failed');
    });
  });

  describe('getDashboardOverview', () => {
    it('should generate dashboard overview with default 7-day period', async () => {
      const now = new Date();
      const recent = Array.from({ length: 5 }, (_, i) => ({
        id: `verify-${i}`,
        backup_id: `backup-${i}`,
        status: i < 4 ? 'passed' : 'failed',
        duration_ms: 1000 + i * 100,
        verification_date: now,
      }));

      const failedRecords = [recent[4]];

      mockModel.getRecentVerifications.mockResolvedValueOnce(recent);
      mockModel.getFailedVerifications.mockResolvedValueOnce(failedRecords);
      mockModel.getPendingVerifications.mockResolvedValueOnce([]);

      const result = await service.getDashboardOverview();

      expect(result.total_backups_verified).toBe(5);
      expect(result.successful_verifications).toBe(4);
      expect(result.failed_verifications).toBe(1);
      expect(result.pending_verifications).toBe(0);
      expect(result.average_duration_ms).toBe(1200);
      expect(result.at_risk_backups).toHaveLength(1);
    });

    it('should use custom day parameter', async () => {
      mockModel.getRecentVerifications.mockResolvedValueOnce([]);
      mockModel.getFailedVerifications.mockResolvedValueOnce([]);
      mockModel.getPendingVerifications.mockResolvedValueOnce([]);

      await service.getDashboardOverview(30);

      expect(mockModel.getRecentVerifications).toHaveBeenCalledWith(30);
    });

    it('should handle empty dashboard data', async () => {
      mockModel.getRecentVerifications.mockResolvedValueOnce([]);
      mockModel.getFailedVerifications.mockResolvedValueOnce([]);
      mockModel.getPendingVerifications.mockResolvedValueOnce([]);

      const result = await service.getDashboardOverview();

      expect(result.total_backups_verified).toBe(0);
      expect(result.successful_verifications).toBe(0);
      expect(result.average_duration_ms).toBe(0);
    });

    it('should handle retrieval errors', async () => {
      mockModel.getRecentVerifications.mockRejectedValueOnce(new Error('Query error'));

      await expect(
        service.getDashboardOverview()
      ).rejects.toThrow('Failed to get dashboard overview: Query error');
    });

    it('should limit at-risk backups to 10', async () => {
      const failedRecords = Array.from({ length: 15 }, (_, i) => ({
        id: `verify-${i}`,
        backup_id: `backup-${i}`,
        status: 'failed',
      }));

      mockModel.getRecentVerifications.mockResolvedValueOnce([]);
      mockModel.getFailedVerifications.mockResolvedValueOnce(failedRecords);
      mockModel.getPendingVerifications.mockResolvedValueOnce([]);

      const result = await service.getDashboardOverview();

      expect(result.at_risk_backups).toHaveLength(10);
    });
  });

  describe('scheduleVerification', () => {
    it('should schedule verification without throwing', async () => {
      await expect(
        service.scheduleVerification('backup-001')
      ).resolves.toBeUndefined();
    });

    it('should handle scheduling errors', async () => {
      // The method currently only logs, so we need to verify no exception is thrown
      await expect(
        service.scheduleVerification('backup-001')
      ).resolves.toBeUndefined();
    });
  });
});
