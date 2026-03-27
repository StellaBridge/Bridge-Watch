/**
 * Thin compatibility shim over EthereumRpcClient.
 * Existing callers (bridge.service.ts, reserveVerification.service.ts) continue
 * to work unchanged while new code uses EthereumRpcClient directly.
 */
import { ethers } from "ethers";
import { config } from "../config/index.js";
import { logger } from "./logger.js";
import { getEthereumRpcClient } from "../services/ethereum/client.js";

export class EthereumClientError extends Error {
  constructor(message: string, public readonly originalError: unknown) {
    super(message);
    this.name = "EthereumClientError";
  }
}

/** @deprecated Use getEthereumRpcClient() directly */
export function getEthereumProvider(): ethers.Provider | null {
  if (!config.ETHEREUM_RPC_URL && !config.ETHEREUM_RPC_WS_URL) {
    logger.warn("No Ethereum RPC URL configured; Ethereum queries disabled");
    return null;
  }
  if (config.RPC_PROVIDER_TYPE === "ws" && config.ETHEREUM_RPC_WS_URL) {
    return new ethers.WebSocketProvider(config.ETHEREUM_RPC_WS_URL);
  }
  return new ethers.JsonRpcProvider(config.ETHEREUM_RPC_URL!);
}

export async function getEthereumTokenSupply(tokenAddress: string): Promise<number> {
  try {
    const client = getEthereumRpcClient();
    const info = await client.getTokenInfo("ethereum", tokenAddress);
    return parseFloat(ethers.formatUnits(info.totalSupply, info.decimals));
  } catch (error) {
    logger.error({ error, tokenAddress }, "Failed to fetch Ethereum token supply");
    throw new EthereumClientError("Failed to fetch token supply", error);
  }
}

export async function getEthereumTokenBalance(
  tokenAddress: string,
  holderAddress: string
): Promise<number> {
  try {
    const client = getEthereumRpcClient();
    const bal = await client.getTokenBalance("ethereum", tokenAddress, holderAddress);
    return parseFloat(bal.formatted);
  } catch (error) {
    logger.error({ error, tokenAddress, holderAddress }, "Failed to fetch Ethereum token balance");
    throw new EthereumClientError("Failed to fetch token balance", error);
  }
}
