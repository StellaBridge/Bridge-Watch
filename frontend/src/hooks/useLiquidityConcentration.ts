import { useQuery } from "@tanstack/react-query";
import { getLiquidityConcentration } from "../services/api";
import type { LiquidityConcentrationState } from "../types/liquidity";

export function useLiquidityConcentration(pair: string): LiquidityConcentrationState {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["liquidity-concentration", pair],
    queryFn: () => getLiquidityConcentration(pair),
    enabled: Boolean(pair),
    refetchInterval: 5000,
    staleTime: 2500,
  });

  return {
    data: data ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Error loading concentration data") : null,
    lastUpdated: data?.timestamp ?? null,
    refetch,
  };
}
