import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type NotificationType =
  | "price_alert"
  | "supply_mismatch"
  | "bridge_downtime"
  | "health_score_drop"
  | "system"
  | "info";

export type NotificationPriority = "critical" | "high" | "medium" | "low";

export interface Notification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  assetCode?: string;
  bridgeId?: string;
  timestamp: number;
  read: boolean;
  dismissed: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  criticalCount: number;
  highCount: number;
  notificationHistory: Notification[];
  maxHistorySize: number;
}

export interface NotificationActions {
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read" | "dismissed">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
  dismissAll: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  getUnreadNotifications: () => Notification[];
  getNotificationsByType: (type: NotificationType) => Notification[];
  getNotificationsByPriority: (priority: NotificationPriority) => Notification[];
  getNotificationsByAsset: (assetCode: string) => Notification[];
  setMaxHistorySize: (size: number) => void;
}

const MAX_HISTORY_DEFAULT = 100;

const createNotificationId = (): string =>
  `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const countByPredicate = (notifications: Notification[], predicate: (n: Notification) => boolean): number =>
  notifications.filter((n) => !n.dismissed && predicate(n)).length;

export const useNotificationStore = create<NotificationState & NotificationActions>()(
  devtools(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      criticalCount: 0,
      highCount: 0,
      notificationHistory: [],
      maxHistorySize: MAX_HISTORY_DEFAULT,

      addNotification: (notificationData) => {
        const notification: Notification = {
          ...notificationData,
          id: createNotificationId(),
          timestamp: Date.now(),
          read: false,
          dismissed: false,
        };

        set((state) => {
          const newNotifications = [notification, ...state.notifications];
          const newHistory = [notification, ...state.notificationHistory].slice(
            0,
            state.maxHistorySize
          );

          return {
            notifications: newNotifications,
            notificationHistory: newHistory,
            unreadCount: countByPredicate(newNotifications, (n) => !n.read),
            criticalCount: countByPredicate(
              newNotifications,
              (n) => n.priority === "critical" && !n.read
            ),
            highCount: countByPredicate(
              newNotifications,
              (n) => n.priority === "high" && !n.read
            ),
          };
        }, false, "addNotification");
      },

      markAsRead: (id) => {
        set((state) => {
          const newNotifications = state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          );

          return {
            notifications: newNotifications,
            unreadCount: countByPredicate(newNotifications, (n) => !n.read),
            criticalCount: countByPredicate(
              newNotifications,
              (n) => n.priority === "critical" && !n.read
            ),
            highCount: countByPredicate(
              newNotifications,
              (n) => n.priority === "high" && !n.read
            ),
          };
        }, false, "markAsRead");
      },

      markAllAsRead: () => {
        set((state) => {
          const newNotifications = state.notifications.map((n) => ({
            ...n,
            read: true,
          }));

          return {
            notifications: newNotifications,
            unreadCount: 0,
            criticalCount: 0,
            highCount: 0,
          };
        }, false, "markAllAsRead");
      },

      dismissNotification: (id) => {
        set((state) => {
          const newNotifications = state.notifications.map((n) =>
            n.id === id ? { ...n, dismissed: true } : n
          );

          return {
            notifications: newNotifications,
            unreadCount: countByPredicate(newNotifications, (n) => !n.read),
            criticalCount: countByPredicate(
              newNotifications,
              (n) => n.priority === "critical" && !n.read
            ),
            highCount: countByPredicate(
              newNotifications,
              (n) => n.priority === "high" && !n.read
            ),
          };
        }, false, "dismissNotification");
      },

      dismissAll: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({
            ...n,
            dismissed: true,
          })),
          unreadCount: 0,
          criticalCount: 0,
          highCount: 0,
        }), false, "dismissAll");
      },

      removeNotification: (id) => {
        set((state) => {
          const newNotifications = state.notifications.filter((n) => n.id !== id);

          return {
            notifications: newNotifications,
            unreadCount: countByPredicate(newNotifications, (n) => !n.read),
            criticalCount: countByPredicate(
              newNotifications,
              (n) => n.priority === "critical" && !n.read
            ),
            highCount: countByPredicate(
              newNotifications,
              (n) => n.priority === "high" && !n.read
            ),
          };
        }, false, "removeNotification");
      },

      clearAll: () => {
        set(
          {
            notifications: [],
            unreadCount: 0,
            criticalCount: 0,
            highCount: 0,
          },
          false,
          "clearAll"
        );
      },

      getUnreadNotifications: () => {
        return get().notifications.filter((n) => !n.read && !n.dismissed);
      },

      getNotificationsByType: (type) => {
        return get().notifications.filter(
          (n) => n.type === type && !n.dismissed
        );
      },

      getNotificationsByPriority: (priority) => {
        return get().notifications.filter(
          (n) => n.priority === priority && !n.dismissed
        );
      },

      getNotificationsByAsset: (assetCode) => {
        return get().notifications.filter(
          (n) => n.assetCode === assetCode && !n.dismissed
        );
      },

      setMaxHistorySize: (size) => {
        set((state) => ({
          maxHistorySize: size,
          notificationHistory: state.notificationHistory.slice(0, size),
        }), false, "setMaxHistorySize");
      },
    }),
    { name: "NotificationStore" }
  )
);

// Selectors for optimized re-renders
export const selectNotifications = (state: NotificationState & NotificationActions) =>
  state.notifications.filter((n) => !n.dismissed);

export const selectUnreadCount = (state: NotificationState & NotificationActions) =>
  state.unreadCount;

export const selectCriticalCount = (state: NotificationState & NotificationActions) =>
  state.criticalCount;

export const selectHighPriorityCount = (state: NotificationState & NotificationActions) =>
  state.highCount;

export const selectNotificationStats = (state: NotificationState & NotificationActions) => ({
  total: state.notifications.filter((n) => !n.dismissed).length,
  unread: state.unreadCount,
  critical: state.criticalCount,
  high: state.highCount,
});
