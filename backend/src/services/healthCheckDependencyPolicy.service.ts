import { logger } from '../utils/logger.js';
import { HealthCheckDependencyModel } from '../database/models/healthCheckDependency.model.js';
import type { HealthCheckDependencyRecord } from '../database/models/healthCheckDependency.model.js';

export interface DependencyPolicy {
  health_check_id: string;
  dependent_check_id: string;
  dependency_type: 'blocking' | 'informational';
  failure_impact: string;
}

export class HealthCheckDependencyPolicyService {
  private model: HealthCheckDependencyModel;

  constructor() {
    this.model = new HealthCheckDependencyModel();
  }

  async createDependency(policy: DependencyPolicy): Promise<HealthCheckDependencyRecord> {
    try {
      logger.info({ policy }, 'Creating health check dependency policy');
      const record = await this.model.insert(policy);
      return record;
    } catch (error) {
      logger.error({ error, policy }, 'Failed to create dependency policy');
      throw new Error(`Failed to create dependency policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDependencies(health_check_id: string): Promise<HealthCheckDependencyRecord[]> {
    try {
      return await this.model.getByHealthCheckId(health_check_id);
    } catch (error) {
      logger.error({ error, health_check_id }, 'Failed to get dependencies');
      throw new Error(`Failed to get dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDependents(health_check_id: string): Promise<HealthCheckDependencyRecord[]> {
    try {
      return await this.model.getDependents(health_check_id);
    } catch (error) {
      logger.error({ error, health_check_id }, 'Failed to get dependents');
      throw new Error(`Failed to get dependents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateDependencyChain(health_check_id: string): Promise<{
    valid: boolean;
    hasCycles: boolean;
    chainDepth: number;
  }> {
    try {
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      const hasCycle = async (id: string): Promise<boolean> => {
        visited.add(id);
        recursionStack.add(id);

        const deps = await this.model.getByHealthCheckId(id);
        for (const dep of deps) {
          if (!visited.has(dep.dependent_check_id)) {
            if (await hasCycle(dep.dependent_check_id)) {
              return true;
            }
          } else if (recursionStack.has(dep.dependent_check_id)) {
            return true;
          }
        }

        recursionStack.delete(id);
        return false;
      };

      const cycleExists = await hasCycle(health_check_id);
      const chainDepth = await this.calculateChainDepth(health_check_id);

      return {
        valid: !cycleExists && chainDepth <= 10,
        hasCycles: cycleExists,
        chainDepth,
      };
    } catch (error) {
      logger.error({ error, health_check_id }, 'Failed to validate dependency chain');
      throw new Error(`Failed to validate dependency chain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async calculateChainDepth(health_check_id: string, depth = 0, visited = new Set<string>()): Promise<number> {
    if (visited.has(health_check_id)) return depth;
    visited.add(health_check_id);

    const deps = await this.model.getByHealthCheckId(health_check_id);
    if (deps.length === 0) return depth;

    const depths = await Promise.all(
      deps.map(dep => this.calculateChainDepth(dep.dependent_check_id, depth + 1, visited))
    );

    return Math.max(...depths);
  }

  async updateDependency(id: string, policy: Partial<DependencyPolicy>): Promise<void> {
    try {
      await this.model.update(id, policy);
      logger.info({ id, policy }, 'Updated health check dependency policy');
    } catch (error) {
      logger.error({ error, id, policy }, 'Failed to update dependency policy');
      throw new Error(`Failed to update dependency policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteDependency(id: string): Promise<void> {
    try {
      await this.model.delete(id);
      logger.info({ id }, 'Deleted health check dependency policy');
    } catch (error) {
      logger.error({ error, id }, 'Failed to delete dependency policy');
      throw new Error(`Failed to delete dependency policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getFullGraph(): Promise<Map<string, string[]>> {
    try {
      const deps = await this.model.getGraph();
      const graph = new Map<string, string[]>();

      for (const dep of deps) {
        if (!graph.has(dep.health_check_id)) {
          graph.set(dep.health_check_id, []);
        }
        graph.get(dep.health_check_id)!.push(dep.dependent_check_id);
      }

      return graph;
    } catch (error) {
      logger.error({ error }, 'Failed to get dependency graph');
      throw new Error(`Failed to get dependency graph: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getImpactAnalysis(health_check_id: string): Promise<{
    directDependents: string[];
    indirectDependents: string[];
    totalAffected: number;
  }> {
    try {
      const directDependents = (await this.model.getDependents(health_check_id)).map(d => d.health_check_id);
      const indirectDependents = new Set<string>();

      for (const dependent of directDependents) {
        const indirect = await this.model.getDependents(dependent);
        indirect.forEach(dep => indirectDependents.add(dep.health_check_id));
      }

      return {
        directDependents,
        indirectDependents: Array.from(indirectDependents),
        totalAffected: directDependents.length + indirectDependents.size,
      };
    } catch (error) {
      logger.error({ error, health_check_id }, 'Failed to get impact analysis');
      throw new Error(`Failed to get impact analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
