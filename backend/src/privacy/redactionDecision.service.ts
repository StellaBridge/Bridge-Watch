/**
 * Persistence layer for redaction decisions.
 *
 * A redaction decision is written after a payload is processed so that what
 * was redacted, under which policy version, and which fields were touched can
 * be audited later. The decision is already scrubbed by the redaction engine
 * (rule fingerprints + field paths only), so writing it stores no secrets.
 *
 * Persistence is best-effort: a decision must never break the operational
 * path that produced it, so failures here are logged and swallowed.
 */

import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";
import type { RedactionDecision } from "./types.js";

export interface DecisionCorrelation {
  /** Incident / request / delivery id the decision belongs to, if any. */
  incidentId?: string;
  /** Resource type this decision was about, if known. */
  resourceType?: string;
  /** Resource id this decision was about, if known. */
  resourceId?: string;
}

export function scrubDecisionForLog(decision: RedactionDecision) {
  return {
    sink: decision.sink,
    policyVersion: decision.policyVersion,
    modified: decision.modified,
    secretDetected: decision.secretDetected,
    blocked: decision.blocked,
    eventCount: decision.events.length,
    policyFingerprint: decision.policyFingerprint,
  };
}

export class RedactionDecisionService {
  async record(decision: RedactionDecision, correlation: DecisionCorrelation = {}): Promise<void> {
    if (!config.REDACTION_DECISION_LOG_ENABLED) return;
    try {
      const db = getDatabase();
      await db("redaction_decisions").insert({
        sink: decision.sink,
        policy_version: decision.policyVersion,
        modified: decision.modified,
        secret_detected: decision.secretDetected,
        blocked: decision.blocked,
        policy_fingerprint: decision.policyFingerprint,
        events: JSON.stringify(decision.events),
        correlation: JSON.stringify(correlation),
        created_at: new Date(),
      });
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to persist redaction decision",
      );
    }
  }
}

export const redactionDecisionService = new RedactionDecisionService();
