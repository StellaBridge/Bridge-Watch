import type { ToastItem } from "./ToastContextValue";

export const MAX_VISIBLE_TOASTS = 3;
export const DEFAULT_TOAST_DURATION_MS = 6000;
export const CRITICAL_TOAST_DURATION_MS = 8000;

export interface ToastQueueState {
  visible: ToastItem[];
  queued: ToastItem[];
}

export function enqueueToast(state: ToastQueueState, toast: ToastItem): ToastQueueState {
  const duplicate = [...state.visible, ...state.queued].find(
    (t) => t.message === toast.message && t.variant === toast.variant
  );

  if (duplicate) {
    const bump = (t: ToastItem) =>
      t.id === duplicate.id ? { ...t, count: t.count + 1, revision: t.revision + 1 } : t;
    return { visible: state.visible.map(bump), queued: state.queued.map(bump) };
  }

  if (toast.variant === "critical") {
    const visible = [toast, ...state.visible];
    return {
      visible: visible.slice(0, MAX_VISIBLE_TOASTS),
      queued: [...visible.slice(MAX_VISIBLE_TOASTS), ...state.queued],
    };
  }

  if (state.visible.length < MAX_VISIBLE_TOASTS) {
    return { ...state, visible: [...state.visible, toast] };
  }

  return { ...state, queued: [...state.queued, toast] };
}

export function dismissToast(state: ToastQueueState, id: string): ToastQueueState {
  const visible = state.visible.filter((t) => t.id !== id);
  const queued = state.queued.filter((t) => t.id !== id);
  const free = MAX_VISIBLE_TOASTS - visible.length;
  return {
    visible: [...visible, ...queued.slice(0, free)],
    queued: queued.slice(free),
  };
}
