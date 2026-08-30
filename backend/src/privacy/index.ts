/**
 * Privacy-preserving operational data redaction pipeline.
 *
 * Public entry point for the redaction module. Wire sinks through these
 * exports; the engine classifies fields centrally, applies the sink's policy,
 * scans for secrets, and emits versioned decisions.
 */

export {
  redactionService,
  RedactionService,
  DEFAULT_SINK_POLICIES,
  REDACTION_MARKER,
  type RedactOptions,
} from "./redaction.service.js";

export {
  fieldRegistry,
  FieldRegistry,
  DEFAULT_FIELD_RULES,
  FIELD_REGISTRY_CURRENT_VERSION,
  pathMatches,
  type ClassifiedField,
} from "./fieldRegistry.js";

export {
  scanValue,
  scanString,
  DEFAULT_SECRET_PATTERNS,
  type SecretMatch,
  type SecretPattern,
} from "./secretScanner.js";

export {
  pseudonymize,
  pseudonymizeValue,
  hmacDigest,
  isPseudonym,
  type PseudonymOptions,
} from "./pseudonymizer.js";

export {
  redactionDecisionService,
  RedactionDecisionService,
  scrubDecisionForLog,
  type DecisionCorrelation,
} from "./redactionDecision.service.js";

export * from "./types.js";
