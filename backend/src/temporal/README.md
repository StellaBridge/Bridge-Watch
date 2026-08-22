# Temporal Semantics Layer

## Overview

The Temporal Semantics Layer provides explicit clock provenance, uncertainty intervals, and deterministic temporal comparisons for cross-chain data in Bridge-Watch. This layer addresses the fundamental problem that Stellar ledgers, EVM blocks, external APIs, and system clocks expose different timestamp guarantees, making direct comparisons unreliable.

## Problem Statement

When comparing timestamps from different sources:

- **Stellar ledgers** use consensus-based close times with ~5 second granularity
- **EVM blocks** use miner-provided timestamps with ~12 second granularity (Ethereum) or ~2 seconds (Polygon)
- **External APIs** have varying precision and caching delays
- **System clocks** are NTP-synced but can drift

Direct comparison of these timestamps can lead to:
- False latency conclusions (attributing clock skew to network delay)
- Incorrect stale data detection
- Inaccurate volume window calculations
- Wrong incident ordering

## Solution

The temporal semantics layer introduces:

1. **Clock Provenance** - Tracking the origin and characteristics of each timestamp
2. **Uncertainty Intervals** - Defining a range within which the true time is expected to lie
3. **Explicit Comparison Modes** - Making comparison semantics explicit (strict, approximate, optimistic, pessimistic)
4. **Deterministic Boundary Handling** - Handling window boundaries with uncertainty in mind

## Core Concepts

### Clock Sources

Different timestamp origins with varying guarantees:

- `stellar_ledger` - Stellar ledger close time (consensus timestamp)
- `evm_block` - EVM block timestamp (miner-provided)
- `system_clock` - Local system clock (NTP-synced)
- `external_api` - External API timestamp (provider-specific)
- `oracle` - Oracle-provided timestamp
- `user_provided` - User-submitted timestamp
- `derived` - Computed from other sources

### Clock Precision

Levels of timestamp precision:

- `exact` - Exact timestamp (e.g., database record time)
- `second` - Precision to 1 second
- `block` - Block/ledger granularity (variable duration)
- `epoch` - Epoch-based (e.g., Unix epoch boundaries)
- `approximate` - Approximate timing with significant uncertainty

### Temporal Point

An enhanced timestamp with full temporal metadata:

```typescript
interface TemporalPoint {
  timestampMs: number;              // Best estimate timestamp (Unix milliseconds)
  temporal: TemporalMetadata;       // Full temporal metadata
}
```

### Temporal Metadata

Complete provenance and uncertainty information:

```typescript
interface TemporalMetadata {
  provenance: ClockProvenance;      // Clock source information
  uncertainty: TemporalInterval;    // Uncertainty interval
  observedAt: number;               // When we received this observation
  observationLatencyMs: number;      // Observation latency
  isMissing: boolean;               // Whether timestamp is missing
  notes?: string[];                 // Quality notes
}
```

### Uncertainty Interval

Defines the range within which the true time is expected to lie:

```typescript
interface TemporalInterval {
  earliestMs: number;  // Earliest possible time (inclusive)
  latestMs: number;    // Latest possible time (exclusive)
}
```

## Usage

### Creating Temporal Points

```typescript
import { createTemporalPoint } from "./temporal/temporalUtils.js";

// Create a temporal point for a Stellar ledger close time
const stellarPoint = createTemporalPoint(timestampMs, "stellar_ledger", {
  chain: "stellar",
  blockNumber: 12345,
  rawTimestamp: "2024-01-01T00:00:00Z",
});

// Create a temporal point for an EVM block
const evmPoint = createTemporalPoint(timestampMs, "evm_block", {
  chain: "ethereum",
  blockNumber: 18900000,
  rawTimestamp: "2024-01-01T00:00:00Z",
});
```

### Comparing Temporal Points

