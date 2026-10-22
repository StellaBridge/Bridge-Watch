import type { AssetWithHealth, Bridge } from "../../types";

type StatusTone = "healthy" | "warning" | "critical" | "unknown";

interface InlineStatusCardItem {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: StatusTone;
}

interface InlineStatusCardsProps {
  assets: AssetWithHealth[];
  bridges: Bridge[];
  loading?: boolean;
}

const toneClasses: Record<StatusTone, string> = {
  healthy: "border-green-400/30 bg-green-500/10 text-green-800 dark:text-green-300",
  warning: "border-yellow-400/30 bg-yellow-500/10 text-yellow-800 dark:text-yellow-200",
  critical: "border-red-400/30 bg-red-500/10 text-red-800 dark:text-red-300",
  unknown: "border-stellar-border bg-stellar-dark/50 text-stellar-text-secondary",
};

function isStale(timestamp: string | undefined): boolean {
  if (!timestamp) return true;
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return true;
  return Date.now() - time > 15 * 60 * 1000;
}

function buildStatusItems(assets: AssetWithHealth[], bridges: Bridge[]): InlineStatusCardItem[] {
  const degradedBridgeCount = bridges.filter(
    (bridge) => bridge.status === "degraded" || bridge.status === "down",
  ).length;
  const staleAssetCount = assets.filter((asset) => isStale(asset.health?.lastUpdated)).length;
  const criticalAssetCount = assets.filter(
    (asset) => typeof asset.health?.overallScore === "number" && asset.health.overallScore < 50,
  ).length;
  const mismatchCount = bridges.filter((bridge) => bridge.mismatchPercentage > 1).length;

  return [
    {
      id: "service",
      label: "Service",
      value:
        degradedBridgeCount === 0
          ? "Healthy"
          : degradedBridgeCount === bridges.length
            ? "Critical"
            : "Watch",
      detail:
        bridges.length === 0
          ? "Waiting for bridge status"
          : `${bridges.length - degradedBridgeCount}/${bridges.length} bridges healthy`,
      tone:
        bridges.length === 0
          ? "unknown"
          : degradedBridgeCount === 0
            ? "healthy"
            : degradedBridgeCount === bridges.length
              ? "critical"
              : "warning",
    },
    {
      id: "data",
      label: "Data freshness",
      value: staleAssetCount === 0 && assets.length > 0 ? "Live" : "Stale signals",
      detail:
        assets.length === 0
          ? "Waiting for asset updates"
          : `${assets.length - staleAssetCount}/${assets.length} assets updated recently`,
      tone: assets.length === 0 ? "unknown" : staleAssetCount === 0 ? "healthy" : "warning",
    },
    {
      id: "assets",
      label: "Asset health",
      value: criticalAssetCount === 0 ? "Stable" : `${criticalAssetCount} critical`,
      detail:
        assets.length === 0
          ? "No asset health scores yet"
          : `${assets.length - criticalAssetCount}/${assets.length} above critical`,
      tone: assets.length === 0 ? "unknown" : criticalAssetCount === 0 ? "healthy" : "critical",
    },
    {
      id: "reserves",
      label: "Reserve checks",
      value: mismatchCount === 0 ? "Aligned" : `${mismatchCount} mismatch`,
      detail:
        bridges.length === 0
          ? "Waiting for bridge reserve data"
          : "Mismatch threshold is greater than 1%",
      tone: bridges.length === 0 ? "unknown" : mismatchCount === 0 ? "healthy" : "warning",
    },
  ];
}

function StatusSkeleton() {
  return (
    <div className="rounded-lg border border-stellar-border bg-stellar-card p-3">
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-20 rounded bg-stellar-border" />
        <div className="h-5 w-24 rounded bg-stellar-border" />
        <div className="h-3 w-full rounded bg-stellar-border" />
      </div>
    </div>
  );
}

export default function InlineStatusCards({
  assets,
  bridges,
  loading = false,
}: InlineStatusCardsProps) {
  const items = buildStatusItems(assets, bridges);

  return (
    <section aria-labelledby="inline-status-cards" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="inline-status-cards" className="text-sm font-semibold uppercase text-stellar-text-secondary">
          Live status
        </h2>
        <span className="text-xs text-stellar-text-secondary">Auto-refreshing</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }, (_, index) => <StatusSkeleton key={index} />)
          : items.map((item) => (
              <article
                key={item.id}
                className="min-h-28 rounded-lg border border-stellar-border bg-stellar-card p-3"
                aria-label={`${item.label}: ${item.value}. ${item.detail}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium uppercase text-stellar-text-secondary">
                    {item.label}
                  </p>
                  <span
                    className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${toneClasses[item.tone]}`}
                  >
                    {item.tone}
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold text-stellar-text-primary">{item.value}</p>
                <p className="mt-1 text-sm text-stellar-text-secondary">{item.detail}</p>
              </article>
            ))}
      </div>
    </section>
  );
}
