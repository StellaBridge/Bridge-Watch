import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiDeprecationDashboardService } from '../../services/apiDeprecationDashboard.service.js';
import { authMiddleware } from '../middleware/auth.js';

const DeprecationRegisterSchema = {
  type: 'object',
  required: ['endpoint', 'method', 'deprecation_date', 'sunset_date'],
  properties: {
    endpoint: { type: 'string' },
    method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
    deprecation_date: { type: 'string' },
    sunset_date: { type: 'string' },
    replacement_endpoint: { type: 'string' },
    migration_guide: { type: 'string' },
  },
};

export async function apiDeprecationDashboardRoutes(server: FastifyInstance) {
  const service = new ApiDeprecationDashboardService();

  server.addHook('preHandler', authMiddleware());

  server.post<{ Body: any }>(
    '/api/v1/admin/deprecations/register',
    { schema: { body: DeprecationRegisterSchema } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          endpoint,
          method,
          deprecation_date,
          sunset_date,
          replacement_endpoint,
          migration_guide,
        } = request.body;

        const record = await service.registerDeprecation(
          endpoint,
          method,
          new Date(deprecation_date),
          new Date(sunset_date),
          replacement_endpoint,
          migration_guide
        );

        reply.code(201).send({ data: record });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to register deprecation',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/deprecations/dashboard/metrics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await service.getDashboardMetrics();
        reply.send({ data: metrics });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get metrics',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/deprecations/at-risk',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const endpoints = await service.getAtRiskEndpoints();
        reply.send({ data: endpoints });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get at-risk endpoints',
        });
      }
    }
  );

  server.get(
    '/api/v1/admin/deprecations/deprecated',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const endpoints = await service.getDeprecatedEndpoints();
        reply.send({ data: endpoints });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get deprecated endpoints',
        });
      }
    }
  );

  server.post<{ Params: { id: string }; Body: { status: string } }>(
    '/api/v1/admin/deprecations/:id/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { status } = request.body;

        await service.updateDeprecationStatus(id, status as 'deprecated' | 'sunset');
        reply.send({ success: true });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to update status',
        });
      }
    }
  );

  server.post<{ Params: { endpoint: string; method: string } }>(
    '/api/v1/deprecations/track/:endpoint/:method',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { endpoint, method } = request.params;
        await service.trackEndpointUsage(endpoint, method);
        reply.send({ success: true });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to track usage',
        });
      }
    }
  );

  server.get<{ Params: { endpoint: string; method: string } }>(
    '/api/v1/deprecations/migration-report/:endpoint/:method',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { endpoint, method } = request.params;
        const report = await service.getMigrationReport(endpoint, method);
        reply.send({ data: report });
      } catch (error) {
        reply.code(400).send({
          error: error instanceof Error ? error.message : 'Failed to get migration report',
        });
      }
    }
  );
}
