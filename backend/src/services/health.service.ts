import { logger } from "../utils/logger.js";
import { PriceService } from "./price.service.js";
import { BridgeService } from "./bridge.service.js";
import { LiquidityService } from "./liquidity.service.js";
import { AlertService } from "./alert.service.js";
import { HealthScoreModel, HealthScoreRecord } from "../database/models/healthScore.model.js";
import { ScoreCalculator, ScoreComponents } from "../utils/scoreCalculator.js";
import { SUPPORTED_ASSETS } from "../config/index.js";

export interface HealthScore {
  symbol: string;
  overallScore: number;
  factors: {
    liquidityDepth: number;
    priceStability: number;
    bridgeUptime: number;
    reserveBacking: number;
    volumeTrend: number;
  };
  trend: "improving" | "stable" | "deteriorating";
  lastUpdated: string;
}

export class HealthService {
  private priceService = new PriceService();
  private bridgeService = new BridgeService();
  private liquidityService = new LiquidityService();
  private alertService = new AlertService();
  private model = new HealthScoreModel();

  /**
   * Compute composite health score (0-100) for an asset.
   */
  async getHealthScore(symbol: string): Promise<HealthScore | null> {
    logger.info({ symbol }, "Computing health score");

    try {
      const liquidity = await this.liquidityService.getAggregatedLiquidity(symbol);
      const price = await this.priceService.getAggregatedPrice(symbol);
      
      let bridgeStatus: "healthy" | "degraded" | "down" | "unknown" = "healthy";
      let mismatchPercentage = 0;

      // Only USDC and EURC have bridge status and reserve verification
      if (["USDC", "EURC"].includes(symbol)) {
        const bridgeStatuses = await this.bridgeService.getAllBridgeStatuses();
        const bridge = bridgeStatuses.bridges.find(b => b.name.includes(symbol));
        if (bridge) {
          bridgeStatus = bridge.status;
        }

        const verification = await this.bridgeService.verifySupply(symbol);
        mismatchPercentage = verification.mismatchPercentage;
      }

      // Component Scores
      const components: ScoreComponents = {
        liquidityDepth: ScoreCalculator.calculateLiquidityScore(
          liquidity?.totalLiquidity || 0,
          liquidity?.sources[0]?.bidDepth || 0,
          liquidity?.sources[0]?.askDepth || 0
        ),
        priceStability: ScoreCalculator.calculatePriceStabilityScore(price?.deviation || 0),
        bridgeUptime: ScoreCalculator.calculateBridgeUptimeScore(bridgeStatus),
        reserveBacking: ScoreCalculator.calculateReserveBackingScore(mismatchPercentage),
        volumeTrend: ScoreCalculator.calculateVolumeTrendScore(0, 0), // Default volume trend for now
      };

      const overall = ScoreCalculator.calculateCompositeScore(components);

      // Save to database
      const record: HealthScoreRecord = {
        time: new Date(),
        symbol,
        overall_score: overall,
        liquidity_depth_score: components.liquidityDepth,
        price_stability_score: components.priceStability,
        bridge_uptime_score: components.bridgeUptime,
        reserve_backing_score: components.reserveBacking,
        volume_trend_score: components.volumeTrend,
      };

      await this.model.insert(record);

      // Trending & Alerting
      const previous = await this.model.getLatest(symbol);
      if (previous && (previous.overall_score - overall) > 10) {
        logger.warn(
          { symbol, previous: previous.overall_score, current: overall },
          "Significant health score drop detected"
        );
        
        await this.alertService.evaluateAsset({
          assetCode: symbol,
          metrics: {
            health_score: overall,
            health_score_drop: previous.overall_score - overall,
            liquidity_score: components.liquidityDepth,
            price_stability_score: components.priceStability,
          }
        });
      }

      return {
        symbol,
        overallScore: overall,
        factors: {
          liquidityDepth: components.liquidityDepth,
          priceStability: components.priceStability,
          bridgeUptime: components.bridgeUptime,
          reserveBacking: components.reserveBacking,
          volumeTrend: components.volumeTrend,
        },
        trend: previous ? (overall > previous.overall_score ? "improving" : (overall === previous.overall_score ? "stable" : "deteriorating")) : "stable",
        lastUpdated: record.time.toISOString(),
      };
    } catch (error) {
      logger.error({ symbol, error }, "Failed to compute health score");
      return null;
    }
  }

  /**
   * Get historical health scores for trending analysis
   */
  async getHealthHistory(
    symbol: string,
    days: number
  ): Promise<{ timestamp: string; score: number }[]> {
    logger.info({ symbol, days }, "Fetching health history");
    
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - days);

    const scores = await this.model.getTimeBucketed(symbol, "1 hour", startTime);
    return scores.map(s => ({
      timestamp: s.bucket.toISOString(),
      score: s.avg_score
    }));
  }

  /**
   * Compute health scores for all monitored assets
   */
  async computeAllHealthScores(): Promise<HealthScore[]> {
    logger.info("Computing health scores for all monitored assets");
    const results: HealthScore[] = [];

    for (const asset of SUPPORTED_ASSETS) {
      const score = await this.getHealthScore(asset.code);
      if (score) results.push(score);
    }

    return results;
  }
}
