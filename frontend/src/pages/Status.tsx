import { useQuery } from "@tanstack/react-query";
import { getBridges, getServerHealth } from "../services/api";

function statusDot(status: "healthy" | "degraded" | "down" | "unknown") {
  const map = {
    healthy: "bg-emerald-500",
    degraded: "bg-amber-500",
    down: "bg-red-500",
    unknown: "bg-stellar-text-secondary",
  } as const;
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${map[status]}`} aria-hidden />;
}

export default function Status() {
  const healthQuery = useQuery({
    queryKey: ["system-health"],
    queryFn: getServerHealth,
    refetchInterval: 30_000,
  });

  const bridgesQuery = useQuery({
    queryKey: ["bridges", "status-page"],
    queryFn: async () => {
      const res = await getBridges();
      return res.bridges;
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Service status</h1>
        <p className="mt-2 text-stellar-text-secondary">
          API availability and bridge connectivity signals used by Bridge Watch.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section
          className="rounded-xl border border-stellar-border bg-stellar-card p-6"
          aria-labelledby="api-status-heading"
        >
          <h2 id="api-status-heading" className="text-lg font-semibold text-white mb-4">
            API server
          </h2>
          {healthQuery.isLoading && (
            <p className="text-stellar-text-secondary text-sm">Checking health endpoint…</p>
          )}
          {healthQuery.isError && (
            <p className="text-red-400 text-sm" role="alert">
              {healthQuery.error instanceof Error ? healthQuery.error.message : "Unable to reach API."}
            </p>
          )}
          {healthQuery.data && (
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-white">
                {statusDot(healthQuery.data.status === "ok" ? "healthy" : "unknown")}
                <span>Status: {healthQuery.data.status}</span>
              </li>
              <li className="text-stellar-text-secondary">
                Last check: {new Date(healthQuery.data.timestamp).toLocaleString()}
              </li>
            </ul>
          )}
        </section>

        <section
          className="rounded-xl border border-stellar-border bg-stellar-card p-6 md:col-span-2"
          aria-labelledby="bridges-status-heading"
        >
          <h2 id="bridges-status-heading" className="text-lg font-semibold text-white mb-4">
            Bridges
          </h2>
          {bridgesQuery.isLoading && (
            <p className="text-stellar-text-secondary text-sm">Loading bridge statuses…</p>
          )}
          {bridgesQuery.isError && (
            <p className="text-red-400 text-sm" role="alert">
              {bridgesQuery.error instanceof Error
                ? bridgesQuery.error.message
                : "Failed to load bridges."}
            </p>
          )}
          {bridgesQuery.data && bridgesQuery.data.length === 0 && (
            <p className="text-stellar-text-secondary text-sm">No bridges configured.</p>
          )}
          {bridgesQuery.data && bridgesQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-stellar-border text-left text-stellar-text-secondary">
                    <th className="pb-2 pr-4 font-medium">Bridge</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">TVL (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {bridgesQuery.data.map((b) => (
                    <tr key={b.name} className="border-b border-stellar-border/60">
                      <td className="py-3 pr-4 text-white">{b.name}</td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-2 text-stellar-text-secondary">
                          {statusDot(b.status)}
                          <span className="capitalize">{b.status}</span>
                        </span>
                      </td>
                      <td className="py-3 text-stellar-text-secondary tabular-nums">
                        {b.totalValueLocked.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
