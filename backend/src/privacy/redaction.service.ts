/**
 * Schema-aware redaction pipeline.
 *
 * Orchestrates the full flow: walk an operational payload against the central
 * field registry, apply the selected sink's policy (keep / redact /
 * pseudonymize / obfuscate), run secret detection, and emit a versioned
 * decision. The same payload shape therefore gets the same treatment at every
 * configured sink, and decisions stay auditable without storing the values.
 */

import crypto from "crypto";
import { config } from "../config/index.js";
import { fieldRegistry as defaultRegistry, pathMatches } from "./fieldRegistry.js";
import { DEFAULT_SECRET_PATTERNS, scanValue, type SecretPattern } from "./secretScanner.js";
import { pseudonymizeValue, type PseudonymOptions } from "./pseudonymizer.js";
import type {
  FieldRule,
  RedactedResult,
  RedactionAction,
  RedactionDecision,
  RedactionEvent,
  SensitivityLevel,
  SinkName,
  SinkPolicy,
} from "./types.js";

export const REDACTION_MARKER = "[REDACTED]";

/**
 * Default sink policies. A sink's policy decides how each sensitivity level
 * is treated and whether secrets are allowed to pass. Sinks that persist
 * operational payloads are stricter; sinks that only surface aggregate
 * signals are more permissive.
 */
export const DEFAULT_SINK_POLICIES: Record<SinkName, SinkPolicy> = {
  log: {
    sink: "log",
    version: 1,
    enabled: true,
    levelActions: { public: "keep", low: "keep", medium: "redact", high: "redact", critical: "redact" },
    pseudonymizeLevels: [],
    allowList: [],
    blockOnSecret: true,
  },
  audit: {
    sink: "audit",
    version: 1,
    enabled: true,
    levelActions: { public: "keep", low: "keep", medium: "redact", high: "pseudonymize", critical: "pseudonymize" },
    pseudonymizeLevels: ["high", "critical"],
    allowList: ["actorType", "severity", "action", "resourceType"],
    blockOnSecret: false,
  },
  webhook: {
    sink: "webhook",
    version: 1,
    enabled: true,
    levelActions: { public: "keep", low: "keep", medium: "redact", high: "pseudonymize", critical: "redact" },
    pseudonymizeLevels: ["high"],
    allowList: ["eventType", "timestamp", "ruleId", "ruleName", "assetCode", "metric", "threshold", "priority", "alertType"],
    blockOnSecret: false,
  },
  pdf: {
    sink: "pdf",
    version: 1,
    enabled: true,
    levelActions: { public: "keep", low: "keep", medium: "redact", high: "redact", critical: "redact" },
    pseudonymizeLevels: [],
    allowList: [],
    blockOnSecret: true,
  },
  csv: {
    sink: "csv",
    version: 1,
    enabled: true,
    levelActions: { public: "keep", low: "keep", medium: "redact", high: "pseudonymize", critical: "redact" },
    pseudonymizeLevels: ["high"],
    allowList: [],
    blockOnSecret: true,
  },
  json: {
    sink: "json",
    version: 1,
    enabled: true,
    levelActions: { public: "keep", low: "keep", medium: "redact", high: "pseudonymize", critical: "redact" },
    pseudonymizeLevels: ["high"],
    allowList: [],
    blockOnSecret: true,
  },
  websocket: {
    sink: "websocket",
    version: 1,
    enabled: true,
    levelActions: { public: "keep", low: "keep", medium: "redact", high: "pseudonymize", critical: "redact" },
    pseudonymizeLevels: ["high"],
    allowList: ["type", "topic", "sequence", "timestamp", "priority", "ruleId", "assetCode", "metric", "threshold", "severity"],
    blockOnSecret: true,
  },
  export: {
    sink: "export",
    version: 1,
    enabled: true,
    levelActions: { public: "keep", low: "keep", medium: "redact", high: "pseudonymize", critical: "redact" },
    pseudonymizeLevels: ["high"],
    allowList: [],
    blockOnSecret: true,
  },
};

