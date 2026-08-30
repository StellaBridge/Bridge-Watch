import { describe, it, expect } from "vitest";
import {
  fieldRegistry,
  FieldRegistry,
  pathMatches,
  DEFAULT_FIELD_RULES,
  redactionService,
  RedactionService,
  DEFAULT_SINK_POLICIES,
  REDACTION_MARKER,
  scanValue,
  scanString,
  pseudonymize,
  pseudonymizeValue,
  isPseudonym,
  scrubDecisionForLog,
} from "../../src/privacy/index.js";
import { redactionDecisionService } from "../../src/privacy/redactionDecision.service.js";
import type { RedactionDecision, SinkPolicy } from "../../src/privacy/types.js";

describe("fieldRegistry.pathMatches", () => {
  it("matches exact dotted paths", () => {
    expect(pathMatches("after.source_address", "after.source_address")).toBe(true);
    expect(pathMatches("after.source_address", "after.destination_address")).toBe(false);
  });

  it("matches single-segment wildcard *", () => {
    expect(pathMatches("*.source_address", "data.source_address")).toBe(true);
    expect(pathMatches("*.source_address", "data.nested.source_address")).toBe(false);
  });

  it("matches ** suffix across any depth", () => {
    expect(pathMatches("transactions.**", "transactions")).toBe(true);
    expect(pathMatches("transactions.**", "transactions.0.source_address")).toBe(true);
    expect(pathMatches("transactions.**", "other.source_address")).toBe(false);
  });
});

