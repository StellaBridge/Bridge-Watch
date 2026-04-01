import { Suspense } from "react";
import { useRefreshControls } from "../hooks/useRefreshControls";
import TransactionHistory from "../components/TransactionHistory";
import RefreshControls from "../components/RefreshControls";
import { ErrorBoundary, LoadingSpinner } from "../components/Skeleton";

export default function Transactions() {
  const refreshControls = useRefreshControls({
    viewId: "transactions",
    targets: [{ id: "transactions", label: "Transactions", queryKey: ["transactions"] }],
    defaultIntervalMs: 30_000,
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Transaction History</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Browse recent bridge transfers with real-time status tracking
        </p>
      </header>

      <RefreshControls
        autoRefreshEnabled={refreshControls.preferences.autoRefreshEnabled}
        onAutoRefreshEnabledChange={refreshControls.setAutoRefreshEnabled}
        refreshIntervalMs={refreshControls.preferences.refreshIntervalMs}
        onRefreshIntervalChange={refreshControls.setRefreshIntervalMs}
        refreshOnFocus={refreshControls.preferences.refreshOnFocus}
        onRefreshOnFocusChange={refreshControls.setRefreshOnFocus}
        targets={[{ id: "transactions", label: "Transactions", queryKey: ["transactions"] }]}
        selectedTargetIds={refreshControls.preferences.selectedTargetIds}
        onSelectedTargetIdsChange={refreshControls.setSelectedTargetIds}
        onRefresh={refreshControls.refreshNow}
        onCancelRefresh={refreshControls.cancelRefresh}
        isRefreshing={refreshControls.isRefreshing}
        lastUpdatedAt={refreshControls.lastUpdatedAt}
      />

      <ErrorBoundary onRetry={() => window.location.reload()}>
        <Suspense
          fallback={
            <LoadingSpinner
              message="Loading transactions..."
              progress={30}
              className="max-w-sm mx-auto"
            />
          }
        >
          <TransactionHistory
            refreshInterval={
              refreshControls.preferences.autoRefreshEnabled
                ? refreshControls.preferences.refreshIntervalMs
                : false
            }
            refreshOnWindowFocus={refreshControls.preferences.refreshOnFocus}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
