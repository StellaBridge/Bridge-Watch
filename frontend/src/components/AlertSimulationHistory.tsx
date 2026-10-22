import { type SimulationResult, type SimulationSeverity } from "../hooks/useAlertSimulation";
import { SEVERITY_STYLES } from "../pages/AlertSimulationSandbox";

export interface AlertSimulationHistoryProps {
  history: Array<{
    simulationId: string;
    timestamp: string;
    input: {
      severity: "critical" | "high" | "medium" | "low";
      assetCode?: string;
      sourceType?: string;
      label?: string;
    };
    summary: {
      wouldDispatch: boolean;
      totalMatched: number;
      totalActiveRules: number;
    };
  }>;
  onRestore: (run: {
    simulationId: string;
    timestamp: string;
    input: {
      severity: "critical" | "high" | "medium" | "low";
      assetCode?: string;
      sourceType?: string;
      label?: string;
    };
    summary: {
      wouldDispatch: boolean;
      totalMatched: number;
      totalActiveRules: number;
    };
  }) => void;
  onClear: () => void;
}

export function SimulationHistory({
  history,
  onRestore,
  onClear,
}: AlertSimulationHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-stellar-border bg-stellar-card/50 p-8 text-center">
        <p className="text-stellar-text-secondary text-sm">No simulation runs recorded yet.</p>
        <p className="text-xs text-stellar-text-muted mt-1">Runs are saved locally in your browser.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stellar-text-muted">
          {history.length} run{history.length !== 1 ? "s" : ""} — stored locally
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Clear all
        </button>
      </div>

      <div className="space-y-2" role="list" aria-label="Simulation history">
        {history.map((run) => (
          <button
            key={run.simulationId}
            type="button"
            role="listitem"
            onClick={() => onRestore(run)}
            className="w-full text-left rounded-lg border border-stellar-border bg-stellar-card/50 hover:bg-stellar-card-hover hover:border-stellar-blue/40 p-3 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                      SEVERITY_STYLES[run.input.severity as "critical" | "high" | "medium" | "low"]?.badge ?? ""
                    }`}
                  >
                    {run.input.severity}
                  </span>
                  {run.input.label && (
                    <span className="text-xs text-white truncate">"{run.input.label}"</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-stellar-text-muted">
                  {run.input.assetCode && <span>{run.input.assetCode}</span>}
                  {run.input.assetCode && run.input.sourceType && (
                    <span aria-hidden="true">·</span>
                  )}
                  {run.input.sourceType && <span>{run.input.sourceType}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span
                  className={`text-xs font-medium ${
                    run.summary.wouldDispatch ? "text-green-400" : "text-stellar-text-muted"
                  }`}
                >
                  {run.summary.wouldDispatch ? "Fires" : "Silent"}
                </span>
                <p className="text-xs text-stellar-text-muted">
                  {run.summary.totalMatched}/{run.summary.totalActiveRules} matched
                </p>
              </div>
            </div>
            <time
              dateTime={run.timestamp}
              className="block text-xs text-stellar-text-muted mt-1.5"
            >
              {new Date(run.timestamp).toLocaleString()}
            </time>
          </button>
        ))}
      </div>
    </div>
  );
}

const SEVERITY_STYLES: Record<
  "critical" | "high" | "medium" | "low",
  { badge: string; dot: string }
> = {
  critical: { badge: "bg-red-900/50 text-red-400 border border-red-700", dot: "bg-red-500" },
  high: { badge: "bg-orange-900/50 text-orange-400 border border-orange-700", dot: "bg-orange-500" },
  medium: { badge: "bg-yellow-900/50 text-yellow-400 border border-yellow-700", dot: "bg-yellow-500" },
  low: { badge: "bg-blue-900/50 text-blue-400 border border-blue-700", dot: "bg-blue-500" },
};