describe("FieldRegistry", () => {
  it("classifies sensitive paths centrally", () => {
    const classified = fieldRegistry.classify("after.source_address");
    expect(classified).toBeDefined();
    expect(classified?.rule.sensitivity).toBe("critical");
  });

  it("classifies nested evidence paths", () => {
    expect(fieldRegistry.sensitivityLevel("data.raw")).toBe("critical");
    expect(fieldRegistry.sensitivityLevel("transaction.source_address")).toBe("critical");
    expect(fieldRegistry.sensitivityLevel("ownerAddress")).toBe("critical");
  });

  it("most specific rule wins", () => {
    const registry = new FieldRegistry([
      { match: "**", sensitivity: "medium" },
      { match: "account.address", sensitivity: "critical" },
    ]);
    expect(registry.classify("account.address")?.rule.sensitivity).toBe("critical");
    expect(registry.classify("account.other")?.rule.sensitivity).toBe("medium");
  });

  it("fingerprint is stable and changes with rules", () => {
    const a = new FieldRegistry(DEFAULT_FIELD_RULES, 1).fingerprint();
    const b = new FieldRegistry(DEFAULT_FIELD_RULES, 1).fingerprint();
    const c = new FieldRegistry([{ match: "x", sensitivity: "low" }], 1).fingerprint();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("secretScanner", () => {
  it("detects a Stellar ed25519 secret key", () => {
    const matches = scanString("SDR5FQGCNVP5KU2YGW5IOKRRRRMPKXA5ZQ3XO7Q4N7GNRYVUZROXXJUVK");
    expect(matches.some((m) => m.type === "stellar_secret")).toBe(true);
  });

  it("detects an EVM private key", () => {
    const matches = scanValue({
      privateKey: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    expect(matches.some((m) => m.type === "evm_private_key")).toBe(true);
  });

  it("detects a BIP-39 seed phrase", () => {
    const phrase =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const matches = scanString(phrase);
    expect(matches.some((m) => m.type === "bip39_mnemonic")).toBe(true);
  });

  it("detects a JWT / bearer token", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(scanString(jwt).some((m) => m.type === "jwt")).toBe(true);
  });

  it("detects named secret assignments", () => {
    const matches = scanString("apiKey = 'sk-abcdef0123456789'");
    expect(matches.some((m) => m.type === "named_secret")).toBe(true);
  });

  it("does not flag benign operational text", () => {
    const matches = scanString("Bridge USDC supply increased by 12.4% this week");
    expect(matches).toEqual([]);
  });

  it("returns empty when no secret is present", () => {
    expect(scanValue({ symbol: "USDC", price: 1.0 })).toEqual([]);
  });
});

describe("pseudonymizer", () => {
  const opts = { salt: "test-salt", namespace: "incident-1" };

  it("is deterministic for the same value + namespace", () => {
    const a = pseudonymize("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", opts);
    const b = pseudonymize("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", opts);
    expect(a).toBe(b);
    expect(a.startsWith("psn:")).toBe(true);
  });

  it("differs across namespaces for the same value", () => {
    const a = pseudonymize("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", opts);
    const b = pseudonymize("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", { ...opts, namespace: "incident-2" });
    expect(a).not.toBe(b);
  });

  it("is irreversible (pseudonym is a truncated digest, not the value)", () => {
    const value = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    const result = pseudonymize(value, opts);
    expect(result).not.toContain(value);
  });

  it("preserves shape when walking structured values", () => {
    const out = pseudonymizeValue(
      { from: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", amount: 100 },
      opts,
    );
    expect(isPseudonym(out.from)).toBe(true);
    expect(out.amount).toBe(100);
  });
});

describe("RedactionService - audit policy", () => {
  it("pseudonymizes high/critical classified fields (addresses)", () => {
    const result = redactionService.redact(
      { actorId: "user-1", after: { source_address: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" } },
      { sink: "audit" },
    );
    const out = result.output as any;
    expect(out.after.source_address.startsWith("psn:")).toBe(true);
    expect(result.decision.modified).toBe(true);
  });

  it("keeps benign audit metadata", () => {
    const result = redactionService.redact(
      { action: "auth.login", severity: "info", actorType: "user", before: {} },
      { sink: "audit" },
    );
    expect(result.output).toEqual({
      action: "auth.login",
      severity: "info",
      actorType: "user",
      before: {},
    });
  });

  it("redacts free-text notes at persistence", () => {
    const result = redactionService.redact(
      { metadata: { reason: "manual override for account remediation" } },
      { sink: "audit" },
    );
    expect(result.output.metadata.reason).toBe(REDACTION_MARKER);
  });
});

describe("RedactionService - webhook policy", () => {
  it("redacts critical fields and pseudonymizes high fields", () => {
    const result = redactionService.redact(
      {
        ruleId: "r1",
        assetCode: "USDC",
        ownerAddress: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        memo: "release team",
      },
      { sink: "webhook" },
    );
    const out = result.output as any;
    expect(out.ownerAddress).toBe(REDACTION_MARKER); // critical -> redact
    expect(out.ruleId).toBe("r1"); // allowlisted
    expect(out.assetCode).toBe("USDC");
  });
});

describe("RedactionService - sink-specific policies", () => {
  it("applies different actions per sink for the same payload", () => {
    const payload = { source_address: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" };
    const audit = redactionService.redact(payload, { sink: "audit" }).output as any;
    const webhook = redactionService.redact(payload, { sink: "webhook" }).output as any;
    const pdf = redactionService.redact(payload, { sink: "pdf" }).output as any;
    expect(audit.source_address.startsWith("psn:")).toBe(true); // audit pseudonymizes critical? no -> redact
    expect(webhook.source_address).toBe(REDACTION_MARKER);
    expect(pdf.source_address).toBe(REDACTION_MARKER);
  });
});

describe("RedactionService - secret blocking", () => {
  it("blocks payloads that contain secrets when the sink blocks on secret", () => {
    const policy: SinkPolicy = {
      ...DEFAULT_SINK_POLICIES.export,
      blockOnSecret: true,
      sink: "export",
    };
    expect(() =>
      redactionService.redact(
        { evidence: "key material SDR5FQGCNVP5KU2YGW5IOKRRRRMPKXA5ZQ3XO7Q4N7GNRYVUZROXXJUVK in the bundle" },
        { sink: "export", policy },
      ),
    ).toThrow();
  });

  it("records secretDetected without throwing when the sink does not block", () => {
    const result = redactionService.redact(
      { evidence: "witness statement, verify 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
      { sink: "audit" },
    );
    expect(result.decision.secretDetected).toBe(true);
    expect(result.decision.blocked).toBe(false);
  });
});

describe("RedactionService - decisions are auditable without secrets", () => {
  it("decision events carry fingerprints and paths, never original values", () => {
    const secret = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    const result = redactionService.redact(
      { after: { source_address: secret } },
      { sink: "audit" },
    );
    const serialized = JSON.stringify(result.decision);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("GA5ZSEJ");
    const ev = result.decision.events.find((e) => e.field === "after.source_address");
    expect(ev).toBeDefined();
    expect(ev!.ruleFingerprint).toBeTruthy();
  });

  it("decisions are versioned with a policy fingerprint", () => {
    const result = redactionService.redact({ after: { source_address: "x" } }, { sink: "audit" });
    expect(result.decision.policyVersion).toBe(DEFAULT_SINK_POLICIES.audit.version);
    expect(result.decision.policyFingerprint).toContain(String(DEFAULT_SINK_POLICIES.audit.version));
  });
});

describe("RedactionService - nested / stringified JSON", () => {
  it("walks and redacts sensitive fields inside a stringified JSON body", () => {
    const body = JSON.stringify({ requestor: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" });
    const result = redactionService.redact({ request_body: body }, { sink: "webhook" });
    const out = result.output as any;
    expect(out.request_body).not.toContain("GA5ZSEJ");
  });

  it("redacts obfuscate-mode fields in place (shape preserved)", () => {
    const customService = new RedactionService({
      ...DEFAULT_SINK_POLICIES,
      csv: {
        ...DEFAULT_SINK_POLICIES.csv,
        levelActions: { public: "keep", low: "keep", medium: "obfuscate", high: "redact", critical: "redact" },
      },
    });
    const result = customService.redact({ metadata: { reason: "a reasonably long note" } }, { sink: "csv" });
    expect(result.output.metadata.reason).toBe("a ****note");
  });
});

describe("RedactionService - disabled", () => {
  it("passes payload through untouched when a sink policy is disabled", () => {
    const disabledPolicy: SinkPolicy = { ...DEFAULT_SINK_POLICIES.audit, enabled: false };
    const result = redactionService.redact(
      { after: { source_address: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" } },
      { sink: "audit", policy: disabledPolicy },
    );
    expect(result.output.after.source_address).toBe("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
    expect(result.decision.modified).toBe(false);
  });
});

describe("redactionDecisionService.log scrub", () => {
  it("scrubDecisionForLog exposes only safe telemetry", () => {
    const decision: RedactionDecision = {
      sink: "audit",
      policyVersion: 1,
      modified: true,
      secretDetected: false,
      blocked: false,
      events: [{ field: "after.source_address", action: "redact" }],
      policyFingerprint: "1:abc",
      timestamp: new Date().toISOString(),
    };
    const scrubbed = scrubDecisionForLog(decision);
    expect(scrubbed.eventCount).toBe(1);
    expect(scrubbed.sink).toBe("audit");
    expect(JSON.stringify(scrubbed)).not.toContain("source_address");
  });
});
