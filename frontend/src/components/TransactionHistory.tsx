import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTransactions } from "../hooks/useTransactions";
import { exportTransactionsCsv } from "../services/api";
import TransactionFiltersComponent from "./TransactionFilters";
import TransactionRow, {
  TransactionCard,
} from "./TransactionRow";
import TransactionDetail from "./TransactionDetail";
import { SkeletonTable } from "./Skeleton";
import EmptyState from "./EmptyState";
import type { BridgeTransaction } from "../types";

type TransactionHistoryProps = {
  refreshInterval?: number | false;
  refreshOnWindowFocus?: boolean;
};

const ESTIMATED_ROW_HEIGHT = 64;

export default function TransactionHistory({
  refreshInterval,
  refreshOnWindowFocus,
}: TransactionHistoryProps) {
  const {
    data,
    isLoading,
    error,
    filters,
    page,
    pageSize,
    totalPages,
    setPage,
    updatePageSize,
    updateFilters,
    resetFilters,
  } = useTransactions({
    refetchInterval: refreshInterval,
    refetchOnWindowFocus: refreshOnWindowFocus,
  });

  const [selectedTx, setSelectedTx] = useState<BridgeTransaction | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  const transactions = data?.transactions ?? [];
  const total = data?.total ?? 0;

  const rowVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

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
              : `Showing ${(page - 1) * pageSize + 1}–${Math.min(
                  page * pageSize,
                  total
                )} of ${total.toLocaleString()} transactions`}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="pageSize" className="text-sm text-stellar-text-secondary">
              Items per page:
            </label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => updatePageSize(parseInt(e.target.value))}
              className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white hover:bg-stellar-border transition-colors"
            >
              <option value="15">15</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
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
            <div
              ref={tableContainerRef}
              className="max-h-[520px] overflow-auto"
              role="region"
              aria-label="Transaction table content"
            >
              <table className="w-full text-sm">
                <tbody className="text-stellar-text-primary">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6">
                        <SkeletonTable rows={5} columns={6} ariaLabel="Loading transaction table" />
                      </td>
                    </tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-stellar-text-secondary">
                        No transactions match your filters.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {virtualItems.length > 0 && virtualItems[0].start > 0 ? (
                        <tr>
                          <td style={{ height: virtualItems[0].start }} colSpan={6} />
                        </tr>
                      ) : null}

                      {virtualItems.map((virtualItem) => {
                        const tx = transactions[virtualItem.index];
                        if (!tx) return null;
                        return (
                          <TransactionRow
                            key={tx.id}
                            transaction={tx}
                            onSelect={setSelectedTx}
                          />
                        );
                      })}

                      {virtualItems.length > 0 &&
                      totalSize - virtualItems[virtualItems.length - 1].end > 0 ? (
                        <tr>
                          <td
                            style={{
                              height:
                                totalSize -
                                virtualItems[virtualItems.length - 1].end,
                            }}
                            colSpan={6}
                          />
                        </tr>
                      ) : null}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </table>

          {!isLoading && transactions.length === 0 && (
            <EmptyState
              compact
              title="No transactions found"
              description="Adjust your filters to see more transactions."
              actionLabel="Clear all filters"
              onAction={resetFilters}
            />
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
            <div className="bg-stellar-card border border-stellar-border rounded-lg">
              <EmptyState
                compact
                title="No transactions found"
                description="Adjust your filters to see more transactions."
                actionLabel="Clear all filters"
                onAction={resetFilters}
              />
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
