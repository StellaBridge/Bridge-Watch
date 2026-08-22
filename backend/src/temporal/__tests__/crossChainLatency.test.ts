/**
 * Tests for Cross-Chain Latency Analyzer
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  CrossChainLatencyAnalyzer,
  crossChainLatencyAnalyzer,
} from "../crossChainLatency.js";
import { createTemporalPoint } from "../temporalUtils.js";
import type { CrossChainOperation } from "../crossChainLatency.js";

describe("CrossChainLatencyAnalyzer", () => {
  let analyzer: CrossChainLatencyAnalyzer;

  beforeEach(() => {
    analyzer = new CrossChainLatencyAnalyzer();
  });

  describe("analyzeOperation", () => {
    it("should analyze a single cross-chain operation", () => {
      const operation: CrossChainOperation = {
        id: "test-op-1",
        sourceChain: "stellar",
        destinationChain: "ethereum",
        sourceTimestamp: createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" }),
        destinationTimestamp: createTemporalPoint(35000, "evm_block", { chain: "ethereum" }),
        operationType: "transfer",
      };

      const result = analyzer.analyzeOperation(operation);

      expect(result.operationId).toBe("test-op-1");
      expect(result.sourceChain).toBe("stellar");
      expect(result.destinationChain).toBe("ethereum");
      expect(result.latencyBreakdown.totalLatencyMs).toBe(34000);
      expect(result.comparisonResult.success).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("should detect significant clock skew", () => {
      const operation: CrossChainOperation = {
        id: "test-op-2",
        sourceChain: "stellar",
        destinationChain: "ethereum",
        sourceTimestamp: createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" }),
        destinationTimestamp: createTemporalPoint(5000, "evm_block", { chain: "ethereum" }),
        operationType: "transfer",
      };

      const result = analyzer.analyzeOperation(operation);

      // With high clock skew relative to network delay
      expect(result.isClockSkewSignificant).toBe(true);
      expect(result.recommendations).toContainEqual(
        expect.stringContaining("clock skew")
      );
    });

    it("should use custom comparison mode", () => {
      const operation: CrossChainOperation = {
        id: "test-op-3",
        sourceChain: "stellar",
        destinationChain: "ethereum",
        sourceTimestamp: createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" }),
        destinationTimestamp: createTemporalPoint(35000, "evm_block", { chain: "ethereum" }),
        operationType: "transfer",
      };

      const result = analyzer.analyzeOperation(operation, { mode: "optimistic" });

      expect(result.comparisonResult.success).toBe(true);
    });
  });

  describe("analyzeBatch", () => {
    it("should analyze multiple operations", () => {
      const operations: CrossChainOperation[] = [
        {
          id: "op-1",
          sourceChain: "stellar",
          destinationChain: "ethereum",
          sourceTimestamp: createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" }),
          destinationTimestamp: createTemporalPoint(35000, "evm_block", { chain: "ethereum" }),
          operationType: "transfer",
        },
        {
          id: "op-2",
          sourceChain: "ethereum",
          destinationChain: "stellar",
          sourceTimestamp: createTemporalPoint(40000, "evm_block", { chain: "ethereum" }),
          destinationTimestamp: createTemporalPoint(70000, "stellar_ledger", { chain: "stellar" }),
          operationType: "transfer",
        },
      ];

      const { results, aggregate } = analyzer.analyzeBatch(operations);

      expect(results).toHaveLength(2);
      expect(aggregate.totalOperations).toBe(2);
      expect(aggregate.averageTotalLatencyMs).toBeGreaterThan(0);
      expect(aggregate.averageNetworkDelayMs).toBeGreaterThan(0);
      expect(aggregate.averageClockSkewMs).toBeGreaterThanOrEqual(0);
      expect(aggregate.confidenceScore).toBeGreaterThan(0);
    });

    it("should handle empty batch", () => {
      const { results, aggregate } = analyzer.analyzeBatch([]);

      expect(results).toHaveLength(0);
      expect(aggregate.totalOperations).toBe(0);
      expect(aggregate.averageTotalLatencyMs).toBe(0);
    });
  });

  describe("detectClockSyncIssues", () => {
    it("should detect no clock sync issues for normal operations", () => {
      const operations: CrossChainOperation[] = [
        {
          id: "op-1",
          sourceChain: "stellar",
          destinationChain: "ethereum",
          sourceTimestamp: createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" }),
          destinationTimestamp: createTemporalPoint(35000, "evm_block", { chain: "ethereum" }),
          operationType: "transfer",
        },
      ];

      const result = analyzer.detectClockSyncIssues(operations);

      expect(result.hasIssues).toBe(false);
      expect(result.affectedChains).toEqual([]);
      expect(result.severity).toBe("low");
      expect(result.details).toEqual([]);
    });

    it("should detect clock sync issues with significant skew", () => {
      const operations: CrossChainOperation[] = [
        {
          id: "op-1",
          sourceChain: "stellar",
          destinationChain: "ethereum",
          sourceTimestamp: createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" }),
          destinationTimestamp: createTemporalPoint(2000, "evm_block", { chain: "ethereum" }),
          operationType: "transfer",
        },
        {
          id: "op-2",
          sourceChain: "ethereum",
          destinationChain: "stellar",
          sourceTimestamp: createTemporalPoint(3000, "evm_block", { chain: "ethereum" }),
          destinationTimestamp: createTemporalPoint(4000, "stellar_ledger", { chain: "stellar" }),
          operationType: "transfer",
        },
      ];

      const result = analyzer.detectClockSyncIssues(operations);

      expect(result.hasIssues).toBe(true);
      expect(result.affectedChains).toContain("stellar");
      expect(result.affectedChains).toContain("ethereum");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should calculate severity based on skew ratio", () => {
      // Create many operations with significant skew for high severity
      const operations: CrossChainOperation[] = Array.from({ length: 10 }, (_, i) => ({
        id: `op-${i}`,
        sourceChain: "stellar",
        destinationChain: "ethereum",
        sourceTimestamp: createTemporalPoint(i * 1000, "stellar_ledger", { chain: "stellar" }),
        destinationTimestamp: createTemporalPoint(i * 1000 + 500, "evm_block", { chain: "ethereum" }),
        operationType: "transfer",
      }));

      const result = analyzer.detectClockSyncIssues(operations);

      expect(result.hasIssues).toBe(true);
      expect(["low", "medium", "high"]).toContain(result.severity);
    });
  });

  describe("registerExpectedDelay", () => {
    it("should register custom expected delay for chain pair", () => {
      analyzer.registerExpectedDelay("custom-chain-a", "custom-chain-b", 60000);

      const operation: CrossChainOperation = {
        id: "test-op",
        sourceChain: "custom-chain-a",
        destinationChain: "custom-chain-b",
        sourceTimestamp: createTemporalPoint(1000, "system_clock"),
        destinationTimestamp: createTemporalPoint(65000, "system_clock"),
        operationType: "transfer",
      };

      const result = analyzer.analyzeOperation(operation);

      expect(result.latencyBreakdown.totalLatencyMs).toBe(64000);
    });
  });
});

describe("Singleton Instance", () => {
  it("should export a singleton instance", () => {
    expect(crossChainLatencyAnalyzer).toBeInstanceOf(CrossChainLatencyAnalyzer);
  });

  it("should have predefined expected delays", () => {
    const operation: CrossChainOperation = {
      id: "test-op",
      sourceChain: "stellar",
      destinationChain: "ethereum",
      sourceTimestamp: createTemporalPoint(1000, "stellar_ledger", { chain: "stellar" }),
      destinationTimestamp: createTemporalPoint(35000, "evm_block", { chain: "ethereum" }),
      operationType: "transfer",
    };

    const result = crossChainLatencyAnalyzer.analyzeOperation(operation);

    expect(result).toBeDefined();
    expect(result.latencyBreakdown).toBeDefined();
  });
});
