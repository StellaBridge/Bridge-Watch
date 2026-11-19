import { createContext, useContext } from "react";

export type ToastVariant = "error" | "success" | "info" | "critical";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  count?: number;
  timestamp?: number;
}

export type ToastContextValue = {
  showToast: (opts: { message: string; variant?: ToastVariant; severity?: "high" }) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showCritical: (message: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
