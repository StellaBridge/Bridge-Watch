/**
 * Unit tests for `useDashboardLayout` (#1503).
 *
 * The hook owns the customizable dashboard grid: widget order, size and
 * visibility. A regression here shows up as overlapping or un-clickable
 * widgets, so the tests cover loading, drag-and-drop reordering, visibility
 * toggles and the reset-to-default action.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultLayout,
  useDashboardLayout,
  widgetDefinitions,
  type DashboardWidgetId,
} from "./useDashboardLayout";
import { useUserPreferencesStore } from "../stores/userPreferencesStore";

const STORAGE_KEY = "bridge-watch:dashboard-layout:v1";

const DEFAULT_ORDER = defaultLayout.widgets.map((widget) => widget.id);

describe("useDashboardLayout", () => {
  beforeEach(() => {
    localStorage.clear();
    useUserPreferencesStore.setState({ dashboardWidgets: undefined });
  });

  describe("default layout", () => {
    it("initializes with the default layout when no user preference exists", () => {
      const { result } = renderHook(() => useDashboardLayout());

      expect(result.current.layout.map((item) => item.id)).toEqual(DEFAULT_ORDER);
      expect(result.current.layout).toHaveLength(widgetDefinitions.length);
      expect(result.current.enabledWidgets).toHaveLength(widgetDefinitions.length);
      expect(result.current.isWidgetVisible("kpi-banner")).toBe(true);
      expect(result.current.isWidgetVisible("bridge-status")).toBe(true);
    });

    it("gives every default widget a unique, contiguous order and a size", () => {
      const { result } = renderHook(() => useDashboardLayout());

      const orders = result.current.layout.map((item) => item.order);
      expect(orders).toEqual(DEFAULT_ORDER.map((_, index) => index));
      expect(new Set(orders).size).toBe(orders.length);

      for (const item of result.current.layout) {
        expect(["small", "medium", "large"]).toContain(item.size);
      }
    });

    it("restores a persisted layout from localStorage", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          widgets: [
            { id: "watchlist", enabled: true, visible: true, size: "small", order: 0 },
            { id: "kpi-banner", enabled: false, visible: false, size: "large", order: 1 },
          ],
        })
      );

      const { result } = renderHook(() => useDashboardLayout());

      // Unknown widgets are appended so a newer layout never breaks an older
      // stored preference.
      expect(result.current.layout[0].id).toBe("watchlist");
      expect(result.current.layout[1].id).toBe("kpi-banner");
      expect(result.current.layout).toHaveLength(widgetDefinitions.length);
      expect(result.current.isWidgetVisible("kpi-banner")).toBe(false);
      expect(result.current.isWidgetVisible("watchlist")).toBe(true);
    });
  });

  describe("drag-and-drop reordering", () => {
    it("reorders widgets and resolves order collisions", () => {
      const { result } = renderHook(() => useDashboardLayout());

      const reordered: DashboardWidgetId[] = [
        "bridge-status",
        "kpi-banner",
        "status-cards",
        "overview-stats",
        "sparkline-grid",
        "asset-discovery",
        "watchlist",
        "external-dependencies",
        "activity-timeline",
      ];

      act(() => {
        result.current.reorderWidgets(reordered);
      });

      expect(result.current.layout.map((item) => item.id)).toEqual(reordered);

      const orders = result.current.layout.map((item) => item.order);
      // No two widgets may share a slot, otherwise the grid overlaps.
      expect(new Set(orders).size).toBe(orders.length);
      expect(orders).toEqual(reordered.map((_, index) => index));
    });

    it("keeps widgets that were not part of the drop target", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.reorderWidgets(["bridge-status"]);
      });

      const ids = result.current.layout.map((item) => item.id);
      expect(ids[0]).toBe("bridge-status");
      expect(ids).toHaveLength(widgetDefinitions.length);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.slice(1).sort()).toEqual(
        DEFAULT_ORDER.filter((id) => id !== "bridge-status").sort()
      );
    });

    it("ignores unknown widget ids in a drop payload", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.reorderWidgets(["not-a-widget" as DashboardWidgetId]);
      });

      expect(result.current.layout.map((item) => item.id)).toEqual(DEFAULT_ORDER);
    });

    it("moves widgets up and down one slot at a time", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.moveWidget("status-cards", "up");
      });

      expect(result.current.layout[0].id).toBe("status-cards");
      expect(result.current.layout[1].id).toBe("kpi-banner");

      act(() => {
        result.current.moveWidget("status-cards", "down");
      });

      expect(result.current.layout[0].id).toBe("kpi-banner");
      expect(result.current.layout[1].id).toBe("status-cards");
    });

    it("does not move widgets past the edges of the grid", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.moveWidget("kpi-banner", "up");
      });
      expect(result.current.layout[0].id).toBe("kpi-banner");

      act(() => {
        result.current.moveWidget("bridge-status", "down");
      });
      expect(result.current.layout[result.current.layout.length - 1].id).toBe("bridge-status");
    });
  });

  describe("widget visibility", () => {
    it("toggles widget visibility and saves it to localStorage", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.toggleWidgetVisibility("kpi-banner");
      });

      expect(result.current.isWidgetVisible("kpi-banner")).toBe(false);
      expect(
        result.current.enabledWidgets.find((widget) => widget.id === "kpi-banner")
      ).toBeUndefined();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
      const storedWidget = stored.widgets.find(
        (widget: { id: string }) => widget.id === "kpi-banner"
      );
      expect(storedWidget.enabled).toBe(false);
      expect(storedWidget.visible).toBe(false);

      act(() => {
        result.current.toggleWidgetVisibility("kpi-banner");
      });

      expect(result.current.isWidgetVisible("kpi-banner")).toBe(true);
      expect(result.current.enabledWidgets).toHaveLength(widgetDefinitions.length);
    });

    it("hides and shows a widget explicitly", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.setWidgetEnabled("watchlist", false);
      });
      expect(result.current.isWidgetVisible("watchlist")).toBe(false);

      act(() => {
        result.current.setWidgetEnabled("watchlist", true);
      });
      expect(result.current.isWidgetVisible("watchlist")).toBe(true);
    });

    it("keeps the enabled and visible flags in sync", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.setWidgetEnabled("activity-timeline", false);
      });

      const widget = result.current.layout.find((item) => item.id === "activity-timeline");
      expect(widget?.enabled).toBe(false);
      expect(widget?.visible).toBe(false);
    });

    it("publishes the layout to the user preferences store", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.toggleWidgetVisibility("watchlist");
      });

      const stored = useUserPreferencesStore.getState().dashboardWidgets;
      expect(stored).toBeDefined();
      expect(stored?.find((widget) => widget.id === "watchlist")?.visible).toBe(false);
    });
  });

  describe("reset to default", () => {
    it("restores the initial grid structure", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.toggleWidgetVisibility("kpi-banner");
      });
      act(() => {
        result.current.setWidgetSize("kpi-banner", "small");
      });
      act(() => {
        result.current.reorderWidgets(["bridge-status", "kpi-banner"]);
      });

      expect(result.current.layout[0].id).toBe("bridge-status");
      expect(result.current.isWidgetVisible("kpi-banner")).toBe(false);

      act(() => {
        result.current.resetToDefault();
      });

      expect(result.current.layout.map((item) => item.id)).toEqual(DEFAULT_ORDER);
      expect(result.current.layout.map((item) => item.order)).toEqual(
        DEFAULT_ORDER.map((_, index) => index)
      );
      expect(result.current.isWidgetVisible("kpi-banner")).toBe(true);
      expect(result.current.layout.find((item) => item.id === "kpi-banner")?.size).toBe(
        "large"
      );
    });

    it("exposes resetLayout as an alias of resetToDefault", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.setWidgetEnabled("watchlist", false);
        result.current.resetLayout();
      });

      expect(result.current.isWidgetVisible("watchlist")).toBe(true);
    });
  });

  describe("sizes, presets and import/export", () => {
    it("updates the size of a widget", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.setWidgetSize("sparkline-grid", "large");
      });

      expect(result.current.layout.find((item) => item.id === "sparkline-grid")?.size).toBe(
        "large"
      );
    });

    it("applies a preset layout", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.applyPreset("compact");
      });

      // The preset widgets come first, in preset order; widgets the preset
      // does not mention are appended so nothing disappears from the grid.
      expect(result.current.layout.slice(0, 4).map((item) => item.id)).toEqual([
        "kpi-banner",
        "overview-stats",
        "asset-discovery",
        "bridge-status",
      ]);
      expect(result.current.layout).toHaveLength(widgetDefinitions.length);
      expect(result.current.isWidgetVisible("bridge-status")).toBe(false);
      expect(result.current.isWidgetVisible("kpi-banner")).toBe(true);
    });

    it("exports the layout as JSON and imports it back", () => {
      const { result } = renderHook(() => useDashboardLayout());

      act(() => {
        result.current.reorderWidgets(["watchlist", "kpi-banner"]);
      });

      const exported = result.current.exportLayout();
      expect(JSON.parse(exported).widgets).toHaveLength(widgetDefinitions.length);

      act(() => {
        result.current.resetToDefault();
      });
      expect(result.current.layout[0].id).toBe("kpi-banner");

      let outcome = { ok: false, message: "" };
      act(() => {
        outcome = result.current.importLayout(exported);
      });

      expect(outcome.ok).toBe(true);
      expect(result.current.layout[0].id).toBe("watchlist");
    });

    it("rejects an invalid layout payload", () => {
      const { result } = renderHook(() => useDashboardLayout());

      let outcome = { ok: true, message: "" };
      act(() => {
        outcome = result.current.importLayout("not-json");
      });
      expect(outcome.ok).toBe(false);

      act(() => {
        outcome = result.current.importLayout('{"widgets":"nope"}');
      });
      expect(outcome.ok).toBe(false);
      expect(result.current.layout.map((item) => item.id)).toEqual(DEFAULT_ORDER);
    });
  });
});
