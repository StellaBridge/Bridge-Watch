import { useQuery } from "@tanstack/react-query";
import { getIncidentHeatmap } from "../services/api";

export function useIncidentHeatmap(params?: {
  startDate?: string;
  endDate?: string;
  assetSymbol?: string;
}) {
  return useQuery({
    queryKey: ["incident-heatmap", params],
    queryFn: () => getIncidentHeatmap(params),
  });
}
