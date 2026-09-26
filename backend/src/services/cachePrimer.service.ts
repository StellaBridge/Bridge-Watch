import { AnalyticsService } from "./analytics.service.js";
import { PriceService } from "./price.service.js";
import { SUPPORTED_ASSETS } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { getMetricsService } from "./metrics.service.js";

export enum CachePriority {
  HIGH = "high",
  LOW = "low",
}

export interface PrimingTask {
  name: string;
  priority: CachePriority;
  execute: () => Promise<void>;
}

export class CachePrimerService {
  private analyticsService = new AnalyticsService();
  private priceService = new PriceService();
  private metricsService = getMetricsService();

  /**
   * Prime the cache with all high and low priority entries.
   */
  async prime(priorityFilter?: CachePriority): Promise<void> {
    const startTime = Date.now();
    logger.info({ priorityFilter }, "Starting cache priming job");

    const tasks: PrimingTask[] = [
      // HIGH PRIORITY: Protocol Stats
      {
        name: "protocol_stats",
        priority: CachePriority.HIGH,
        execute: async () => { await this.analyticsService.getProtocolStats(true); },
      },
      // HIGH PRIORITY: Bridge Comparisons
      {
        name: "bridge_comparisons",
        priority: CachePriority.HIGH,
        execute: async () => { await this.analyticsService.getBridgeComparisons(true); },
      },
      // HIGH PRIORITY: Top Assets by Health
      {
        name: "top_assets_health",
        priority: CachePriority.HIGH,
        execute: async () => { await this.analyticsService.getTopPerformers("assets", "health", 10, true); },
      },
      // HIGH PRIORITY: Prices for major assets
      {
        name: "major_prices",
        priority: CachePriority.HIGH,
        execute: async () => {
          const majorAssets = ["XLM", "USDC", "USDT", "BTC", "ETH"];
          await Promise.allSettled(
            majorAssets.map((symbol) => this.priceService.getAggregatedPrice(symbol, true))
          );
        },
      },
      // LOW PRIORITY: Remaining Asset Rankings
      {
        name: "asset_rankings",
        priority: CachePriority.LOW,
        execute: async () => { await this.analyticsService.getAssetRankings(true); },
      },
      // LOW PRIORITY: All other prices
      {
        name: "all_prices",
        priority: CachePriority.LOW,
        execute: async () => {
          const otherAssets = SUPPORTED_ASSETS.filter(
            (a) => !["XLM", "USDC", "USDT", "BTC", "ETH"].includes(a.code) && a.code !== "native"
          );
          for (const asset of otherAssets) {
            await this.priceService.getAggregatedPrice(asset.code, true).catch((err: unknown) => {
              const reason = err instanceof Error ? err.message : "unknown";
              logger.warn({ asset: asset.code, err }, "cache_prime_failure: price aggregation error for asset");
              this.metricsService.cachePrimingFailure.inc({ task_name: "all_prices", reason });
            });
          }
        },
      },
    ];

    const filteredTasks = priorityFilter 
      ? tasks.filter(t => t.priority === priorityFilter)
      : tasks;

    let successCount = 0;
    let failureCount = 0;

    for (const task of filteredTasks) {
      const taskStart = Date.now();
      try {
        this.metricsService.cachePrimingTotal.inc({ task_name: task.name });
        await task.execute();
        const duration = (Date.now() - taskStart) / 1000;
        this.metricsService.cachePrimingSuccess.inc({ task_name: task.name });
        this.metricsService.cachePrimingDuration.observe({ task_name: task.name }, duration);
        successCount++;
        logger.debug({ task: task.name, duration }, "Cache priming task completed");
      } catch (error) {
        failureCount++;
        const reason = error instanceof Error ? error.message : "unknown";
        this.metricsService.cachePrimingFailure.inc({ task_name: task.name, reason });
        logger.error({ task: task.name, error }, "Cache priming task failed");
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.info(
      { successCount, failureCount, totalDuration },
      "Cache priming job completed"
    );
  }
}

export const cachePrimerService = new CachePrimerService();
