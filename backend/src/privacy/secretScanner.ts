/**
 * Secret detection for the redaction pipeline.
 *
 * Scans string values (including values that are stringified JSON) for
 * high-confidence secret patterns: private keys, seed phrases, bearer /
 * JWT tokens, API keys, and identity credentials. Detection is intentionally
 * conservative to avoid blocking benign operational data; only well-formed
 * patterns that match real secret formats are flagged.
 */

export interface SecretMatch {
  /** Which secret pattern matched. */
  type: string;
  /** Human readable description of the matched pattern. */
  description: string;
  /** Field path where the secret was found, when scanning structured data. */
  path?: string;
}

export interface SecretPattern {
  type: string;
  description: string;
  regex: RegExp;
}

const ED25519_SECRET = /S[A-Z2-7]{54,56}/;
const EVM_PRIVATE_KEY = /0x[0-9a-fA-F]{64}/;
const BITCOIN_WIF = /5[HJK][1-9A-HJ-NP-Za-km-z]{49,51}/;
const STELLAR_MNEMONIC = /\b([a-z]+(?: [a-z]+){11,23})\b/;
const JW_TOKEN = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]{20,}/i;
const GENERIC_KEY = /(?:api[_-]?key|secret|private[_-]?key|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{16,}["']?/i;
const AWS_ACCESS_KEY = /AKIA[0-9A-Z]{16}/;
const GITHUB_TOKEN = /gh[pousr]_[A-Za-z0-9_]{30,}/;
const STELLAR_SECRET_ISSUER = /G[A-Z2-7]{55}/;

export const DEFAULT_SECRET_PATTERNS: SecretPattern[] = [
  { type: "stellar_secret", description: "Stellar ed25519 secret key (S...)", regex: ED25519_SECRET },
  { type: "evm_private_key", description: "EVM private key (0x + 64 hex)", regex: EVM_PRIVATE_KEY },
  { type: "bitcoin_wif", description: "Bitcoin WIF private key", regex: BITCOIN_WIF },
  { type: "bip39_mnemonic", description: "BIP-39 seed phrase (12-24 words)", regex: STELLAR_MNEMONIC },
  { type: "jwt", description: "JWT / bearer token", regex: JW_TOKEN },
  { type: "bearer_token", description: "Bearer credential", regex: BEARER },
  { type: "named_secret", description: "Named api key / secret / token assignment", regex: GENERIC_KEY },
  { type: "aws_access_key", description: "AWS access key id", regex: AWS_ACCESS_KEY },
  { type: "github_token", description: "GitHub token", regex: GITHUB_TOKEN },
  { type: "stellar_issuer", description: "Stellar public issuer address (G...)", regex: STELLAR_SECRET_ISSUER },
];

/**
 * Detect whether a string contains one or more secrets. Returns a list of
 * matches; an empty list means no secret was found.
 */
export function scanString(value: string, patterns: SecretPattern[] = DEFAULT_SECRET_PATTERNS): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(value)) {
      matches.push({ type: pattern.type, description: pattern.description });
    }
    pattern.regex.lastIndex = 0;
  }
  return matches;
}

function isSensitiveString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Recursively scan a structured value for secrets. The optional `path`
 * tracks the current field path for reporting.
 */
export function scanValue(value: unknown, path = "$", patterns: SecretPattern[] = DEFAULT_SECRET_PATTERNS): SecretMatch[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    return scanString(value, patterns).map((m) => (path === "$" ? m : { ...m, path }));
  }
  if (typeof value === "object") {
    const results: SecretMatch[] = [];
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        results.push(...scanValue(item, `${path}[${idx}]`, patterns));
      });
      return results;
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      results.push(...scanValue(item, `${path}.${key}`, patterns));
    }
    return results;
  }
  return [];
}
