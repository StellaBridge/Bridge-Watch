import { logger } from '../utils/logger.js';
import { ApiDeprecationModel } from '../database/models/apiDeprecation.model.js';
import type { ApiDeprecationRecord } from '../database/models/apiDeprecation.model.js';

export interface DeprecationMetrics {
  total_endpoints: number;
  deprecated_count: number;
  sunset_count: number;
  at_risk_count: number;
  average_active_clients: number;
  high_impact_count: number;
}

export class ApiDeprecationDashboardService {
  private model: ApiDeprecationModel;

  constructor() {
    this.model = new ApiDeprecationModel();
  }

  async registerDeprecation(
    endpoint: string,
    method: string,
    deprecation_date: Date,
    sunset_date: Date,
    replacement_endpoint?: string,
    migration_guide?: string
  ): Promise<ApiDeprecationRecord> {
    try {
      logger.info({ endpoint, method, sunset_date }, 'Registering API deprecation');

      const record = await this.model.insert({
        endpoint,
        method: method as any,
        status: 'deprecated',
        deprecation_date,
        sunset_date,
        replacement_endpoint,
        migration_guide,
        impact_score: 0,
        active_client_count: 0,
      });

      return record;
    } catch (error) {
      logger.error({ error, endpoint, method }, 'Failed to register deprecation');
      throw new Error(`Failed to register deprecation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDashboardMetrics(): Promise<DeprecationMetrics> {
    try {
      const all = await this.model.getAll();
      const deprecated = await this.model.getDeprecated();
      const atRisk = await this.model.getAtRisk();

      const deprecated_count = deprecated.filter(d => d.status === 'deprecated').length;
      const sunset_count = deprecated.filter(d => d.status === 'sunset').length;
      const high_impact_count = deprecated.filter(d => d.impact_score > 7).length;
      const average_active_clients = deprecated.length > 0
        ? deprecated.reduce((sum, d) => sum + d.active_client_count, 0) / deprecated.length
        : 0;

      return {
        total_endpoints: all.length,
        deprecated_count,
        sunset_count,
        at_risk_count: atRisk.length,
        average_active_clients: Math.round(average_active_clients),
        high_impact_count,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get dashboard metrics');
      throw new Error(`Failed to get dashboard metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAtRiskEndpoints(): Promise<ApiDeprecationRecord[]> {
    try {
      return await this.model.getAtRisk();
    } catch (error) {
      logger.error({ error }, 'Failed to get at-risk endpoints');
      throw new Error(`Failed to get at-risk endpoints: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDeprecatedEndpoints(): Promise<ApiDeprecationRecord[]> {
    try {
      return await this.model.getDeprecated();
    } catch (error) {
      logger.error({ error }, 'Failed to get deprecated endpoints');
      throw new Error(`Failed to get deprecated endpoints: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async trackEndpointUsage(endpoint: string, method: string): Promise<void> {
    try {
      const deprecation = await this.model.getByEndpoint(endpoint, method);
      if (deprecation) {
        await this.model.updateLastUsed(deprecation.id);
      }
    } catch (error) {
      logger.warn({ error, endpoint, method }, 'Failed to track endpoint usage');
    }
  }

  async updateImpactMetrics(endpoint: string, method: string, impact_score: number, active_clients: number): Promise<void> {
    try {
      const deprecation = await this.model.getByEndpoint(endpoint, method);
      if (deprecation) {
        await this.model.updateImpactScore(deprecation.id, impact_score, active_clients);
      }
    } catch (error) {
      logger.error({ error, endpoint, method }, 'Failed to update impact metrics');
      throw new Error(`Failed to update impact metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateDeprecationStatus(id: string, status: 'deprecated' | 'sunset'): Promise<void> {
    try {
      await this.model.update(id, { status });
      logger.info({ id, status }, 'Updated deprecation status');
    } catch (error) {
      logger.error({ error, id, status }, 'Failed to update deprecation status');
      throw new Error(`Failed to update deprecation status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getMigrationReport(endpoint: string, method: string): Promise<{
    endpoint: string;
    method: string;
    status: string;
    replacement?: string;
    migration_guide?: string;
    active_clients: number;
    last_used?: Date;
  } | null> {
    try {
      const record = await this.model.getByEndpoint(endpoint, method);
      if (!record) return null;

      return {
        endpoint: record.endpoint,
        method: record.method,
        status: record.status,
        replacement: record.replacement_endpoint,
        migration_guide: record.migration_guide,
        active_clients: record.active_client_count,
        last_used: record.last_used_at,
      };
    } catch (error) {
      logger.error({ error, endpoint, method }, 'Failed to get migration report');
      throw new Error(`Failed to get migration report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
