import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useDashboardLayout } from "./useDashboardLayout";

describe("useDashboardLayout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes with default layout and all widgets visible", () => {
    const { result } = renderHook(() => useDashboardLayout());
    expect(result.current.layout.length).toBeGreaterThanOrEqual(9);
    expect(result.current.isWidgetVisible("kpi-banner")).toBe(true);
    expect(result.current.isWidgetVisible("bridge-status")).toBe(true);
  });

  it("toggles widget visibility and saves to localStorage", () => {
    const { result } = renderHook(() => useDashboardLayout());

    act(() => {
      result.current.toggleWidgetVisibility("kpi-banner");
    });

    expect(result.current.isWidgetVisible("kpi-banner")).toBe(false);

    act(() => {
      result.current.toggleWidgetVisibility("kpi-banner");
    });

    expect(result.current.isWidgetVisible("kpi-banner")).toBe(true);
  });

  it("moves widgets up and down", () => {
    const { result } = renderHook(() => useDashboardLayout());
    const initialFirst = result.current.layout[0].id;
    const initialSecond = result.current.layout[1].id;

    act(() => {
      result.current.moveWidget(initialSecond, "up");
    });

    expect(result.current.layout[0].id).toBe(initialSecond);
    expect(result.current.layout[1].id).toBe(initialFirst);
  });

  it("resets to default layout", () => {
    const { result } = renderHook(() => useDashboardLayout());

    act(() => {
      result.current.toggleWidgetVisibility("kpi-banner");
      result.current.resetLayout();
    });

    expect(result.current.isWidgetVisible("kpi-banner")).toBe(true);
  });
});
