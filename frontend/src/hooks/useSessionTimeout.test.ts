import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionTimeout } from "./useSessionTimeout";

const SESSION_MS = 15 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"];

describe("useSessionTimeout", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not show the warning before the threshold", () => {
    const { result } = renderHook(() => useSessionTimeout(SESSION_MS, WARNING_MS));

    act(() => {
      vi.advanceTimersByTime(SESSION_MS - WARNING_MS - 1000);
    });

    expect(result.current.showModal).toBe(false);
    expect(result.current.timeoutSeconds).toBe(120);
  });

  it("shows the warning when inactivity reaches the threshold", () => {
    const { result } = renderHook(() => useSessionTimeout(SESSION_MS, WARNING_MS));

    act(() => {
      vi.advanceTimersByTime(SESSION_MS - WARNING_MS);
    });

    expect(result.current.showModal).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("logs out once the grace period expires", () => {
    const { result } = renderHook(() => useSessionTimeout(SESSION_MS, WARNING_MS));

    act(() => {
      vi.advanceTimersByTime(SESSION_MS);
    });

    expect(logSpy).toHaveBeenCalledWith("User logged out due to inactivity");
    expect(result.current.showModal).toBe(false);
  });

  it.each(ACTIVITY_EVENTS)("resets the inactivity timer on %s", (eventName) => {
    const { result } = renderHook(() => useSessionTimeout(SESSION_MS, WARNING_MS));

    act(() => {
      vi.advanceTimersByTime(SESSION_MS - WARNING_MS);
    });
    expect(result.current.showModal).toBe(true);

    act(() => {
      window.dispatchEvent(new Event(eventName));
    });
    expect(result.current.showModal).toBe(false);

    // A full warning window later the session would have expired without the reset.
    act(() => {
      vi.advanceTimersByTime(WARNING_MS);
    });
    expect(result.current.showModal).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("extends the session and hides the warning", () => {
    const { result } = renderHook(() => useSessionTimeout(SESSION_MS, WARNING_MS));

    act(() => {
      vi.advanceTimersByTime(SESSION_MS - WARNING_MS);
    });
    expect(result.current.showModal).toBe(true);

    act(() => {
      result.current.extendSession();
    });
    expect(result.current.showModal).toBe(false);

    act(() => {
      vi.advanceTimersByTime(SESSION_MS - WARNING_MS - 1000);
    });
    expect(result.current.showModal).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("removes activity listeners and stops the timer on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useSessionTimeout(SESSION_MS, WARNING_MS));

    for (const eventName of ACTIVITY_EVENTS) {
      expect(addSpy).toHaveBeenCalledWith(eventName, expect.any(Function));
    }

    unmount();

    for (const eventName of ACTIVITY_EVENTS) {
      const handler = addSpy.mock.calls.find(([name]) => name === eventName)?.[1];
      expect(removeSpy).toHaveBeenCalledWith(eventName, handler);
    }

    act(() => {
      vi.advanceTimersByTime(SESSION_MS * 2);
    });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
