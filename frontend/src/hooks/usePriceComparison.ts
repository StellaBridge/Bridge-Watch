import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAssetPrice } from "../services/api";

export type PriceSourceId = "stellar_dex" | "circle" | "coinbase" | "stellar_amm";

export interface PriceComparisonPoint {
  t: number;
  iso: string;
  prices: Partial<Record<PriceSourceId, number>>;
  vwap: number | null;
  deviationPct: number | null;
}

export interface UsePriceComparisonParams {
  symbol: string;
  enabledSources?: PriceSourceId[];
  rangeMs: number;
  refetchIntervalMs?: number;
}

export interface UsePriceComparisonResult {
  points: PriceComparisonPoint[];
  latest: PriceComparisonPoint | null;
  currentPrices: Partial<Record<PriceSourceId, number>>;
  currentVwap: number | null;
  currentDeviationPct: number | null;
  isLoading: boolean;
  error: unknown;
}

function normalizeSourceId(source: string): PriceSourceId | null {
  const s = source.trim().toLowerCase();

  if (s === "sdex" || s.includes("stellar dex") || s.includes("stellar_dex")) return "stellar_dex";
  if (s === "amm" || s.includes("stellar amm") || s.includes("stellar_amm")) return "stellar_amm";
  if (s.includes("circle")) return "circle";
  if (s.includes("coinbase")) return "coinbase";

  return null;
}

function computeDeviationPct(values: number[], baseline: number): number {
  if (values.length < 2) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (baseline === 0) return 0;
  return (max - min) / baseline;
}

export function usePriceComparison(params: UsePriceComparisonParams): UsePriceComparisonResult {
  const { symbol, enabledSources, rangeMs, refetchIntervalMs = 10_000 } = params;
  const [points, setPoints] = useState<PriceComparisonPoint[]>([]);

  const query = useQuery({
    queryKey: ["price-comparison", symbol],
    queryFn: () => getAssetPrice(symbol),
    enabled: !!symbol,
    refetchInterval: refetchIntervalMs,
    staleTime: 5_000,
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;

    const nowIso = data.lastUpdated ?? new Date().toISOString();
    const t = Date.parse(nowIso);

    const prices: Partial<Record<PriceSourceId, number>> = {};
    for (const src of data.sources ?? []) {
      const id = normalizeSourceId(src.source);
      if (!id) continue;
      prices[id] = src.price;
    }

    const filteredPrices = enabledSources
      ? (Object.fromEntries(
          Object.entries(prices).filter(([k]) => enabledSources.includes(k as PriceSourceId))
        ) as Partial<Record<PriceSourceId, number>>)
      : prices;

    const priceValues = Object.values(filteredPrices).filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v)
    );

    const vwap =
      typeof data.vwap === "number" && Number.isFinite(data.vwap) ? data.vwap : null;
    const baseline =
      vwap ??
      (priceValues.length
        ? priceValues.reduce((a, b) => a + b, 0) / priceValues.length
        : 0);
    const deviationPct = priceValues.length
      ? computeDeviationPct(priceValues, baseline)
      : null;

    setPoints((prev) => {
      const nextPoint: PriceComparisonPoint = {
        t: Number.isFinite(t) ? t : Date.now(),
        iso: nowIso,
        prices: filteredPrices,
        vwap,
        deviationPct,
      };

      const cutoff = Date.now() - rangeMs;
      const next = [...prev, nextPoint].filter((p) => p.t >= cutoff);

      const deduped: PriceComparisonPoint[] = [];
      for (const p of next) {
        const last = deduped[deduped.length - 1];
        if (last && last.t === p.t) {
          deduped[deduped.length - 1] = p;
        } else {
          deduped.push(p);
        }
      }

      return deduped;
    });
  }, [enabledSources, query.data, rangeMs]);

  const derived = useMemo(() => {
    const latest = points.length ? points[points.length - 1] : null;
    const currentPrices = latest?.prices ?? {};
    const currentVwap = latest?.vwap ?? null;
    const currentDeviationPct = latest?.deviationPct ?? null;

    return { latest, currentPrices, currentVwap, currentDeviationPct };
  }, [points]);

  return {
    points,
    latest: derived.latest,
    currentPrices: derived.currentPrices,
    currentVwap: derived.currentVwap,
    currentDeviationPct: derived.currentDeviationPct,
    isLoading: query.isLoading,
    error: query.error,
  };
}
