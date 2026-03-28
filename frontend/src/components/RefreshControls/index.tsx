import { useState } from "react";
import AutoRefreshToggle from "./AutoRefreshToggle";
import RefreshButton from "./RefreshButton";
import RefreshSettingsPanel from "./RefreshSettingsPanel";
import type { RefreshTarget } from "../../hooks/useRefreshControls";

type RefreshControlsProps = {
  autoRefreshEnabled: boolean;
  onAutoRefreshEnabledChange: (value: boolean) => void;
  refreshIntervalMs: number;
  onRefreshIntervalChange: (value: number) => void;
  refreshOnFocus: boolean;
  onRefreshOnFocusChange: (value: boolean) => void;
  targets: RefreshTarget[];
  selectedTargetIds: string[];
  onSelectedTargetIdsChange: (value: string[]) => void;
  onRefresh: () => void | Promise<void>;
  onCancelRefresh: () => void | Promise<void>;
  isRefreshing: boolean;
  lastUpdatedAt: Date | null;
};

function formatTimestamp(value: Date | null): string {
  if (!value) return "Not refreshed yet";

  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function RefreshControls({
  autoRefreshEnabled,
  onAutoRefreshEnabledChange,
  refreshIntervalMs,
  onRefreshIntervalChange,
  refreshOnFocus,
  onRefreshOnFocusChange,
  targets,
  selectedTargetIds,
  onSelectedTargetIdsChange,
  onRefresh,
  onCancelRefresh,
  isRefreshing,
  lastUpdatedAt,
}: RefreshControlsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border border-stellar-border bg-stellar-card/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <RefreshButton onRefresh={onRefresh} isRefreshing={isRefreshing} disabled={selectedTargetIds.length === 0} />

        {isRefreshing && (
          <button
            type="button"
            onClick={() => {
              void onCancelRefresh();
            }}
            className="rounded-md border border-red-500/50 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
          >
            Cancel refresh
          </button>
        )}

        <AutoRefreshToggle checked={autoRefreshEnabled} onChange={onAutoRefreshEnabledChange} />

        <button
          type="button"
          onClick={() => setSettingsOpen((prev) => !prev)}
          className="rounded-md border border-stellar-border px-3 py-2 text-sm text-stellar-text-secondary hover:text-white"
        >
          {settingsOpen ? "Hide settings" : "Refresh settings"}
        </button>

        <span className="text-xs text-stellar-text-secondary">Last updated: {formatTimestamp(lastUpdatedAt)}</span>
      </div>

      {settingsOpen && (
        <RefreshSettingsPanel
          refreshIntervalMs={refreshIntervalMs}
          onRefreshIntervalChange={onRefreshIntervalChange}
          refreshOnFocus={refreshOnFocus}
          onRefreshOnFocusChange={onRefreshOnFocusChange}
          targets={targets}
          selectedTargetIds={selectedTargetIds}
          onSelectedTargetIdsChange={onSelectedTargetIdsChange}
        />
      )}
    </div>
  );
}
