/**
 * Deterministic pseudonymization.
 *
 * Values are transformed with an HMAC-SHA-256 keyed by a salt that lives in
 * configuration (never in the persisted data). The same input always maps to
 * the same pseudonym within a namespace, so related records stay correlatable
 * across sinks during an investigation, while the original value cannot be
 * recovered from the pseudonym.
 *
 * Separating namespaces (one per distinct payload shape) prevents cross-sink
 * correlation outside the intended scope and lets a namespace be rotated
 * without disturbing the others.
 */

import crypto from "crypto";

export interface PseudonymOptions {
  /** Hex salt. Derived from config; keeps pseudonyms deterministic per deployment. */
  salt: string;
  /** Namespace the pseudonym is scoped to. */
  namespace: string;
  /** Prefix that makes the output obviously a pseudonym. */
  prefix?: string;
  /** Number of hex characters of the HMAC digest to keep (min 16). */
  length?: number;
}

const DEFAULT_LENGTH = 24;

/** Compute the HMAC digest for a value under a namespace + salt. */
export function hmacDigest(value: string, salt: string, namespace: string): string {
  return crypto
    .createHmac("sha256", salt)
    .update(`${namespace}:${value}`)
    .digest("hex");
}

/** Whether a value already looks like one of our pseudonyms. */
export function isPseudonym(value: string, prefix = "psn:"): boolean {
  return typeof value === "string" && value.startsWith(prefix);
}

/**
 * Deterministically pseudonymize a string. Returns a `psn:`-prefixed value
 * that is stable for the same (value, namespace, salt).
 */
export function pseudonymize(value: string, options: PseudonymOptions): string {
  const length = Math.max(typeof options.length === "number" ? options.length : DEFAULT_LENGTH, 16);
  const prefix = options.prefix ?? "psn:";
  if (isPseudonym(value, prefix)) return value;
  const digest = hmacDigest(value, options.salt, options.namespace).slice(0, length);
  return `${prefix}${digest}`;
}

/**
 * Walk a value and deterministically pseudonymize every string leaf under a
 * namespace. Objects and arrays are cloned so the caller's value is never
 * mutated.
 */
export function pseudonymizeValue(
  value: unknown,
  options: PseudonymOptions,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return pseudonymize(value, options);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => pseudonymizeValue(item, options));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = pseudonymizeValue(item, options);
    }
    return out;
  }
  return value;
}
