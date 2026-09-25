import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BackupVerificationDashboardService } from '../../services/backupVerificationDashboard.service.js';
import { authMiddleware } from '../middleware/auth.js';

const VerificationInitiateSchema = {
  type: 'object',
  required: ['backup_id', 'backup_name', 'verification_type'],
  properties: {
    backup_id: { type: 'string' },
    backup_name: { type: 'string' },
    verification_type: { type: 'string', enum: ['checksum', 'restore_test', 'integrity'] },
  },
};

const VerificationResultSchema = {
  type: 'object',
  required: ['backup_id', 'verification_type', 'passed', 'duration_ms'],
  properties: {
    backup_id: { type: 'string' },
    verification_type: { type: 'string', enum: ['checksum', 'restore_test', 'integrity'] },
    passed: { type: 'boolean' },
    duration_ms: { type: 'number' },
    verified_file_count: { type: 'number' },
    total_file_count: { type: 'number' },
    error: { type: 'string' },
  },
};

export async function backupVerificationDashboardRoutes(server: FastifyInstance) {
  const service = new BackupVerificationDashboardService();

  server.addHook('preHandler', authMiddleware());

  server.post<{ Body: any }>(
    '/api/v1/admin/backups/verify/initiate',
    { schema: { body: VerificationInitiateSchema } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { backup_id, backup_name, verification_type } = request.body;

        const record = await service.initiateVerification(
          backup_id,
          backup_name,
          verification_type
        );

        reply.code(201).send({ data: record });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to initiate verification',
        });
      }
    }
  );

  server.post<{ Params: { id: string }; Body: any }>(
    '/api/v1/admin/backups/verify/:id/result',
    { schema: { body: VerificationResultSchema } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { backup_id, verification_type, passed, duration_ms, verified_file_count, total_file_count, error } = request.body;

        await service.recordVerificationResult(id, {
          backup_id,
          verification_type,
          passed,
          duration_ms,
          verified_file_count,
          total_file_count,
          error,
        });

        reply.send({ success: true });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to record result',
        });
      }
    }
  );

  server.get<{ Params: { backup_id: string } }>(
    '/api/v1/backups/:backup_id/verification-status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { backup_id } = request.params;
        const status = await service.getBackupStatus(backup_id);
        reply.send({ data: status });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get status',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/backups/verify/dashboard/overview',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const days = (request.query as any).days || 7;
        const overview = await service.getDashboardOverview(parseInt(String(days)));
        reply.send({ data: overview });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get overview',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/backups/verify/failed',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const failed = await service.getFailedVerifications();
        reply.send({ data: failed });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get failed verifications',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/backups/verify/pending',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const pending = await service.getPendingVerifications();
        reply.send({ data: pending });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get pending verifications',
        });
      }
    }
  );

  server.post<{ Params: { backup_id: string } }>(
    '/api/v1/admin/backups/:backup_id/schedule-verification',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { backup_id } = request.params;
        await service.scheduleVerification(backup_id);
        reply.send({ success: true });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to schedule verification',
        });
      }
    }
  );
}
