import { Suspense } from "react";
import { useBridges } from "../hooks/useBridges";
import BridgeStatusCard from "../components/BridgeStatusCard";
import { SkeletonCard, ErrorBoundary } from "../components/Skeleton";

export default function Bridges() {
  const { data, isLoading } = useBridges();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Bridges</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Monitor cross-chain bridge status, supply consistency, and performance
        </p>
      </div>

      {/* Bridge Cards */}
      <ErrorBoundary onRetry={() => window.location.reload()}>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} rows={6} ariaLabel={`Loading bridge card ${i}`} />
              ))}
            </div>
          }
        >
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} rows={6} ariaLabel={`Loading bridge card ${i}`} />
              ))}
            </div>
          ) : data && data.bridges.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.bridges.map(
                (bridge: {
                  name: string;
                  status: "healthy" | "degraded" | "down" | "unknown";
                  totalValueLocked: number;
                  supplyOnStellar: number;
                  supplyOnSource: number;
                  mismatchPercentage: number;
                }) => (
                  <BridgeStatusCard key={bridge.name} {...bridge} />
                )
              )}
            </div>
          ) : (
            <div className="bg-stellar-card border border-stellar-border rounded-lg p-8 text-center">
              <p className="text-stellar-text-secondary">
                No bridge data available. Bridge monitoring will populate this page
                once configured and running.
              </p>
            </div>
          )}
        </Suspense>
      </ErrorBoundary>

      {/* Bridge Performance Table */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Bridge Performance
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Bridge performance metrics table
            </caption>
            <thead>
              <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                <th scope="col" className="pb-3 pr-4">
                  Bridge
                </th>
                <th scope="col" className="pb-3 pr-4">
                  24h Volume
                </th>
                <th scope="col" className="pb-3 pr-4">
                  7d Volume
                </th>
                <th scope="col" className="pb-3 pr-4">
                  Avg Transfer Time
                </th>
                <th scope="col" className="pb-3">
                  30d Uptime
                </th>
              </tr>
            </thead>
            <tbody className="text-white">
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-stellar-text-secondary"
                >
                  Performance data will appear once bridge monitoring is active
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
