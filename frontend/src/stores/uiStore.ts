import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type ModalType =
  | "assetDetails"
  | "alertSettings"
  | "bridgeDetails"
  | "settings"
  | "help"
  | null;

export type SidebarView = "default" | "favorites" | "alerts" | "settings";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface UIState {
  // Modal state
  activeModal: ModalType;
  modalData: Record<string, unknown> | null;

  // Sidebar state
  sidebarOpen: boolean;
  sidebarView: SidebarView;

  // Toast notifications
  toasts: Toast[];

  // Loading states
  globalLoading: boolean;
  loadingMessage: string | null;

  // Page-specific UI state
  selectedAsset: string | null;
  selectedBridge: string | null;
  selectedTimeRange: "1h" | "24h" | "7d" | "30d";

  // View states
  isMobileView: boolean;
  isTouchDevice: boolean;
}

export interface UIActions {
  // Modal actions
  openModal: (modal: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  setModalData: (data: Record<string, unknown>) => void;

  // Sidebar actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarView: (view: SidebarView) => void;

  // Toast actions
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;

  // Loading actions
  setGlobalLoading: (loading: boolean, message?: string) => void;

  // Selection actions
  setSelectedAsset: (asset: string | null) => void;
  setSelectedBridge: (bridge: string | null) => void;
  setSelectedTimeRange: (range: "1h" | "24h" | "7d" | "30d") => void;

  // View actions
  setIsMobileView: (isMobile: boolean) => void;
  setIsTouchDevice: (isTouch: boolean) => void;

  // Reset
  resetUI: () => void;
}

const initialUIState: UIState = {
  activeModal: null,
  modalData: null,
  sidebarOpen: true,
  sidebarView: "default",
  toasts: [],
  globalLoading: false,
  loadingMessage: null,
  selectedAsset: null,
  selectedBridge: null,
  selectedTimeRange: "24h",
  isMobileView: false,
  isTouchDevice: false,
};

export const useUIStore = create<UIState & UIActions>()(
  devtools(
    (set, get) => ({
      ...initialUIState,

      openModal: (modal, data) => {
        set(
          { activeModal: modal, modalData: data || null },
          false,
          `openModal/${modal}`
        );
      },

      closeModal: () => {
        set({ activeModal: null, modalData: null }, false, "closeModal");
      },

      setModalData: (data) => {
        set(
          { modalData: { ...get().modalData, ...data } },
          false,
          "setModalData"
        );
      },

      toggleSidebar: () => {
        set({ sidebarOpen: !get().sidebarOpen }, false, "toggleSidebar");
      },

      setSidebarOpen: (open) => {
        set({ sidebarOpen: open }, false, "setSidebarOpen");
      },

      setSidebarView: (view) => {
        set({ sidebarView: view }, false, "setSidebarView");
      },

      addToast: (message, type, duration = 5000) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const toast: Toast = { id, message, type, duration };

        set({ toasts: [...get().toasts, toast] }, false, "addToast");

        if (duration > 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, duration);
        }
      },

      removeToast: (id) => {
        set(
          { toasts: get().toasts.filter((t) => t.id !== id) },
          false,
          "removeToast"
        );
      },

      clearToasts: () => {
        set({ toasts: [] }, false, "clearToasts");
      },

      setGlobalLoading: (loading, message) => {
        set(
          { globalLoading: loading, loadingMessage: message || null },
          false,
          "setGlobalLoading"
        );
      },

      setSelectedAsset: (asset) => {
        set({ selectedAsset: asset }, false, "setSelectedAsset");
      },

      setSelectedBridge: (bridge) => {
        set({ selectedBridge: bridge }, false, "setSelectedBridge");
      },

      setSelectedTimeRange: (range) => {
        set({ selectedTimeRange: range }, false, "setSelectedTimeRange");
      },

      setIsMobileView: (isMobile) => {
        set({ isMobileView: isMobile }, false, "setIsMobileView");
      },

      setIsTouchDevice: (isTouch) => {
        set({ isTouchDevice: isTouch }, false, "setIsTouchDevice");
      },

      resetUI: () => {
        set(initialUIState, false, "resetUI");
      },
    }),
    { name: "UIStore" }
  )
);

// Selectors for optimized re-renders
export const selectActiveModal = (state: UIState & UIActions) =>
  state.activeModal;

export const selectModalData = (state: UIState & UIActions) => state.modalData;

export const selectSidebarOpen = (state: UIState & UIActions) =>
  state.sidebarOpen;

export const selectToasts = (state: UIState & UIActions) => state.toasts;

export const selectGlobalLoading = (state: UIState & UIActions) => ({
  loading: state.globalLoading,
  message: state.loadingMessage,
});

export const selectSelectedAsset = (state: UIState & UIActions) =>
  state.selectedAsset;

export const selectIsMobileView = (state: UIState & UIActions) =>
  state.isMobileView;
