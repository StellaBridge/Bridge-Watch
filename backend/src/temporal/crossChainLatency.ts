/**
 * Cross-Chain Latency Analysis
 * 
 * Provides latency breakdown analysis for cross-chain operations,
 * distinguishing between network delay and clock skew using temporal semantics.
 */

import type { TemporalPoint, LatencyBreakdown, ComparisonOptions } from "./types.js";
import { analyzeLatency, compareTemporalPoints } from "./temporalUtils.js";

export interface CrossChainOperation {
  id: string;
  sourceChain: string;
  destinationChain: string;
  sourceTimestamp: TemporalPoint;
  destinationTimestamp: TemporalPoint;
  operationType: "transfer" | "swap" | "bridge_lock" | "bridge_release";
}

export interface LatencyAnalysisResult {
  operationId: string;
  sourceChain: string;
  destinationChain: string;
  operationType: string;
  latencyBreakdown: LatencyBreakdown;
  comparisonResult: ReturnType<typeof compareTemporalPoints>;
  isClockSkewSignificant: boolean;
  recommendations: string[];
}

export class CrossChainLatencyAnalyzer {
  private readonly expectedNetworkDelays: Record<string, number> = {
    "stellar-ethereum": 30000, // 30 seconds expected
    "ethereum-stellar": 30000,
    "stellar-polygon": 25000,
    "polygon-stellar": 25000,
    "ethereum-polygon": 10000, // EVM to EVM is faster
    "polygon-ethereum": 10000,
  };

  /**
   * Analyze latency for a single cross-chain operation.
   */
  analyzeOperation(
    operation: CrossChainOperation,
    options?: ComparisonOptions
  ): LatencyAnalysisResult {
    const chainKey = `${operation.sourceChain}-${operation.destinationChain}`;
    const expectedDelay = this.expectedNetworkDelays[chainKey] || 20000;

    const latencyBreakdown = analyzeLatency(
      operation.sourceTimestamp,
      operation.destinationTimestamp,
      expectedDelay
    );

    const comparisonResult = compareTemporalPoints(
      operation.sourceTimestamp,
      operation.destinationTimestamp,
      options || { mode: "approximate" }
    );

    const isClockSkewSignificant = 
      latencyBreakdown.clockSkewMs > latencyBreakdown.networkDelayMs * 0.5;

    const recommendations = this.generateRecommendations(
      latencyBreakdown,
      isClockSkewSignificant,
      expectedDelay
    );

    return {
      operationId: operation.id,
      sourceChain: operation.sourceChain,
      destinationChain: operation.destinationChain,
      operationType: operation.operationType,
      latencyBreakdown,
      comparisonResult,
      isClockSkewSignificant,
      recommendations,
    };
  }

  /**
   * Analyze multiple operations and return aggregate statistics.
   */
  analyzeBatch(operations: CrossChainOperation[]): {
    results: LatencyAnalysisResult[];
    aggregate: {
      totalOperations: number;
      averageTotalLatencyMs: number;
      averageNetworkDelayMs: number;
      averageClockSkewMs: number;
      significantClockSkewCount: number;
      confidenceScore: number;
    };
  } {
    const results = operations.map(op => this.analyzeOperation(op));

    const validResults = results.filter(r => r.latencyBreakdown.confidence > 0.5);
    
    const aggregate = {
      totalOperations: operations.length,
      averageTotalLatencyMs: this.average(validResults, r => r.latencyBreakdown.totalLatencyMs),
      averageNetworkDelayMs: this.average(validResults, r => r.latencyBreakdown.networkDelayMs),
      averageClockSkewMs: this.average(validResults, r => r.latencyBreakdown.clockSkewMs),
      significantClockSkewCount: results.filter(r => r.isClockSkewSignificant).length,
      confidenceScore: this.average(validResults, r => r.latencyBreakdown.confidence),
    };

    return { results, aggregate };
  }

  /**
   * Detect clock synchronization issues across chains.
   */
  detectClockSyncIssues(operations: CrossChainOperation[]): {
    hasIssues: boolean;
    affectedChains: string[];
    severity: "low" | "medium" | "high";
    details: string[];
  } {
    const results = operations.map(op => this.analyzeOperation(op));
    const significantSkewOps = results.filter(r => r.isClockSkewSignificant);

    if (significantSkewOps.length === 0) {
      return {
        hasIssues: false,
        affectedChains: [],
        severity: "low",
        details: [],
      };
    }

    const affectedChains = new Set<string>();
    significantSkewOps.forEach(op => {
      affectedChains.add(op.sourceChain);
      affectedChains.add(op.destinationChain);
    });

    const skewRatio = significantSkewOps.length / operations.length;
    let severity: "low" | "medium" | "high";
    if (skewRatio > 0.5) {
      severity = "high";
    } else if (skewRatio > 0.25) {
      severity = "medium";
    } else {
      severity = "low";
    }

    const details = [
      `${significantSkewOps.length} of ${operations.length} operations show significant clock skew`,
      `Average clock skew: ${this.average(significantSkewOps, r => r.latencyBreakdown.clockSkewMs).toFixed(0)}ms`,
      `Affected chains: ${Array.from(affectedChains).join(", ")}`,
    ];

    return {
      hasIssues: true,
      affectedChains: Array.from(affectedChains),
      severity,
      details,
    };
  }

  private generateRecommendations(
    breakdown: LatencyBreakdown,
    isClockSkewSignificant: boolean,
    expectedDelay: number
  ): string[] {
    const recommendations: string[] = [];

    if (isClockSkewSignificant) {
      recommendations.push(
        "Significant clock skew detected - verify NTP synchronization across chain nodes",
        "Consider using optimistic/pessimistic comparison modes for this chain pair"
      );
    }

    if (breakdown.networkDelayMs > expectedDelay * 2) {
      recommendations.push(
        "Network delay significantly exceeds expected - check for network congestion or routing issues"
      );
    }

    if (breakdown.confidence < 0.5) {
      recommendations.push(
        "Low confidence in latency breakdown - consider increasing observation frequency"
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("Latency within expected parameters");
    }

    return recommendations;
  }

  private average<T>(items: T[], selector: (item: T) => number): number {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, item) => acc + selector(item), 0);
    return sum / items.length;
  }

  /**
   * Register custom expected network delay for a chain pair.
   */
  registerExpectedDelay(sourceChain: string, destinationChain: string, delayMs: number): void {
    const key = `${sourceChain}-${destinationChain}`;
    this.expectedNetworkDelays[key] = delayMs;
  }
}

// Singleton instance
export const crossChainLatencyAnalyzer = new CrossChainLatencyAnalyzer();
