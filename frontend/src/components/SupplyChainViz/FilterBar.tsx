const ASSETS = ["USDC", "USDT", "WBTC", "WETH", "XLM"] as const;
type Asset = (typeof ASSETS)[number];

interface Props {
  activeAssets: Set<string>;
  onToggleAsset: (asset: string) => void;
  onClearFilters: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  zoomLevel: number;
}

const ASSET_COLORS: Record<Asset, string> = {
  USDC: "#2775CA",
  USDT: "#26A17B",
  WBTC: "#F7931A",
  WETH: "#627EEA",
  XLM: "#7B64FF",
};

export default function FilterBar({
  activeAssets,
  onToggleAsset,
  onClearFilters,
  onZoomIn,
  onZoomOut,
  onResetView,
  zoomLevel,
}: Props) {
  const hasFilter = activeAssets.size > 0 && activeAssets.size < ASSETS.length;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      {/* Asset filters */}
      <span className="text-slate-500 text-xs mr-1">Filter:</span>
      {ASSETS.map((asset) => {
        const active = activeAssets.size === 0 || activeAssets.has(asset);
        return (
          <button
            key={asset}
            onClick={() => onToggleAsset(asset)}
            className={`text-xs font-mono px-2 py-0.5 rounded border transition-colors ${
              active
                ? "border-transparent text-white"
                : "border-slate-700 text-slate-500 hover:text-slate-300"
            }`}
            style={active ? { backgroundColor: `${ASSET_COLORS[asset]}33`, borderColor: ASSET_COLORS[asset], color: ASSET_COLORS[asset] } : {}}
            aria-pressed={active}
          >
            {asset}
          </button>
        );
      })}

      {hasFilter && (
        <button
          onClick={onClearFilters}
          className="text-xs text-slate-500 hover:text-white ml-1 border-l border-slate-700 pl-2"
        >
          Clear
        </button>
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-slate-700 mx-1" />

      {/* Zoom controls */}
      <button
        onClick={onZoomOut}
        className="text-slate-400 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-slate-700"
        aria-label="Zoom out"
      >
        −
      </button>
      <span className="text-slate-400 text-xs w-10 text-center tabular-nums">
        {Math.round(zoomLevel * 100)}%
      </span>
      <button
        onClick={onZoomIn}
        className="text-slate-400 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-slate-700"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        onClick={onResetView}
        className="text-slate-400 hover:text-white text-xs ml-1 border-l border-slate-700 pl-2"
        aria-label="Reset view"
      >
        Reset
      </button>
    </div>
  );
}
