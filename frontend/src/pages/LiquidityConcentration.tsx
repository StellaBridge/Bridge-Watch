import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useLiquidityConcentration } from "../hooks/useLiquidityConcentration";
import { PairSelector } from "../components/liquidity";
import LiquidityConcentrationVisualizer from "../components/liquidity/LiquidityConcentrationVisualizer";
import type { TradingPair } from "../types/liquidity";

export default function LiquidityConcentration() {
  const [pair, setPair] = useLocalStorageState<TradingPair>(
    "bridge-watch:liquidity-pair:v1",
    "USDC/XLM"
  );

  const { data, isLoading, error, lastUpdated } =
    useLiquidityConcentration(pair);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Liquidity Concentration
          </h1>
          <p className="mt-1 text-stellar-text-secondary text-sm">
            Depth distribution across price brackets — spot thin zones
          </p>
        </div>
        <PairSelector value={pair} onChange={setPair} />
      </header>

      {error && (
        <div
          role="alert"
          className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Mid Price",
              value: data.midPrice.toFixed(7),
            },
            {
              label: "Spread",
              value: `${data.spreadPct.toFixed(4)}%`,
            },
            {
              label: "Bid Total",
              value: `$${data.bidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            },
            {
              label: "Ask Total",
              value: `$${data.askTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-stellar-card border border-stellar-border rounded-lg p-4"
            >
              <p className="text-xs text-stellar-text-secondary">{stat.label}</p>
              <p className="mt-1 text-xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main chart */}
      <section
        className="bg-stellar-card border border-stellar-border rounded-lg p-6"
        aria-label={`${pair} liquidity concentration`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Depth by Price Bracket
          </h2>
          {lastUpdated && (
            <span className="text-xs text-stellar-text-secondary">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
        <LiquidityConcentrationVisualizer
          data={data}
          isLoading={isLoading}
          pair={pair}
        />
      </section>
    </div>
  );
}
