import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { WebsocketService } from "./websocket.js";
import type {
  BridgeTransaction,
  BridgeTransactionSummary,
  BridgeTransactionStatus,
  NewBridgeTransaction,
} from "../database/types.js";

export class BridgeTransactionService {
  private readonly websocket = WebsocketService.getInstance();

  async createTransaction(payload: NewBridgeTransaction): Promise<BridgeTransaction> {
    logger.info({ payload }, "Creating bridge transaction record");
    const db = getDatabase();
    const [record] = await db("bridge_transactions")
      .insert({
        ...payload,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    const transaction = this.normalizeRecord(record);
    this.websocket.publish("transaction_update", `bridge.${transaction.bridge_name}`, {
      event: "created",
      transaction,
    }, { priority: "high" });

    return transaction;
  }

  async getTransactionsForBridge(
    bridgeName: string,
    status?: BridgeTransactionStatus,
  ): Promise<BridgeTransaction[]> {
    const db = getDatabase();
    const query = db("bridge_transactions").select("*").where("bridge_name", bridgeName);

    if (status) {
      query.andWhere("status", status);
    }

    const rows = await query.orderBy("submitted_at", "desc");
    return rows.map(this.normalizeRecord);
  }

  async getTransactionByHash(
    bridgeName: string,
    txHash: string,
  ): Promise<BridgeTransaction | null> {
    const db = getDatabase();
    const row = await db("bridge_transactions")
      .select("*")
      .where({ bridge_name: bridgeName, tx_hash: txHash })
      .first();

    return row ? this.normalizeRecord(row) : null;
  }

  async updateTransactionStatus(
    bridgeName: string,
    txHash: string,
    status: BridgeTransactionStatus,
    errorMessage?: string,
  ): Promise<BridgeTransaction | null> {
    const db = getDatabase();
    const update: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };

    if (status === "confirmed") {
      update.confirmed_at = new Date();
    }

    if (status === "failed") {
      update.failed_at = new Date();
      if (errorMessage) {
        update.error_message = errorMessage;
      }
    }

    await db("bridge_transactions")
      .where({ bridge_name: bridgeName, tx_hash: txHash })
      .update(update);

    const transaction = await this.getTransactionByHash(bridgeName, txHash);
    if (transaction) {
      this.websocket.publish("transaction_update", `bridge.${bridgeName}`, {
        event: "updated",
        transaction,
      }, { priority: "high" });
    }

    return transaction;
  }

  async getBridgeTransactionSummary(bridgeName: string): Promise<BridgeTransactionSummary> {
    const db = getDatabase();

    const [counts, timing] = await Promise.all([
      db("bridge_transactions")
        .where({ bridge_name: bridgeName })
        .countDistinct("id as total_transactions")
        .sum("amount::numeric as total_volume")
        .first(),
      db("bridge_transactions")
        .where({ bridge_name: bridgeName, status: "confirmed" })
        .select(db.raw("AVG(EXTRACT(EPOCH FROM (confirmed_at - submitted_at))) as avg"))
        .first() as unknown as Promise<{ avg: string | null } | undefined>,
    ]);

    return {
      bridgeName,
      totalTransactions: Number(counts?.total_transactions || 0),
      totalVolume: counts?.total_volume ? String(counts.total_volume) : "0",
      averageConfirmationTimeSeconds: Number((timing as any)?.avg || 0),
      pendingTransactions: Number(
        await db("bridge_transactions").where({ bridge_name: bridgeName, status: "pending" }).count("id as count").first().then((row: any) => Number(row?.count || 0)),
      ),
      failedTransactions: Number(
        await db("bridge_transactions").where({ bridge_name: bridgeName, status: "failed" }).count("id as count").first().then((row: any) => Number(row?.count || 0)),
      ),
      confirmedTransactions: Number(
        await db("bridge_transactions").where({ bridge_name: bridgeName, status: "confirmed" }).count("id as count").first().then((row: any) => Number(row?.count || 0)),
      ),
    };
  }

  private normalizeRecord(record: any): BridgeTransaction {
    return {
      id: record.id,
      bridge_name: record.bridge_name,
      symbol: record.symbol,
      transaction_type: record.transaction_type,
      status: record.status,
      correlation_id: record.correlation_id,
      tx_hash: record.tx_hash,
      source_chain: record.source_chain,
      source_address: record.source_address,
      destination_address: record.destination_address,
      amount: record.amount,
      fee: record.fee,
      submitted_at: record.submitted_at,
      confirmed_at: record.confirmed_at,
      failed_at: record.failed_at,
      error_message: record.error_message,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}
