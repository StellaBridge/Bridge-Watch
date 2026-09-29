import { useCallback, useMemo, useState } from "react";
import { useLocalStorageState } from "./useLocalStorageState";
import { useUserPreferencesStore } from "../stores/userPreferencesStore";

export type DashboardWidgetId =
  | "kpi-banner"
  | "status-cards"
  | "overview-stats"
  | "quick-stats"
  | "sparkline-grid"
  | "asset-discovery"
  | "asset-health"
  | "watchlist"
  | "external-dependencies"
  | "activity-timeline"
  | "bridge-status";

export type DashboardWidgetSize = "small" | "medium" | "large";

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  title: string;
  description: string;
}

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  enabled: boolean;
  visible?: boolean;
  size: DashboardWidgetSize;
  order?: number;
}

export interface WidgetLayoutItem {
  id: DashboardWidgetId;
  visible: boolean;
  enabled: boolean;
  size: DashboardWidgetSize;
  order: number;
}

interface DashboardLayout {
  widgets: DashboardWidgetConfig[];
}

const STORAGE_KEY = "bridge-watch:dashboard-layout:v1";

export const widgetDefinitions: DashboardWidgetDefinition[] = [
  {
    id: "kpi-banner",
    title: "KPI Metrics",
    description: "Live summary of TVL, monitored assets, active bridges, and health score.",
  },
  {
    id: "status-cards",
    title: "Status at a Glance",
    description: "Inline alerts for assets and bridges requiring immediate attention.",
  },
  {
    id: "overview-stats",
    title: "Overview Summary",
    description: "High-level summary cards for TVL, asset count, active bridges, and health.",
  },
  {
    id: "sparkline-grid",
    title: "Comparative Sparklines",
    description: "Multi-asset price and volume mini-charts.",
  },
  {
    id: "asset-discovery",
    title: "Asset Discovery & Health",
    description: "Live scorecards and discovery tables for monitored bridged assets.",
  },
  {
    id: "watchlist",
    title: "Watchlist",
    description: "Custom user-curated watchlists and alerts.",
  },
  {
    id: "external-dependencies",
    title: "External Dependencies",
    description: "Status of external oracles, RPC providers, and indexers.",
  },
  {
    id: "activity-timeline",
    title: "Recent Activity Timeline",
    description: "Chronological transaction, bridge event, and governance timeline.",
  },
  {
    id: "bridge-status",
    title: "Bridge Status",
    description: "Current bridge availability, mismatch percentage, and operational status.",
  },
];

export const WIDGET_TITLES: Record<string, string> = Object.fromEntries(
  widgetDefinitions.map((w) => [w.id, w.title])
);

export const defaultLayout: DashboardLayout = {
  widgets: [
    { id: "kpi-banner", enabled: true, visible: true, size: "large", order: 0 },
    { id: "status-cards", enabled: true, visible: true, size: "large", order: 1 },
    { id: "overview-stats", enabled: true, visible: true, size: "large", order: 2 },
    { id: "sparkline-grid", enabled: true, visible: true, size: "medium", order: 3 },
    { id: "asset-discovery", enabled: true, visible: true, size: "large", order: 4 },
    { id: "watchlist", enabled: true, visible: true, size: "medium", order: 5 },
    { id: "external-dependencies", enabled: true, visible: true, size: "medium", order: 6 },
    { id: "activity-timeline", enabled: true, visible: true, size: "large", order: 7 },
    { id: "bridge-status", enabled: true, visible: true, size: "large", order: 8 },
  ],
};

const presets: Record<string, DashboardLayout> = {
  default: defaultLayout,
  compact: {
    widgets: [
      { id: "kpi-banner", enabled: true, visible: true, size: "small", order: 0 },
      { id: "overview-stats", enabled: true, visible: true, size: "small", order: 1 },
      { id: "asset-discovery", enabled: true, visible: true, size: "medium", order: 2 },
      { id: "bridge-status", enabled: false, visible: false, size: "small", order: 3 },
    ],
  },
  operations: {
    widgets: [
      { id: "bridge-status", enabled: true, visible: true, size: "large", order: 0 },
      { id: "status-cards", enabled: true, visible: true, size: "medium", order: 1 },
      { id: "kpi-banner", enabled: true, visible: true, size: "small", order: 2 },
      { id: "external-dependencies", enabled: true, visible: true, size: "medium", order: 3 },
    ],
  },
  analyst: {
    widgets: [
      { id: "asset-discovery", enabled: true, visible: true, size: "large", order: 0 },
      { id: "sparkline-grid", enabled: true, visible: true, size: "large", order: 1 },
      { id: "kpi-banner", enabled: true, visible: true, size: "medium", order: 2 },
      { id: "activity-timeline", enabled: true, visible: true, size: "medium", order: 3 },
    ],
  },
};

