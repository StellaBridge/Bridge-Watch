import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ContributorDiagnosticsService } from '../../services/contributorDiagnostics.service.js';
import { authMiddleware } from '../middleware/auth.js';

const DiagnosticsRecordSchema = {
  type: 'object',
  required: ['contributor_id', 'contributor_name', 'diagnostic_type', 'metrics', 'score', 'recommendations'],
  properties: {
    contributor_id: { type: 'string' },
    contributor_name: { type: 'string' },
    diagnostic_type: { type: 'string', enum: ['performance', 'code_quality', 'testing', 'documentation'] },
    metrics: { type: 'object' },
    score: { type: 'number' },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
};

export async function contributorDiagnosticsRoutes(server: FastifyInstance) {
  const service = new ContributorDiagnosticsService();

  server.addHook('preHandler', authMiddleware());

  server.post<{ Body: any }>(
    '/api/v1/admin/contributors/diagnostics/record',
    { schema: { body: DiagnosticsRecordSchema } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { contributor_id, contributor_name, diagnostic_type, metrics, score, recommendations } = request.body;

        const record = await service.recordDiagnostics(
          contributor_id,
          contributor_name,
          diagnostic_type,
          metrics,
          score,
          recommendations
        );

        reply.code(201).send({ data: record });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to record diagnostics',
        });
      }
    }
  );

  server.get<{ Params: { contributor_id: string } }>(
    '/api/v1/contributors/:contributor_id/diagnostics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { contributor_id } = request.params;
        const diagnostics = await service.getContributorDiagnostics(contributor_id);
        reply.send({ data: diagnostics });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get diagnostics',
        });
      }
    }
  );

  server.get<{ Params: { contributor_id: string; type: string } }>(
    '/api/v1/contributors/:contributor_id/diagnostics/:type',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { contributor_id, type } = request.params;
        const diagnostic = await service.getLatestDiagnostic(contributor_id, type);
        reply.send({ data: diagnostic });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get diagnostic',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/contributors/diagnostics/critical',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const issues = await service.getCriticalIssues();
        reply.send({ data: issues });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get critical issues',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/contributors/diagnostics/dashboard',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const overview = await service.getDashboardOverview();
        reply.send({ data: overview });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get dashboard overview',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/contributors/diagnostics/averages',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const averages = await service.getTypeAverages();
        reply.send({ data: averages });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get averages',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/contributors/diagnostics/recent-updates',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const days = (request.query as any).days || 7;
        const updates = await service.getRecentUpdates(parseInt(String(days)));
        reply.send({ data: updates });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get recent updates',
        });
      }
    }
  );
}
