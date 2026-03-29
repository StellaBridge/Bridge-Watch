// Centralized exports for all Zustand stores
// This file provides a clean API for importing stores throughout the application

// User Preferences Store
export {
  useUserPreferencesStore,
  selectUserPreferences,
  selectAlertThresholds,
  selectFavoriteAssets,
  type UserPreferences,
} from "./userPreferencesStore";

// UI Store
export {
  useUIStore,
  selectActiveModal,
  selectModalData,
  selectSidebarOpen,
  selectToasts,
  selectGlobalLoading,
  selectSelectedAsset,
  selectIsMobileView,
  type ModalType,
  type SidebarView,
  type ToastType,
  type Toast,
  type UIState,
  type UIActions,
} from "./uiStore";

// Notification Store
export {
  useNotificationStore,
  selectNotifications,
  selectUnreadCount,
  selectCriticalCount,
  selectHighPriorityCount,
  selectNotificationStats,
  type NotificationType,
  type NotificationPriority,
  type Notification,
  type NotificationState,
  type NotificationActions,
} from "./notificationStore";

// WebSocket Store
export {
  useWebSocketStore,
  selectWebSocketStatus,
  selectIsConnected,
  selectActiveChannels,
  selectLastMessage,
  selectConnectionStats,
  type WebSocketStatus,
  type WebSocketMessage,
  type WebSocketError,
  type WebSocketState,
  type WebSocketActions,
} from "./webSocketStore";

// Theme Store
export {
  useThemeStore,
  selectThemeMode,
  selectResolvedMode,
  selectIsDarkMode,
  selectThemeColors,
  selectFontSettings,
  selectDensity,
  selectAnimationSettings,
  type ThemeMode,
  type ThemeColors,
  type FontSettings,
  type ThemeState,
  type ThemeActions,
} from "./themeStore";

// Cache Store
export {
  useCacheStore,
  createCachedQuery,
  selectCacheStats,
  selectCacheHitRate,
  type CacheEntry,
  type CacheState,
  type CacheActions,
} from "./cacheStore";

// Middleware
export {
  logger,
  stateMetricsMiddleware,
  errorBoundaryMiddleware,
  type StateChangeMetric,
} from "./middleware";

// Utility hooks for common store operations
import { useCallback } from "react";
import { useUIStore, type ToastType, type UIState, type UIActions } from "./uiStore";
import { useNotificationStore, type NotificationPriority, type NotificationState, type NotificationActions } from "./notificationStore";
import { useThemeStore, type ThemeState, type ThemeActions } from "./themeStore";

// Hook for showing toast notifications
export function useToast() {
  const addToast = useUIStore((state: UIState & UIActions) => state.addToast);

  return useCallback(
    (message: string, type: ToastType = "info", duration?: number) => {
      addToast(message, type, duration);
    },
    [addToast]
  );
}

// Hook for managing notifications
export function useNotifications() {
  const addNotification = useNotificationStore((state: NotificationState & NotificationActions) => state.addNotification);
  const markAsRead = useNotificationStore((state: NotificationState & NotificationActions) => state.markAsRead);
  const dismiss = useNotificationStore((state: NotificationState & NotificationActions) => state.dismissNotification);
  const clearAll = useNotificationStore((state: NotificationState & NotificationActions) => state.clearAll);

  return {
    notify: useCallback(
      (
        title: string,
        message: string,
        priority: NotificationPriority = "medium",
        options?: {
          type?: Parameters<typeof addNotification>[0]["type"];
          assetCode?: string;
          bridgeId?: string;
          actionUrl?: string;
          actionLabel?: string;
        }
      ) => {
        addNotification({
          type: options?.type || "info",
          priority,
          title,
          message,
          assetCode: options?.assetCode,
          bridgeId: options?.bridgeId,
          actionUrl: options?.actionUrl,
          actionLabel: options?.actionLabel,
        });
      },
      [addNotification]
    ),
    markAsRead: useCallback(
      (id: string) => markAsRead(id),
      [markAsRead]
    ),
    dismiss: useCallback(
      (id: string) => dismiss(id),
      [dismiss]
    ),
    clearAll: useCallback(
      () => clearAll(),
      [clearAll]
    ),
  };
}

// Hook for theme management
export function useTheme() {
  const { resolvedMode, toggleMode, setMode, applyTheme } = useThemeStore((state: ThemeState & ThemeActions) => ({
    resolvedMode: state.resolvedMode,
    toggleMode: state.toggleMode,
    setMode: state.setMode,
    applyTheme: state.applyTheme,
  }));

  return {
    isDark: resolvedMode === "dark",
    toggle: toggleMode,
    setMode,
    applyTheme,
  };
}
