import AlertSnoozeControls from "./alerts/AlertSnoozeControls";
import { useAlertSnoozes } from "../hooks/useAlertSnoozes";
import type { Alert } from "../types";

interface AlertConfigSectionProps {
  alerts: Alert[] | null | undefined;
  isLoading: boolean;
}

const SEVERITY_STYLES: Record<Alert["severity"], string> = {
  info: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  warning: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-200",
  critical: "bg-red-500/20 text-red-700 dark:text-red-300",
};

export default function AlertConfigSection({ alerts, isLoading }: AlertConfigSectionProps) {
  const { snoozeMany, snooze, unsnooze, getStatus } = useAlertSnoozes();
  const activeAlerts = (alerts ?? []).filter((alert) => !getStatus(alert.id));

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
