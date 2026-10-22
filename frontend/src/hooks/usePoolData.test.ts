import { renderHook, waitFor } from "@testing-library/react";
import { usePoolData } from "./usePoolData";

global.fetch = jest.fn();

describe("usePoolData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it("should fetch initial data and set loading state", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 1, pool: "test" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 1, event: "test" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: "healthy" } }),
      });

    const { result } = renderHook(() => usePoolData({ enabled: true }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.metrics).toHaveLength(1);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.status).toEqual({ status: "healthy" });
    expect(result.current.error).toBeNull();
  });

  it("should execute polling interval and update state", async () => {
    jest.useFakeTimers();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    renderHook(() => usePoolData({ enabled: true, pollIntervalMs: 1000 }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const initialCallCount = (global.fetch as jest.Mock).mock.calls.length;

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialCallCount
      );
    });

    jest.useRealTimers();
  });

  it("should handle network failure and set error state", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => usePoolData({ enabled: true }));

    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
    });

    expect(result.current.loading).toBe(false);
  });

  it("should cancel polling timer on unmount", async () => {
    jest.useFakeTimers();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { unmount } = renderHook(() =>
      usePoolData({ enabled: true, pollIntervalMs: 1000 })
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const callCountBeforeUnmount = (global.fetch as jest.Mock).mock.calls.length;

    unmount();

    jest.advanceTimersByTime(5000);

    expect((global.fetch as jest.Mock).mock.calls.length).toBe(
      callCountBeforeUnmount
    );

    jest.useRealTimers();
  });
});
