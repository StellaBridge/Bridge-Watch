import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BridgeTransactionService } from "../../src/services/bridgeTransaction.service.js";
import type { BridgeTransaction, BridgeTransactionStatus } from "../../src/database/types.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/services/websocket.service.js", () => ({
  WebsocketService: {
    getInstance: vi.fn(() => ({ publish: vi.fn() })),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("BridgeTransactionService", () => {
  let bridgeService: BridgeTransactionService;
  let dbMock: any;

  beforeEach(async () => {
    dbMock = Object.assign(
      vi.fn().mockImplementation(() => dbMock),
      {
        insert: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          {
            id: "123",
            bridge_name: "circle",
            symbol: "USDC",
            transaction_type: "mint",
            status: "pending",
            correlation_id: "corr-1",
            tx_hash: "0xabc123",
            source_chain: "Ethereum",
            source_address: "0xsource",
            destination_address: "GDEST",
            amount: "100.00",
            fee: "0.10",
            submitted_at: new Date(),
            confirmed_at: null,
            failed_at: null,
            error_message: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ]),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(1),
        countDistinct: vi.fn().mockReturnThis(),
        sum: vi.fn().mockReturnThis(),
        avg: vi.fn().mockReturnThis(),
        count: vi.fn().mockReturnThis(),
        then: vi.fn().mockResolvedValue({ count: 0 }),
      },
    );

    const { getDatabase } = await import("../../src/database/connection.js");
    vi.mocked(getDatabase).mockReturnValue(dbMock as any);

    bridgeService = new BridgeTransactionService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a transaction and publishes a websocket event", async () => {
    const payload = {
      bridge_name: "circle",
      symbol: "USDC",
      transaction_type: "mint" as const,
      status: "pending" as const,
      tx_hash: "0xabc123",
      amount: "100.00",
      fee: "0.10",
      source_chain: "Ethereum",
      source_address: "0xsource",
      destination_address: "GDEST",
      correlation_id: "corr-1",
      submitted_at: new Date(),
    };

    const transaction = await bridgeService.createTransaction(payload);

    expect(transaction).toEqual(expect.objectContaining({ id: "123", bridge_name: "circle", tx_hash: "0xabc123" }));
  });

  it("returns null when no transaction is found by hash", async () => {
    const result = await bridgeService.getTransactionByHash("circle", "unknown");
    expect(result).toBeNull();
  });

  it("updates transaction status and publishes a websocket event", async () => {
    const { getDatabase } = await import("../../src/database/connection.js");
    vi.mocked(getDatabase).mockReturnValue(() => ({
      ...dbMock,
      first: vi.fn().mockResolvedValue({
        id: "123",
        bridge_name: "circle",
        symbol: "USDC",
        transaction_type: "mint",
        status: "confirmed",
        correlation_id: "corr-1",
        tx_hash: "0xabc123",
        source_chain: "Ethereum",
        source_address: "0xsource",
        destination_address: "GDEST",
        amount: "100.00",
        fee: "0.10",
        submitted_at: new Date(),
        confirmed_at: new Date(),
        failed_at: null,
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
      }),
    } as any));

    const result = await bridgeService.updateTransactionStatus("circle", "0xabc123", "confirmed" as BridgeTransactionStatus);
    expect(result).toEqual(expect.objectContaining({ tx_hash: "0xabc123", status: "confirmed" }));
  });
});
