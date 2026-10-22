import { useQuery } from "@tanstack/react-query";
import {
  getExternalDependencies,
  type ExternalDependency,
} from "../../services/api";
import { CollapsibleWidget } from "./CollapsibleWidget";

function statusClasses(status: ExternalDependency["status"]) {
  switch (status) {
    case "healthy":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30";
    case "degraded":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/30";
    case "down":
      return "bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30";
    case "maintenance":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/30";
    default:
      return "bg-slate-500/15 text-slate-800 dark:text-slate-300 border border-slate-500/30";
  }
}

function formatEndpoint(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function formatLatency(latencyMs: number | null) {
  return latencyMs === null ? "n/a" : `${latencyMs} ms`;
}

export default function ExternalDependencyPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["external-dependencies"],
    queryFn: () => getExternalDependencies(true, 6),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <CollapsibleWidget
        id="external-dependencies"
        title="External Dependencies"
        defaultCollapsed={true}
      >
        <p className="text-sm text-stellar-text-secondary">
          Loading provider heartbeat data...
        </p>
      </CollapsibleWidget>
    );
  }

  if (isError || !data) {
    return (
      <CollapsibleWidget
        id="external-dependencies"
        title="External Dependencies"
        defaultCollapsed={true}
      >
        <p className="text-sm text-rose-800 dark:text-rose-300">
          Dependency monitor data is unavailable right now.
        </p>
      </CollapsibleWidget>
    );
  }

  const summaryEntries = [
    ["Healthy", data.summary.healthy],
    ["Degraded", data.summary.degraded],
    ["Down", data.summary.down],
    ["Maintenance", data.summary.maintenance],
  ] as const;

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      {summaryEntries.map(([label, count]) => (
        <span
          key={label}
          className="rounded-full border border-stellar-border bg-stellar-card px-3 py-1 text-xs text-stellar-text-secondary"
        >
          {label}: <span className="text-white">{count}</span>
        </span>
      ))}
    </div>
  );

  return (
    <CollapsibleWidget
      id="external-dependencies"
      title="External Dependencies"
      headerActions={headerActions}
      defaultCollapsed={true}
      className="rounded-lg border border-stellar-border bg-stellar-card p-6"
    >
      <div className="space-y-5">
        <p className="text-sm text-stellar-text-secondary">
          Provider heartbeat, latency thresholds, and maintenance state across upstream services.
        </p>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {data.dependencies.map((dependency) => (
            <article
              key={dependency.providerKey}
              className="rounded-lg border border-stellar-border bg-black/15 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{dependency.displayName}</p>
                  <p className="mt-1 text-xs text-stellar-text-secondary">
                    {dependency.category} · {formatEndpoint(dependency.endpoint)}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${statusClasses(dependency.status)}`}>
                  {dependency.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-stellar-border/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-stellar-text-secondary">
                    Last Latency
                  </p>
                  <p className="mt-1 text-white">{formatLatency(dependency.lastLatencyMs)}</p>
                </div>
                <div className="rounded-md bg-stellar-border/30 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-stellar-text-secondary">
                    Consecutive Failures
                  </p>
                  <p className="mt-1 text-white">{dependency.consecutiveFailures}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-stellar-text-secondary">
                <span>Warn {dependency.latencyWarningMs} ms</span>
                <span>Critical {dependency.latencyCriticalMs} ms</span>
                <span>Alert after {dependency.failureThreshold} failures</span>
              </div>

              {dependency.history && dependency.history.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-stellar-text-secondary">
                    <span>Recent Checks</span>
                    <span>{dependency.lastCheckedAt ? new Date(dependency.lastCheckedAt).toLocaleTimeString() : "No data"}</span>
                  </div>
                  <div className="flex gap-1">
                    {dependency.history
                      .slice()
                      .reverse()
                      .map((check) => (
                        <span
                          key={check.id}
                          className={`h-2 flex-1 rounded-full ${
                            check.status === "healthy"
                              ? "bg-emerald-400"
                              : check.status === "maintenance"
                              ? "bg-sky-400"
                              : check.status === "degraded"
                              ? "bg-amber-400"
                              : "bg-rose-400"
                          }`}
                          title={`${check.status} · ${formatLatency(check.latencyMs)}`}
                        />
                      ))}
                  </div>
                </div>
              )}

              {(dependency.maintenanceNote || dependency.lastError) && (
                <p className="text-xs text-stellar-text-secondary">
                  {dependency.maintenanceNote ?? dependency.lastError}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </CollapsibleWidget>
  );
}
