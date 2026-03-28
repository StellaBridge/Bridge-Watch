import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useLocalStorageState } from "./useLocalStorageState";

export type RefreshTarget = {
  id: string;
  label: string;
  queryKey?: QueryKey;
  refetch?: () => Promise<unknown>;
};

type StoredPreferences = {
  autoRefreshEnabled: boolean;
  refreshIntervalMs: number;
  refreshOnFocus: boolean;
  selectedTargetIds: string[];
};

type UseRefreshControlsOptions = {
  viewId: string;
  targets: RefreshTarget[];
  defaultIntervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 30_000;

function getDefaultTargetIds(targets: RefreshTarget[]): string[] {
  return targets.map((target) => target.id);
}

export function useRefreshControls({
  viewId,
  targets,
  defaultIntervalMs = DEFAULT_INTERVAL_MS,
}: UseRefreshControlsOptions) {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useLocalStorageState<StoredPreferences>(
    `bridge-watch:refresh-preferences:${viewId}:v1`,
    {
      autoRefreshEnabled: false,
      refreshIntervalMs: defaultIntervalMs,
      refreshOnFocus: true,
      selectedTargetIds: getDefaultTargetIds(targets),
    }
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const isRefreshingRef = useRef(false);

  const selectedTargets = useMemo(() => {
    const selectedIds = new Set(preferences.selectedTargetIds);
    return targets.filter((target) => selectedIds.has(target.id));
  }, [preferences.selectedTargetIds, targets]);

  const refreshNow = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      await Promise.all(
        selectedTargets.map(async (target) => {
          if (target.refetch) {
            await target.refetch();
            return;
          }

          if (target.queryKey) {
            await queryClient.refetchQueries({ queryKey: target.queryKey, type: "active" });
          }
        })
      );

      setLastUpdatedAt(new Date());
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [queryClient, selectedTargets]);

  const cancelRefresh = useCallback(async () => {
    await queryClient.cancelQueries();
    isRefreshingRef.current = false;
    setIsRefreshing(false);
  }, [queryClient]);

  useEffect(() => {
    if (!preferences.autoRefreshEnabled) return;

    const intervalId = window.setInterval(() => {
      void refreshNow();
    }, preferences.refreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [preferences.autoRefreshEnabled, preferences.refreshIntervalMs, refreshNow]);

  useEffect(() => {
    if (!preferences.refreshOnFocus) return;

    const handleFocus = () => {
      void refreshNow();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [preferences.refreshOnFocus, refreshNow]);

  useEffect(() => {
    if (preferences.selectedTargetIds.length > 0) return;

    setPreferences((prev) => ({
      ...prev,
      selectedTargetIds: getDefaultTargetIds(targets),
    }));
  }, [preferences.selectedTargetIds.length, setPreferences, targets]);

  const setAutoRefreshEnabled = useCallback(
    (value: boolean) => {
      setPreferences((prev) => ({ ...prev, autoRefreshEnabled: value }));
    },
    [setPreferences]
  );

  const setRefreshIntervalMs = useCallback(
    (value: number) => {
      setPreferences((prev) => ({ ...prev, refreshIntervalMs: value }));
    },
    [setPreferences]
  );

  const setRefreshOnFocus = useCallback(
    (value: boolean) => {
      setPreferences((prev) => ({ ...prev, refreshOnFocus: value }));
    },
    [setPreferences]
  );

  const setSelectedTargetIds = useCallback(
    (selectedTargetIds: string[]) => {
      setPreferences((prev) => ({ ...prev, selectedTargetIds }));
    },
    [setPreferences]
  );

  return {
    preferences,
    setAutoRefreshEnabled,
    setRefreshIntervalMs,
    setRefreshOnFocus,
    setSelectedTargetIds,
    refreshNow,
    cancelRefresh,
    isRefreshing,
    lastUpdatedAt,
    selectedTargets,
    allTargets: targets,
  };
}
