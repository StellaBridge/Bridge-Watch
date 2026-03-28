import { Suspense } from "react";
import TransactionHistory from "../components/TransactionHistory";
import { ErrorBoundary, LoadingSpinner } from "../components/Skeleton";

export default function Transactions() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Transaction History</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Browse recent bridge transfers with real-time status tracking
        </p>
      </header>

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
          <TransactionHistory />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
