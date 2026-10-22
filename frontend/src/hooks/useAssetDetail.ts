import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import {
  getAssetInfo,
  getAssetHealth,
  getAssetPriceHistory,
  getAssetPriceSources,
  getAssetLiquiditySources,
  getAssetVolume,
  getAssetSupplyVerification,
  getAssetHealthHistory,
  getAssetAlerts,
} from "../services/api";
import { useWebSocket } from "./useWebSocket";
import type { HealthScore, PriceTimeframe } from "../types";

export function useAssetDetail(symbol: string) {
  const [timeframe, setTimeframe] = useState<PriceTimeframe>("24H");

  const assetInfo = useQuery({
    queryKey: ["asset-info", symbol],
    queryFn: ({ signal }) => getAssetInfo(symbol, signal),
    enabled: !!symbol,
  });

  const health = useQuery({
    queryKey: ["asset-health", symbol],
    queryFn: ({ signal }) => getAssetHealth(symbol, signal),
    enabled: !!symbol,
    refetchInterval: 30_000,
  });

  const priceHistory = useQuery({
    queryKey: ["asset-price-history", symbol, timeframe],
    queryFn: ({ signal }) => getAssetPriceHistory(symbol, timeframe, signal),
    enabled: !!symbol,
  });

  const priceSources = useQuery({
    queryKey: ["asset-price-sources", symbol],
    queryFn: ({ signal }) => getAssetPriceSources(symbol, signal),
    enabled: !!symbol,
    refetchInterval: 30_000,
  });

  const liquidity = useQuery({
    queryKey: ["asset-liquidity-sources", symbol],
    queryFn: ({ signal }) => getAssetLiquiditySources(symbol, signal),
    enabled: !!symbol,
  });

  const volume = useQuery({
    queryKey: ["asset-volume", symbol],
    queryFn: ({ signal }) => getAssetVolume(symbol, signal),
    enabled: !!symbol,
  });

  const supply = useQuery({
    queryKey: ["asset-supply", symbol],
    queryFn: ({ signal }) => getAssetSupplyVerification(symbol, signal),
    enabled: !!symbol,
    refetchInterval: 60_000,
  });

  const healthHistory = useQuery({
    queryKey: ["asset-health-history", symbol],
    queryFn: ({ signal }) => getAssetHealthHistory(symbol, "7d", signal),
    enabled: !!symbol,
  });

  const alerts = useQuery({
    queryKey: ["asset-alerts", symbol],
    queryFn: ({ signal }) => getAssetAlerts(symbol, signal),
    enabled: !!symbol,
  });

  const handleHealthUpdate = useCallback(
    (data: unknown) => {
      const update = data as { channel: string } & HealthScore;
      if (update.symbol === symbol) {
        health.refetch();
        healthHistory.refetch();
      }
    },
    [symbol, health, healthHistory]
  );

  useWebSocket("health-updates", handleHealthUpdate);

  return {
    assetInfo,
    health,
    priceHistory,
    priceSources,
    liquidity,
    volume,
    supply,
    healthHistory,
    alerts,
    timeframe,
    setTimeframe,
  };
}
