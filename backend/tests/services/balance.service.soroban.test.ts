import { describe, it, expect, vi, beforeEach } from "vitest";
import { BalanceService, scaleTokenAmount } from "../../src/services/balance.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => vi.fn(),
}));

const getAccount = vi.fn();

vi.mock("../../src/services/stellar/horizon.client.js", () => ({
  HorizonClient: class {
    getAccount = getAccount;
  },
}));

const simulateCalls: Array<{ contractId: string; functionName: string; args?: unknown[] }> = [];
const simulateHandler = vi.fn();

vi.mock("../../src/services/stellar/soroban.client.js", () => ({
  SorobanRpcClient: class {
    async simulateInvocation<T>(request: { contractId: string; functionName: string; args?: unknown[] }) {
      simulateCalls.push(request);
      return { simulation: {}, returnValue: simulateHandler(request) as T };
    }
    async getLatestLedger() {
      return { sequence: 12345 };
    }
  },
}));

const CONTRACT_ID = "CACMC4GPCMRPRDH5BZVNWRVGVTTGRKXVDURPPKGV7CNNR3SOZKVRALIC";

function mockRegistryLookup(contractAddress: string | null) {
  const db: any = vi.fn().mockImplementation(() => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      join: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereNotNull: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(
        contractAddress ? { contractAddress } : undefined
      ),
    };
    return builder;
  });
  return builder;
}

describe("scaleTokenAmount", () => {
  it("scales raw SAC units by the token decimals", () => {
    expect(scaleTokenAmount(10_000_000n as unknown as number, 7)).toBe(1);
    expect(scaleTokenAmount(123_450_000n as unknown as number, 7)).toBe(12.345);
    expect(scaleTokenAmount(0, 7)).toBe(0);
    expect(scaleTokenAmount(Number.NaN, 7)).toBe(0);
  });
});

describe("BalanceService Soroban SAC balance querying", () => {
  let service: BalanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    simulateCalls.length = 0;
    service = new BalanceService();
    (service as unknown as { db: unknown }).db = vi.fn();
  });

  const baseRequest = {
    assetCode: "USDC",
    assetIssuer: "GA5XIGA5C7QTPTWXRD2EXF6YZ66LMCCDGMGA3B7KDLWLZHAZFMIFCDLI",
    addressLabel: "test custody",
    address: "GBTESTCUSTODY00000000000000000000000000000000000000000",
    chain: "stellar" as const,
    addressType: "custody" as const,
  };

  it("uses Horizon for classic trustline balances without touching Soroban", async () => {
    getAccount.mockResolvedValueOnce({
      balances: [{ asset: "USDC:GA5XIGA5C7QTPTWXRD2EXF6YZ66LMCCDGMGA3B7KDLWLZHAZFMIFCDLI", balance: "42.5" }],
      lastModifiedLedger: 100,
      subentryCount: 3,
    });

    const snapshot = await (service as unknown as { fetchBalanceSnapshot: (r: unknown) => Promise<unknown> }).fetchBalanceSnapshot(baseRequest);

    expect((snapshot as { balance: number }).balance).toBe(42.5);
    expect((snapshot as { metadata: { source: string } }).metadata.source).toBe("horizon");
    expect(simulateCalls).toEqual([]);
  });

  it("reads Soroban SAC balances via contract invocations when Horizon has no trustline", async () => {
    getAccount.mockResolvedValueOnce({
      balances: [],
      lastModifiedLedger: 100,
      subentryCount: 0,
    });

    // Asset registry resolves the SAC contract id
    (service as unknown as { db: unknown }).db = mockRegistryLookup(CONTRACT_ID);
    // balance() -> 15_000_000 raw (7 decimals) ; decimals() -> 7
    simulateHandler.mockImplementation((request: { functionName: string }) =>
      request.functionName === "decimals" ? 7 : 15_000_000
    );

    const snapshot = await (service as unknown as { fetchBalanceSnapshot: (r: unknown) => Promise<unknown> }).fetchBalanceSnapshot(baseRequest);

    expect(simulateCalls.map((call) => call.functionName)).toEqual(["balance", "decimals"]);
    expect(simulateCalls[0].contractId).toBe(CONTRACT_ID);
    expect(simulateCalls[0].args).toEqual([baseRequest.address]);
    expect((snapshot as { balance: number }).balance).toBe(1.5);
    expect((snapshot as { metadata: Record<string, unknown> }).metadata).toEqual({
      source: "soroban-rpc",
      contractId: CONTRACT_ID,
    });
  });

  it("falls back to a zero Horizon snapshot when no Soroban contract is registered", async () => {
    getAccount.mockResolvedValueOnce({
      balances: [],
      lastModifiedLedger: 100,
      subentryCount: 0,
    });

    (service as unknown as { db: unknown }).db = mockRegistryLookup(null);

    const snapshot = await (service as unknown as { fetchBalanceSnapshot: (r: unknown) => Promise<unknown> }).fetchBalanceSnapshot(baseRequest);

    expect((snapshot as { balance: number }).balance).toBe(0);
    expect((snapshot as { metadata: { source: string } }).metadata.source).toBe("horizon");
    expect(simulateCalls).toEqual([]);
  });

  it("prefers an explicit tokenAddress over the asset registry", async () => {
    getAccount.mockResolvedValueOnce({
      balances: [],
      lastModifiedLedger: 100,
      subentryCount: 0,
    });

    simulateHandler.mockImplementation((request: { functionName: string }) =>
      request.functionName === "decimals" ? 7 : 700_000_000
    );

    const explicitRequest = { ...baseRequest, tokenAddress: CONTRACT_ID };
    const snapshot = await (service as unknown as { fetchBalanceSnapshot: (r: unknown) => Promise<unknown> }).fetchBalanceSnapshot(explicitRequest);

    expect(simulateCalls[0].contractId).toBe(CONTRACT_ID);
    expect((snapshot as { balance: number }).balance).toBe(70);
  });
});
