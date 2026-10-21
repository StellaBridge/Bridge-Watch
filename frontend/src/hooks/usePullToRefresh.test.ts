import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePullToRefresh } from "./usePullToRefresh";

function dispatchTouch(type: string, x = 10, y = 100) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }],
  });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("usePullToRefresh (#1506)", () => {
  it("tracks downward touch deltas, progress, and the default threshold", () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ enabled: true, onRefresh: refresh }));

    act(() => { dispatchTouch("touchstart", 10, 100); });
    act(() => { dispatchTouch("touchmove", 10, 142); });
    expect(result.current.isPulling).toBe(true);
    expect(result.current.pullDistance).toBe(42);
    expect(result.current.progress).toBe(0.5);
    expect(result.current.shouldTrigger).toBe(false);

    act(() => { dispatchTouch("touchend"); });
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });

  it("triggers refresh only at or above the configured threshold", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({
      enabled: true, onRefresh: refresh, thresholdPx: 100,
    }));

    act(() => { dispatchTouch("touchstart", 0, 10); dispatchTouch("touchmove", 0, 109); });
    expect(result.current.shouldTrigger).toBe(false);
    act(() => { dispatchTouch("touchend"); });
    expect(refresh).not.toHaveBeenCalled();

    act(() => { dispatchTouch("touchstart", 0, 10); dispatchTouch("touchmove", 0, 110); });
    expect(result.current.shouldTrigger).toBe(true);
    expect(result.current.progress).toBe(1);
    act(() => { dispatchTouch("touchend"); });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
  });

  it("caps pull distance and prevents default vertical scrolling", () => {
    const { result } = renderHook(() => usePullToRefresh({ enabled: true, onRefresh: vi.fn(), thresholdPx: 100 }));
    act(() => { dispatchTouch("touchstart", 0, 10); });
    let move!: Event;
    act(() => { move = dispatchTouch("touchmove", 0, 500); });
    expect(move.defaultPrevented).toBe(true);
    expect(result.current.pullDistance).toBe(150);
    expect(result.current.progress).toBe(1);
  });

  it("ignores diagonal and upward drags", () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ enabled: true, onRefresh: refresh }));
    act(() => {
      dispatchTouch("touchstart", 5, 100);
      dispatchTouch("touchmove", 120, 105);
      dispatchTouch("touchmove", 5, 50);
      dispatchTouch("touchend");
    });
    expect(result.current.pullDistance).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not start when scrolled and cancels a pull if scrolling begins", () => {
    const refresh = vi.fn();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 35 });
    const { result } = renderHook(() => usePullToRefresh({ enabled: true, onRefresh: refresh }));

    act(() => {
      dispatchTouch("touchstart", 0, 10);
      dispatchTouch("touchmove", 0, 120);
      dispatchTouch("touchend");
    });
    expect(refresh).not.toHaveBeenCalled();

    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    act(() => { dispatchTouch("touchstart", 0, 10); dispatchTouch("touchmove", 0, 60); });
    expect(result.current.isPulling).toBe(true);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 20 });
    act(() => { dispatchTouch("touchmove", 0, 150); dispatchTouch("touchend"); });
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.isPulling).toBe(false);
  });

  it("disables gestures when enabled is false", () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ enabled: false, onRefresh: refresh }));
    act(() => {
      dispatchTouch("touchstart", 0, 0);
      dispatchTouch("touchmove", 0, 200);
      dispatchTouch("touchend");
    });
    expect(result.current.isSupported).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("removes all registered touch listeners on unmount", () => {
    const register = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => usePullToRefresh({ enabled: true, onRefresh: vi.fn() }));
    const listenerTypes = ["touchstart", "touchmove", "touchend", "touchcancel"];
    const callbacks = listenerTypes.map(type => {
      const registration = register.mock.calls.find(args => args[0] === type);
      expect(registration).toBeDefined();
      return registration![1];
    });
    unmount();
    listenerTypes.forEach((type, index) => {
      expect(remove).toHaveBeenCalledWith(type, callbacks[index]);
    });
  });
});
