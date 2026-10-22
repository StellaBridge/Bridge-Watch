/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAlertPlaybooks, useAlertPlaybook } from "./useAlertPlaybooks";
import { searchAlertPlaybooks, getAlertPlaybook } from "../services/api";

vi.mock("../services/api", () => ({
  searchAlertPlaybooks: vi.fn(),
  getAlertPlaybook: vi.fn(),
}));

const mockSearch = vi.mocked(searchAlertPlaybooks);
const mockGet = vi.mocked(getAlertPlaybook);

const bridgePlaybook = {
  id: "pb-bridge-outage",
  title: "Bridge outage response",
  alertType: "bridge_down",
  steps: ["Pause transfers", "Notify operators", "Verify reserves"],
} as any;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAlertPlaybooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads playbooks for the given alert category", async () => {
    mockSearch.mockResolvedValue({ playbooks: [bridgePlaybook], total: 1 });

    const { result } = renderHook(() => useAlertPlaybooks(undefined, "bridge_down"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSearch).toHaveBeenCalledWith({ q: undefined, alertType: "bridge_down" });
    expect(result.current.data?.playbooks).toEqual([bridgePlaybook]);
    expect(result.current.data?.total).toBe(1);
  });

  it("passes the search query through to the API", async () => {
    mockSearch.mockResolvedValue({ playbooks: [], total: 0, query: "reserve" });

    const { result } = renderHook(() => useAlertPlaybooks("reserve"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSearch).toHaveBeenCalledWith({ q: "reserve", alertType: undefined });
    expect(result.current.data?.playbooks).toEqual([]);
  });

  it("refetches when the alert category changes", async () => {
    mockSearch.mockResolvedValue({ playbooks: [bridgePlaybook], total: 1 });

    const { result, rerender } = renderHook(
      ({ alertType }: { alertType: string }) => useAlertPlaybooks(undefined, alertType),
      { wrapper: createWrapper(), initialProps: { alertType: "bridge_down" } },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ alertType: "price_deviation" });

    await waitFor(() =>
      expect(mockSearch).toHaveBeenLastCalledWith({
        q: undefined,
        alertType: "price_deviation",
      }),
    );
    expect(mockSearch).toHaveBeenCalledTimes(2);
  });

  it("exposes the error when loading fails", async () => {
    mockSearch.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() => useAlertPlaybooks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toBe("Network down");
  });
});

describe("useAlertPlaybook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when no id is provided", () => {
    const { result } = renderHook(() => useAlertPlaybook(undefined), {
      wrapper: createWrapper(),
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("loads a single playbook by id", async () => {
    mockGet.mockResolvedValue(bridgePlaybook);

    const { result } = renderHook(() => useAlertPlaybook("pb-bridge-outage"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith("pb-bridge-outage");
    expect(result.current.data).toEqual(bridgePlaybook);
  });

  it("starts fetching once an id becomes available", async () => {
    mockGet.mockResolvedValue(bridgePlaybook);

    const { result, rerender } = renderHook(
      ({ id }: { id?: string }) => useAlertPlaybook(id),
      { wrapper: createWrapper(), initialProps: { id: undefined as string | undefined } },
    );

    expect(mockGet).not.toHaveBeenCalled();

    rerender({ id: "pb-bridge-outage" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
