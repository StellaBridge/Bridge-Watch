import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getBridges, getBridgeStats } from "../services/api";
import { wsService } from "../services/websocket";
import type { Bridge } from "../types";

type QueryRefreshOptions = {
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

export function useBridges(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["bridges"],
    queryFn: getBridges,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

export function useBridgeStats(bridgeName: string, options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["bridge-stats", bridgeName],
    queryFn: () => getBridgeStats(bridgeName),
    enabled: !!bridgeName,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}
