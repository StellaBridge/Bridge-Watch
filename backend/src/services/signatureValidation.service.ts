/**
 * Cryptographic signature validation for federated event payloads.
 *
 * Supports Ed25519 (nacl-style) and ECDSA (secp256k1/p256) algorithms.
 * The payload is canonicalised as JSON before verification to ensure
 * deterministic serialisation across producers.
 */

import { createPublicKey, createVerify } from "crypto";
import type { SourceKeyAlgorithm } from "../database/types.js";

export interface SignedPayload {
  /** Canonical JSON of the event payload (what was signed). */
  payload: string;
  /** Hex-encoded signature. */
  signature: string;
  /** ISO-8601 timestamp of when the signature was created. */
  signedAt: string;
  /** Name of the source that signed the payload. */
  sourceName: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  /** Age of the signature in milliseconds (now - signedAt). */
  ageMs?: number;
}

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

function canonicalisePayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function verifyEd25519(publicKeyPem: string, data: string, signatureHex: string): boolean {
  try {
    const keyObj = createPublicKey(publicKeyPem);
    const verifier = createVerify("sha512");
    verifier.update(data);
    return verifier.verify(keyObj, hexToBuffer(signatureHex));
  } catch {
    return false;
  }
}

function verifyEcdsa(
  publicKeyPem: string,
  data: string,
  signatureHex: string,
  algorithm: "sha256" | "sha384" | "sha512",
): boolean {
  try {
    const keyObj = createPublicKey(publicKeyPem);
    const verifier = createVerify(algorithm);
    verifier.update(data);
    return verifier.verify(keyObj, hexToBuffer(signatureHex));
  } catch {
    return false;
  }
}

function getHashAlgorithm(algorithm: SourceKeyAlgorithm): "sha256" | "sha384" | "sha512" {
  switch (algorithm) {
    case "secp256k1":
      return "sha256";
    case "p256":
      return "sha256";
    case "ed25519":
      return "sha512";
    default:
      return "sha256";
  }
}

function validateTimestampAge(signedAt: string): ValidationResult {
  const signedTime = new Date(signedAt).getTime();
  if (Number.isNaN(signedTime)) {
    return { valid: false, error: "Invalid signedAt timestamp" };
  }

  const ageMs = Date.now() - signedTime;

  if (ageMs < 0) {
    return { valid: false, error: "Signature timestamp is in the future", ageMs };
  }

  if (ageMs > MAX_TIMESTAMP_AGE_MS) {
    return {
      valid: false,
      error: `Signature expired: age ${ageMs}ms exceeds max ${MAX_TIMESTAMP_AGE_MS}ms`,
      ageMs,
    };
  }

  return { valid: true, ageMs };
}

export function validateSignature(
  publicKeyPem: string,
  payload: Record<string, unknown>,
  signatureHex: string,
  algorithm: SourceKeyAlgorithm,
): boolean {
  const canonical = canonicalisePayload(payload);

  switch (algorithm) {
    case "ed25519":
      return verifyEd25519(publicKeyPem, canonical, signatureHex);
    case "secp256k1":
    case "p256":
      return verifyEcdsa(publicKeyPem, canonical, signatureHex, getHashAlgorithm(algorithm));
    default:
      return false;
  }
}

export function validateSignedPayload(
  signedPayload: SignedPayload,
  publicKeyPem: string,
  algorithm: SourceKeyAlgorithm,
): ValidationResult {
  const timestampResult = validateTimestampAge(signedPayload.signedAt);
  if (!timestampResult.valid) {
    return timestampResult;
  }

  let payloadObj: Record<string, unknown>;
  try {
    payloadObj = JSON.parse(signedPayload.payload) as Record<string, unknown>;
  } catch {
    return { valid: false, error: "Invalid payload JSON", ageMs: timestampResult.ageMs };
  }

  const signatureValid = validateSignature(
    publicKeyPem,
    payloadObj,
    signedPayload.signature,
    algorithm,
  );

  if (!signatureValid) {
    return { valid: false, error: "Signature verification failed", ageMs: timestampResult.ageMs };
  }

  return { valid: true, ageMs: timestampResult.ageMs };
}

export function canonicalise(payload: Record<string, unknown>): string {
  return canonicalisePayload(payload);
}
