type RefreshButtonProps = {
  onRefresh: () => void | Promise<void>;
  isRefreshing: boolean;
  disabled?: boolean;
};

export default function RefreshButton({ onRefresh, isRefreshing, disabled }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void onRefresh();
      }}
      disabled={disabled || isRefreshing}
      className="inline-flex items-center gap-2 rounded-md border border-stellar-border bg-stellar-card px-3 py-2 text-sm text-white transition-colors hover:bg-stellar-border disabled:cursor-not-allowed disabled:opacity-60"
      aria-label="Refresh data"
    >
      <span className={`inline-block ${isRefreshing ? "animate-spin" : ""}`} aria-hidden>
        ↻
      </span>
      <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
    </button>
  );
}
