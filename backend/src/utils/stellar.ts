import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../config/index.js";
import { logger } from "./logger.js";

const horizonUrl = config.STELLAR_HORIZON_URL;

export class HorizonTimeoutError extends Error {
  constructor(message = "Horizon API request timed out") {
    super(message);
    this.name = "HorizonTimeoutError";
  }
}

export class HorizonClientError extends Error {
  constructor(message: string, public readonly originalError: unknown) {
    super(message);
    this.name = "HorizonClientError";
  }
}

/**
 * Executes a Horizon API call with a configured timeout.
 * @template T - The type of the expected result
 * @param {Promise<T>} promise - The Horizon API call promise
 * @returns {Promise<T>} The result of the API call if it resolves before the timeout
 * @throws {HorizonTimeoutError} If the request exceeds the configured timeout duration
 * @throws {HorizonClientError} If another client-side or connectivity error occurs
 */
export async function withHorizonTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new HorizonTimeoutError(`Horizon API request exceeded ${config.HORIZON_TIMEOUT_MS}ms`));
    }, config.HORIZON_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } catch (error) {
    if (error instanceof HorizonTimeoutError) {
      throw error;
    }
    logger.error({ error }, "Horizon client connectivity error");
    throw new HorizonClientError((error as Error).message || "Failed to connect to Horizon API", error);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Get a configured Horizon server instance
 */
export function getHorizonServer(): StellarSdk.Horizon.Server {
  return new StellarSdk.Horizon.Server(horizonUrl);
}

/**
 * Fetch the total supply of an asset on Stellar
 */
export async function getStellarAssetSupply(
  assetCode: string,
  issuer: string
): Promise<number> {
  const server = getHorizonServer();

  try {
    const accounts = await withHorizonTimeout<{ records: Array<{ amount: string }> }>(
      server.assets().forCode(assetCode).forIssuer(issuer).call()
    );

    if (accounts.records.length > 0) {
      return parseFloat(accounts.records[0].amount);
    }
    return 0;
  } catch (error) {
    logger.error({ error, assetCode, issuer }, "Failed to fetch Stellar asset supply");
    throw error;
  }
}

/**
 * Fetch SDEX order book for an asset pair
 */
export async function getOrderBook(
  baseCode: string,
  baseIssuer: string,
  counterCode: string,
  counterIssuer: string | null
): Promise<StellarSdk.Horizon.ServerApi.OrderbookRecord> {
  const server = getHorizonServer();

  const base = (baseCode === "XLM" || baseIssuer === "native")
    ? StellarSdk.Asset.native()
    : new StellarSdk.Asset(baseCode, baseIssuer);
  const counter = counterIssuer && counterCode !== "XLM"
    ? new StellarSdk.Asset(counterCode, counterIssuer)
    : StellarSdk.Asset.native();

  return withHorizonTimeout(server.orderbook(base, counter).call());
}

/**
 * Fetch liquidity pools for a reserve asset pair.
 * @param {StellarSdk.Asset} assetA - The first asset in the liquidity pool
 * @param {StellarSdk.Asset} assetB - The second asset in the liquidity pool
 * @returns {Promise<StellarSdk.Horizon.ServerApi.CollectionPage<StellarSdk.Horizon.ServerApi.LiquidityPoolRecord>>} A page of liquidity pool records mapping to the requested pair
 */
export async function getLiquidityPools(
  assetA: StellarSdk.Asset,
  assetB: StellarSdk.Asset
): Promise<StellarSdk.Horizon.ServerApi.CollectionPage<StellarSdk.Horizon.ServerApi.LiquidityPoolRecord>> {
  const server = getHorizonServer();
  return withHorizonTimeout(
    (server.liquidityPools() as unknown as { forReserves: (a: StellarSdk.Asset, b: StellarSdk.Asset) => { call: () => Promise<StellarSdk.Horizon.ServerApi.CollectionPage<StellarSdk.Horizon.ServerApi.LiquidityPoolRecord>> } }).forReserves(assetA, assetB).call()
  );
}

/**
 * Stream ledger effects for real-time monitoring
 */
export function streamPayments(
  onPayment: (payment: StellarSdk.Horizon.ServerApi.PaymentOperationRecord) => void
): () => void {
  const server = getHorizonServer();

  const closeStream = server
    .payments()
    .cursor("now")
    .stream({
      onmessage: (payment: unknown) => {
        onPayment(payment as StellarSdk.Horizon.ServerApi.PaymentOperationRecord);
      },
    });

  return closeStream;
}
