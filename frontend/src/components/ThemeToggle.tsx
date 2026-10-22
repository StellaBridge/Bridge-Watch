import { useState } from "react";
import { useTheme } from "../theme/useTheme";
import { useThemeProfileSync } from "../hooks/useThemeProfileSync";
import HighContrastToggle from "./HighContrastToggle";

export default function ThemeToggle() {
  const { mode, resolvedTheme, toggle, highContrast } = useTheme();
  const [showSync, setShowSync] = useState(false);

  const { status, error, setSyncUserId } = useThemeProfileSync({ mode, highContrast });

  const label = resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  const isDark = resolvedTheme === "dark";
  const text = isDark ? "Dark" : "Light";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={isDark}
        className="inline-flex items-center gap-2 rounded-full border border-stellar-border bg-stellar-card px-2 py-1 text-xs font-medium text-stellar-text-primary hover:border-stellar-blue focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        aria-label={label}
        title={mode === "system" ? `Theme: ${text} (System)` : `Theme: ${text}`}
      >
        <span
          aria-hidden="true"
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-stellar-border transition-colors ${
            isDark ? "bg-stellar-blue" : "bg-stellar-border/60"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              isDark ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </span>
        <span className="tabular-nums">{text}</span>
      </button>

      <HighContrastToggle />

      <button
        type="button"
        onClick={() => setShowSync((prev) => !prev)}
        aria-expanded={showSync}
        className="rounded-full border border-stellar-border bg-stellar-card px-2 py-1 text-xs font-medium text-stellar-text-secondary hover:border-stellar-blue focus:outline-none focus:ring-2 focus:ring-stellar-blue"
      >
        Sync
        <span className="sr-only"> theme across devices</span>
      </button>

      {showSync && (
        <div className="absolute right-4 top-16 z-50 w-72 rounded-lg border border-stellar-border bg-stellar-card p-3 text-xs shadow-xl">
          <p className="font-medium text-stellar-text-primary">Sync theme to your profile</p>
          <p className="mt-1 text-stellar-text-secondary">
            Enter the account id used by the preferences API. Leave empty to keep this device
            local only.
          </p>
          <label className="mt-2 block text-stellar-text-secondary" htmlFor="theme-sync-user-id">
            User id
          </label>
          <input
            id="theme-sync-user-id"
            type="text"
            defaultValue=""
            placeholder="e.g. operator-1"
            onBlur={(event) => setSyncUserId(event.target.value.trim() || null)}
            className="mt-1 w-full rounded border border-stellar-border bg-stellar-bg px-2 py-1 text-stellar-text-primary"
          />
          <p className="mt-2" role="status" aria-live="polite">
            {status === "syncing" && "Syncing…"}
            {status === "synced" && "Theme synced."}
            {status === "error" && <span className="text-red-400">{error}</span>}
            {status === "disabled" && "Local only — no user id set."}
          </p>
        </div>
      )}
    </div>
  );
}
