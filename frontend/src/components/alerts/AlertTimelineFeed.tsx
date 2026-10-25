import { useState, useMemo } from "react";
import { useIncidentFeed } from "../../hooks/useIncidentFeed";
import type { BridgeIncident } from "../../hooks/useIncidentFeed";

interface AlertTimelineFeedProps {
  readonly bridgeId?: string;
  readonly assetCode?: string;
  readonly maxItems?: number;
  readonly className?: string;
}

type SeverityLevel = "critical" | "high" | "medium" | "low";
type ResolutionStatus = "open" | "investigating" | "resolved";

const SEVERITY_STYLES: Record<SeverityLevel, { bg: string; border: string; icon: string; label: string }> = {
  critical: { bg: "bg-red-500/10", border: "border-l-4 border-red-500", icon: "🔴", label: "Critical" },
  high: { bg: "bg-orange-500/10", border: "border-l-4 border-orange-500", icon: "🟠", label: "High" },
  medium: { bg: "bg-yellow-500/10", border: "border-l-4 border-yellow-500", icon: "🟡", label: "Medium" },
  low: { bg: "bg-blue-500/10", border: "border-l-4 border-blue-500", icon: "🔵", label: "Low" },
};

const RESOLUTION_STYLES: Record<ResolutionStatus, string> = {
  open: "bg-red-500/20 text-red-800 dark:text-red-300 border border-red-500/50",
  investigating: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-200 border border-yellow-500/50",
  resolved: "bg-green-500/20 text-green-800 dark:text-green-300 border border-green-500/50",
};

function AlertCard({ incident }: { readonly incident: BridgeIncident }) {
  const severity = incident.severity.toLowerCase() as SeverityLevel;
  const status = incident.status as ResolutionStatus;
  const style = SEVERITY_STYLES[severity];

  const relativeTime = useMemo(() => {
    const date = new Date(incident.occurredAt);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }, [incident.occurredAt]);

  return (
    <div className={`${style.border} ${style.bg} rounded-lg p-4 border border-stellar-border/50 bg-stellar-card/50`}>
      <div className="flex gap-3">
        <div className="flex-shrink-0 pt-1 text-lg">{style.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="font-medium text-stellar-text-primary truncate">{incident.title}</h4>
              <p className="text-sm text-stellar-text-secondary mt-1">{incident.description}</p>
            </div>
            <span className={`${RESOLUTION_STYLES[status]} text-xs font-medium px-2 py-1 rounded whitespace-nowrap flex-shrink-0`}>
              {status}
            </span>
          </div>

          {(incident.sourceRepository || incident.sourceActor || incident.sourceType) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {incident.sourceType && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stellar-dark/40 text-stellar-text-secondary text-xs rounded border border-stellar-border/50">
                  {incident.sourceType}
                </span>
              )}
              {incident.sourceRepository && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stellar-dark/40 text-stellar-text-secondary text-xs rounded border border-stellar-border/50">
                  {incident.sourceRepository}
                </span>
              )}
              {incident.sourceActor && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stellar-dark/40 text-stellar-text-secondary text-xs rounded border border-stellar-border/50">
                  @{incident.sourceActor}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-stellar-text-secondary">{relativeTime}</span>
            {incident.assetCode && (
              <span className="text-xs text-stellar-text-secondary">{incident.assetCode}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AlertTimelineFeed({
  bridgeId,
  assetCode,
  maxItems = 50,
  className = "",
}: AlertTimelineFeedProps) {
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ResolutionStatus | "all">("all");
  const { incidents, isLoading, error } = useIncidentFeed();

  const filteredIncidents = useMemo(() => {
    let items = incidents || [];

    if (bridgeId) {
      items = items.filter((i) => i.bridgeId === bridgeId);
    }
    if (assetCode) {
      items = items.filter((i) => i.assetCode === assetCode);
    }
    if (severityFilter !== "all") {
      items = items.filter((i) => i.severity.toLowerCase() === severityFilter);
    }
    if (statusFilter !== "all") {
      items = items.filter((i) => i.status === statusFilter);
    }

    return items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, maxItems);
  }, [incidents, bridgeId, assetCode, severityFilter, statusFilter, maxItems]);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-stellar-text-primary">Alert Timeline</h3>
          <p className="text-sm text-stellar-text-secondary mt-1">Recent alerts and incidents from bridge operations</p>
        </div>
        <button
          type="button"
          onClick={() => {}}
          className="rounded-md border border-stellar-border px-3 py-2 text-sm text-stellar-text-secondary hover:text-stellar-text-primary transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSeverityFilter("all")}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              severityFilter === "all"
                ? "border-stellar-blue bg-stellar-blue/20 text-stellar-text-primary"
                : "border-stellar-border text-stellar-text-secondary hover:text-stellar-text-primary"
            }`}
          >
            All
          </button>
          {(["critical", "high", "medium", "low"] as const).map((severity) => (
            <button
              key={severity}
              type="button"
              onClick={() => setSeverityFilter(severity)}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                severityFilter === severity
                  ? "border-stellar-blue bg-stellar-blue/20 text-stellar-text-primary"
                  : "border-stellar-border text-stellar-text-secondary hover:text-stellar-text-primary"
              }`}
            >
              {SEVERITY_STYLES[severity].label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-stellar-border hidden md:block" />

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              statusFilter === "all"
                ? "border-stellar-blue bg-stellar-blue/20 text-stellar-text-primary"
                : "border-stellar-border text-stellar-text-secondary hover:text-stellar-text-primary"
            }`}
          >
            All
          </button>
          {(["open", "investigating", "resolved"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-sm rounded-full border capitalize transition-colors ${
                statusFilter === status
                  ? "border-stellar-blue bg-stellar-blue/20 text-stellar-text-primary"
                  : "border-stellar-border text-stellar-text-secondary hover:text-stellar-text-primary"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-lg border border-stellar-border bg-stellar-card/50 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
          <p className="text-sm text-red-800 dark:text-red-300">Failed to load alerts: {error instanceof Error ? error.message : String(error)}</p>
        </div>
      ) : filteredIncidents.length === 0 ? (
        <div className="rounded-lg border border-stellar-border bg-stellar-card/50 p-8 text-center">
          <p className="text-stellar-text-secondary">No alerts found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.map((incident) => (
            <AlertCard key={incident.id} incident={incident} />
          ))}
        </div>
      )}
    </div>
  );
}
