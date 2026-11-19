import {
  useCallback,
  useId,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { ToastContext, ToastVariant, ToastItem } from "./ToastContextValue";

const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_TOAST_DURATION = 6000;
const CRITICAL_TOAST_DURATION = 8000;

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
        const displayMessage = t.count && t.count > 1 ? `${t.message} (×${t.count})` : t.message;
        const isCritical = t.variant === "critical";

        return (
          <div
            key={t.id}
            role={t.variant === "error" || isCritical ? "alert" : "status"}
            aria-live={t.variant === "error" || isCritical ? "assertive" : "polite"}
            aria-atomic="true"
            aria-labelledby={titleId}
            className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm ${
              isCritical
                ? "border-red-600/60 bg-red-900/95 text-red-100 ring-2 ring-red-500/50"
                : t.variant === "error"
                  ? "border-red-500/40 bg-red-950/90 text-red-100"
                  : t.variant === "success"
                    ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-100"
                    : "border-stellar-border bg-stellar-card/95 text-stellar-text-primary"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-snug">{displayMessage}</p>
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [queuedToasts, setQueuedToasts] = useState<ToastItem[]>([]);
  const titleId = useId();
  const timersRef = useRef<Record<string, number>>({});
  const messageCountRef = useRef<Record<string, number>>({});

  const remove = useCallback((id: string) => {
    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts((prev) => {
      const remaining = prev.filter((x) => x.id !== id);
      return remaining;
    });

    // If there are queued toasts and we have room, show the next one
    setQueuedToasts((prev) => {
      if (prev.length > 0) {
        setToasts((current) => {
          if (current.length < MAX_VISIBLE_TOASTS) {
            const nextToast = prev[0];
            const duration =
              nextToast.variant === "critical" ? CRITICAL_TOAST_DURATION : DEFAULT_TOAST_DURATION;
            timersRef.current[nextToast.id] = window.setTimeout(
              () => remove(nextToast.id),
              duration
            );
            return [...current, nextToast];
          }
          return current;
        });
        return prev.slice(1);
      }
      return prev;
    });
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
      const isCriticalAlert = severity === "high" || variant === "critical";
      const finalVariant: ToastVariant = isCriticalAlert ? "critical" : variant;

      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random()}`;

      const newToast: ToastItem = {
        id,
        message,
        variant: finalVariant,
        count: 1,
        timestamp: Date.now(),
      };

      setToasts((prev) => {
        const existingIndex = prev.findIndex((t) => t.message === message && t.variant === finalVariant);

        // If critical alert, bypass queue and add to visible toasts
        if (isCriticalAlert) {
          if (prev.length >= MAX_VISIBLE_TOASTS) {
            // Insert at the top instead of queueing
            const updated = [newToast, ...prev];
            if (updated.length > MAX_VISIBLE_TOASTS) {
              const removed = updated.pop();
              if (removed) {
                setQueuedToasts((q) => [removed, ...q]);
              }
            }
            return updated;
          }
          const duration = CRITICAL_TOAST_DURATION;
          timersRef.current[id] = window.setTimeout(() => remove(id), duration);
          return [...prev, newToast];
        }

        // For non-critical toasts, check for duplicates
        if (existingIndex !== -1) {
          const existing = prev[existingIndex];
          const updated = [...prev];
          updated[existingIndex] = {
            ...existing,
            count: (existing.count || 1) + 1,
            timestamp: Date.now(),
          };
          // Reset timer for updated toast
          if (timersRef.current[existing.id]) {
            window.clearTimeout(timersRef.current[existing.id]);
          }
          const duration = DEFAULT_TOAST_DURATION;
          timersRef.current[existing.id] = window.setTimeout(() => remove(existing.id), duration);
          return updated;
        }

        // If at capacity, queue the toast
        if (prev.length >= MAX_VISIBLE_TOASTS) {
          setQueuedToasts((q) => [...q, newToast]);
          return prev;
        }

        // Show the toast
        const duration = DEFAULT_TOAST_DURATION;
        timersRef.current[id] = window.setTimeout(() => remove(id), duration);
        return [...prev, newToast];
      });
    },
    [remove]
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
    (message: string) => showToast({ message, variant: "critical", severity: "high" }),
    [showToast]
  );

  const value = useMemo(
    () => ({ showToast, showError, showSuccess, showCritical }),
    [showToast, showError, showSuccess, showCritical]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={remove} titleId={titleId} />
    </ToastContext.Provider>
  );
}