export interface RedactOptions {
  sink: SinkName;
  policy?: SinkPolicy;
  /** Overrides for the default sink policy (merges level actions/regex). */
  registry?: ReturnType<typeof getDefaultRegistry>;
  secretPatterns?: SecretPattern[];
  /** Namespace for pseudonyms (defaults to config namespace). */
  namespace?: string;
}

function getDefaultRegistry() {
  return defaultRegistry;
}

export class RedactionService {
  private readonly policies: Record<SinkName, SinkPolicy>;
  private readonly registry;
  private readonly secretPatterns: SecretPattern[];

  constructor(
    policies: Record<SinkName, SinkPolicy> = DEFAULT_SINK_POLICIES,
    registry = defaultRegistry,
    secretPatterns: SecretPattern[] = DEFAULT_SECRET_PATTERNS,
  ) {
    this.policies = policies;
    this.registry = registry;
    this.secretPatterns = secretPatterns;
  }

  getPolicy(sink: SinkName): SinkPolicy {
    return this.policies[sink];
  }

  /**
   * Redact a structured payload for a sink. Returns the transformed output
   * and a versioned decision. The decision never contains original values.
   */
  redact(input: unknown, opts: RedactOptions): RedactedResult {
    const policy = opts.policy ?? this.getPolicy(opts.sink);
    if (!config.REDACTION_ENABLED || !policy.enabled) {
      const decision = this.emptyDecision(policy, opts.sink);
      return { output: input, decision };
    }

    const events: RedactionEvent[] = [];
    const secretPaths: string[] = [];
    const output = this.walk(input, {
      path: "",
      policy,
      events,
      secretPaths,
      namespace: opts.namespace ?? config.REDACTION_PSEUDONYM_NAMESPACE,
      registry: opts.registry ?? this.registry,
      secretPatterns: opts.secretPatterns ?? this.secretPatterns,
    });

    const secretDetected = secretPaths.length > 0;
    const blocked = secretDetected && policy.blockOnSecret;

    if (blocked) {
      throw new Error(
        `Redaction blocked payload for sink "${opts.sink}": secret content is not allowed. Paths: ${secretPaths.join(", ")}`,
      );
    }

    return {
      output,
      decision: {
        sink: opts.sink,
        policyVersion: policy.version,
        modified: events.length > 0,
        secretDetected,
        blocked,
        events,
        policyFingerprint: this.registryFingerprint(policy),
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Scan a plain string (e.g. a message or a serialized body) for secrets,
   * and if the policy blocks on secrets, throw. Returns the original string
   * when allowed. Used when there is no structured object to walk.
   */
  classifyString(input: string, opts: { sink: SinkName; policy?: SinkPolicy }): { allowed: boolean; decision: RedactionDecision } {
    const policy = opts.policy ?? this.getPolicy(opts.sink);
    const matches = scanValue(input, "$", this.secretPatterns);
    const secretDetected = matches.length > 0;
    const blocked = secretDetected && policy.blockOnSecret;
    const events: RedactionEvent[] = secretDetected
      ? matches.map((m) => ({ field: "$", action: blocked ? "redact" : "keep", sensitivity: "critical" }))
      : [];
    return {
      allowed: !blocked,
      decision: {
        sink: opts.sink,
        policyVersion: policy.version,
        modified: blocked,
        secretDetected,
        blocked,
        events,
        policyFingerprint: this.registryFingerprint(policy),
        timestamp: new Date().toISOString(),
      },
    };
  }

  private emptyDecision(policy: SinkPolicy, sink: SinkName): RedactionDecision {
    return {
      sink,
      policyVersion: policy.version,
      modified: false,
      secretDetected: false,
      blocked: false,
      events: [],
      policyFingerprint: this.registryFingerprint(policy),
      timestamp: new Date().toISOString(),
    };
  }

  private registryFingerprint(policy: SinkPolicy): string {
    return `${policy.version}:${this.registry.fingerprint()}`;
  }

  private walk(
    value: unknown,
    ctx: {
      path: string;
      policy: SinkPolicy;
      events: RedactionEvent[];
      secretPaths: string[];
      namespace: string;
      registry: ReturnType<typeof getDefaultRegistry>;
      secretPatterns: SecretPattern[];
    },
  ): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      return this.handleString(value, ctx);
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
      return value.map((item, idx) => this.walk(item, { ...ctx, path: `${ctx.path}[${idx}]` }));
    }
    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        const childPath = ctx.path ? `${ctx.path}.${key}` : key;
        out[key] = this.walk(item, { ...ctx, path: childPath });
      }
      return out;
    }
    return value;
  }

  private handleString(
    value: string,
    ctx: {
      path: string;
      policy: SinkPolicy;
      events: RedactionEvent[];
      secretPaths: string[];
      namespace: string;
      registry: ReturnType<typeof getDefaultRegistry>;
      secretPatterns: SecretPattern[];
    },
  ): string {
    const classified = ctx.registry.classify(ctx.path);

    if (classified && !this.isAllowed(ctx.policy.allowList, ctx.path)) {
      const rule = classified.rule;
      const action = this.resolveAction(rule, classified.rule.sensitivity, ctx.policy);
      const event: RedactionEvent = {
        field: ctx.path,
        action,
        sensitivity: rule.sensitivity,
        ruleFingerprint: this.ruleFingerprint(rule),
      };

      if (action === "pseudonymize" || ctx.policy.pseudonymizeLevels.includes(rule.sensitivity)) {
        ctx.events.push({ ...event, action: "pseudonymize" });
        return pseudoOf(value, ctx.namespace);
      }
      if (action === "redact") {
        ctx.events.push({ ...event, action: "redact" });
        return REDACTION_MARKER;
      }
      if (action === "obfuscate") {
        ctx.events.push({ ...event, action: "obfuscate" });
        return obfuscate(value);
      }
      // keep
      return value;
    }

    // Unclassified string: still run secret detection. If a secret is found,
    // respect the policy's secret handling.
    const secretMatches = scanValue(value, ctx.path, ctx.secretPatterns);
    if (secretMatches.length > 0) {
      if (!secretMatches.some((m) => m.path && ctx.policy.allowList.includes(m.path.replace(/^\$\./, "")))) {
        ctx.secretPaths.push(ctx.path || "$");
        if (ctx.policy.blockOnSecret) {
          return value; // value preserved; the caller walks decision.blocked to reject
        }
      }
    }

    // String values that are serialized JSON may contain nested sensitive
    // fields: parse, walk, and re-serialize.
    const parsed = tryParseJson(value);
    if (parsed !== undefined) {
      const walked = this.walk(parsed, { ...ctx, path: ctx.path ? `${ctx.path}.~` : "~" });
      const reserialized = JSON.stringify(walked);
      if (reserialized !== value) {
        ctx.events.push({ field: ctx.path, action: "redact", sensitivity: "high" });
        return reserialized;
      }
    }
    return value;
  }

  private isAllowed(allowList: string[], path: string): boolean {
    for (const allow of allowList) {
      if (pathMatches(allow, path)) return true;
    }
    return false;
  }

  private resolveAction(rule: FieldRule, level: SensitivityLevel, policy: SinkPolicy): RedactionAction {
    if (rule.action) return rule.action;
    return policy.levelActions[level] ?? "redact";
  }

  private ruleFingerprint(rule: FieldRule): string {
    // Fingerprint identifies the rule without leaking any value.
    const payload = `${this.registry.version}:${rule.match}:${rule.sensitivity}`;
    return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }
}

function pseudoOf(value: string, namespace: string): string {
  const opts: PseudonymOptions = {
    salt: config.REDACTION_PSEUDONYM_SALT,
    namespace,
  };
  return pseudonymizeValue(value, opts) as string;
}

function obfuscate(value: string): string {
  if (value.length <= 4) return REDACTION_MARKER;
  const head = value.slice(0, 2);
  const tail = value.slice(-4);
  return `${head}****${tail}`;
}

function tryParseJson(value: string): unknown | undefined {
  if (value.length < 2 || (value[0] !== "{" && value[0] !== "[")) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export const redactionService = new RedactionService();
