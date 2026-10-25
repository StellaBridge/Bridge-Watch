import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMarketDepth } from "./useMarketDepth";

type FetchMock = ReturnType<typeof vi.fn>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const mockSnapshot = {
  asset: "USDC",
  bids: [{ price: 1.09, amount: 1000 }, { price: 1.08, amount: 2000 }],
  asks: [{ price: 1.11, amount: 1500 }, { price: 1.12, amount: 500 }],
  spread: 0.02,
  spreadPct: 1.83,
  midPrice: 1.1,
  fetchedAt: "2026-01-01T10:00:00Z",
};

const originalFetch = globalThis.fetch;
let fetchMock: FetchMock;

describe("useMarketDepth", () => {
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSnapshot,
    } as unknown as Response);
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("fetches market depth for the asset and returns the snapshot", async () => {
    const { result } = renderHook(() => useMarketDepth("USDC"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/assets/USDC/market-depth");
    expect(result.current.data).toMatchObject(mockSnapshot);
  });

  it("uses the asset in the query key", async () => {
    const { result } = renderHook(() => useMarketDepth("ETH"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/assets/ETH/market-depth");
  });

  it("returns loading state initially", () => {
    const { result } = renderHook(() => useMarketDepth("USDC"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns a synthetic empty snapshot instead of throwing on non-ok responses", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);

    const { result } = renderHook(() => useMarketDepth("USDC"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toMatchObject({
      asset: "USDC",
      bids: [],
      asks: [],
      spread: 0,
      spreadPct: 0,
      midPrice: 0,
    });
  });

  it("is disabled when no asset is provided", () => {
    const { result } = renderHook(() => useMarketDepth(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("respects the refetch interval", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useMarketDepth("USDC", 10_000), {
      wrapper: createWrapper(),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(result.current.isSuccess).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
