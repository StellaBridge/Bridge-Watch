import { useState } from "react";
import { useTransactions } from "../hooks/useTransactions";
import { exportTransactionsCsv } from "../services/api";
import TransactionFiltersComponent from "./TransactionFilters";
import TransactionRow, {
  TransactionCard,
} from "./TransactionRow";
import TransactionDetail from "./TransactionDetail";
import { SkeletonTable } from "./Skeleton";
import type { BridgeTransaction } from "../types";

export default function TransactionHistory() {
  const {
    data,
    isLoading,
    error,
    filters,
    page,
    totalPages,
    setPage,
    updateFilters,
    resetFilters,
  } = useTransactions();

  const [selectedTx, setSelectedTx] = useState<BridgeTransaction | null>(null);

  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;

  function handleExport() {
    const url = exportTransactionsCsv(filters);
    window.open(url, "_blank");
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <TransactionFiltersComponent
        filters={filters}
        onFilterChange={updateFilters}
        onReset={resetFilters}
        onExport={handleExport}
      />

      {/* Results summary */}
      {!isLoading && !error && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-stellar-text-secondary">
            {total === 0
              ? "No transactions found"
              : `Showing ${(page - 1) * 10 + 1}–${Math.min(
                  page * 10,
                  total
                )} of ${total.toLocaleString()} transactions`}
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center"
          role="alert"
        >
          <p className="text-red-400 font-medium">
            Failed to load transactions
          </p>
          <p className="text-sm text-red-400/80 mt-1">
            Please check your connection and try again.
          </p>
        </div>
      )}

      {/* Desktop table */}
      {!error && (
        <div className="hidden md:block bg-stellar-card border border-stellar-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stellar-border bg-stellar-dark/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-stellar-text-secondary uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stellar-text-secondary uppercase tracking-wider">
                  Tx Hash
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stellar-text-secondary uppercase tracking-wider">
                  Bridge
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stellar-text-secondary uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stellar-text-secondary uppercase tracking-wider">
                  Direction
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-stellar-text-secondary uppercase tracking-wider">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6">
                    <SkeletonTable rows={5} columns={6} ariaLabel="Loading transaction table" />
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    onSelect={setSelectedTx}
                  />
                ))
              )}
            </tbody>
          </table>

          {!isLoading && transactions.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-stellar-text-secondary">
                No transactions match your filters.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 text-sm text-stellar-blue hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile cards */}
      {!error && (
        <div className="md:hidden space-y-3">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-stellar-card border border-stellar-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between">
                    <div className="h-5 w-20 bg-stellar-border rounded animate-pulse" />
                    <div className="h-4 w-16 bg-stellar-border rounded animate-pulse" />
                  </div>
                  <div className="h-4 w-32 bg-stellar-border rounded animate-pulse" />
                  <div className="h-4 w-24 bg-stellar-border rounded animate-pulse" />
                </div>
              ))
            : transactions.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  transaction={tx}
                  onSelect={setSelectedTx}
                />
              ))}

          {!isLoading && transactions.length === 0 && (
            <div className="bg-stellar-card border border-stellar-border rounded-lg p-8 text-center">
              <p className="text-stellar-text-secondary">
                No transactions match your filters.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-3 text-sm text-stellar-blue hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-2 text-sm rounded-lg border border-stellar-border text-white hover:bg-stellar-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i + 1;
            } else if (page <= 4) {
              pageNum = i + 1;
            } else if (page >= totalPages - 3) {
              pageNum = totalPages - 6 + i;
            } else {
              pageNum = page - 3 + i;
            }

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => setPage(pageNum)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  pageNum === page
                    ? "bg-stellar-blue border-stellar-blue text-white"
                    : "border-stellar-border text-stellar-text-secondary hover:bg-stellar-border hover:text-white"
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-2 text-sm rounded-lg border border-stellar-border text-white hover:bg-stellar-border disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selectedTx && (
        <TransactionDetail
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </div>
  );
}
