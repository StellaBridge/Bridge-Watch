import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export interface CircuitBreakerConfig {
  contractId: string;
  network: string;
  SOROBAN_RPC_URL?: string;
}

export enum PauseLevel {
  None = 0,
  Warning = 1,
  Partial = 2,
  Full = 3,
}

export enum PauseScope {
  Global = 0,
  Bridge = 1,
  Asset = 2,
}

export interface PauseState {
  scope: PauseScope;
  level: PauseLevel;
  triggeredBy: string;
  triggerReason: string;
  timestamp: number;
  recoveryDeadline: number;
  guardianApprovals: number;
  guardianThreshold: number;
}

class CircuitBreakerService {
  private server: StellarSdk.SorobanRpc.Server;
  private networkPassphrase: string;
  private contractId: string;

  constructor(config: CircuitBreakerConfig) {
    this.contractId = config.contractId;
    const rpcUrl = config.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
    this.server = new StellarSdk.SorobanRpc.Server(rpcUrl, {
      allowHttp: config.network === "development",
    });
    this.networkPassphrase = config.network === "mainnet"
      ? StellarSdk.Networks.PUBLIC
      : StellarSdk.Networks.TESTNET;
  }

  /**
   * Check if operations are paused for a given scope
   */
  async isPaused(scope: PauseScope, identifier?: string): Promise<boolean> {
    try {
      const contract = new StellarSdk.Contract(this.contractId);

      let scopeScVal: StellarSdk.xdr.ScVal;
      switch (scope) {
        case PauseScope.Global:
          scopeScVal = StellarSdk.xdr.ScVal.scvVec([
            StellarSdk.xdr.ScVal.scvU32(PauseScope.Global),
          ]);
          break;
        case PauseScope.Bridge:
          if (!identifier) throw new Error("Bridge ID required for bridge scope");
          scopeScVal = StellarSdk.xdr.ScVal.scvVec([
            StellarSdk.xdr.ScVal.scvU32(PauseScope.Bridge),
            StellarSdk.xdr.ScVal.scvString(identifier),
          ]);
          break;
        case PauseScope.Asset:
          if (!identifier) throw new Error("Asset code required for asset scope");
          scopeScVal = StellarSdk.xdr.ScVal.scvVec([
            StellarSdk.xdr.ScVal.scvU32(PauseScope.Asset),
            StellarSdk.xdr.ScVal.scvString(identifier),
          ]);
          break;
      }

      const tx = new StellarSdk.TransactionBuilder(
        await this.server.getAccount(StellarSdk.Keypair.random().publicKey()),
        {
          fee: "100",
          networkPassphrase: this.networkPassphrase,
        }
      )
        .addOperation(contract.call("is_paused", scopeScVal))
        .setTimeout(30)
        .build();

      const result = await this.server.simulateTransaction(tx);
      if ((result as any).result) {
        return StellarSdk.xdr.ScVal.fromXDR((result as any).result.retval, 'base64').value() === 1;
      }
      return false;
    } catch (error) {
      logger.error({ error }, "Circuit breaker check failed");
      // In case of error, assume not paused to avoid blocking operations
      return false;
    }
  }

  /**
   * Check if an address is whitelisted
   */
  async isWhitelistedAddress(address: string): Promise<boolean> {
    try {
      const contract = new StellarSdk.Contract(this.contractId);
      const addressScVal = StellarSdk.xdr.ScVal.scvAddress(
        new StellarSdk.Address(address).toScAddress()
      );

      const tx = new StellarSdk.TransactionBuilder(
        await this.server.getAccount(StellarSdk.Keypair.random().publicKey()),
        {
          fee: "100",
          networkPassphrase: this.networkPassphrase,
        }
      )
        .addOperation(contract.call("is_whitelisted_address", addressScVal))
        .setTimeout(30)
        .build();

      const result = await this.server.simulateTransaction(tx);
      if ((result as any).result) {
        return StellarSdk.xdr.ScVal.fromXDR((result as any).result.retval, 'base64').value() === 1;
      }
      return false;
    } catch (error) {
      logger.error({ error }, "Whitelist check failed");
      return false;
    }
  }

