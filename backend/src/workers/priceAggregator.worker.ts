import { Worker, Queue } from "bullmq";
import { config } from "../config/index.js";
import { PriceService, type AggregatedPrice } from "../services/price.service.js";
import { logger } from "../utils/logger.js";
import { alertRoutingService, type RouteableAlert } from "../services/alertRouting.service.js";
import { duplicateAlertCheckService } from "../services/duplicateAlertCheck.service.js";
import type { AlertEvent } from "../services/alert.service.js";
import { PriceModel } from "../database/models/price.model.js";

const QUEUE_NAME = "price-aggregator";

// =============================================================================
// EXTERNAL PRICE FEED HEALTH / CIRCUIT BREAKER
// =============================================================================

/** Price feed health status exposed to downstream consumers. */
export type PriceFeedStatus = "HEALTHY" | "DEGRADED";

/**
 * If every external price source (Stellar DEX, AMM pools, Circle, and any
 * upstream APIs such as CoinGecko/Binance) fails continuously for longer than
 * this window, the feed is marked DEGRADED and the asset-pricing circuit
 * breaker is tripped so automated liquidation/rebalancing triggers pause
 * instead of evaluating health scores on stale data.
 */
export const PRICE_FEED_OUTAGE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

let consecutiveExternalFailures = 0;
let firstConsecutiveFailureAt: number | null = null;
let priceFeedStatus: PriceFeedStatus = "HEALTHY";
let priceFeedBreakerTripped = false;

/** Current external price feed status for downstream health-score consumers. */
export function getPriceFeedStatus(): PriceFeedStatus {
  return priceFeedStatus;
}

export function getPriceFeedFailureState(): {
  status: PriceFeedStatus;
  consecutiveFailures: number;
  outageMs: number;
  breakerTripped: boolean;
} {
  return {
    status: priceFeedStatus,
    consecutiveFailures: consecutiveExternalFailures,
    outageMs: firstConsecutiveFailureAt ? Date.now() - firstConsecutiveFailureAt : 0,
    breakerTripped: priceFeedBreakerTripped,
  };
}

/** Reset tracker state (used by tests and on successful fetch). */
export function resetPriceFeedTracker(): void {
  consecutiveExternalFailures = 0;
  firstConsecutiveFailureAt = null;
  priceFeedStatus = "HEALTHY";
  priceFeedBreakerTripped = false;
}

function recordExternalFetchSuccess(): void {
  if (consecutiveExternalFailures > 0 || priceFeedStatus !== "HEALTHY") {
    logger.info(
      { consecutiveFailures: consecutiveExternalFailures },
      "External price feed recovered — resetting failure tracker",
    );
  }
  consecutiveExternalFailures = 0;
  firstConsecutiveFailureAt = null;
  priceFeedStatus = "HEALTHY";
  priceFeedBreakerTripped = false;
}

/**
 * Trip the asset-pricing circuit breaker to pause automated liquidation and
 * rebalancing triggers while the price feed is degraded. Failures to enqueue
 * are logged but never break the worker path.
 */
async function tripAssetPricingCircuitBreaker(symbol: string, outageMs: number): Promise<void> {
  try {
    const { circuitBreakerQueue } = await import("./circuitBreaker.worker.js");
    await circuitBreakerQueue.add("circuit-breaker-trigger", {
      alertId: `price-feed-outage-${symbol}-${Date.now()}`,
      alertType: "price_deviation",
      assetCode: symbol,
      severity: "high",
      value: outageMs,
      threshold: PRICE_FEED_OUTAGE_THRESHOLD_MS,
    });
    logger.warn(
      { symbol, outageMs },
      "Asset pricing circuit breaker tripped — pausing automated liquidation/rebalancing triggers",
    );
  } catch (err) {
    logger.error(
      { err, symbol },
      "Failed to trip asset pricing circuit breaker after price feed outage",
    );
  }
}

async function recordExternalFetchFailure(symbol: string, error: unknown): Promise<void> {
  consecutiveExternalFailures += 1;
  if (firstConsecutiveFailureAt === null) {
    firstConsecutiveFailureAt = Date.now();
  }
  const outageMs = Date.now() - firstConsecutiveFailureAt;
  logger.error(
    {
      symbol,
      consecutiveFailures: consecutiveExternalFailures,
      outageMs,
      error: error instanceof Error ? error.message : String(error),
    },
    "External price fetch failed (all sources unreachable)",
  );

  if (outageMs >= PRICE_FEED_OUTAGE_THRESHOLD_MS && priceFeedStatus !== "DEGRADED") {
    priceFeedStatus = "DEGRADED";
    logger.warn(
      { symbol, consecutiveFailures: consecutiveExternalFailures, outageMs },
      "External price feed unreachable for > 15 minutes — transitioning price feed status to DEGRADED",
    );
  }

  if (priceFeedStatus === "DEGRADED" && !priceFeedBreakerTripped) {
    priceFeedBreakerTripped = true;
    await tripAssetPricingCircuitBreaker(symbol, outageMs);
  }
}

const priceModel = new PriceModel();

