import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastContext, ToastVariant, ToastItem } from "./ToastContextValue";
import {
  CRITICAL_TOAST_DURATION_MS,
  DEFAULT_TOAST_DURATION_MS,
  dismissToast,
  enqueueToast,
  type ToastQueueState,
} from "./toastQueue";

function createToastId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random()}`;
}

function toastClassName(variant: ToastVariant) {
  switch (variant) {
    case "critical":
      return "border-red-600/60 bg-red-900/95 text-red-100 ring-2 ring-red-500/50";
    case "error":
      return "border-red-500/40 bg-red-950/90 text-red-100";
    case "success":
      return "border-emerald-500/40 bg-emerald-950/90 text-emerald-100";
    default:
      return "border-stellar-border bg-stellar-card/95 text-stellar-text-primary";
  }
}

function ToastViewport({
  toasts,
  onDismiss,
  titleId,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  titleId: string;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <span id={titleId} className="sr-only">
        Notifications
      </span>
      {toasts.map((t) => {
        const urgent = t.variant === "error" || t.variant === "critical";
        return (
          <div
            key={t.id}
            role={urgent ? "alert" : "status"}
            aria-live={urgent ? "assertive" : "polite"}
            aria-atomic="true"
            aria-labelledby={titleId}
            data-variant={t.variant}
            className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm ${toastClassName(t.variant)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-snug">
                {t.count > 1 ? `${t.message} (x${t.count})` : t.message}
              </p>
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                className="shrink-0 rounded p-0.5 text-current opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastQueueState>({ visible: [], queued: [] });
  const titleId = useId();
  const timersRef = useRef<Record<string, { revision: number; handle: number }>>({});

  const remove = useCallback((id: string) => {
    setState((prev) => dismissToast(prev, id));
  }, []);

  // Only visible toasts count down; queued ones start their timer once shown.
  useEffect(() => {
    const timers = timersRef.current;
    const visibleIds = new Set(state.visible.map((t) => t.id));

    for (const [id, timer] of Object.entries(timers)) {
      if (!visibleIds.has(id)) {
        window.clearTimeout(timer.handle);
        delete timers[id];
      }
    }

    for (const t of state.visible) {
      const existing = timers[t.id];
      if (existing?.revision === t.revision) continue;
      if (existing) window.clearTimeout(existing.handle);
      const duration =
        t.variant === "critical" ? CRITICAL_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS;
      timers[t.id] = {
        revision: t.revision,
        handle: window.setTimeout(() => remove(t.id), duration),
      };
    }
  }, [state.visible, remove]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((t) => window.clearTimeout(t.handle));
    };
  }, []);

  const showToast = useCallback(
    ({
      message,
      variant = "info",
      severity,
    }: {
      message: string;
      variant?: ToastVariant;
      severity?: "high";
    }) => {
      const toast: ToastItem = {
        id: createToastId(),
        message,
        variant: severity === "high" ? "critical" : variant,
        count: 1,
        revision: 0,
      };
      setState((prev) => enqueueToast(prev, toast));
    },
    []
  );

  const showError = useCallback(
    (message: string) => showToast({ message, variant: "error" }),
    [showToast]
  );

  const showSuccess = useCallback(
    (message: string) => showToast({ message, variant: "success" }),
    [showToast]
  );

  const showCritical = useCallback(
    (message: string) => showToast({ message, variant: "critical" }),
    [showToast]
  );

  const value = useMemo(
    () => ({ showToast, showError, showSuccess, showCritical }),
    [showToast, showError, showSuccess, showCritical]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={state.visible} onDismiss={remove} titleId={titleId} />
    </ToastContext.Provider>
  );
}
