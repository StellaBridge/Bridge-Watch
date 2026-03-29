import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
  tags: string[];
}

export interface CacheState {
  // Cache storage
  cache: Map<string, CacheEntry<unknown>>;

  // Cache statistics
  hits: number;
  misses: number;
  evictions: number;

  // Cache configuration
  defaultTTL: number;
  maxSize: number;
}

export interface CacheActions {
  // Cache operations
  get: <T>(key: string) => CacheEntry<T> | null;
  set: <T>(key: string, data: T, ttl?: number, tags?: string[]) => void;
  invalidate: (key: string) => void;
  invalidateByTag: (tag: string) => void;
  invalidateAll: () => void;
  invalidatePattern: (pattern: RegExp) => void;

  // Cache status
  has: (key: string) => boolean;
  isExpired: (key: string) => boolean;
  getAge: (key: string) => number;

  // Cache info
  getCacheInfo: () => {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: { key: string; age: number; tags: string[] }[];
  };

  // Configuration
  setDefaultTTL: (ttl: number) => void;
  setMaxSize: (size: number) => void;

  // Prefetching
  prefetch: <T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
    tags?: string[]
  ) => Promise<void>;

  // Background refresh
  refresh: <T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ) => Promise<void>;
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE_DEFAULT = 100;

export const useCacheStore = create<CacheState & CacheActions>()(
  devtools(
    (set, get) => ({
      cache: new Map(),
      hits: 0,
      misses: 0,
      evictions: 0,
      defaultTTL: DEFAULT_TTL,
      maxSize: MAX_CACHE_SIZE_DEFAULT,

      get: <T>(key: string): CacheEntry<T> | null => {
        const entry = get().cache.get(key) as CacheEntry<T> | undefined;

        if (!entry) {
          set({ misses: get().misses + 1 }, false, "cacheMiss");
          return null;
        }

        if (Date.now() > entry.timestamp + entry.ttl) {
          get().invalidate(key);
          set({ misses: get().misses + 1 }, false, "cacheMissExpired");
          return null;
        }

        set({ hits: get().hits + 1 }, false, "cacheHit");
        return entry;
      },

      set: <T>(key: string, data: T, ttl?: number, tags: string[] = []) => {
        const { cache, maxSize } = get();

        // Evict oldest entries if cache is full
        if (cache.size >= maxSize && !cache.has(key)) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey) {
            cache.delete(oldestKey);
            set({ evictions: get().evictions + 1 }, false, "cacheEviction");
          }
        }

        const entry: CacheEntry<T> = {
          key,
          data,
          timestamp: Date.now(),
          ttl: ttl ?? get().defaultTTL,
          tags,
        };

        set(
          (state) => {
            const newCache = new Map(state.cache);
            newCache.set(key, entry as CacheEntry<unknown>);
            return { cache: newCache };
          },
          false,
          "cacheSet"
        );
      },

      invalidate: (key: string) => {
        set(
          (state) => {
            const newCache = new Map(state.cache);
            newCache.delete(key);
            return { cache: newCache };
          },
          false,
          `invalidate/${key}`
        );
      },

      invalidateByTag: (tag: string) => {
        set(
          (state) => {
            const newCache = new Map<string, CacheEntry<unknown>>();
            for (const [key, entry] of state.cache.entries()) {
              if (!entry.tags.includes(tag)) {
                newCache.set(key, entry);
              }
            }
            return { cache: newCache };
          },
          false,
          `invalidateByTag/${tag}`
        );
      },

      invalidateAll: () => {
        set({ cache: new Map() }, false, "invalidateAll");
      },

      invalidatePattern: (pattern: RegExp) => {
        set(
          (state) => {
            const newCache = new Map<string, CacheEntry<unknown>>();
            for (const [key, entry] of state.cache.entries()) {
              if (!pattern.test(key)) {
                newCache.set(key, entry);
              }
            }
            return { cache: newCache };
          },
          false,
          "invalidatePattern"
        );
      },

      has: (key: string) => {
        return get().cache.has(key) && !get().isExpired(key);
      },

      isExpired: (key: string) => {
        const entry = get().cache.get(key);
        if (!entry) return true;
        return Date.now() > entry.timestamp + entry.ttl;
      },

      getAge: (key: string) => {
        const entry = get().cache.get(key);
        if (!entry) return Infinity;
        return Date.now() - entry.timestamp;
      },

      getCacheInfo: () => {
        const { cache, hits, misses } = get();
        const total = hits + misses;
        const entries: { key: string; age: number; tags: string[] }[] = [];

        for (const [key, entry] of cache.entries()) {
          entries.push({
            key,
            age: Date.now() - entry.timestamp,
            tags: entry.tags,
          });
        }

        return {
          size: cache.size,
          maxSize: get().maxSize,
          hitRate: total > 0 ? hits / total : 0,
          entries,
        };
      },

      setDefaultTTL: (ttl: number) => {
        set({ defaultTTL: ttl }, false, "setDefaultTTL");
      },

      setMaxSize: (size: number) => {
        set({ maxSize: size }, false, "setMaxSize");
      },

      prefetch: async <T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl?: number,
        tags: string[] = []
      ) => {
        if (get().has(key)) return;

        try {
          const data = await fetcher();
          get().set(key, data, ttl, tags);
        } catch (error) {
          console.error(`Prefetch failed for key: ${key}`, error);
        }
      },

      refresh: async <T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl?: number
      ) => {
        try {
          const data = await fetcher();
          const entry = get().cache.get(key);
          const tags = entry?.tags || [];
          get().set(key, data, ttl, tags);
        } catch (error) {
          console.error(`Refresh failed for key: ${key}`, error);
        }
      },
    }),
    { name: "CacheStore" }
  )
);

// Helper hook for cached data fetching
export function createCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: {
    ttl?: number;
    tags?: string[];
    staleWhileRevalidate?: boolean;
  }
) {
  const { ttl = DEFAULT_TTL, tags = [], staleWhileRevalidate = true } = options || {};
  const cache = useCacheStore.getState();

  return async (): Promise<T> => {
    const cached = cache.get<T>(key);

    if (cached) {
      if (staleWhileRevalidate) {
        // Refresh in background
        cache.refresh(key, fetcher, ttl);
      }
      return cached.data;
    }

    const data = await fetcher();
    cache.set(key, data, ttl, tags);
    return data;
  };
}

// Selectors for optimized re-renders
export const selectCacheStats = (state: CacheState & CacheActions) => ({
  size: state.cache.size,
  maxSize: state.maxSize,
  hits: state.hits,
  misses: state.misses,
  evictions: state.evictions,
});

export const selectCacheHitRate = (state: CacheState & CacheActions) => {
  const total = state.hits + state.misses;
  return total > 0 ? state.hits / total : 0;
};
