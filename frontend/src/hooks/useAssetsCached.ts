import { useQuery } from "@tanstack/react-query";
import { getAssets } from "../services/api";
import { useCacheStore } from "../stores";

/**
 * Hook to fetch assets with optional caching support via Zustand cache store.
 * Falls back to React Query's built-in caching when Zustand cache is not needed.
 */
export function useAssets() {
  const { set, get, has } = useCacheStore();

  return useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      // Check Zustand cache first for faster response
      const cached = get<unknown>("assets");
      if (cached) {
        return cached.data as { assets: Array<{ symbol: string }>; total: number };
      }

      // Fetch from API
      const data = await getAssets();

      // Store in Zustand cache with 5 minute TTL
      set("assets", data, 5 * 60 * 1000, ["assets"]);

      return data;
    },
    // React Query will still handle its own caching
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch assets with explicit cache control
 */
export function useAssetsWithCache(options?: {
  cacheTTL?: number;
  skipCache?: boolean;
}) {
  const { cacheTTL = 5 * 60 * 1000, skipCache = false } = options || {};
  const { set, get, has, invalidate } = useCacheStore();

  const query = useQuery({
    queryKey: ["assets", { skipCache }],
    queryFn: async () => {
      if (!skipCache) {
        const cached = get<unknown>("assets");
        if (cached) {
          return cached.data as { assets: Array<{ symbol: string }>; total: number };
        }
      }

      const data = await getAssets();
      set("assets", data, cacheTTL, ["assets"]);
      return data;
    },
    staleTime: skipCache ? 0 : 30000,
  });

  return {
    ...query,
    invalidateCache: () => invalidate("assets"),
    isCached: has("assets"),
  };
}
