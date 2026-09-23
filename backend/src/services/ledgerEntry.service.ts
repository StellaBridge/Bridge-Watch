import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { SorobanRpcClient, SorobanStateReadError } from "./stellar/soroban.client.js";

// =============================================================================
// TYPES
// =============================================================================

export interface LedgerEntryInspectRequest {
  keys: string[];
  ledgerSeq?: number;
}

export interface InspectedLedgerEntry {
  key: string;
  entryType: string;
  liveUntilLedgerSeq?: number;
  lastModifiedLedgerSeq?: number;
  entryXdrPreview: string;
}

export interface LedgerEntryInspectResult {
  ledgerSeq?: number;
  latestLedgerSeq?: number;
  entries: InspectedLedgerEntry[];
  notFoundKeys: string[];
}

export class LedgerEntryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerEntryValidationError";
  }
}

export class LedgerEntryUpstreamError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LedgerEntryUpstreamError";
  }
}

// =============================================================================
// SERVICE (#1200)
// =============================================================================

type RpcClientFactory = () => Pick<SorobanRpcClient, "getLedgerEntries" | "getLatestLedger">;

const MAX_KEYS = 100;
const XDR_PREVIEW_CHARS = 512;

function decodeLedgerKey(keyBase64: string): StellarSdk.xdr.LedgerKey {
  try {
    return StellarSdk.xdr.LedgerKey.fromXDR(keyBase64, "base64");
  } catch {
    throw new LedgerEntryValidationError(
      "Each key must be a base64-encoded XDR LedgerKey."
    );
  }
}

function entryTypeOf(key: StellarSdk.xdr.LedgerKey): string {
  try {
    return key.switch().name;
  } catch {
    return "unknown";
  }
}

export class LedgerEntryService {
  private static instance: LedgerEntryService;
  private readonly createClient: RpcClientFactory;

  constructor(createClient?: RpcClientFactory) {
    this.createClient =
      createClient ??
      (() =>
        new SorobanRpcClient({
          rpcUrls: [config.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org"],
        }));
  }

  public static getInstance(): LedgerEntryService {
    if (!LedgerEntryService.instance) {
      LedgerEntryService.instance = new LedgerEntryService();
    }
    return LedgerEntryService.instance;
  }

  /** For tests: build a service backed by a stub RPC client. */
  public static withClient(createClient: RpcClientFactory): LedgerEntryService {
    return new LedgerEntryService(createClient);
  }

  public validateRequest(request: LedgerEntryInspectRequest): StellarSdk.xdr.LedgerKey[] {
    if (!request || !Array.isArray(request.keys) || request.keys.length === 0) {
      throw new LedgerEntryValidationError("keys must be a non-empty array.");
    }
    if (request.keys.length > MAX_KEYS) {
      throw new LedgerEntryValidationError(`keys must contain at most ${MAX_KEYS} entries.`);
    }
    if (
      request.ledgerSeq !== undefined &&
      (!Number.isInteger(request.ledgerSeq) || request.ledgerSeq <= 0)
    ) {
      throw new LedgerEntryValidationError("ledgerSeq must be a positive integer.");
    }
    for (const key of request.keys) {
      if (typeof key !== "string" || key.length === 0 || key.length > 8192) {
        throw new LedgerEntryValidationError(
          "Each key must be a non-empty base64 XDR string."
        );
      }
    }
    return request.keys.map(decodeLedgerKey);
  }

  public async inspect(request: LedgerEntryInspectRequest): Promise<LedgerEntryInspectResult> {
    const decodedKeys = this.validateRequest(request);
    const client = this.createClient();

    let response: {
      entries?: Array<{
        key?: unknown;
        xdr?: unknown;
        liveUntilLedgerSeq?: unknown;
        lastModifiedLedgerSeq?: unknown;
      }>;
      latestLedger?: unknown;
    };
    try {
      response = (await client.getLedgerEntries(
        decodedKeys,
        request.ledgerSeq
      )) as typeof response;
    } catch (error) {
      logger.error(
        { keyCount: decodedKeys.length, ledgerSeq: request.ledgerSeq, error },
        "Ledger entry inspection upstream failure"
      );
      const message =
        error instanceof Error ? error.message : "Soroban RPC getLedgerEntries failed";
      throw new LedgerEntryUpstreamError(message, error);
    }

    const seen = new Set<string>();
    const entries: InspectedLedgerEntry[] = [];
    for (const entry of response.entries ?? []) {
      const rawKey = typeof entry.key === "string" ? entry.key : "";
      const rawXdr = typeof entry.xdr === "string" ? entry.xdr : "";
      const decoded = rawKey ? this.safeDecodeKey(rawKey) : null;
      entries.push({
        key: rawKey,
        entryType: decoded ? entryTypeOf(decoded) : "unknown",
        liveUntilLedgerSeq:
          typeof entry.liveUntilLedgerSeq === "number"
            ? entry.liveUntilLedgerSeq
            : undefined,
        lastModifiedLedgerSeq:
          typeof entry.lastModifiedLedgerSeq === "number"
            ? entry.lastModifiedLedgerSeq
            : undefined,
        entryXdrPreview: rawXdr.slice(0, XDR_PREVIEW_CHARS),
      });
      if (rawKey) seen.add(rawKey);
    }

    const notFoundKeys = request.keys.filter((k) => !seen.has(k));

    logger.info(
      {
        keyCount: request.keys.length,
        found: entries.length,
        notFound: notFoundKeys.length,
        ledgerSeq: request.ledgerSeq,
      },
      "Ledger entries inspected"
    );

    return {
      ...(request.ledgerSeq !== undefined && { ledgerSeq: request.ledgerSeq }),
      ...(typeof response.latestLedger === "number" && {
        latestLedgerSeq: response.latestLedger,
      }),
      entries,
      notFoundKeys,
    };
  }

  public async getLatestLedger(): Promise<unknown> {
    try {
      return await this.createClient().getLatestLedger();
    } catch (error) {
      if (error instanceof SorobanStateReadError) throw error;
      throw new LedgerEntryUpstreamError(
        error instanceof Error ? error.message : "Failed to fetch latest ledger",
        error
      );
    }
  }

  private safeDecodeKey(keyBase64: string): StellarSdk.xdr.LedgerKey | null {
    try {
      return StellarSdk.xdr.LedgerKey.fromXDR(keyBase64, "base64");
    } catch {
      return null;
    }
  }
}

export const ledgerEntryService = LedgerEntryService.getInstance();
