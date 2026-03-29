import { useLocalStorageState } from "./useLocalStorageState";

const STORAGE_KEY = "bridge-watch.preferences.v1";

export type UserPreferences = {
  /** Prefer abbreviated numbers (e.g. 1.2M) where supported */
  compactNumbers: boolean;
  /** Reduce motion for charts and loading shimmer */
  reducedMotion: boolean;
  /** Poll interval hint for dashboards (ms); backend refetch uses app defaults unless wired */
  dataRefreshMs: 30_000 | 60_000 | 120_000;
};

const DEFAULT_PREFERENCES: UserPreferences = {
  compactNumbers: false,
  reducedMotion: false,
  dataRefreshMs: 60_000,
};

export function useUserPreferences(): [UserPreferences, (next: Partial<UserPreferences>) => void] {
  const [prefs, setPrefs] = useLocalStorageState<UserPreferences>(STORAGE_KEY, DEFAULT_PREFERENCES);

  const patch = (next: Partial<UserPreferences>) => {
    setPrefs((prev) => ({ ...prev, ...next }));
  };

  return [prefs, patch];
}
