import { useState } from "react";
import { useNotificationContext } from "../hooks/useNotificationContext";
import { useToast } from "../context/ToastContextValue";
import { NotificationAnalyticsDashboard } from "../components/NotificationAnalyticsDashboard";

type Channel = "in_app" | "email" | "webhook";
type Priority = "all" | "high_critical" | "critical_only";
type DigestFrequency = "immediate" | "hourly" | "daily" | "never";

interface ExtendedPrefs {
  channels: Channel[];
  digestFrequency: DigestFrequency;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  priority: Priority;
}

const STORAGE_KEY = "bridge-watch:notification-extended-prefs:v1";

function loadExtendedPrefs(): ExtendedPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ExtendedPrefs;
  } catch {
    // fall through
  }
  return {
    channels: ["in_app"],
    digestFrequency: "immediate",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    priority: "all",
  };
}

function saveExtendedPrefs(prefs: ExtendedPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-card ${
        checked ? "bg-stellar-blue" : "bg-stellar-border"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function NotificationPreferencesPage() {
  const { preferences, updatePreferences } = useNotificationContext();
  const { showSuccess } = useToast();
  const [extended, setExtended] = useState<ExtendedPrefs>(loadExtendedPrefs);

  function update(patch: Partial<ExtendedPrefs>) {
    const next = { ...extended, ...patch };
    setExtended(next);
    saveExtendedPrefs(next);
    showSuccess("Preference saved.");
  }

  function toggleChannel(ch: Channel) {
    const next = extended.channels.includes(ch)
      ? extended.channels.filter((c) => c !== ch)
      : [...extended.channels, ch];
    if (next.length === 0) return; // always keep at least one
    update({ channels: next });
  }

  const channelConfig: { id: Channel; label: string; description: string }[] = [
    { id: "in_app", label: "In-app", description: "Notifications appear in the sidebar drawer." },
    { id: "email", label: "Email", description: "Receive alerts via email (requires verified address)." },
    { id: "webhook", label: "Webhook", description: "POST payloads to a configured webhook endpoint." },
  ];

  const priorityOptions: { id: Priority; label: string; description: string }[] = [
    { id: "all", label: "All severities", description: "Receive notifications for every severity level." },
    { id: "high_critical", label: "High & Critical only", description: "Skip low and medium severity events." },
    { id: "critical_only", label: "Critical only", description: "Only the most urgent alerts." },
  ];

  const digestOptions: { id: DigestFrequency; label: string }[] = [
    { id: "immediate", label: "Immediate" },
    { id: "hourly", label: "Hourly digest" },
    { id: "daily", label: "Daily digest" },
    { id: "never", label: "Never" },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary mb-2">
          Notification Preferences
        </h1>
        <p className="text-stellar-text-secondary">
          Choose how and when you receive alerts about asset and bridge status changes.
        </p>
      </div>

      {/* Sound toggle (existing) */}
      <section className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-stellar-text-primary">Sound</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-stellar-text-primary">Notification sounds</p>
            <p className="text-xs text-stellar-text-secondary mt-0.5">
              Play a chime when a new notification arrives.
            </p>
          </div>
          <Toggle
            checked={preferences.soundEnabled}
            onChange={(v) => {
              updatePreferences({ soundEnabled: v });
              showSuccess("Preference saved.");
            }}
            label="Toggle notification sounds"
          />
        </div>
      </section>

      {/* Delivery channels */}
      <section className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-stellar-text-primary">Delivery channels</h2>
        <p className="text-sm text-stellar-text-secondary">
          Select where notifications are sent. At least one channel must remain active.
        </p>
        <div className="space-y-3">
          {channelConfig.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-stellar-text-primary">{ch.label}</p>
                <p className="text-xs text-stellar-text-secondary mt-0.5">{ch.description}</p>
              </div>
              <Toggle
                checked={extended.channels.includes(ch.id)}
                onChange={() => toggleChannel(ch.id)}
                label={`Toggle ${ch.label} channel`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Digest frequency */}
      <section className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-stellar-text-primary">Digest frequency</h2>
        <p className="text-sm text-stellar-text-secondary">
          Control how often batched summaries are sent instead of individual notifications.
        </p>
        <div className="flex flex-wrap gap-2">
          {digestOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => update({ digestFrequency: opt.id })}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                extended.digestFrequency === opt.id
                  ? "bg-stellar-blue text-white"
                  : "border border-stellar-border text-stellar-text-secondary hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Quiet hours */}
      <section className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stellar-text-primary">Quiet hours</h2>
            <p className="text-sm text-stellar-text-secondary mt-0.5">
              Suppress non-critical notifications during the specified time window.
            </p>
          </div>
          <Toggle
            checked={extended.quietHoursEnabled}
            onChange={(v) => update({ quietHoursEnabled: v })}
            label="Toggle quiet hours"
          />
        </div>
        {extended.quietHoursEnabled && (
          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stellar-text-secondary">From</span>
              <input
                type="time"
                value={extended.quietHoursStart}
                onChange={(e) => update({ quietHoursStart: e.target.value })}
                className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-stellar-text-secondary">Until</span>
              <input
                type="time"
                value={extended.quietHoursEnd}
                onChange={(e) => update({ quietHoursEnd: e.target.value })}
                className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
          </div>
        )}
      </section>

      {/* Priority overrides */}
      <section className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4">
        <h2 className="text-lg font-semibold text-stellar-text-primary">Priority overrides</h2>
        <p className="text-sm text-stellar-text-secondary">
          Limit which severity levels trigger a notification.
        </p>
        <div className="space-y-2">
          {priorityOptions.map((opt) => (
            <label key={opt.id} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="priority"
                value={opt.id}
                checked={extended.priority === opt.id}
                onChange={() => update({ priority: opt.id })}
                className="mt-0.5 h-4 w-4 border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
              />
              <span>
                <span className="text-sm text-stellar-text-primary">{opt.label}</span>
                <span className="block text-xs text-stellar-text-secondary mt-0.5">
                  {opt.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* #1241 — Mount orphaned NotificationAnalyticsDashboard panel */}
      <NotificationAnalyticsDashboard />
    </div>
  );
}