const connection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD || undefined,
};

export const priceAggregatorQueue = new Queue(QUEUE_NAME, { connection });

function buildDeviationAlert(symbol: string, deviation: { deviated: boolean; percentage: number }): RouteableAlert {
  return {
    eventTime: new Date(),
    alertRuleId: `price-aggregator-${symbol}`,
    ownerAddress: "system",
    ruleName: "Price Deviation",
    assetCode: symbol,
    sourceType: "price_deviation",
    severity: deviation.percentage > (config.PRICE_DEVIATION_THRESHOLD ?? 0.02) * 2 ? "critical" : "high",
    triggeredValue: deviation.percentage,
    threshold: config.PRICE_DEVIATION_THRESHOLD ?? 0.02,
    metric: "price_deviation_pct",
  };
}

async function routeDeviationAlert(symbol: string, deviation: { deviated: boolean; percentage: number }): Promise<void> {
  const now = new Date();
  const dedupEvent: Omit<AlertEvent, "eventId"> = {
    ruleId: `price-aggregator-${symbol}`,
    assetCode: symbol,
    alertType: "price_deviation",
    priority: deviation.percentage > (config.PRICE_DEVIATION_THRESHOLD ?? 0.02) * 2 ? "critical" : "high",
    triggeredValue: deviation.percentage,
    threshold: config.PRICE_DEVIATION_THRESHOLD ?? 0.02,
    metric: "price_deviation_pct",
    webhookDelivered: false,
    onChainEventId: null,
    lifecycleState: "open",
    acknowledgedAt: null,
    acknowledgedBy: null,
    assignedAt: null,
    assignedTo: null,
    closedAt: null,
    closedBy: null,
    closureNote: null,
    updatedAt: now,
    time: now,
  };

  const dedupResult = duplicateAlertCheckService.check(dedupEvent);

  if (!dedupResult.isDuplicate || dedupResult.action !== "block") {
    const alert = buildDeviationAlert(symbol, deviation);
    await alertRoutingService.routeAlert(alert);
    logger.info({ symbol, percentage: deviation.percentage }, "Price deviation alert routed");
  } else {
    logger.debug({ symbol, reason: dedupResult.reason }, "Price deviation alert suppressed by deduplication");
  }
}

/**
 * Batch-inserts one row per price source into the prices TimescaleDB hypertable.
 * Columns: time (now), symbol, source, price, volume_24h (null — not returned by aggregation).
 * Errors are swallowed so a DB outage never prevents the alert routing path from running.
 */
async function persistAggregatedPrice(aggregated: AggregatedPrice): Promise<void> {
  try {
    const now = new Date();
    const records = aggregated.sources.map((src) => ({
      time: now,
      symbol: aggregated.symbol,
      source: src.source,
      price: src.price,
      volume_24h: null as number | null,
    }));
    await priceModel.insertBatch(records);
  } catch (err) {
    logger.error({ err, symbol: aggregated.symbol }, "Failed to persist aggregated price");
  }
}

export async function processPriceAggregatorJob(job: { id?: string; data: { symbol: string } }) {
  const priceService = new PriceService();
  logger.info({ jobId: job.id, data: job.data }, "Processing price aggregation job");

  const { symbol } = job.data;

  let aggregatedPrice: AggregatedPrice | null = null;
  try {
    aggregatedPrice = await priceService.getAggregatedPrice(symbol);
  } catch (error) {
    // All upstream sources (Stellar DEX, AMM, Circle / CoinGecko / Binance)
    // unreachable — track the outage instead of silently serving stale data.
    await recordExternalFetchFailure(symbol, error);
    throw error;
  }

  if (!aggregatedPrice) {
    await recordExternalFetchFailure(symbol, new Error("All external price sources failed"));
    throw new Error(`All external price sources failed for ${symbol}`);
  }

  // At least one external source succeeded — feed is healthy.
  recordExternalFetchSuccess();

  const deviation = await priceService.checkDeviation(symbol);

  if (deviation.deviated) {
    logger.warn({ symbol, deviation: deviation.percentage }, "Price deviation detected");
    await routeDeviationAlert(symbol, deviation);
  }

  if (aggregatedPrice) {
    await persistAggregatedPrice(aggregatedPrice);
  }

  return { success: true, symbol, price: aggregatedPrice };
}

/**
 * Worker that periodically aggregates prices from multiple sources:
 * - Stellar DEX (SDEX + AMM pools)
 * - Circle API
 * - Coinbase API
 *
 * Computes VWAP, persists source prices to TimescaleDB, and triggers alerts
 * when cross-source deviation exceeds the configured threshold.
 */
export const priceAggregatorWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    try {
      return await processPriceAggregatorJob(job);
    } catch (error) {
      logger.error({ error, symbol: job.data?.symbol }, "Price aggregation job failed");
      throw error;
    }
  },
  { connection, concurrency: 5 }
);

priceAggregatorWorker.on("completed", (job) => {
  logger.debug({ jobId: job?.id }, "Price aggregation job completed");
});

priceAggregatorWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error: error.message }, "Price aggregation job failed");
});
