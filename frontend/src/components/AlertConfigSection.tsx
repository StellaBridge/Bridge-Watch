import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import AlertSnoozeControls from "./alerts/AlertSnoozeControls";
import { useAlertSnoozes } from "../hooks/useAlertSnoozes";
import { updateAlertThresholds } from "../services/api";
import type { Alert } from "../types";

interface AlertConfigSectionProps {
  alerts: Alert[] | null | undefined;
  isLoading: boolean;
}

interface ThresholdForm {
  warningThreshold: string;
  criticalThreshold: string;
  cooldownMinutes: string;
}

const DEFAULT_THRESHOLDS: ThresholdForm = {
  warningThreshold: "70",
  criticalThreshold: "90",
  cooldownMinutes: "15",
};

const SEVERITY_STYLES: Record<Alert["severity"], string> = {
  info: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  warning: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-200",
  critical: "bg-red-500/20 text-red-700 dark:text-red-300",
};

export default function AlertConfigSection({ alerts, isLoading }: AlertConfigSectionProps) {
  const { snoozeMany, snooze, unsnooze, getStatus } = useAlertSnoozes();
  const [thresholds, setThresholds] = useState<ThresholdForm>(DEFAULT_THRESHOLDS);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const activeAlerts = (alerts ?? []).filter((alert) => !getStatus(alert.id));
  const saveThresholds = useMutation({ mutationFn: updateAlertThresholds });

  const updateThreshold = (key: keyof ThresholdForm, value: string) => {
    setThresholds((current) => ({ ...current, [key]: value }));
    setValidationError(null);
    setSaveStatus(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.values(thresholds).map(Number);
    if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
      setSaveStatus(null);
      setValidationError("Threshold values must be positive numbers.");
      return;
    }
    if (Number(thresholds.warningThreshold) >= Number(thresholds.criticalThreshold)) {
      setSaveStatus(null);
      setValidationError("Critical threshold must be greater than the warning threshold.");
      return;
    }

    setValidationError(null);
    saveThresholds.mutate(
      {
        warningThreshold: Number(thresholds.warningThreshold),
        criticalThreshold: Number(thresholds.criticalThreshold),
        cooldownMinutes: Number(thresholds.cooldownMinutes),
      },
      {
        onSuccess: () => setSaveStatus("Alert configuration saved."),
        onError: () => setValidationError("Failed to save alert configuration."),
      }
    );
  };

  const handleReset = () => {
    setThresholds(DEFAULT_THRESHOLDS);
    setValidationError(null);
    setSaveStatus(null);
  };

  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Alerts</h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-stellar-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-xl p-6">
      <form onSubmit={handleSubmit} aria-label="Alert threshold configuration" noValidate
        className="mb-6 space-y-3 rounded-lg border border-stellar-border p-4">
        <h3 className="text-sm font-semibold text-white">Alert thresholds</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block text-sm">
            <span className="text-stellar-text-secondary">Warning threshold (%)</span>
            <input type="number" min="1" max="100" value={thresholds.warningThreshold}
              onChange={(event) => updateThreshold("warningThreshold", event.target.value)}
              className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white" />
          </label>
          <label className="block text-sm">
            <span className="text-stellar-text-secondary">Critical threshold (%)</span>
            <input type="number" min="1" max="100" value={thresholds.criticalThreshold}
              onChange={(event) => updateThreshold("criticalThreshold", event.target.value)}
              className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white" />
          </label>
          <label className="block text-sm">
            <span className="text-stellar-text-secondary">Cooldown (minutes)</span>
            <input type="number" min="1" value={thresholds.cooldownMinutes}
              onChange={(event) => updateThreshold("cooldownMinutes", event.target.value)}
              className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white" />
          </label>
        </div>
        {validationError && <p role="alert" className="text-sm text-red-300">{validationError}</p>}
        {saveStatus && <p role="status" className="text-sm text-green-300">{saveStatus}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saveThresholds.isPending}
            className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {saveThresholds.isPending ? "Saving..." : "Save configuration"}
          </button>
          <button type="button" onClick={handleReset}
            className="rounded-md border border-stellar-border px-4 py-2 text-sm text-stellar-text-primary">
            Reset to defaults
          </button>
        </div>
      </form>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Alerts</h3>
        {activeAlerts.length > 0 ? (
          <AlertSnoozeControls
            label="all active alerts"
            compact
            snoozedUntil={null}
            onSnooze={(durationMinutes) =>
              snoozeMany(
                activeAlerts.map((alert) => ({ key: alert.id, label: alert.message })),
                durationMinutes
              )
            }
          />
        ) : null}
      </div>
      {alerts && alerts.length > 0 ? (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const status = getStatus(alert.id);

            return (
              <div
                key={alert.id}
                className="flex flex-col gap-3 rounded-lg border border-stellar-border bg-stellar-dark p-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${SEVERITY_STYLES[alert.severity]}`}
                  >
                    {alert.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{alert.message}</p>
                    <p className="mt-1 text-xs text-stellar-text-secondary">
                      {new Date(alert.createdAt).toLocaleString()}
                    </p>
                    {status ? (
                      <p className="mt-1 text-xs text-stellar-blue">
                        Snoozed until {new Date(status.snoozedUntil).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>
                <AlertSnoozeControls
                  label={alert.message}
                  snoozedUntil={status?.snoozedUntil ?? null}
                  onSnooze={(durationMinutes) => snooze(alert.id, alert.message, durationMinutes)}
                  onUnsnooze={status ? () => unsnooze(alert.id) : undefined}
                  compact
                />
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-stellar-text-secondary text-sm">No active alerts.</p>
      )}
    </div>
  );
}
