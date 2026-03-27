import { useEffect, useState } from "react";
import SkeletonCard from "../components/Skeleton/SkeletonCard";
import SkeletonChart from "../components/Skeleton/SkeletonChart";
import LoadingSpinner from "../components/Skeleton/LoadingSpinner";

export default function Analytics() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-white">Analytics</h1>
          <p className="mt-2 text-stellar-text-secondary">
            Historical trends, cross-asset comparisons, and ecosystem health
            metrics
          </p>
        </header>

        <LoadingSpinner message="Loading analytics data..." showProgress />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} variant="dashboard" />
          ))}
        </div>

        <SkeletonChart title="Health Score Trends" />
        <SkeletonChart title="Bridge Volume Analytics" />
        <SkeletonChart title="Liquidity Distribution Across DEXs" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Historical trends, cross-asset comparisons, and ecosystem health
          metrics
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "Total Bridges Monitored", value: "--" },
          { label: "Total Assets Tracked", value: "--" },
          { label: "Average Health Score", value: "--" },
          { label: "Total Value Locked", value: "--" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-stellar-card border border-stellar-border rounded-lg p-6"
          >
            <p className="text-sm text-stellar-text-secondary">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Health Score Trends */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Health Score Trends
        </h2>
        <div className="h-64 flex items-center justify-center">
          <p className="text-stellar-text-secondary">
            Historical health score charts will render here once data is
            available
          </p>
        </div>
      </div>

      {/* Volume Analytics */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Bridge Volume Analytics
        </h2>
        <div className="h-64 flex items-center justify-center">
          <p className="text-stellar-text-secondary">
            Volume analytics will render here once bridge monitoring data is
            collected
          </p>
        </div>
      </div>

      {/* Liquidity Distribution */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Liquidity Distribution Across DEXs
        </h2>
        <div className="h-64 flex items-center justify-center">
          <p className="text-stellar-text-secondary">
            DEX liquidity distribution charts will render here once data is
            aggregated
          </p>
        </div>
      </div>
    </div>
  );
}
