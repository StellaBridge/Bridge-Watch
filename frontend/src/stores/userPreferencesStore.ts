import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { devtools } from "zustand/middleware";

export interface UserPreferences {
  defaultAsset: string;
  defaultTimeRange: "1h" | "24h" | "7d" | "30d";
  refreshInterval: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  sidebarCollapsed: boolean;
  dashboardLayout: "grid" | "list";
  favoriteAssets: string[];
  alertThresholds: {
    priceDeviation: number;
    supplyMismatch: number;
    healthScoreDrop: number;
  };
}

const defaultPreferences: UserPreferences = {
  defaultAsset: "USDC",
  defaultTimeRange: "24h",
  refreshInterval: 30000,
  notificationsEnabled: true,
  soundEnabled: false,
  sidebarCollapsed: false,
  dashboardLayout: "grid",
  favoriteAssets: [],
  alertThresholds: {
    priceDeviation: 0.02,
    supplyMismatch: 0.1,
    healthScoreDrop: 10,
  },
};

interface UserPreferencesState extends UserPreferences {
  setPreference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  addFavoriteAsset: (asset: string) => void;
  removeFavoriteAsset: (asset: string) => void;
  toggleSidebar: () => void;
  setAlertThreshold: (
    type: keyof UserPreferences["alertThresholds"],
    value: number
  ) => void;
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  devtools(
    persist(
      (set, get) => ({
        ...defaultPreferences,

        setPreference: (key, value) => {
          set({ [key]: value }, false, `setPreference/${key}`);
        },

        setPreferences: (preferences) => {
          set((state) => ({ ...state, ...preferences }), false, "setPreferences");
        },

        resetPreferences: () => {
          set(defaultPreferences, false, "resetPreferences");
        },

        addFavoriteAsset: (asset) => {
          const current = get().favoriteAssets;
          if (!current.includes(asset)) {
            set(
              { favoriteAssets: [...current, asset] },
              false,
              "addFavoriteAsset"
            );
          }
        },

        removeFavoriteAsset: (asset) => {
          set(
            {
              favoriteAssets: get().favoriteAssets.filter((a) => a !== asset),
            },
            false,
            "removeFavoriteAsset"
          );
        },

        toggleSidebar: () => {
          set(
            { sidebarCollapsed: !get().sidebarCollapsed },
            false,
            "toggleSidebar"
          );
        },

        setAlertThreshold: (type, value) => {
          set(
            {
              alertThresholds: {
                ...get().alertThresholds,
                [type]: value,
              },
            },
            false,
            `setAlertThreshold/${type}`
          );
        },
      }),
      {
        name: "bridge-watch-user-preferences",
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: "UserPreferencesStore" }
  )
);

export const selectUserPreferences = (state: UserPreferencesState) => ({
  defaultAsset: state.defaultAsset,
  defaultTimeRange: state.defaultTimeRange,
  refreshInterval: state.refreshInterval,
  notificationsEnabled: state.notificationsEnabled,
  soundEnabled: state.soundEnabled,
  sidebarCollapsed: state.sidebarCollapsed,
  dashboardLayout: state.dashboardLayout,
  favoriteAssets: state.favoriteAssets,
  alertThresholds: state.alertThresholds,
});

export const selectAlertThresholds = (state: UserPreferencesState) =>
  state.alertThresholds;

export const selectFavoriteAssets = (state: UserPreferencesState) =>
  state.favoriteAssets;
