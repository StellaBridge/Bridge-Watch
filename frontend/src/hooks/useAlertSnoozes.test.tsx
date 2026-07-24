import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAlertSnoozes } from "./useAlertSnoozes";
import type { SnoozeDurationMinutes } from "./useAlertSnoozes";

// Mock useLocalStorageState
vi.mock("./useLocalStorageState", () => ({
  useLocalStorageState: (key: string, initialValue: unknown) => {
    let store = initialValue;

    const setState = (updater: any) => {
      if (typeof updater === "function") {
        store = updater(store);
      } else {
        store = updater;
      }
    };

    return [store, setState];
  },
}));

describe("useAlertSnoozes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("snooze creation", () => {
    it("should create a snooze for a single alert", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "High CPU Usage", 15);
      });

      expect(result.current.snoozes).toHaveLength(1);
      expect(result.current.snoozes[0]).toMatchObject({
        key: "alert-1",
        label: "High CPU Usage",
      });
      expect(result.current.snoozes[0].snoozedUntil).toBeGreaterThan(Date.now());
    });

    it("should calculate correct snooze duration for 15 minutes", () => {
      const { result } = renderHook(() => useAlertSnoozes());
      const now = Date.now();
      const duration: SnoozeDurationMinutes = 15;

      act(() => {
        result.current.snooze("alert-1", "Test Alert", duration);
      });

      const snoozedEntry = result.current.snoozes[0];
      const expectedSnoozeUntil = now + duration * 60_000;

      expect(snoozedEntry.snoozedUntil).toBeLessThanOrEqual(expectedSnoozeUntil + 100);
      expect(snoozedEntry.snoozedUntil).toBeGreaterThanOrEqual(expectedSnoozeUntil - 100);
    });

    it("should calculate correct snooze duration for 30 minutes", () => {
      const { result } = renderHook(() => useAlertSnoozes());
      const duration: SnoozeDurationMinutes = 30;

      act(() => {
        result.current.snooze("alert-1", "Test Alert", duration);
      });

      const snoozedUntil = result.current.snoozes[0].snoozedUntil;
      const now = Date.now();
      const durationMs = duration * 60_000;

      expect(snoozedUntil - now).toBeLessThanOrEqual(durationMs + 100);
      expect(snoozedUntil - now).toBeGreaterThanOrEqual(durationMs - 100);
    });

    it("should calculate correct snooze duration for 60 minutes", () => {
      const { result } = renderHook(() => useAlertSnoozes());
      const duration: SnoozeDurationMinutes = 60;

      act(() => {
        result.current.snooze("alert-1", "Test Alert", duration);
      });

      const snoozedUntil = result.current.snoozes[0].snoozedUntil;
      const now = Date.now();
      const durationMs = duration * 60_000;

      expect(snoozedUntil - now).toBeCloseTo(durationMs, -2);
    });

    it("should calculate correct snooze duration for 240 minutes (4 hours)", () => {
      const { result } = renderHook(() => useAlertSnoozes());
      const duration: SnoozeDurationMinutes = 240;

      act(() => {
        result.current.snooze("alert-1", "Test Alert", duration);
      });

      const snoozedUntil = result.current.snoozes[0].snoozedUntil;
      const now = Date.now();
      const durationMs = duration * 60_000;

      expect(snoozedUntil - now).toBeCloseTo(durationMs, -2);
    });

    it("should set updateAt timestamp when creating snooze", () => {
      const { result } = renderHook(() => useAlertSnoozes());
      const now = Date.now();

      act(() => {
        result.current.snooze("alert-1", "Test Alert", 15);
      });

      const snoozedEntry = result.current.snoozes[0];
      expect(snoozedEntry.updatedAt).toBeLessThanOrEqual(now + 100);
      expect(snoozedEntry.updatedAt).toBeGreaterThanOrEqual(now - 100);
    });

    it("should snooze multiple alerts with snoozeMany", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      const items = [
        { key: "alert-1", label: "CPU High" },
        { key: "alert-2", label: "Memory High" },
        { key: "alert-3", label: "Disk Full" },
      ];

      act(() => {
        result.current.snoozeMany(items, 30);
      });

      expect(result.current.snoozes).toHaveLength(3);
      expect(result.current.snoozes[0].key).toBe("alert-1");
      expect(result.current.snoozes[1].key).toBe("alert-2");
      expect(result.current.snoozes[2].key).toBe("alert-3");
    });

    it("should update existing snooze with new duration", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Test Alert", 15);
      });

      const firstSnoozeUntil = result.current.snoozes[0].snoozedUntil;

      vi.advanceTimersByTime(1000);

      act(() => {
        result.current.snooze("alert-1", "Test Alert", 60);
      });

      const secondSnoozeUntil = result.current.snoozes[0].snoozedUntil;

      expect(secondSnoozeUntil).toBeGreaterThan(firstSnoozeUntil);
    });
  });

  describe("snooze cancellation", () => {
    it("should unsnooze a single alert", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Test Alert", 15);
      });

      expect(result.current.snoozes).toHaveLength(1);

      act(() => {
        result.current.unsnooze("alert-1");
      });

      expect(result.current.snoozes).toHaveLength(0);
    });

    it("should not error when unsnoozing non-existent alert", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      expect(() => {
        act(() => {
          result.current.unsnooze("non-existent");
        });
      }).not.toThrow();

      expect(result.current.snoozes).toHaveLength(0);
    });

    it("should unsnooze one alert without affecting others", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Alert 1", 15);
        result.current.snooze("alert-2", "Alert 2", 15);
        result.current.snooze("alert-3", "Alert 3", 15);
      });

      expect(result.current.snoozes).toHaveLength(3);

      act(() => {
        result.current.unsnooze("alert-2");
      });

      expect(result.current.snoozes).toHaveLength(2);
      expect(result.current.snoozes.map((s) => s.key)).toEqual(["alert-1", "alert-3"]);
    });

    it("should allow re-snoozeing after unsnoozing", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Test Alert", 15);
      });

      act(() => {
        result.current.unsnooze("alert-1");
      });

      expect(result.current.snoozes).toHaveLength(0);

      act(() => {
        result.current.snooze("alert-1", "Test Alert", 30);
      });

      expect(result.current.snoozes).toHaveLength(1);
    });
  });

  describe("snooze listing and status", () => {
    it("should only list active snoozes", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Active", 15);
      });

      expect(result.current.snoozes).toHaveLength(1);
      expect(result.current.snoozes[0].key).toBe("alert-1");
    });

    it("should sort snoozes by snoozedUntil timestamp", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Alert 1", 60);
        vi.advanceTimersByTime(1000);
        result.current.snooze("alert-2", "Alert 2", 30);
      });

      const times = result.current.snoozes.map((s) => s.snoozedUntil);
      expect(times[0]).toBeLessThanOrEqual(times[1]);
    });

    it("should get status of snoozed alert", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Test Alert", 15);
      });

      const status = result.current.getStatus("alert-1");

      expect(status).not.toBeNull();
      expect(status?.key).toBe("alert-1");
      expect(status?.snoozedUntil).toBeGreaterThan(Date.now());
    });

    it("should return null for non-existent alert", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      const status = result.current.getStatus("non-existent");

      expect(status).toBeNull();
    });

    it("should return null for expired snooze", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Test Alert", 1); // 1 minute
      });

      const status1 = result.current.getStatus("alert-1");
      expect(status1).not.toBeNull();

      // Advance time past snooze expiration
      vi.advanceTimersByTime(2 * 60 * 1000);

      const status2 = result.current.getStatus("alert-1");
      expect(status2).toBeNull();
    });
  });

  describe("snooze expiration and cleanup", () => {
    it("should exclude expired snoozes from activeSnoozes", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Alert 1", 1); // 1 minute
        result.current.snooze("alert-2", "Alert 2", 60); // 60 minutes
      });

      expect(result.current.snoozes).toHaveLength(2);

      // Advance time past first snooze expiration
      vi.advanceTimersByTime(2 * 60 * 1000);

      expect(result.current.snoozes).toHaveLength(1);
      expect(result.current.snoozes[0].key).toBe("alert-2");
    });

    it("should cleanup expired snoozes", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Alert 1", 1);
        result.current.snooze("alert-2", "Alert 2", 60);
      });

      vi.advanceTimersByTime(2 * 60 * 1000);

      act(() => {
        result.current.cleanup();
      });

      const snoozes = result.current.snoozes;
      expect(snoozes.every((s) => s.snoozedUntil > Date.now())).toBe(true);
    });

    it("should preserve non-expired snoozes during cleanup", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Alert 1", 1);
        result.current.snooze("alert-2", "Alert 2", 60);
      });

      vi.advanceTimersByTime(2 * 60 * 1000);

      const beforeCleanup = result.current.snoozes.length;

      act(() => {
        result.current.cleanup();
      });

      const afterCleanup = result.current.snoozes.length;

      expect(afterCleanup).toBeLessThan(beforeCleanup);
      expect(result.current.snoozes[0].key).toBe("alert-2");
    });

    it("should handle cleanup with no expired snoozes", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Alert 1", 60);
      });

      const beforeCleanup = result.current.snoozes.length;

      act(() => {
        result.current.cleanup();
      });

      expect(result.current.snoozes).toHaveLength(beforeCleanup);
    });

    it("should handle cleanup with all snoozes expired", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Alert 1", 1);
      });

      vi.advanceTimersByTime(2 * 60 * 1000);

      act(() => {
        result.current.cleanup();
      });

      expect(result.current.snoozes).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty snoozes list", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      expect(result.current.snoozes).toHaveLength(0);

      act(() => {
        result.current.unsnooze("any-alert");
      });

      expect(result.current.snoozes).toHaveLength(0);
    });

    it("should handle special characters in alert keys and labels", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze(
          "alert-@#$%",
          "Alert with special chars: !@#$%^&*()",
          15
        );
      });

      expect(result.current.snoozes).toHaveLength(1);
      expect(result.current.snoozes[0].key).toBe("alert-@#$%");
    });

    it("should handle very long alert labels", () => {
      const { result } = renderHook(() => useAlertSnoozes());
      const longLabel = "A".repeat(1000);

      act(() => {
        result.current.snooze("alert-1", longLabel, 15);
      });

      expect(result.current.snoozes[0].label).toBe(longLabel);
      expect(result.current.snoozes[0].label.length).toBe(1000);
    });

    it("should handle rapid snooze/unsnooze cycles", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.snooze("alert-1", "Test", 15);
          result.current.unsnooze("alert-1");
        });
      }

      expect(result.current.snoozes).toHaveLength(0);
    });

    it("should maintain snooze list consistency across multiple operations", () => {
      const { result } = renderHook(() => useAlertSnoozes());

      act(() => {
        result.current.snooze("alert-1", "Alert 1", 15);
        result.current.snooze("alert-2", "Alert 2", 30);
        result.current.snooze("alert-3", "Alert 3", 60);
      });

      expect(result.current.snoozes).toHaveLength(3);

      act(() => {
        result.current.unsnooze("alert-2");
      });

      expect(result.current.snoozes).toHaveLength(2);

      const keys = result.current.snoozes.map((s) => s.key);
      expect(keys).not.toContain("alert-2");
      expect(keys).toContain("alert-1");
      expect(keys).toContain("alert-3");
    });
  });
});
