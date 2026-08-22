/**
 * Temporal Semantics Layer
 * 
 * Provides explicit clock provenance, uncertainty intervals, and deterministic
 * temporal comparisons for cross-chain data. This layer addresses the problem
 * that Stellar ledgers, EVM blocks, external APIs, and system clocks expose
 * different timestamp guarantees, making direct comparisons unreliable.
 */

// ─── Clock Source Types ───────────────────────────────────────────────────────

export type ClockSource =
  | "stellar_ledger"           // Stellar ledger close time (consensus timestamp)
  | "evm_block"                // EVM block timestamp (miner-provided)
  | "system_clock"             // Local system clock (NTP-synced)
  | "external_api"              // External API timestamp (provider-specific)
  | "oracle"                   // Oracle-provided timestamp
  | "user_provided"            // User-submitted timestamp
  | "derived";                 // Computed from other sources

// ─── Clock Precision Levels ───────────────────────────────────────────────────

export type ClockPrecision =
  | "exact"                    // Exact timestamp (e.g., database record time)
  | "second"                   // Precision to 1 second
  | "block"                    // Block/ledger granularity (variable duration)
  | "epoch"                    // Epoch-based (e.g., Unix epoch boundaries)
  | "approximate";             // Approximate timing with significant uncertainty

// ─── Temporal Interval ──────────────────────────────────────────────────────────

export interface TemporalInterval {
  /** Earliest possible time (inclusive), Unix milliseconds */
  earliestMs: number;
  /** Latest possible time (exclusive), Unix milliseconds */
  latestMs: number;
}

// ─── Clock Provenance ──────────────────────────────────────────────────────────

export interface ClockProvenance {
  /** Source of the clock reading */
  source: ClockSource;
  /** Precision level of the clock */
  precision: ClockPrecision;
  /** Chain/network identifier (e.g., "stellar", "ethereum", "polygon") */
  chain?: string;
  /** Specific provider (e.g., "horizon-mainnet", "infura", "coinbase") */
  provider?: string;
  /** Block or ledger sequence number */
  blockNumber?: number;
  /** Original raw timestamp from source */
  rawTimestamp?: string;
  /** Confidence in this provenance (0-1) */
  confidence: number;
}

// ─── Temporal Metadata ─────────────────────────────────────────────────────────

export interface TemporalMetadata {
  /** Clock provenance information */
  provenance: ClockProvenance;
  /** Uncertainty interval for the timestamp */
  uncertainty: TemporalInterval;
  /** Time when this observation was received by our system (Unix ms) */
  observedAt: number;
  /** Estimated observation latency (ms) = observedAt - timestamp */
  observationLatencyMs: number;
  /** Whether the timestamp is missing or invalid */
  isMissing: boolean;
  /** Notes about temporal quality (e.g., "clock skew detected") */
  notes?: string[];
}

// ─── Temporal Point (enhanced timestamp) ───────────────────────────────────────

export interface TemporalPoint {
  /** Best estimate timestamp (Unix milliseconds) */
  timestampMs: number;
  /** Full temporal metadata */
  temporal: TemporalMetadata;
}

// ─── Comparison Modes ───────────────────────────────────────────────────────────

export type ComparisonMode =
  | "strict"                   // Intervals must not overlap
  | "approximate"              // Allow interval overlap with confidence threshold
  | "optimistic"               // Assume earliest possible times
  | "pessimistic";             // Assume latest possible times

export interface ComparisonOptions {
  mode: ComparisonMode;
  /** Minimum confidence threshold (0-1) for approximate mode */
  minConfidence?: number;
  /** Maximum allowed clock skew (ms) before flagging */
  maxClockSkewMs?: number;
}

// ─── Comparison Result ───────────────────────────────────────────────────────────

export interface ComparisonResult {
  /** Whether the comparison succeeded */
  success: boolean;
  /** The comparison result (for ordering) */
  result?: "before" | "after" | "concurrent" | "unknown";
  /** Confidence in the result (0-1) */
  confidence: number;
  /** Detected clock skew (ms) */
  clockSkewMs?: number;
  /** Warnings or notes about the comparison */
  warnings?: string[];
}

// ─── Window Boundary Handling ──────────────────────────────────────────────────

export type BoundaryMode =
  | "inclusive_start"           // Include points at window start
  | "inclusive_end"             // Include points at window end
  | "inclusive_both"            // Include points at both boundaries
  | "exclusive_both";           // Exclude points at both boundaries

export interface TemporalWindowOptions {
  /** How to handle points at window boundaries */
  boundaryMode: BoundaryMode;
  /** How to handle uncertainty at boundaries */
  uncertaintyMode: "strict" | "lenient" | "expand";
  /** Whether to include points with missing timestamps */
  includeMissing: boolean;
}

// ─── Latency Breakdown ──────────────────────────────────────────────────────────

export interface LatencyBreakdown {
  /** Total end-to-end latency (ms) */
  totalLatencyMs: number;
  /** Network propagation delay (ms) */
  networkDelayMs: number;
  /** Clock skew component (ms) */
  clockSkewMs: number;
  /** Processing delay in our system (ms) */
  processingDelayMs: number;
  /** Confidence in the breakdown (0-1) */
  confidence: number;
}

// ─── Temporal Quality Metrics ─────────────────────────────────────────────────

export interface TemporalQuality {
  /** Overall temporal quality score (0-1) */
  score: number;
  /** Clock synchronization status */
  clockSyncStatus: "synchronized" | "drifting" | "unknown";
  /** Estimated clock drift rate (ms/second) */
  clockDriftRate?: number;
  /** Data freshness status */
  freshnessStatus: "fresh" | "stale" | "unknown";
  /** Whether temporal data is sufficient for analysis */
  isSufficient: boolean;
}
