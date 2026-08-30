/**
 * Central, schema-aware field classification registry.
 *
 * Every sensitive field in operational payloads is classified here, once.
 * Sinks consume these classifications through their policies instead of
 * maintaining their own redaction lists, so a change to sensitivity is
 * enforced across every sink from a single source of truth.
 *
 * Rule matching is path-based. A rule's `match` is a dotted path into the
 * JSON payload. The following wildcards are supported:
 *   - a trailing `**`       matches any number of remaining segments
 *   - a trailing `*`        matches any single value at that position
 *
 * Classification is versioned (CURRENT_VERSION) so a redaction decision can
 * always be tied back to the exact rule set that produced it.
 */

import crypto from "crypto";
import type { FieldRule, SensitivityLevel } from "./types.js";

export const FIELD_REGISTRY_CURRENT_VERSION = 1;

/**
 * Match a dotted path against a rule pattern.
 *
 * Rules support three forms:
 *   - Exact: "after.source_address"
 *   - Single-segment wildcard: "transactions.**" (matches the field itself
 *     and every descendent under transactions)
 *   - Final-value wildcard: "metadata.*" (matches every immediate child of
 *     metadata)
 */
export function pathMatches(pattern: string, path: string): boolean {
  const patternSegs = pattern.split(".").filter(Boolean);
  const pathSegs = path.split(".").filter(Boolean);

  // A trailing `**` matches the prefix and any number of remaining segments.
  // A bare `**` matches every path.
  const doubleWildcardIndex = patternSegs.indexOf("**");
  if (doubleWildcardIndex !== -1) {
    const prefix = patternSegs.slice(0, doubleWildcardIndex);
    if (prefix.length > pathSegs.length) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (prefix[i] !== pathSegs[i]) return false;
    }
    // Any extra segments after `**` beyond the matched prefix must themselves
    // match up to where the suffix wildcard started; `**` consumes the rest.
    return true;
  }

  if (patternSegs.length !== pathSegs.length) return false;

  for (let i = 0; i < pathSegs.length; i++) {
    if (patternSegs[i] === "*") continue;
    if (patternSegs[i] !== pathSegs[i]) return false;
  }
  return true;
}

export interface ClassifiedField {
  rule: FieldRule;
  path: string;
}