```typescript
import { compareTemporalPoints } from "./temporal/temporalUtils.js";

// Strict comparison - intervals must not overlap
const strictResult = compareTemporalPoints(pointA, pointB, {
  mode: "strict",
});

// Approximate comparison - allow overlap with confidence threshold
const approxResult = compareTemporalPoints(pointA, pointB, {
  mode: "approximate",
  minConfidence: 0.7,
});

// Optimistic comparison - assume earliest possible times
const optimisticResult = compareTemporalPoints(pointA, pointB, {
  mode: "optimistic",
});

// Pessimistic comparison - assume latest possible times
const pessimisticResult = compareTemporalPoints(pointA, pointB, {
  mode: "pessimistic",
});
```

### Window Aggregations with Uncertainty

```typescript
import { aggregateTumblingTemporal } from "./services/aggregationWindow.js";

const windows = aggregateTumblingTemporal(dataPoints, {
  sizeMs: 3600000, // 1 hour
}, {
  boundaryMode: "inclusive_start",
  uncertaintyMode: "strict",
  includeMissing: false,
});

// Each window includes:
// - count, sum, min, max, avg
// - uncertainBoundaryCount (points with high uncertainty)
// - confidence (overall confidence score)
```

### Cross-Chain Latency Analysis

```typescript
import { crossChainLatencyAnalyzer } from "./temporal/crossChainLatency.js";

const operation = {
  id: "transfer-123",
  sourceChain: "stellar",
  destinationChain: "ethereum",
  sourceTimestamp: stellarPoint,
  destinationTimestamp: evmPoint,
  operationType: "transfer",
};

const analysis = crossChainLatencyAnalyzer.analyzeOperation(operation);

// Latency breakdown distinguishes:
// - networkDelayMs: Actual network propagation delay
// - clockSkewMs: Clock synchronization difference
// - processingDelayMs: Processing delay in our system
```

### Freshness Detection with Temporal Semantics

```typescript
import { stalenessDetectionService } from "./services/stalenessDetection.service.js";

const snapshot = await stalenessDetectionService.getSnapshot({
  comparisonMode: "approximate", // Use temporal comparison
  includeHistory: true,
});

// Each source includes:
// - comparisonMode: Which comparison mode was used
// - confidence: Confidence in the freshness assessment
```

### Alert Conditions with Temporal Semantics

```typescript
import { alertRulesService } from "./services/alertRules.service.js";

// Create a rule with temporal comparison
const rule = await alertRulesService.createRule({
  name: "Cross-chain latency alert",
  conditions: [{
    metric: "cross_chain_latency",
    operator: "gt",
    threshold: 30000,
    useTemporal: true,           // Enable temporal comparison
    temporalMode: "approximate",  // Use approximate mode
  }],
  // ... other fields
});

// Evaluate with temporal metrics
const result = alertRulesService.evaluateRule(
  rule,
  numericMetrics,
  previousNumericMetrics,
  false,
  temporalMetrics,              // Temporal points for metrics
  previousTemporalMetrics
);

// Result includes:
// - temporalComparison: Temporal comparison result
// - confidence: Confidence in the condition evaluation
// - overallConfidence: Overall evaluation confidence
```

## Clock Registry

The clock registry manages clock source configurations and provides uncertainty estimates:

```typescript
import { clockRegistry } from "./temporal/clockRegistry.js";

// Get configuration for a clock source
const config = clockRegistry.getConfig("stellar_ledger");

// Register a custom clock configuration
clockRegistry.registerConfig("custom_source", {
  source: "external_api",
  precision: "second",
  provider: "custom_provider",
  baseUncertaintyMs: 2000,
  expectedBlockTimeMs: 5000,
});

// Calculate uncertainty for a timestamp
const uncertainty = clockRegistry.calculateUncertainty(
  timestampMs,
  config,
  Date.now() // observation time
);
```

## Predefined Clock Configurations

The following clock configurations are predefined:

### Stellar
- `stellar_ledger`: 100ms base uncertainty, 5s expected block time

### EVM Chains
- `evm_block_ethereum`: 1000ms base uncertainty, 12s expected block time
- `evm_block_polygon`: 2000ms base uncertainty, 2s expected block time
- `evm_block_base`: 1000ms base uncertainty, 2s expected block time

### System
- `system_clock`: 50ms base uncertainty, 0.001ms/second drift rate

