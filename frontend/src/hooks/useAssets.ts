import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getAssets, getAssetsWithHealth, getAssetHealth } from "../services/api";
import type { AssetWithHealth, HealthScore } from "../types";

type QueryRefreshOptions = {
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

export function useAssets(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["assets"],
    queryFn: getAssets,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

export function useAssetsWithHealth(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["assets-with-health"],
    queryFn: getAssetsWithHealth,
    refetchInterval: options?.refetchInterval ?? 30_000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

export function useAssetHealth(symbol: string, options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["asset-health", symbol],
    queryFn: () => getAssetHealth(symbol),
    enabled: !!symbol,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

export function useHealthUpdater() {
  const queryClient = useQueryClient();

  const updateHealth = useCallback(
    (data: HealthScore) => {
      queryClient.setQueryData<AssetWithHealth[]>(
        ["assets-with-health"],
        (oldData) => {
          if (!oldData) return oldData;
          return oldData.map((asset) =>
            asset.symbol === data.symbol ? { ...asset, health: data } : asset
          );
        }
      );
    },
    [queryClient]
  );

  return { updateHealth };
}
