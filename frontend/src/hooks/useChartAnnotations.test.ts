import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChartAnnotations } from "./useChartAnnotations";

const baseInput = {
  kind: "note" as const,
  label: "Test annotation",
  timestamp: "2026-01-01T10:00:00Z",
  notes: "some notes",
  color: "#3b82f6",
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("useChartAnnotations", () => {
  it("starts with an empty annotation list", () => {
    const { result } = renderHook(() => useChartAnnotations("USDC"));

    expect(result.current.annotations).toEqual([]);
  });

  it("adds an annotation and exposes it in the list", () => {
    const { result } = renderHook(() => useChartAnnotations("USDC"));

    act(() => {
      result.current.addAnnotation(baseInput);
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].label).toBe("Test annotation");
    expect(result.current.annotations[0].kind).toBe("note");
    expect(result.current.annotations[0].color).toBe("#3b82f6");
    expect(result.current.annotations[0].createdAt).toBeDefined();
    expect(result.current.annotations[0].updatedAt).toBeDefined();
  });

  it("trims labels and defaults missing notes and color", () => {
    const { result } = renderHook(() => useChartAnnotations("USDC"));

    act(() => {
      result.current.addAnnotation({
        kind: "marker",
        label: "  spaced  ",
        timestamp: "2026-01-02T10:00:00Z",
      });
    });

    expect(result.current.annotations[0].label).toBe("spaced");
    expect(result.current.annotations[0].notes).toBe("");
    expect(result.current.annotations[0].color).toBe("#3b82f6");
  });

  it("sorts annotations by timestamp ascending", () => {
    const { result } = renderHook(() => useChartAnnotations("USDC"));

    act(() => {
      result.current.addAnnotation({ ...baseInput, label: "later", timestamp: "2026-01-03T10:00:00Z" });
      result.current.addAnnotation({ ...baseInput, label: "earlier", timestamp: "2026-01-01T10:00:00Z" });
      result.current.addAnnotation({ ...baseInput, label: "middle", timestamp: "2026-01-02T10:00:00Z" });
    });

    const labels = result.current.annotations.map((a) => a.label);
    expect(labels).toEqual(["earlier", "middle", "later"]);
  });

  it("updates an existing annotation by id and preserves createdAt", () => {
    const { result } = renderHook(() => useChartAnnotations("USDC"));

    act(() => {
      result.current.addAnnotation(baseInput);
    });
    const added = result.current.annotations[0];
    const createdAt = added.createdAt;
    const id = added.id;

    act(() => {
      result.current.updateAnnotation(id, {
        kind: "comparison",
        label: "updated label",
        timestamp: "2026-01-05T10:00:00Z",
        notes: "updated notes",
        color: "#ef4444",
      });
    });

    const updated = result.current.annotations[0];
    expect(updated.id).toBe(id);
    expect(updated.label).toBe("updated label");
    expect(updated.kind).toBe("comparison");
    expect(updated.notes).toBe("updated notes");
    expect(updated.color).toBe("#ef4444");
    expect(updated.createdAt).toBe(createdAt);
    expect(updated.updatedAt).not.toBe(createdAt);
  });

  it("removes an annotation by id", () => {
    const { result } = renderHook(() => useChartAnnotations("USDC"));

    act(() => {
      result.current.addAnnotation(baseInput);
      result.current.addAnnotation({
        ...baseInput,
        label: "second",
        timestamp: "2026-01-02T10:00:00Z",
      });
    });

    const firstId = result.current.annotations[0].id;
    const secondId = result.current.annotations[1].id;

    act(() => {
      result.current.removeAnnotation(firstId);
    });

    expect(result.current.annotations).toHaveLength(1);
    expect(result.current.annotations[0].id).toBe(secondId);
  });

  it("clears all annotations", () => {
    const { result } = renderHook(() => useChartAnnotations("USDC"));

    act(() => {
      result.current.addAnnotation(baseInput);
      result.current.addAnnotation({ ...baseInput, label: "second" });
    });

    act(() => {
      result.current.clearAnnotations();
    });

    expect(result.current.annotations).toEqual([]);
  });

  it("exports annotations as JSON", () => {
    const { result } = renderHook(() => useChartAnnotations("USDC"));

    act(() => {
      result.current.addAnnotation(baseInput);
    });

    const exported = result.current.exportAnnotations();
    const parsed = JSON.parse(exported);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("Test annotation");
  });

  it("is scoped per symbol via separate localStorage keys", () => {
    const usdc = renderHook(() => useChartAnnotations("USDC"));
    const eth = renderHook(() => useChartAnnotations("ETH"));

    act(() => {
      usdc.result.current.addAnnotation({ ...baseInput, label: "usdc-only" });
    });

    expect(usdc.result.current.annotations).toHaveLength(1);
    expect(eth.result.current.annotations).toEqual([]);
  });
});