export const DEFAULT_FIELD_RULES: FieldRule[] = [
  // -- Account / wallet identifiers ------------------------------------------
  { match: "source_address", sensitivity: "critical", description: "Wallet address the transfer originates from" },
  { match: "destination_address", sensitivity: "critical", description: "Wallet address the transfer is destined for" },
  { match: "*.source_address", sensitivity: "critical" },
  { match: "*.destination_address", sensitivity: "critical" },
  { match: "*.from", sensitivity: "critical", description: "Blockchain event sender" },
  { match: "*.to", sensitivity: "critical", description: "Blockchain event recipient" },
  { match: "*.ownerAddress", sensitivity: "critical", description: "Webhook endpoint owner address" },
  { match: "*.owner_address", sensitivity: "critical" },
  { match: "ownerAddress", sensitivity: "critical" },
  { match: "endpointUrl", sensitivity: "high", description: "Webhook / endpoint URL" },
  { match: "endpoint_url", sensitivity: "high" },
  { match: "*.endpointUrl", sensitivity: "high" },
  { match: "*.endpoint_url", sensitivity: "high" },
  { match: "webhookEndpointId", sensitivity: "medium", description: "Webhook endpoint identifier" },
  { match: "webhook_endpoint_id", sensitivity: "medium" },
  { match: "*.webhookEndpointId", sensitivity: "medium" },
  { match: "endpointName", sensitivity: "medium", description: "Webhook endpoint name" },
  { match: "*.endpointName", sensitivity: "medium" },
  { match: "address", sensitivity: "high", description: "Wallet / contract address" },
  { match: "*.address", sensitivity: "high" },
  { match: "admin.address", sensitivity: "critical" },
  { match: "contractAddress", sensitivity: "high" },
  { match: "*.contractAddress", sensitivity: "high" },
  { match: "issuer", sensitivity: "medium", description: "Asset issuer address" },
  { match: "tx_hash", sensitivity: "high", description: "Transaction hash" },
  { match: "*.tx_hash", sensitivity: "high" },
  { match: "*.txHash", sensitivity: "high" },
  { match: "transactionHash", sensitivity: "high" },
  { match: "*.transactionHash", sensitivity: "high" },
  { match: "leaf_hash", sensitivity: "low", description: "Public merkle leaf hash" },
  { match: "public_key", sensitivity: "medium" },
  { match: "publicKey", sensitivity: "medium" },

  // -- Network / identity -----------------------------------------------------
  { match: "ipAddress", sensitivity: "high", description: "Client IP address" },
  { match: "ip_address", sensitivity: "high" },
  { match: "*.ipAddress", sensitivity: "high" },
  { match: "*.ip_address", sensitivity: "high" },
  { match: "userAgent", sensitivity: "medium", description: "Client user agent" },
  { match: "user_agent", sensitivity: "medium" },
  { match: "*.userAgent", sensitivity: "medium" },
  { match: "email", sensitivity: "high", description: "Email address" },
  { match: "emailAddress", sensitivity: "high" },
  { match: "email_address", sensitivity: "high" },
  { match: "*.email", sensitivity: "high" },
  { match: "phone", sensitivity: "high" },
  { match: "actorId", sensitivity: "high", description: "Actor identifier" },
  { match: "actor_id", sensitivity: "high" },
  { match: "userId", sensitivity: "medium" },
  { match: "user_id", sensitivity: "medium" },
  { match: "resourceId", sensitivity: "medium", description: "Resource identifier (may embed addresses)" },
  { match: "resource_id", sensitivity: "medium" },
  { match: "incidentId", sensitivity: "medium", description: "Incident identifier" },
  { match: "incident_id", sensitivity: "medium" },

  // -- Free-text notes / evidence ---------------------------------------------
  { match: "metadata.reason", sensitivity: "medium", description: "Free-text reason / note" },
  { match: "metadata.comment", sensitivity: "medium" },
  { match: "metadata.changes", sensitivity: "medium", description: "Free-text change description" },
  { match: "*.reason", sensitivity: "medium" },
  { match: "*.comment", sensitivity: "medium" },
  { match: "notes", sensitivity: "medium" },
  { match: "error_message", sensitivity: "medium", description: "Error text, may embed payloads" },
  { match: "errorMessage", sensitivity: "medium" },
  { match: "*.error_message", sensitivity: "medium" },

  // -- Raw third-party evidence -----------------------------------------------
  { match: "raw", sensitivity: "critical", description: "Verbatim third-party payload" },
  { match: "*.raw", sensitivity: "critical" },
  { match: "rawPayload", sensitivity: "critical" },
  { match: "request_body", sensitivity: "high", description: "Serialized outbound request body" },
  { match: "requestBody", sensitivity: "high" },
  { match: "request_headers", sensitivity: "high" },
  { match: "requestHeaders", sensitivity: "high" },
  { match: "response_body", sensitivity: "medium", description: "Serialized response body" },
  { match: "responseBody", sensitivity: "medium" },

  // -- Credentials / secrets ---------------------------------------------------
  { match: "secret", sensitivity: "critical" },
  { match: "*.secret", sensitivity: "critical" },
  { match: "password", sensitivity: "critical" },
  { match: "passwordHash", sensitivity: "critical" },
  { match: "token", sensitivity: "critical" },
  { match: "*.token", sensitivity: "critical" },
  { match: "apiKey", sensitivity: "critical" },
  { match: "api_key", sensitivity: "critical" },
  { match: "apikey", sensitivity: "critical" },
  { match: "private_key", sensitivity: "critical" },
  { match: "privateKey", sensitivity: "critical" },
  { match: "signature", sensitivity: "critical" },
  { match: "authorization", sensitivity: "critical" },
  { match: "cookie", sensitivity: "critical" },
  { match: "memo", sensitivity: "medium", description: "Stellar transaction note" },

  // -- Security / admin --------------------------------------------------------
  { match: "before", sensitivity: "medium", description: "Pre-mutation snapshot" },
  { match: "after", sensitivity: "medium", description: "Post-mutation snapshot" },
];

export class FieldRegistry {
  private readonly rules: FieldRule[];
  readonly version: number;

  constructor(rules: FieldRule[] = DEFAULT_FIELD_RULES, version: number = FIELD_REGISTRY_CURRENT_VERSION) {
    this.rules = rules;
    this.version = version;
  }

  get signatures(): FieldRule[] {
    return this.rules;
  }

  /**
   * Classify a field path. Returns undefined when the path does not match any
   * classified rule. When multiple rules match, the most specific (longest
   * pattern) wins.
   */
  classify(path: string): ClassifiedField | undefined {
    let best: ClassifiedField | undefined;
    for (const rule of this.rules) {
      if (!pathMatches(rule.match, path)) continue;
      if (!best || rule.match.length > best.rule.match.length) {
        best = { rule, path };
      }
    }
    return best;
  }

  /**
   * Stable fingerprint covering the rule set. Used so a redaction decision
   * can be audited against the exact rules that produced it without storing
   * the rules or the values. SHA-256 over the serialized rule set.
   */
  fingerprint(): string {
    const sorted = [...this.rules].sort((a, b) => (a.match < b.match ? -1 : 1));
    return crypto.createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
  }

  sensitivityLevel(path: string): SensitivityLevel | undefined {
    return this.classify(path)?.rule.sensitivity;
  }

  /**
   * Return the set of sensitive leaf key names across all rules plus common
   * snake_case / camelCase variants. Used to derive the flat key list for
   * loggers that redact by key name (cheap at runtime, single source of
   * truth with the registry).
   */
  sensitiveKeyNames(): string[] {
    const names = new Set<string>();
    for (const rule of this.rules) {
      const segs = rule.match.split(".");
      const leaf = segs[segs.length - 1];
      if (leaf === "*" || leaf === "**") continue;
      if (leaf.startsWith("~")) continue;
      names.add(leaf);
      // seed common casing variants
      names.add(snakeToCamel(leaf));
      names.add(leaf.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());
    }
    return Array.from(names);
  }
}

/** Convert snake_case to camelCase: "api_key" -> "apiKey". */
function snakeToCamel(value: string): string {
  if (!value.includes("_")) return value;
  return value.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

export const fieldRegistry = new FieldRegistry();