### External APIs
- `external_api_coinbase`: 1000ms base uncertainty
- `external_api_coingecko`: 5000ms base uncertainty (caching)

### Oracles
- `oracle_chainlink`: 3000ms base uncertainty

## Best Practices

### 1. Always Use Temporal Points for Cross-Chain Data

When working with data from multiple chains, always use `TemporalPoint` instead of raw timestamps:

```typescript
// Good
const point = createTemporalPoint(timestampMs, "stellar_ledger", {
  chain: "stellar",
  blockNumber: ledger.sequence,
});

// Avoid
const rawTimestamp = timestampMs;
```

### 2. Choose Appropriate Comparison Modes

- **Strict**: Use when you need certainty (e.g., regulatory reporting)
- **Approximate**: Use for general monitoring and analytics
- **Optimistic**: Use when you want to minimize false positives
- **Pessimistic**: Use when you want to minimize false negatives

### 3. Handle Missing Timestamps

Always check for missing timestamps and handle them appropriately:

```typescript
if (point.temporal.isMissing) {
  // Handle missing data - skip, use default, or flag
  return;
}
```

### 4. Consider Confidence Levels

Use confidence scores to make decisions:

```typescript
if (result.confidence < 0.7) {
  // Low confidence - may need manual review
  logger.warn({ confidence: result.confidence }, "Low confidence comparison");
}
```

### 5. Document Clock Sources

When registering custom clock sources, document their characteristics:

```typescript
clockRegistry.registerConfig("my_custom_source", {
  source: "external_api",
  precision: "second",
  provider: "my_provider",
  baseUncertaintyMs: 5000,  // 5 second uncertainty due to caching
  // Document why this uncertainty is appropriate
});
```

## Testing

Comprehensive tests are provided for the temporal semantics layer:

```bash
# Run all temporal tests
npm test -- src/temporal/__tests__/

# Run specific test file
npm test -- src/temporal/__tests__/temporalUtils.test.ts
npm test -- src/temporal/__tests__/clockRegistry.test.ts
npm test -- src/temporal/__tests__/crossChainLatency.test.ts
```

## Migration Guide

### Migrating Existing Code

1. **Replace raw timestamps with TemporalPoint**:
   ```typescript
   // Before
   const timestamp = event.timestamp;
   
   // After
   const temporal = event.temporal;
   const timestamp = temporal.timestampMs;
   ```

2. **Update comparisons**:
   ```typescript
   // Before
   if (timestampA < timestampB) { ... }
   
   // After
   const result = compareTemporalPoints(pointA, pointB, { mode: "approximate" });
   if (result.result === "before") { ... }
   ```

3. **Update window aggregations**:
   ```typescript
   // Before
   const windows = aggregateTumbling(dataPoints, config);
   
   // After
   const windows = aggregateTumblingTemporal(temporalDataPoints, config, options);
   ```

4. **Update freshness checks**:
   ```typescript
   // Before
   const snapshot = await stalenessDetectionService.getSnapshot();
   
   // After
   const snapshot = await stalenessDetectionService.getSnapshot({
     comparisonMode: "approximate",
   });
   ```

## Performance Considerations

- Temporal point creation is lightweight (~0.1ms per point)
- Comparison operations are O(1) and very fast
- Uncertainty calculations use simple arithmetic
- Memory overhead per TemporalPoint is ~200 bytes

## Future Enhancements

Potential future improvements:

1. **Automatic clock calibration** - Learn and update clock configurations over time
2. **Machine learning-based uncertainty** - Use ML to predict uncertainty based on historical patterns
3. **Real-time clock sync monitoring** - Continuous monitoring of clock synchronization
4. **Temporal query language** - DSL for complex temporal queries
5. **Visualization tools** - Tools for visualizing uncertainty intervals

## References

- [Temporal Types](./types.ts) - Core type definitions
- [Temporal Utilities](./temporalUtils.ts) - Utility functions
- [Clock Registry](./clockRegistry.ts) - Clock configuration management
- [Cross-Chain Latency](./crossChainLatency.ts) - Latency analysis tools
