import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { useAssetHealth } from "../hooks/useAssets";
import { usePrices } from "../hooks/usePrices";
import HealthScoreCard from "../components/HealthScoreCard";
import PriceChart from "../components/PriceChart";
import LiquidityDepthChart from "../components/LiquidityDepthChart";
import type { DataTableColumnDef } from "../components/DataTable";
import { DataTable } from "../components/DataTable";
import type { CellContext } from "@tanstack/react-table";
import { ErrorBoundary, LoadingSpinner } from "../components/Skeleton";

export default function AssetDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const { data: healthData } = useAssetHealth(symbol ?? "");
  const { data: priceData } = usePrices(symbol ?? "");

  const priceSourceRows = (priceData?.sources ?? []) as Array<{
    source: string;
    price: number;
    timestamp: string;
  }>;

  const priceSourceColumns: Array<
    DataTableColumnDef<{
      source: string;
      price: number;
      timestamp: string;
    }>
  > = [
    {
      id: "source",
      accessorKey: "source",
      header: "Source",
      filterType: "text",
    },
    {
      id: "price",
      accessorKey: "price",
      header: "Price",
      filterType: "numberRange",
      cell: (
        ctx: CellContext<
          { source: string; price: number; timestamp: string },
          unknown
        >
      ) =>
        `$${Number(ctx.getValue()).toFixed(4)}`,
    },
    {
      id: "timestamp",
      accessorKey: "timestamp",
      header: "Last Updated",
      filterType: "text",
    },
  ];

  if (!symbol) {
    return (
      <div className="text-stellar-text-secondary">
        No asset symbol provided.
      </div>
    );
  }

  return (
    <ErrorBoundary onRetry={() => window.location.reload()}>
      <Suspense
        fallback={
          <LoadingSpinner
            message={`Loading ${symbol} details...`}
            progress={25}
            className="max-w-lg mx-auto"
          />
        }
      >
        <div className="space-y-8">
          <header>
            <h1 className="text-3xl font-bold text-white">{symbol}</h1>
            <p className="mt-2 text-stellar-text-secondary">
              Detailed monitoring for {symbol} on the Stellar network
            </p>
          </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <HealthScoreCard
          symbol={symbol}
          overallScore={healthData?.overallScore ?? null}
          factors={healthData?.factors ?? null}
          trend={healthData?.trend ?? null}
        />
        <div className="lg:col-span-2">
          <PriceChart symbol={symbol} />
        </div>
      </div>

      <LiquidityDepthChart symbol={symbol} data={[]} isLoading={false} />

      <DataTable
        data={priceSourceRows}
        columns={priceSourceColumns}
        isLoading={!priceData}
        title="Price Sources"
        description={`Price sources for ${symbol} including last update times`}
        pageSizeOptions={[10, 20, 50]}
        filenameBase={`${symbol}-price-sources`}
        enableRowSelection={true}
        enableMultiSort={true}
        enableColumnReorder={true}
        enableVirtualization={true}
        rowActions={{
          items: [
            {
              id: "copy-source",
              label: "Copy source",
              onSelect: (row) => {
                void navigator.clipboard.writeText(row.source);
              },
            },
          ],
        }}
      />
    </div>
  </Suspense>
</ErrorBoundary>
  );
}
