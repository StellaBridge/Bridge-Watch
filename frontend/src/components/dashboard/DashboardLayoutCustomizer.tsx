import React from "react";
import {
  type WidgetLayoutItem,
  WIDGET_TITLES,
} from "../../hooks/useDashboardLayout";

interface DashboardLayoutCustomizerProps {
  open: boolean;
  onClose: () => void;
  layout: WidgetLayoutItem[];
  onToggleVisibility: (id: string) => void;
  onMoveWidget: (id: string, direction: "up" | "down") => void;
  onResetLayout: () => void;
}

export default function DashboardLayoutCustomizer({
  open,
  onClose,
  layout,
  onToggleVisibility,
  onMoveWidget,
  onResetLayout,
}: DashboardLayoutCustomizerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-customizer-title"
        className="relative mx-auto w-full max-w-lg rounded-3xl border border-stellar-border bg-stellar-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="layout-customizer-title"
              className="text-xl font-semibold text-white"
            >
              Customize dashboard layout
            </h2>
            <p className="mt-1 text-xs text-stellar-text-secondary">
              Reorder widgets and toggle their visibility. Your layout is saved automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stellar-border bg-stellar-dark/90 p-2 text-stellar-text-secondary transition-colors hover:bg-stellar-border hover:text-white"
            aria-label="Close layout customizer"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {layout.map((item, index) => {
            const title = WIDGET_TITLES[item.id] ?? item.id;
            return (
              <div
                key={item.id}
                data-testid={`widget-layout-row-${item.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-stellar-border bg-stellar-dark/70 px-4 py-3"
              >
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.visible}
                    onChange={() => onToggleVisibility(item.id)}
                    className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
                    aria-label={`Toggle visibility of ${title}`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      item.visible ? "text-white" : "text-stellar-text-secondary line-through"
                    }`}
                  >
                    {title}
                  </span>
                </label>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMoveWidget(item.id, "up")}
                    className="rounded-lg border border-stellar-border bg-stellar-dark px-2.5 py-1 text-xs font-semibold text-stellar-text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Move ${title} up`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={index === layout.length - 1}
                    onClick={() => onMoveWidget(item.id, "down")}
                    className="rounded-lg border border-stellar-border bg-stellar-dark px-2.5 py-1 text-xs font-semibold text-stellar-text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={`Move ${title} down`}
                  >
                    ▼
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-stellar-border pt-4">
          <button
            type="button"
            onClick={onResetLayout}
            className="rounded-2xl border border-stellar-border px-4 py-2 text-xs font-semibold text-stellar-text-secondary transition hover:bg-stellar-border hover:text-white"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-stellar-blue px-5 py-2 text-xs font-semibold text-white transition hover:bg-stellar-blue/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
