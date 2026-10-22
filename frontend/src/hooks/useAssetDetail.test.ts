import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../services/api";
import { useAssetDetail } from "./useAssetDetail";

vi.mock("./useWebSocket", () => ({ useWebSocket: vi.fn(() => ({ send: vi.fn() })) }));
vi.mock("../services/api", () => ({
  getAssetInfo: vi.fn(),
  getAssetHealth: vi.fn(),
  getAssetPriceHistory: vi.fn(),
  getAssetPriceSources: vi.fn(),
  getAssetLiquiditySources: vi.fn(),
  getAssetVolume: vi.fn(),
  getAssetSupplyVerification: vi.fn(),
  getAssetHealthHistory: vi.fn(),
  getAssetAlerts: vi.fn(),
}));

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const method of [
    api.getAssetInfo,
    api.getAssetHealth,
    api.getAssetPriceHistory,
    api.getAssetPriceSources,
    api.getAssetLiquiditySources,
    api.getAssetVolume,
    api.getAssetSupplyVerification,
    api.getAssetHealthHistory,
    api.getAssetAlerts,
  ]) {
    vi.mocked(method).mockResolvedValue(null as never);
  }
});

describe("useAssetDetail (#1500)", () => {
  it("fetches each asset dataset for a valid symbol", async () => {
    vi.mocked(api.getAssetInfo).mockResolvedValue({ symbol: "XLM" } as Awaited<ReturnType<typeof api.getAssetInfo>>);
    const { result } = renderHook(() => useAssetDetail("XLM"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.assetInfo.isSuccess).toBe(true));
    expect(result.current.assetInfo.data).toMatchObject({ symbol: "XLM" });
    expect(api.getAssetHealth).toHaveBeenCalledWith("XLM", expect.any(AbortSignal));
    expect(api.getAssetPriceHistory).toHaveBeenCalledWith("XLM", "24H", expect.any(AbortSignal));
    expect(api.getAssetLiquiditySources).toHaveBeenCalledWith("XLM", expect.any(AbortSignal));
  });

  it("exposes an error instead of data for a missing asset", async () => {
    vi.mocked(api.getAssetInfo).mockRejectedValue(new Error("Asset not found (404)"));
    const { result } = renderHook(() => useAssetDetail("UNKNOWN"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.assetInfo.isError).toBe(true));
    expect(result.current.assetInfo.error?.message).toMatch(/404/);
  });

  it("does not query when the symbol is empty", () => {
    const { result } = renderHook(() => useAssetDetail(""), { wrapper: wrapper() });
    expect(api.getAssetInfo).not.toHaveBeenCalled();
    expect(result.current.assetInfo.fetchStatus).toBe("idle");
  });

  it("refetches asset info when the user requests a refresh", async () => {
    vi.mocked(api.getAssetInfo).mockResolvedValue({ symbol: "USDC" } as Awaited<ReturnType<typeof api.getAssetInfo>>);
    const { result } = renderHook(() => useAssetDetail("USDC"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.assetInfo.isSuccess).toBe(true));
    await act(async () => { await result.current.assetInfo.refetch(); });
    expect(api.getAssetInfo).toHaveBeenCalledTimes(2);
  });

  it("changes the price-history query key when the timeframe changes", async () => {
    const { result } = renderHook(() => useAssetDetail("XLM"), { wrapper: wrapper() });
    await waitFor(() => expect(api.getAssetPriceHistory).toHaveBeenCalled());
    act(() => result.current.setTimeframe("7D"));
    await waitFor(() => expect(api.getAssetPriceHistory).toHaveBeenCalledWith("XLM", "7D", expect.any(AbortSignal)));
  });

  it("aborts in-flight API requests when navigating away", async () => {
    vi.mocked(api.getAssetInfo).mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderHook(() => useAssetDetail("XLM"), { wrapper: wrapper() });
    await waitFor(() => expect(api.getAssetInfo).toHaveBeenCalled());
    const signal = vi.mocked(api.getAssetInfo).mock.calls[0][1];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