  /**
   * Check if an asset is whitelisted
   */
  async isWhitelistedAsset(assetCode: string): Promise<boolean> {
    try {
      const contract = new StellarSdk.Contract(this.contractId);
      const assetScVal = StellarSdk.xdr.ScVal.scvString(assetCode);

      const tx = new StellarSdk.TransactionBuilder(
        await this.server.getAccount(StellarSdk.Keypair.random().publicKey()),
        {
          fee: "100",
          networkPassphrase: this.networkPassphrase,
        }
      )
        .addOperation(contract.call("is_whitelisted_asset", assetScVal))
        .setTimeout(30)
        .build();

      const result = await this.server.simulateTransaction(tx);
      if ((result as any).result) {
        return StellarSdk.xdr.ScVal.fromXDR((result as any).result.retval, 'base64').value() === 1;
      }
      return false;
    } catch (error) {
      logger.error({ error }, "Asset whitelist check failed");
      return false;
    }
  }

  /**
   * Trigger a pause (guardian operation)
   */
  async triggerPause(
    signer: StellarSdk.Keypair,
    scope: PauseScope,
    identifier: string | undefined,
    reason: string
  ): Promise<void> {
    // Contract instance creation for potential future use or verification
    new StellarSdk.Contract(this.contractId);

    let operation: StellarSdk.xdr.Operation;
    switch (scope) {
      case PauseScope.Global:
        operation = StellarSdk.Operation.invokeContractFunction({
          contract: this.contractId,
          function: "pause_global",
          args: [
            StellarSdk.xdr.ScVal.scvAddress(new StellarSdk.Address(signer.publicKey()).toScAddress()),
            StellarSdk.xdr.ScVal.scvString(reason),
          ],
        });
        break;
      case PauseScope.Bridge:
        if (!identifier) throw new Error("Bridge ID required");
        operation = StellarSdk.Operation.invokeContractFunction({
          contract: this.contractId,
          function: "pause_bridge",
          args: [
            StellarSdk.xdr.ScVal.scvAddress(new StellarSdk.Address(signer.publicKey()).toScAddress()),
            StellarSdk.xdr.ScVal.scvString(identifier),
            StellarSdk.xdr.ScVal.scvString(reason),
          ],
        });
        break;
      case PauseScope.Asset:
        if (!identifier) throw new Error("Asset code required");
        operation = StellarSdk.Operation.invokeContractFunction({
          contract: this.contractId,
          function: "pause_asset",
          args: [
            StellarSdk.xdr.ScVal.scvAddress(new StellarSdk.Address(signer.publicKey()).toScAddress()),
            StellarSdk.xdr.ScVal.scvString(identifier),
            StellarSdk.xdr.ScVal.scvString(reason),
          ],
        });
        break;
    }

    const account = await this.server.getAccount(signer.publicKey());
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "1000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    tx.sign(signer);
    await this.server.sendTransaction(tx);
  }

  /**
   * Request recovery from pause
   */
  async requestRecovery(signer: StellarSdk.Keypair, pauseId: number): Promise<void> {
    // Contract instance creation for potential future use or verification
    new StellarSdk.Contract(this.contractId);

    const operation = StellarSdk.Operation.invokeContractFunction({
      contract: this.contractId,
      function: "request_recovery",
      args: [
        StellarSdk.xdr.ScVal.scvAddress(new StellarSdk.Address(signer.publicKey()).toScAddress()),
        StellarSdk.xdr.ScVal.scvU32(pauseId),
      ],
    });

    const account = await this.server.getAccount(signer.publicKey());
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "1000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    tx.sign(signer);
    await this.server.sendTransaction(tx);
  }
}

let circuitBreakerService: CircuitBreakerService | null = null;

export function getCircuitBreakerService(): CircuitBreakerService | null {
  if (!circuitBreakerService && config.CIRCUIT_BREAKER_CONTRACT_ID) {
    circuitBreakerService = new CircuitBreakerService({
      contractId: config.CIRCUIT_BREAKER_CONTRACT_ID,
      network: config.STELLAR_NETWORK,
      SOROBAN_RPC_URL: config.SOROBAN_RPC_URL,
    });
  }
  return circuitBreakerService;
}

export { CircuitBreakerService };