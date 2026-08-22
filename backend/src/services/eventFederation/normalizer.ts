/**
 * Per-chain event normalisation.
 *
 * Each `normalize*` function converts a chain-native payload into the
 * canonical FederatedEvent schema.  New chains should add a new function
 * here and wire it into the matching connector.
 */

import type { FederatedEvent, FederatedEventType } from "./types.js";
import { createTemporalPoint, isoToMs } from "../../temporal/temporalUtils.js";
import type { TemporalPoint } from "../../temporal/types.js";

// ─── Stellar ──────────────────────────────────────────────────────────────────

export interface RawStellarPayment {
  id: string;
  type: string;
  transaction_hash: string;
  created_at: string;
  from?: string;
  to?: string;
  asset_type?: string;
  asset_code?: string;
  amount?: string;
  source_amount?: string;
  paging_token?: string;
  /** Synthetic ledger sequence resolved by the connector */
  ledger_sequence?: number;
}

export function normalizeStellarPayment(raw: RawStellarPayment): FederatedEvent {
  const assetCode =
    raw.asset_type === "native" ? "XLM" : (raw.asset_code ?? undefined);

  const amount = raw.amount ?? raw.source_amount;

  const eventType: FederatedEventType =
    raw.type === "path_payment_strict_send" ||
    raw.type === "path_payment_strict_receive"
      ? "swap"
      : "payment";

  const timestampMs = isoToMs(raw.created_at);
  const temporal = createTemporalPoint(timestampMs, "stellar_ledger", {
    chain: "stellar",
    blockNumber: raw.ledger_sequence,
    rawTimestamp: raw.created_at,
  });

  return {
    id: `stellar:${eventType}:${raw.id}`,
    chain: "stellar",
    type: eventType,
    blockNumber: raw.ledger_sequence ?? 0,
    timestamp: raw.created_at,
    temporal,
    from: raw.from,
    to: raw.to,
    assetCode,
    amount,
    sourceId: raw.id,
    raw: raw as unknown as Record<string, unknown>,
  };
}

export interface RawStellarLedger {
  id: string;
  sequence: number;
  hash: string;
  closed_at: string;
  transaction_count: number;
  operation_count: number;
  base_fee_in_stroops?: number;
}

export function normalizeStellarLedger(raw: RawStellarLedger): FederatedEvent {
  const timestampMs = isoToMs(raw.closed_at);
  const temporal = createTemporalPoint(timestampMs, "stellar_ledger", {
    chain: "stellar",
    blockNumber: raw.sequence,
    rawTimestamp: raw.closed_at,
  });

  return {
    id: `stellar:ledger_close:${raw.sequence}`,
    chain: "stellar",
    type: "ledger_close",
    blockNumber: raw.sequence,
    timestamp: raw.closed_at,
    temporal,
    sourceId: String(raw.sequence),
    raw: raw as unknown as Record<string, unknown>,
  };
}

// ─── Ethereum (and EVM-compatible chains) ────────────────────────────────────

export interface RawEthBlock {
  chain: string;
  number: number;
  hash: string;
  timestamp: number;
  parentHash: string;
  transactionCount: number;
}

export function normalizeEthBlock(raw: RawEthBlock): FederatedEvent {
  const timestampMs = raw.timestamp * 1000;
  const temporal = createTemporalPoint(timestampMs, "evm_block", {
    chain: raw.chain,
    blockNumber: raw.number,
    rawTimestamp: new Date(raw.timestamp * 1000).toISOString(),
  });

  return {
    id: `${raw.chain}:block:${raw.number}`,
    chain: raw.chain,
    type: "block",
    blockNumber: raw.number,
    timestamp: new Date(raw.timestamp * 1000).toISOString(),
    temporal,
    sourceId: raw.hash,
    raw: raw as unknown as Record<string, unknown>,
  };
}

export interface RawEthTransfer {
  chain: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: number;
  from: string;
  to: string;
  assetCode?: string;
  tokenAddress?: string;
  amount: string;
  eventName: string;
}

export function normalizeEthTransfer(raw: RawEthTransfer): FederatedEvent {
  const eventType: FederatedEventType =
    raw.eventName === "Lock" || raw.eventName === "Locked"
      ? "bridge_lock"
      : raw.eventName === "Release" || raw.eventName === "Released"
        ? "bridge_release"
        : raw.eventName === "Swap"
          ? "swap"
          : "transfer";

  const timestampMs = raw.timestamp * 1000;
  const temporal = createTemporalPoint(timestampMs, "evm_block", {
    chain: raw.chain,
    blockNumber: raw.blockNumber,
    rawTimestamp: new Date(raw.timestamp * 1000).toISOString(),
  });

  return {
    id: `${raw.chain}:${eventType}:${raw.transactionHash}:${raw.logIndex}`,
    chain: raw.chain,
    type: eventType,
    blockNumber: raw.blockNumber,
    timestamp: new Date(raw.timestamp * 1000).toISOString(),
    temporal,
    from: raw.from,
    to: raw.to,
    assetCode: raw.assetCode,
    amount: raw.amount,
    sourceId: `${raw.transactionHash}:${raw.logIndex}`,
    raw: raw as unknown as Record<string, unknown>,
  };
}
