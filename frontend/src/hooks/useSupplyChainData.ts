import { useQuery } from "@tanstack/react-query";
import { getSupplyChainGraph } from "../services/api";
import type { SupplyChainGraph } from "../components/SupplyChainViz/types";

export function useSupplyChainData(refetchIntervalMs = 60_000) {
  return useQuery<SupplyChainGraph, Error>({
    queryKey: ["supplyChain"],
    queryFn: getSupplyChainGraph,
    refetchInterval: refetchIntervalMs,
    staleTime: 30_000,
  });
}
