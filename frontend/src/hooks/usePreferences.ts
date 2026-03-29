import { useCallback } from "react";
import {
  useUserPreferencesStore,
  selectAlertThresholds,
  selectFavoriteAssets,
  useNotificationStore,
  useNotifications,
} from "../stores";

/**
 * Hook to manage user favorites with notifications
 */
export function useFavorites() {
  const favorites = useUserPreferencesStore(selectFavoriteAssets);
  const { addFavoriteAsset, removeFavoriteAsset } = useUserPreferencesStore();
  const { notify } = useNotifications();

  const addFavorite = useCallback(
    (asset: string) => {
      addFavoriteAsset(asset);
      notify(
        "Favorite Added",
        `${asset} has been added to your favorites`,
        "low",
        { type: "info", assetCode: asset }
      );
    },
    [addFavoriteAsset, notify]
  );

  const removeFavorite = useCallback(
    (asset: string) => {
      removeFavoriteAsset(asset);
      notify(
        "Favorite Removed",
        `${asset} has been removed from your favorites`,
        "low",
        { type: "info", assetCode: asset }
      );
    },
    [removeFavoriteAsset, notify]
  );

  const isFavorite = useCallback(
    (asset: string) => favorites.includes(asset),
    [favorites]
  );

  const toggleFavorite = useCallback(
    (asset: string) => {
      if (isFavorite(asset)) {
        removeFavorite(asset);
      } else {
        addFavorite(asset);
      }
    },
    [isFavorite, addFavorite, removeFavorite]
  );

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    toggleFavorite,
    count: favorites.length,
  };
}

/**
 * Hook to manage alert thresholds
 */
export function useAlertThresholds() {
  const thresholds = useUserPreferencesStore(selectAlertThresholds);
  const setAlertThreshold = useUserPreferencesStore(
    (state) => state.setAlertThreshold
  );

  const updatePriceDeviation = useCallback(
    (value: number) => setAlertThreshold("priceDeviation", value),
    [setAlertThreshold]
  );

  const updateSupplyMismatch = useCallback(
    (value: number) => setAlertThreshold("supplyMismatch", value),
    [setAlertThreshold]
  );

  const updateHealthScoreDrop = useCallback(
    (value: number) => setAlertThreshold("healthScoreDrop", value),
    [setAlertThreshold]
  );

  return {
    thresholds,
    updatePriceDeviation,
    updateSupplyMismatch,
    updateHealthScoreDrop,
  };
}

/**
 * Hook to check if an alert should be triggered based on thresholds
 */
export function useAlertChecker() {
  const thresholds = useUserPreferencesStore(selectAlertThresholds);
  const { notify } = useNotifications();

  const checkPriceDeviation = useCallback(
    (symbol: string, deviation: number) => {
      if (deviation > thresholds.priceDeviation) {
        notify(
          "Price Deviation Alert",
          `${symbol} price has deviated by ${(deviation * 100).toFixed(2)}%`,
          deviation > 0.05 ? "high" : "medium",
          { type: "price_alert", assetCode: symbol }
        );
        return true;
      }
      return false;
    },
    [thresholds.priceDeviation, notify]
  );

  const checkSupplyMismatch = useCallback(
    (bridge: string, mismatch: number) => {
      if (mismatch > thresholds.supplyMismatch) {
        notify(
          "Supply Mismatch Alert",
          `${bridge} has a supply mismatch of ${(mismatch * 100).toFixed(2)}%`,
          mismatch > 0.2 ? "critical" : "high",
          { type: "supply_mismatch", bridgeId: bridge }
        );
        return true;
      }
      return false;
    },
    [thresholds.supplyMismatch, notify]
  );

  const checkHealthScoreDrop = useCallback(
    (symbol: string, oldScore: number, newScore: number) => {
      const drop = oldScore - newScore;
      if (drop > thresholds.healthScoreDrop) {
        notify(
          "Health Score Drop",
          `${symbol} health score dropped by ${drop} points`,
          drop > 20 ? "critical" : "high",
          { type: "health_score_drop", assetCode: symbol }
        );
        return true;
      }
      return false;
    },
    [thresholds.healthScoreDrop, notify]
  );

  return {
    checkPriceDeviation,
    checkSupplyMismatch,
    checkHealthScoreDrop,
  };
}
