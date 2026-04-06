interface Alert {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  createdAt: string;
}

interface AlertConfigSectionProps {
  alerts: Alert[] | null | undefined;
  isLoading: boolean;
}

const SEVERITY_STYLES: Record<Alert["severity"], string> = {
  info: "bg-blue-500/20 text-blue-400",
  warning: "bg-yellow-500/20 text-yellow-400",
  critical: "bg-red-500/20 text-red-400",
};

export default function AlertConfigSection({ alerts, isLoading }: AlertConfigSectionProps) {
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
      <h3 className="text-lg font-semibold text-white mb-4">Alerts</h3>
      {alerts && alerts.length > 0 ? (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-stellar-dark border border-stellar-border"
            >
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${SEVERITY_STYLES[alert.severity]}`}
              >
                {alert.severity}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{alert.message}</p>
                <p className="text-xs text-stellar-text-secondary mt-1">
                  {new Date(alert.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-stellar-text-secondary text-sm">No active alerts.</p>
      )}
    </div>
  );
}