function sanitizeLayout(layout: DashboardLayout): DashboardLayout {
  const seen = new Set<string>();
  const normalized: DashboardWidgetConfig[] = [];
  let orderIndex = 0;

  for (const widget of layout.widgets ?? []) {
    if (seen.has(widget.id)) continue;
    seen.add(widget.id);
    const isEnabled = widget.enabled !== undefined ? Boolean(widget.enabled) : (widget.visible !== undefined ? Boolean(widget.visible) : true);
    normalized.push({
      id: widget.id,
      enabled: isEnabled,
      visible: isEnabled,
      size: widget.size ?? "medium",
      order: widget.order ?? orderIndex++,
    });
  }

  for (const definition of widgetDefinitions) {
    if (!seen.has(definition.id)) {
      normalized.push({
        id: definition.id,
        enabled: true,
        visible: true,
        size: "medium",
        order: orderIndex++,
      });
    }
  }

  return { widgets: normalized.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) };
}

export function useDashboardLayout() {
  const [layout, setLayout] = useLocalStorageState<DashboardLayout>(STORAGE_KEY, defaultLayout);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const setStoreWidgets = useUserPreferencesStore((s) => s.setDashboardWidgets);

  const normalizedLayout = useMemo(() => sanitizeLayout(layout), [layout]);

  const enabledWidgets = useMemo(
    () => normalizedLayout.widgets.filter((widget) => widget.enabled),
    [normalizedLayout],
  );

  const flatLayoutList = useMemo<WidgetLayoutItem[]>(() => {
    return normalizedLayout.widgets.map((widget, idx) => ({
      id: widget.id,
      visible: widget.enabled,
      enabled: widget.enabled,
      size: widget.size,
      order: widget.order ?? idx,
    }));
  }, [normalizedLayout]);

  const saveLayout = useCallback(
    (newWidgets: DashboardWidgetConfig[]) => {
      const sanitized = sanitizeLayout({ widgets: newWidgets });
      setLayout(sanitized);
      if (setStoreWidgets) {
        setStoreWidgets(
          sanitized.widgets.map((w, idx) => ({
            id: w.id,
            visible: w.enabled,
            order: w.order ?? idx,
          }))
        );
      }
    },
    [setLayout, setStoreWidgets]
  );

  function setWidgetEnabled(id: DashboardWidgetId, enabled: boolean): void {
    saveLayout(
      normalizedLayout.widgets.map((widget) =>
        widget.id === id ? { ...widget, enabled, visible: enabled } : widget
      )
    );
  }

  const toggleWidgetVisibility = useCallback(
    (id: string) => {
      const widget = normalizedLayout.widgets.find((w) => w.id === id);
      if (widget) {
        setWidgetEnabled(widget.id as DashboardWidgetId, !widget.enabled);
      }
    },
    [normalizedLayout]
  );

  function setWidgetSize(id: DashboardWidgetId, size: DashboardWidgetSize): void {
    saveLayout(
      normalizedLayout.widgets.map((widget) =>
        widget.id === id ? { ...widget, size } : widget
      )
    );
  }

  const moveWidget = useCallback(
    (id: string, direction: "up" | "down") => {
      const current = [...normalizedLayout.widgets];
      const index = current.findIndex((w) => w.id === id);
      if (index === -1) return;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return;

      const itemA = current[index];
      const itemB = current[targetIndex];
      current[index] = itemB;
      current[targetIndex] = itemA;

      const reindexed = current.map((item, idx) => ({ ...item, order: idx }));
      saveLayout(reindexed);
    },
    [normalizedLayout, saveLayout]
  );

  function reorderWidgets(idsInOrder: DashboardWidgetId[]): void {
    const current = normalizedLayout.widgets;
    const byId = new Map(current.map((widget) => [widget.id, widget]));
    const reordered: DashboardWidgetConfig[] = [];
    let order = 0;

    for (const id of idsInOrder) {
      const item = byId.get(id);
      if (item) {
        reordered.push({ ...item, order: order++ });
      }
    }

    for (const widget of current) {
      if (!idsInOrder.includes(widget.id)) {
        reordered.push({ ...widget, order: order++ });
      }
    }

    saveLayout(reordered);
  }

  function applyPreset(name: keyof typeof presets): void {
    saveLayout(presets[name]?.widgets ?? defaultLayout.widgets);
  }

  function resetToDefault(): void {
    saveLayout(defaultLayout.widgets);
  }

  const resetLayout = useCallback(() => {
    resetToDefault();
  }, []);

  const isWidgetVisible = useCallback(
    (id: string) => {
      const widget = normalizedLayout.widgets.find((w) => w.id === id);
      return widget ? widget.enabled : true;
    },
    [normalizedLayout]
  );

  function exportLayout(): string {
    return JSON.stringify(normalizedLayout, null, 2);
  }

  function importLayout(payload: string): { ok: boolean; message: string } {
    try {
      const parsed = JSON.parse(payload) as DashboardLayout;
      if (!parsed || !Array.isArray(parsed.widgets)) {
        return { ok: false, message: "Invalid layout payload" };
      }
      saveLayout(parsed.widgets);
      return { ok: true, message: "Layout imported successfully" };
    } catch {
      return { ok: false, message: "Unable to parse layout JSON" };
    }
  }

  return {
    layout: flatLayoutList,
    rawLayout: normalizedLayout,
    widgetDefinitions,
    enabledWidgets,
    isCustomizing,
    setIsCustomizing,
    toggleWidgetVisibility,
    moveWidget,
    setWidgetEnabled,
    setWidgetSize,
    reorderWidgets,
    applyPreset,
    resetToDefault,
    resetLayout,
    isWidgetVisible,
    exportLayout,
    importLayout,
  };
}
