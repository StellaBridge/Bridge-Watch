import { describe, it, expect, beforeEach } from "vitest";
import { logError, getErrorLog, clearErrorLog, getErrorSummary } from "./errorReporting";

beforeEach(() => {
  clearErrorLog();
});

describe("logError", () => {
  it("adds an entry to the error log", () => {
    const error = new Error("test error");
    const entry = logError(error, undefined, "medium", "TestContext");
    expect(entry.error).toBe(error);
    expect(entry.severity).toBe("medium");
    expect(entry.context).toBe("TestContext");
    expect(entry.recovered).toBe(false);
    expect(entry.id).toMatch(/^err-/);
    expect(getErrorLog()).toHaveLength(1);
  });

  it("defaults severity to medium", () => {
    const entry = logError(new Error("test"));
    expect(entry.severity).toBe("medium");
  });

  it("stores component stack when provided", () => {
    const entry = logError(new Error("test"), "at MyComponent", "low");
    expect(entry.componentStack).toBe("at MyComponent");
  });

  it("caps log at MAX_LOG_SIZE (50)", () => {
    for (let i = 0; i < 55; i++) {
      logError(new Error(`error-${i}`));
    }
    expect(getErrorLog()).toHaveLength(50);
    // Oldest entries should be evicted
    expect(getErrorLog()[0].error.message).toBe("error-5");
  });

  it("generates unique IDs", () => {
    const entry1 = logError(new Error("a"));
    const entry2 = logError(new Error("b"));
    expect(entry1.id).not.toBe(entry2.id);
  });
});

describe("getErrorLog", () => {
  it("returns empty array when no errors", () => {
    expect(getErrorLog()).toHaveLength(0);
  });

  it("returns readonly array", () => {
    logError(new Error("test"));
    const log = getErrorLog();
    expect(log).toHaveLength(1);
  });
});

describe("clearErrorLog", () => {
  it("clears all entries", () => {
    logError(new Error("a"));
    logError(new Error("b"));
    expect(getErrorLog()).toHaveLength(2);
    clearErrorLog();
    expect(getErrorLog()).toHaveLength(0);
  });
});

describe("getErrorSummary", () => {
  it("returns zero counts when empty", () => {
    const summary = getErrorSummary();
    expect(summary.total).toBe(0);
    expect(summary.bySeverity).toEqual({ low: 0, medium: 0, high: 0, critical: 0 });
  });

  it("counts by severity correctly", () => {
    logError(new Error("a"), undefined, "low");
    logError(new Error("b"), undefined, "medium");
    logError(new Error("c"), undefined, "medium");
    logError(new Error("d"), undefined, "critical");
    const summary = getErrorSummary();
    expect(summary.total).toBe(4);
    expect(summary.bySeverity.low).toBe(1);
    expect(summary.bySeverity.medium).toBe(2);
    expect(summary.bySeverity.high).toBe(0);
    expect(summary.bySeverity.critical).toBe(1);
  });
});
