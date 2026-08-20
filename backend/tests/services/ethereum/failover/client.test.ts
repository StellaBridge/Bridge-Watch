import { describe, it, expect, vi, afterEach } from "vitest";
import { ethers } from "ethers";
import { EthereumRpcClient } from "../../../../src/services/ethereum/client.js";

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();

  const makeContract = () => ({
    lockedAmount: vi.fn(async () => 1000n),
    isPaused: vi.fn(async () => false),
    decimals: vi.fn(async () => 6),
    symbol: vi.fn(async () => "USDC"),
    totalSupply: vi.fn(async () => 1_000_000n),
    balanceOf: vi.fn(async () => 500n),
    queryFilter: vi.fn(async () => []),
    interface: { parseLog: vi.fn(() => null) },
    filters: {},
  });

  const contractMock = vi.fn().mockImplementation(() => makeContract());
  const ethersNamespace = { ...actual.ethers, Contract: contractMock };

  return {
    ...actual,
    ethers: ethersNamespace,
    Contract: contractMock,
    default: ethersNamespace,
  };
});

type FakeProvider = Record<string, any>;

function makeProvider(overrides: Record<string, unknown> = {}): FakeProvider {
  return {
    getBlockNumber: vi.fn(async () => 100),
    getBlock: vi.fn(async () => ({ timestamp: 123 })),
    destroy: vi.fn(async () => undefined),
    ...overrides,
  };
}

function buildClient(
  providerImpls: Array<Record<string, unknown>>,
  opts: Record<string, unknown> = {}
): { client: EthereumRpcClient; providers: FakeProvider[] } {
  const providers: FakeProvider[] = [];
  const client = new EthereumRpcClient(
    [
      {
        chainId: "ethereum",
        name: "Ethereum Mainnet",
        rpcUrls: providerImpls.map((_, i) => `http://provider-${i}.local`),
        blockTime: 12,
        rateLimit: 1000,
      },
    ],
    { maxRetries: 0, requestTimeoutMs: 1000, failover: { enableHedging: false }, ...opts },
    {
      createProvider: () => {
        const next = makeProvider();
        providers.push(next);
        return next as any;
      },
    }
  );
  // Wire the per-URL behavior onto the injected providers.
  providerImpls.forEach((impl, index) => Object.assign(providers[index], impl));
  return { client, providers };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("EthereumRpcClient", () => {
  it("fetches the latest block number and advances the accepted head", async () => {
    const { client } = buildClient([{ getBlockNumber: vi.fn(async () => 12345) }]);

    const height = await client.getBlockNumber("ethereum");

    expect(height).toBe(12345);
    expect(client.getLastKnownBlock("ethereum")).toBe(12345);
  });

  it("never regresses the last-known block even when a provider lags", async () => {
    let currentHeight = 12345;
    const { client } = buildClient([{ getBlockNumber: vi.fn(async () => currentHeight) }]);

    await client.getBlockNumber("ethereum");
    expect(client.getLastKnownBlock("ethereum")).toBe(12345);

    currentHeight = 12000;
    const returned = await client.getBlockNumber("ethereum");

    expect(returned).toBe(12000);
    expect(client.getLastKnownBlock("ethereum")).toBe(12345); // not regressed
    expect(client.getProviderStates("ethereum").providers[0].reason).toBe("provider_lag");
  });

  it("reads bridge reserves and binds contracts to the circuit-selected provider", async () => {
    const { client, providers } = buildClient([{ getBlockNumber: vi.fn(async () => 777) }]);

    const reserves = await client.getBridgeReserves("ethereum", "0xbridge", "0xtoken");

    expect(reserves.lockedAmount).toBe(1000n);
    expect(reserves.formattedAmount).toBe("0.001");
    expect(reserves.isPaused).toBe(false);
    expect(reserves.blockNumber).toBe(777);
    expect(reserves.timestamp).toBe(123);

    const boundProviders = (ethers.Contract as any).mock.calls.map((call: any[]) => call[2]);
    expect(boundProviders[0]).toBe(providers[0]);
    expect(boundProviders[1]).toBe(providers[0]);
  });

  it("cleans up its timeout timer when a call times out", async () => {
    vi.useFakeTimers();
    const { client } = buildClient(
      [{ getBlockNumber: vi.fn(() => new Promise(() => {})) }],
      { requestTimeoutMs: 50 }
    );

    const call = client.getBlockNumber("ethereum");
    // Flush the async call chain so the request's timeout timer is scheduled.
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);

    const assertion = expect(call).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("destroys every provider on teardown", async () => {
    const { client, providers } = buildClient([{}, {}]);
    await client.destroy();
    expect(providers[0].destroy).toHaveBeenCalled();
    expect(providers[1].destroy).toHaveBeenCalled();
  });

  it("reports configured chains and rejects unknown ones", async () => {
    const { client } = buildClient([{}]);
    expect(client.getSupportedChains()).toEqual(["ethereum"]);
    await expect(client.getBlockNumber("polygon" as any)).rejects.toThrow(/not configured/);
  });

  it("exposes the active provider index", async () => {
    const { client } = buildClient([{}, {}]);
    expect(client.getActiveProviderIndex("ethereum")).toBe(0);
  });
});