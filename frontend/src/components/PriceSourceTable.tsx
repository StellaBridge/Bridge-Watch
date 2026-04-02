import type { PriceSource } from "../types";

interface PriceSourceTableProps {
  sources: PriceSource[];
  isLoading: boolean;
  vwap: number | null;
}

function getStatusStyle(status: PriceSource["status"]): string {
  switch (status) {
    case "active":
      return "bg-green-500/20 text-green-400";
    case "stale":
      return "bg-yellow-500/20 text-yellow-400";
    case "offline":
      return "bg-red-500/20 text-red-400";
  }
}

function getDeviationColor(deviation: number): string {
  const abs = Math.abs(deviation);
  if (abs < 0.1) return "text-green-400";
  if (abs < 0.5) return "text-yellow-400";
  return "text-red-400";
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

export default function PriceSourceTable({
  sources,
  isLoading,
  vwap,
}: PriceSourceTableProps) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Price Sources
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-stellar-border rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Price Sources</h3>
        {vwap !== null && (
          <div className="text-right">
            <span className="text-xs text-stellar-text-secondary">VWAP</span>
            <p className="text-lg font-bold text-white">${vwap.toFixed(4)}</p>
          </div>
        )}
      </div>

      {sources.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                <th className="pb-3 pr-4 font-medium">Source</th>
                <th className="pb-3 pr-4 font-medium">Price</th>
                <th className="pb-3 pr-4 font-medium">Deviation</th>
                <th className="pb-3 pr-4 font-medium">Last Updated</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-white">
              {sources.map((source) => (
                <tr
                  key={source.source}
                  className="border-b border-stellar-border last:border-b-0"
                >
                  <td className="py-3 pr-4 font-medium">{source.source}</td>
                  <td className="py-3 pr-4 font-mono">
                    ${source.price.toFixed(4)}
                  </td>
                  <td
                    className={`py-3 pr-4 font-mono ${getDeviationColor(source.deviation)}`}
                  >
                    {source.deviation > 0 ? "+" : ""}
                    {source.deviation.toFixed(4)}%
                  </td>
                  <td
                    className="py-3 pr-4 text-stellar-text-secondary"
                    title={new Date(source.timestamp).toLocaleString()}
                  >
                    {formatTimestamp(source.timestamp)}
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(source.status)}`}
                    >
                      {source.status.charAt(0).toUpperCase() +
                        source.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            No price source data available
          </span>
        </div>
      )}
    </div>
  );
}
