import { useEffect } from "react";
import NotificationPreferences from "../components/NotificationPreferences";
import { usePreferences } from "../context/PreferencesContext";
import { useToast } from "../context/ToastContext";
import { useNotificationContext } from "../hooks/useNotificationContext";

export default function Settings() {
  const { prefs, setPrefs } = usePreferences();
  const { showSuccess } = useToast();
  const { addNotification } = useNotificationContext();

  useEffect(() => {
    if (prefs.reducedMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }
  }, [prefs.reducedMotion]);

  const triggerTestNotification = (type: "alert" | "system" | "info") => {
    addNotification({
      title: `Test ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      message: `This is a test ${type} notification to verify the Notification Center functionality.`,
      type,
      link: type === "alert" ? "/dashboard" : undefined,
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary mb-2">Settings</h1>
        <p className="text-stellar-text-secondary">
          Manage your application preferences, display options, and notification settings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section id="notifications" aria-labelledby="settings-notifications-heading">
            <h2
              id="settings-notifications-heading"
              className="text-xl font-semibold text-stellar-text-primary mb-4 flex items-center gap-2"
            >
              <svg className="w-5 h-5 text-stellar-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              Notification settings
            </h2>
            <NotificationPreferences />
          </section>

          <section
            className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-6"
            aria-labelledby="settings-display-heading"
          >
            <h2 id="settings-display-heading" className="text-lg font-semibold text-stellar-text-primary">
              Display
            </h2>
            <p className="text-sm text-stellar-text-secondary -mt-2">
              Saved in this browser only.
            </p>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-stellar-text-secondary">
                Compact number format
                <span className="block text-xs mt-1 text-stellar-text-secondary/80">
                  Prefer shorter numeric labels where the UI supports it.
                </span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
                checked={prefs.compactNumbers}
                onChange={(e) => {
                  setPrefs({ compactNumbers: e.target.checked });
                  showSuccess("Preference saved.");
                }}
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-stellar-text-secondary">
                Reduce motion
                <span className="block text-xs mt-1 text-stellar-text-secondary/80">
                  Minimize animations for charts and loading states.
                </span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
                checked={prefs.reducedMotion}
                onChange={(e) => {
                  setPrefs({ reducedMotion: e.target.checked });
                  showSuccess("Preference saved.");
                }}
              />
            </label>
          </section>

          <section
            className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4"
            aria-labelledby="settings-data-heading"
          >
            <h2 id="settings-data-heading" className="text-lg font-semibold text-stellar-text-primary">
              Data refresh
            </h2>
            <p className="text-sm text-stellar-text-secondary">
              Target interval for live dashboards. The app aligns polling with this preference where possible.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: 30_000 as const, label: "30 seconds" },
                  { value: 60_000 as const, label: "1 minute" },
                  { value: 120_000 as const, label: "2 minutes" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setPrefs({ dataRefreshMs: opt.value });
                    showSuccess("Refresh interval updated.");
                  }}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-card ${
                    prefs.dataRefreshMs === opt.value
                      ? "bg-stellar-blue text-white"
                      : "bg-stellar-dark text-stellar-text-secondary hover:text-stellar-text-primary border border-stellar-border"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="settings-dev-heading">
            <h2
              id="settings-dev-heading"
              className="text-xl font-semibold text-stellar-text-primary mb-4 flex items-center gap-2"
            >
              <svg className="w-5 h-5 text-stellar-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.477 2.387a2 2 0 00.547 1.022l1.414 1.414a2 2 0 001.022.547l2.387.477a2 2 0 001.96-1.414l.477-2.387a2 2 0 00-.547-1.022l-1.414-1.414z"
                />
              </svg>
              Developer tools
            </h2>
            <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
              <p className="text-sm text-stellar-text-secondary mb-4">
                Trigger manual notifications to test the real-time alerting system.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => triggerTestNotification("info")}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/30 transition-colors text-sm font-medium"
                >
                  Test Info
                </button>
                <button
                  type="button"
                  onClick={() => triggerTestNotification("system")}
                  className="px-4 py-2 bg-stellar-blue/20 text-stellar-blue border border-stellar-blue/30 rounded-md hover:bg-stellar-blue/30 transition-colors text-sm font-medium"
                >
                  Test System
                </button>
                <button
                  type="button"
                  onClick={() => triggerTestNotification("alert")}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 transition-colors text-sm font-medium"
                >
                  Test Alert
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
            <h3 className="text-stellar-text-primary font-medium mb-2">Profile information</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-stellar-blue flex items-center justify-center text-xl font-bold text-white">
                JS
              </div>
              <div>
                <p className="text-stellar-text-primary font-medium">John Stellar</p>
                <p className="text-xs text-stellar-text-secondary">Network Operator</p>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="w-full py-2 bg-stellar-border text-stellar-text-muted rounded-md text-sm cursor-not-allowed"
            >
              Edit Profile (Locked)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
