/**
 * Tests for Clock Registry
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { ClockRegistry, clockRegistry } from "../clockRegistry.js";
import type { ClockConfig } from "../clockRegistry.js";

describe("ClockRegistry", () => {
  let registry: ClockRegistry;

  beforeEach(() => {
    registry = new ClockRegistry();
  });

  describe("getConfig", () => {
    it("should return existing clock configuration", () => {
      const config = registry.getConfig("stellar_ledger");
      
      expect(config).toBeDefined();
      expect(config?.source).toBe("stellar_ledger");
      expect(config?.chain).toBe("stellar");
      expect(config?.precision).toBe("block");
    });

    it("should return undefined for non-existent config", () => {
      const config = registry.getConfig("non_existent");
      
      expect(config).toBeUndefined();
    });
  });

  describe("registerConfig", () => {
    it("should register a new clock configuration", () => {
      const newConfig: ClockConfig = {
        source: "external_api",
        precision: "second",
        provider: "test_provider",
        baseUncertaintyMs: 500,
      };

      registry.registerConfig("test_provider", newConfig);

      const retrieved = registry.getConfig("test_provider");
      expect(retrieved).toEqual(newConfig);
    });

    it("should update existing configuration", () => {
      const updatedConfig: ClockConfig = {
        source: "stellar_ledger",
        precision: "exact",
        chain: "stellar",
        baseUncertaintyMs: 50,
      };

      registry.registerConfig("stellar_ledger", updatedConfig);

      const retrieved = registry.getConfig("stellar_ledger");
      expect(retrieved?.baseUncertaintyMs).toBe(50);
    });
  });

  describe("makeKey", () => {
    it("should create key from source only", () => {
      const key = registry.makeKey("system_clock");
      
      expect(key).toBe("system_clock");
    });

    it("should create key from source and chain", () => {
      const key = registry.makeKey("evm_block", "ethereum");
      
      expect(key).toBe("evm_block_ethereum");
    });

    it("should create key from source, chain, and provider", () => {
      const key = registry.makeKey("external_api", "stellar", "coinbase");
      
      expect(key).toBe("external_api_stellar_coinbase");
    });
  });

  describe("calculateUncertainty", () => {
    it("should calculate uncertainty for exact precision", () => {
      const config: ClockConfig = {
        source: "system_clock",
        precision: "exact",
        baseUncertaintyMs: 50,
      };

      const timestampMs = 1000000;
      const uncertainty = registry.calculateUncertainty(timestampMs, config);

      expect(uncertainty.earliestMs).toBe(timestampMs - 50);
      expect(uncertainty.latestMs).toBe(timestampMs + 50);
    });

    it("should add block-level uncertainty for block precision", () => {
      const config: ClockConfig = {
        source: "evm_block",
        precision: "block",
        chain: "ethereum",
        baseUncertaintyMs: 1000,
        expectedBlockTimeMs: 12000,
      };

      const timestampMs = 1000000;
      const uncertainty = registry.calculateUncertainty(timestampMs, config);

      const expectedUncertainty = 1000 + 12000 / 2; // base + half block time
      expect(uncertainty.earliestMs).toBe(timestampMs - expectedUncertainty);
      expect(uncertainty.latestMs).toBe(timestampMs + expectedUncertainty);
    });

    it("should add drift-based uncertainty when observedAt is provided", () => {
      const config: ClockConfig = {
        source: "system_clock",
        precision: "second",
        baseUncertaintyMs: 50,
        driftRateMsPerSec: 0.001,
      };

      const timestampMs = 1000000;
      const observedAt = 1010000; // 1000 seconds later
      const uncertainty = registry.calculateUncertainty(timestampMs, config, observedAt);

      const driftUncertainty = 0.001 * 1000; // 1ms
      expect(uncertainty.earliestMs).toBe(timestampMs - 50 - driftUncertainty);
      expect(uncertainty.latestMs).toBe(timestampMs + 50 + driftUncertainty);
    });
  });

  describe("getAllConfigs", () => {
    it("should return all registered configurations", () => {
      const configs = registry.getAllConfigs();
      
      expect(configs).toBeDefined();
      expect(typeof configs).toBe("object");
      expect(Object.keys(configs).length).toBeGreaterThan(0);
    });

    it("should include predefined configurations", () => {
      const configs = registry.getAllConfigs();
      
      expect(configs["stellar_ledger"]).toBeDefined();
      expect(configs["evm_block_ethereum"]).toBeDefined();
      expect(configs["system_clock"]).toBeDefined();
    });
  });
});

describe("Singleton Instance", () => {
  it("should export a singleton instance", () => {
    expect(clockRegistry).toBeInstanceOf(ClockRegistry);
  });

  it("should have predefined configurations", () => {
    const stellarConfig = clockRegistry.getConfig("stellar_ledger");
    
    expect(stellarConfig).toBeDefined();
    expect(stellarConfig?.source).toBe("stellar_ledger");
  });
});
