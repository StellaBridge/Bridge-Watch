/**
 * Privacy redaction pipeline types.
 *
 * The pipeline classifies fields against a central registry, applies a
 * per-sink policy (keep / redact / pseudonymize), runs secret detection,
 * and emits a versioned, auditable redaction decision. Decisions record
 * what changed and under which policy version, never the original value.
 */

export type SensitivityLevel = "public" | "low" | "medium" | "high" | "critical";

export type RedactionAction = "keep" | "redact" | "pseudonymize" | "obfuscate";

export type SinkName =
  | "log"
  | "audit"
  | "webhook"
  | "pdf"
  | "csv"
  | "json"
  | "websocket"
  | "export";

/**
 * A single classified field rule. `match` is a field path (dotted) or a
 * path pattern. Patterns support the glob suffix `**` (matches any number
 * of segments) and a trailing `*` (matches any single segment value at the
 * final position, e.g. `metadata.*` covers every immediate child). A plain
 * path without wildcards matches exactly.
 */
export interface FieldRule {
  /** Dotted field path or path pattern, e.g. "after.source_address". */
  match: string;
  /** Central sensitivity classification. */
  sensitivity: SensitivityLevel;
  /**
   * Optional per-field action that overrides the sink level action. When
   * omitted the sink policy decides based on sensitivity.
   */
  action?: RedactionAction;
  /** Optional free-text description of why this field is classified. */
  description?: string;
}

/**
 * Semantic classification shared by sinks that do not have a field-precise
 * contract (JSON export, webhook payloads). Sinks apply this to any key
 * whose name matches a sensitive token.
 */
export interface SinkPolicy {
  sink: SinkName;
  /** Monotonic policy version. Bumped when rules change. */
  version: number;
  enabled: boolean;
  /**
   * Default action per sensitivity level when a classified field has no
   * explicit `action`.
   */
  levelActions: Record<SensitivityLevel, RedactionAction>;
  /** Levels that should always be pseudonymized, regardless of level action. */
  pseudonymizeLevels: SensitivityLevel[];
  /**
   * Keys this sink keeps verbatim even if secret detection flags them.
   */
  allowList: string[];
  /** Throw when a secret is detected (sink refuses the payload). */
  blockOnSecret: boolean;
}

export interface RedactionEvent {
  /** Field path that was acted on. */
  field: string;
  /** Action applied. */
  action: RedactionAction;
  /** Central sensitivity of the field, if classified. */
  sensitivity?: SensitivityLevel;
  /** SHA-256 fingerprint of the matched rule (identity, not the value). */
  ruleFingerprint?: string;
}

export interface RedactionDecision {
  /** Sink that produced this decision. */
  sink: SinkName;
  /** Policy version that applied. */
  policyVersion: number;
  /** Whether the payload was modified. */
  modified: boolean;
  /** Whether a secret was detected. */
  secretDetected: boolean;
  /** Whether a secret caused the payload to be blocked. */
  blocked: boolean;
  /** Ordered list of redaction events. */
  events: RedactionEvent[];
  /** Policy rule set fingerprint for audit (version + rules hash). */
  policyFingerprint: string;
  /** ISO timestamp. */
  timestamp: string;
}

export interface RedactedResult<T = unknown> {
  /** The redacted payload. */
  output: T;
  /** Machine-readable decision for audit / telemetry. */
  decision: RedactionDecision;
}
