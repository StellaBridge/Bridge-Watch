/**
 * Clock Registry
 * 
 * Manages clock source configurations and provides uncertainty estimates
 * for different clock sources and chains.
 */

import type { ClockSource, ClockPrecision, TemporalInterval } from "./types.js";

export interface ClockConfig {
  source: ClockSource;
  precision: ClockPrecision;
  chain?: string;
  provider?: string;
  /** Base uncertainty in milliseconds */
  baseUncertaintyMs: number;
  /** Expected block/ledger time in milliseconds */
  expectedBlockTimeMs?: number;
  /** Known clock offset (ms) relative to reference clock */
  knownOffsetMs?: number;
  /** Clock drift rate (ms/second) */
  driftRateMsPerSec?: number;
}

/**
 * Registry of known clock configurations with their uncertainty characteristics.
 */
const CLOCK_CONFIGS: Record<string, ClockConfig> = {
  // Stellar ledger close times - consensus-based, high precision
  stellar_ledger: {
    source: "stellar_ledger",
    precision: "block",
    chain: "stellar",
    baseUncertaintyMs: 100, // ~100ms uncertainty due to consensus finality
    expectedBlockTimeMs: 5000, // ~5 second ledger close time
  },
  
  // Ethereum block timestamps - miner-provided, lower precision
  evm_block_ethereum: {
    source: "evm_block",
    precision: "block",
    chain: "ethereum",
    baseUncertaintyMs: 1000, // ~1 second uncertainty (miner discretion)
    expectedBlockTimeMs: 12000, // ~12 second block time
  },
  
  evm_block_polygon: {
    source: "evm_block",
    precision: "block",
    chain: "polygon",
    baseUncertaintyMs: 2000, // ~2 second uncertainty
    expectedBlockTimeMs: 2000, // ~2 second block time
  },
  
  evm_block_base: {
    source: "evm_block",
    precision: "block",
    chain: "base",
    baseUncertaintyMs: 1000,
    expectedBlockTimeMs: 2000, // ~2 second block time
  },
  
  // System clock - NTP-synced, high precision but potential drift
  system_clock: {
    source: "system_clock",
    precision: "second",
    baseUncertaintyMs: 50, // ~50ms NTP uncertainty
    driftRateMsPerSec: 0.001, // ~1ms drift per second
  },
  
  // External APIs - variable precision depending on provider
  external_api_coinbase: {
    source: "external_api",
    precision: "second",
    provider: "coinbase",
    baseUncertaintyMs: 1000, // ~1 second uncertainty
  },
  
  external_api_coingecko: {
    source: "external_api",
    precision: "second",
    provider: "coingecko",
    baseUncertaintyMs: 5000, // ~5 second uncertainty (caching)
  },
  
  // Oracle timestamps - depend on oracle design
  oracle_chainlink: {
    source: "oracle",
    precision: "block",
    provider: "chainlink",
    baseUncertaintyMs: 3000, // ~3 second uncertainty
  },
};

export class ClockRegistry {
  /**
   * Get clock configuration for a source.
   */
  getConfig(key: string): ClockConfig | undefined {
    return CLOCK_CONFIGS[key];
  }
  
  /**
   * Register or update a clock configuration.
   */
  registerConfig(key: string, config: ClockConfig): void {
    CLOCK_CONFIGS[key] = config;
  }
  
  /**
   * Generate a configuration key from source, chain, and provider.
   */
  makeKey(source: ClockSource, chain?: string, provider?: string): string {
    const parts = [source];
    if (chain) parts.push(chain);
    if (provider) parts.push(provider);
    return parts.join("_");
  }
  
  /**
   * Calculate uncertainty interval for a timestamp given clock configuration.
   */
  calculateUncertainty(
    timestampMs: number,
    config: ClockConfig,
    observedAt?: number
  ): TemporalInterval {
    const { baseUncertaintyMs, expectedBlockTimeMs, driftRateMsPerSec } = config;
    
    let uncertainty = baseUncertaintyMs;
    
    // Add block-level uncertainty for block-based clocks
    if (config.precision === "block" && expectedBlockTimeMs) {
      uncertainty += expectedBlockTimeMs / 2;
    }
    
    // Add drift-based uncertainty if we have observation time
    if (driftRateMsPerSec && observedAt) {
      const ageSeconds = (observedAt - timestampMs) / 1000;
      uncertainty += Math.abs(driftRateMsPerSec * ageSeconds);
    }
    
    return {
      earliestMs: timestampMs - uncertainty,
      latestMs: timestampMs + uncertainty,
    };
  }
  
  /**
   * Get all registered clock configurations.
   */
  getAllConfigs(): Record<string, ClockConfig> {
    return { ...CLOCK_CONFIGS };
  }
}

// Singleton instance
export const clockRegistry = new ClockRegistry();
