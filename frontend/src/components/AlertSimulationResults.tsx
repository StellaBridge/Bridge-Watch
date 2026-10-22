import { useState } from "react";
import { type SimulationResult, type SimulationInput, type SimulationSeverity } from "../hooks/useAlertSimulation";
import { SEVERITY_STYLES } from "../pages/AlertSimulationSandbox";

export interface SimulationResultsProps {
  result: {
    simulationId: string;
    timestamp: string;
    input: SimulationInput;
    summary: {
      wouldDispatch: boolean;
      totalMatched: number;
      totalActiveRules: number;
    };
    input: {
      severity: SimulationSeverity;
      assetCode?: string;
      sourceType?: string;
      label?: string;
    };
    results: Array<{
      ruleId: string;
      ruleName: string;
      matched: boolean;
      channel: string;
      wouldDispatch: boolean;
    }>;
    skippedInactive: number;
  };
}

export function SimulationResults({ result }: { result: any }) {
  const { summary, input, results, skippedInactive } = result;
  const [showSkipped, setShowSkipped] = useState(false);

  return (
    <div className="space-y-4" aria-label="Simulation results">
      {/* Run metadata */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stellar-text-muted">
        <span className="font-mono text-stellar-text-secondary">{result.simulationId}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={result.timestamp}>{new Date(result.timestamp).toLocaleString()}</time>
        {result.input.label && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-stellar-text-primary">"{result.input.label}"</span>
          </>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className={`rounded-lg border p-3 text-center ${
            summary.wouldDispatch
              ? "border-green-700 bg-green-900/20"
              : "border-stellar-border bg-stellar-card"
          }`}
        >
          <p
            className={`text-xl font-bold ${summary.wouldDispatch ? "text-green-400" : "text-stellar-text-muted"}`}
          >
            {summary.wouldDispatch ? "FIRES" : "SILENT"}
          </p>
          <p className="text-xs text-stellar-text-muted mt-0.5">Would dispatch</p>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-3 text-center">
          <p className="text-xl font-bold text-white">{summary.totalMatched}</p>
          <p className="text-xs text-stellar-text-muted mt-0.5">Rules matched</p>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-3 text-center">
          <p className="text-xl font-bold text-white">{summary.totalActiveRules}</p>
          <p className="text-xs text-stellar-text-muted mt-0.5">Rules checked</p>
        </div>
      </div>

      {/* Simulated input echo */}
      <div className="rounded-lg border border-stellar-border bg-stellar-dark/30 px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-stellar-text-muted">Severity:</span>
        <span className={`font-semibold uppercase px-1.5 py-0.5 rounded ${SEVERITY_STYLES[input.severity]?.badge ?? ""}`}>
          {input.severity}
        </span>
        {input.assetCode && (
          <>
            <span className="text-stellar-text-muted">Asset:</span>
            <span className="font-mono">{input.assetCode}</span>
          )}
        </div>
      </div>

      {/* Results table */}
      <div className="rounded-lg border border-stellar-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stellar-dark/50 border-b border-stellar-border">
              <th className="px-3 py-2 text-left text-xs font-medium text-stellar-text-muted">Rule</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-stellar-text-muted">Channel</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-stellar-text-muted">Matched</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-stellar-text-muted">Dispatch</th>
            </thead>
            <tbody className="divide-y divide-stellar-border/50">
              {results.map((r) => (
                <tr key={r.ruleId} className="hover:bg-stellar-card-hover">
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.ruleName}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${{
                      in_app: "bg-blue-900/30 text-blue-400",
                      webhook: "bg-purple-900/30 text-purple-400",
                      email: "bg-green-900/30 text-green-400",
                    }[r.channel] ?? "bg-gray-800 text-gray-400"}`}>
                      {r.channel}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={r.matched ? "text-green-400" : "text-stellar-text-muted"}>
                      {r.matched ? "✓" : "✗"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={r.wouldDispatch ? "text-green-400" : "text-stellar-text-muted"}>
                      {r.wouldDispatch ? "✓" : "✗"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </tbody>
      </table>
    </div>

    {/* Skipped inactive rules */}
    {skippedInactive > 0 && (
      <details className="group">
        <summary className="flex items-center gap-2 text-xs text-stellar-text-muted cursor-pointer p-2 rounded hover:bg-stellar-card-hover">
          <span className="text-stellar-text-secondary">Show skipped rules</span>
          <span className="text-stellar-text-muted">({skippedInactive} hidden)</span>
        </summary>
        <div className="mt-2 p-3 rounded-lg border border-stellar-border bg-stellar-dark/30">
          <p className="text-xs text-stellar-text-muted text-center">
            {skippedInactive} inactive rules hidden
          </p>
        </div>
      </details>
    )}
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