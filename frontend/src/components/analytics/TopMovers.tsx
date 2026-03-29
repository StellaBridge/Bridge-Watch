import type { TopMover } from "../../hooks/useAnalytics";

interface TopMoversProps {
  movers: TopMover[];
  isLoading: boolean;
  period: string;
}

const ASSET_ICONS: Record<string, string> = {
  USDC: "$",
  PYUSD: "$",
  EURC: "€",
  XLM: "✦",
  FOBXX: "F",
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <div className="flex-1 bg-stellar-border rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${score}%`, background: color }}
      />
    </div>
  );
}

function MoverRow({ mover }: { mover: TopMover }) {
  const isUp = mover.direction === "up";
  const changeColor = isUp ? "text-green-400" : "text-red-400";
  const bgColor = isUp ? "bg-green-500/10" : "bg-red-500/10";
  const icon = ASSET_ICONS[mover.symbol] ?? mover.symbol[0];

  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Icon */}
      <div className="flex-none w-8 h-8 rounded-full bg-stellar-border flex items-center justify-center text-sm font-mono text-white">
        {icon}
      </div>

      {/* Symbol + bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-white">{mover.symbol}</span>
          <span className="text-sm font-bold text-white tabular-nums">
            {mover.currentScore.toFixed(1)}
          </span>
        </div>
        <ScoreBar score={mover.currentScore} />
      </div>

      {/* Change badge */}
      <div className={`flex-none flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-medium ${changeColor} ${bgColor}`}>
        <span>{isUp ? "↑" : "↓"}</span>
        <span>
          {isUp ? "+" : ""}
          {mover.change.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export default function TopMovers({ movers, isLoading, period }: TopMoversProps) {
  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="h-5 w-32 bg-stellar-border rounded animate-pulse mb-4" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <div className="w-8 h-8 rounded-full bg-stellar-border animate-pulse" />
            <div className="flex-1">
              <div className="h-3 w-24 bg-stellar-border rounded animate-pulse mb-2" />
              <div className="h-1.5 bg-stellar-border rounded-full animate-pulse" />
            </div>
            <div className="w-12 h-5 bg-stellar-border rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (movers.length === 0) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Top Movers</h2>
        <p className="text-stellar-text-secondary text-sm">No data available</p>
      </div>
    );
  }

  const gainers = movers.filter((m) => m.direction === "up").slice(0, 4);
  const losers = movers.filter((m) => m.direction === "down").slice(0, 4);

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-0.5">Top Movers</h2>
      <p className="text-xs text-stellar-text-secondary mb-4">Health score change over {period}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Gainers */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-1">
            ↑ Gainers
          </p>
          <div className="divide-y divide-stellar-border">
            {gainers.length > 0 ? (
              gainers.map((m) => <MoverRow key={m.symbol} mover={m} />)
            ) : (
              <p className="py-3 text-sm text-stellar-text-secondary">No gainers</p>
            )}
          </div>
        </div>

        {/* Losers */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-1">
            ↓ Losers
          </p>
          <div className="divide-y divide-stellar-border">
            {losers.length > 0 ? (
              losers.map((m) => <MoverRow key={m.symbol} mover={m} />)
            ) : (
              <p className="py-3 text-sm text-stellar-text-secondary">No losers</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
