import { useMemo } from "react";
import type { RefreshTarget } from "../../hooks/useRefreshControls";

type RefreshSettingsPanelProps = {
  refreshIntervalMs: number;
  onRefreshIntervalChange: (value: number) => void;
  refreshOnFocus: boolean;
  onRefreshOnFocusChange: (value: boolean) => void;
  targets: RefreshTarget[];
  selectedTargetIds: string[];
  onSelectedTargetIdsChange: (value: string[]) => void;
};

const INTERVAL_OPTIONS = [
  { label: "10s", value: 10_000 },
  { label: "30s", value: 30_000 },
  { label: "60s", value: 60_000 },
  { label: "5m", value: 300_000 },
];

export default function RefreshSettingsPanel({
  refreshIntervalMs,
  onRefreshIntervalChange,
  refreshOnFocus,
  onRefreshOnFocusChange,
  targets,
  selectedTargetIds,
  onSelectedTargetIdsChange,
}: RefreshSettingsPanelProps) {
  const allSelected = useMemo(
    () => targets.length > 0 && selectedTargetIds.length === targets.length,
    [selectedTargetIds.length, targets.length]
  );

  function handleTargetToggle(id: string, checked: boolean) {
    if (checked) {
      onSelectedTargetIdsChange(Array.from(new Set([...selectedTargetIds, id])));
      return;
    }

    onSelectedTargetIdsChange(selectedTargetIds.filter((value) => value !== id));
  }

  return (
    <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
      <h3 className="text-sm font-semibold text-white">Refresh settings</h3>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-stellar-text-secondary">
          Refresh interval
          <select
            value={refreshIntervalMs}
            onChange={(event) => onRefreshIntervalChange(Number(event.target.value))}
            className="rounded-md border border-stellar-border bg-stellar-dark px-2 py-2 text-white"
          >
            {INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex items-center gap-2 self-end text-sm text-stellar-text-secondary">
          <input
            type="checkbox"
            checked={refreshOnFocus}
            onChange={(event) => onRefreshOnFocusChange(event.target.checked)}
            className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
          />
          Refresh when window gains focus
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm text-stellar-text-secondary">Refresh scope</legend>
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) =>
              onSelectedTargetIdsChange(event.target.checked ? targets.map((target) => target.id) : [])
            }
            className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
          />
          Refresh all
        </label>

        <div className="mt-2 flex flex-wrap gap-4">
          {targets.map((target) => (
            <label key={target.id} className="inline-flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={selectedTargetIds.includes(target.id)}
                onChange={(event) => handleTargetToggle(target.id, event.target.checked)}
                className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
              />
              {target.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
