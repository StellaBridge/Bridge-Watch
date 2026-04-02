import { config } from "../config/index.js";

export interface ScoreComponents {
  liquidityDepth: number;
  priceStability: number;
  bridgeUptime: number;
  reserveBacking: number;
  volumeTrend: number;
}

/**
 * Calculate component scores and composite health score (0-100).
 */
export class ScoreCalculator {
  /**
   * Calculate Liquidity Score based on total liquidity and bid/ask balance.
   * Target liquidity for a perfect score is $1,000,000.
   */
  static calculateLiquidityScore(totalLiquidity: number, bidDepth: number, askDepth: number): number {
    if (totalLiquidity <= 0) return 0;

    // Logarithmic scale: $1k = 25, $10k = 50, $100k = 75, $1M = 100
    const _logBase = 10;
    const baseScore = Math.min(100, (Math.log10(Math.max(1, totalLiquidity)) / 6) * 100);

    // Balance penalty: penalize if one side is significantly thinner than the other
    const totalDepth = bidDepth + askDepth;
    const balanceRatio = totalDepth > 0 ? Math.min(bidDepth, askDepth) / (totalDepth / 2) : 0;
    
    // Impact of balance: 20% weight on balance
    return Math.round(baseScore * (0.8 + 0.2 * balanceRatio));
  }

  /**
   * Calculate Price Stability Score based on deviation from aggregate.
   * Deviation of 0% = 100, 2% (threshold) = 80, 10% = 0.
   */
  static calculatePriceStabilityScore(deviation: number): number {
    // deviation is already a percentage (e.g. 0.02 for 2%)
    const score = 100 - (deviation * 1000);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate Bridge Uptime Score based on current status.
   */
  static calculateBridgeUptimeScore(status: "healthy" | "degraded" | "down" | "unknown"): number {
    switch (status) {
      case "healthy": return 100;
      case "degraded": return 50;
      case "down": return 0;
      default: return 0;
    }
  }

  /**
   * Calculate Reserve Backing Score based on mismatch percentage.
   * Mismatch of 0% = 100, 0.1% (threshold) = 90, 1% = 0.
   */
  static calculateReserveBackingScore(mismatchPercentage: number): number {
    // mismatchPercentage is e.g. 0.1 for 0.1%
    const score = 100 - (mismatchPercentage * 100);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate Volume Trend Score based on 24h vs 7d average.
   * Ratio of 1.0 (stable) = 70, 0.5 (dropping) = 35, 2.0 (surging) = 100.
   */
  static calculateVolumeTrendScore(volume24h: number, volume7d: number): number {
    if (volume7d <= 0) return volume24h > 0 ? 50 : 0;
    
    const dailyAvg = volume7d / 7;
    const ratio = volume24h / dailyAvg;
    
    const score = ratio * 70;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Combine components into a single composite score (0-100) using weights.
   */
  static calculateCompositeScore(components: ScoreComponents): number {
    const overall = 
      (components.liquidityDepth * config.HEALTH_WEIGHT_LIQUIDITY) +
      (components.priceStability * config.HEALTH_WEIGHT_PRICE) +
      (components.bridgeUptime * config.HEALTH_WEIGHT_BRIDGE) +
      (components.reserveBacking * config.HEALTH_WEIGHT_RESERVES) +
      (components.volumeTrend * config.HEALTH_WEIGHT_VOLUME);

    return Math.max(0, Math.min(100, Math.round(overall)));
  }

  /**
   * Generate a brief explanation of the score components.
   */
  static generateExplanation(components: ScoreComponents, overall: number): string {
    const reasons: string[] = [];
    if (components.liquidityDepth < 60) reasons.push("Low liquidity depth");
    if (components.priceStability < 80) reasons.push("High price deviation");
    if (components.bridgeUptime < 100) reasons.push("Bridge status issues");
    if (components.reserveBacking < 90) reasons.push("Reserve mismatch detected");
    
    if (reasons.length === 0) return "All metrics are within healthy ranges.";
    return `Concerns: ${reasons.join(", ")}. Overall score: ${overall}/100.`;
  }
}
