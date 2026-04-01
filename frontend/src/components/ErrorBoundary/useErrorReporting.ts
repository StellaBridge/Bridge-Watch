import { useCallback, useRef } from "react";
import { logError, getErrorLog, clearErrorLog, getErrorSummary } from "./errorReporting";
import type { ErrorSeverity } from "./types";

export function useErrorReporting() {
  const recentIdRef = useRef<string | null>(null);

  const reportError = useCallback(
    (
      error: Error,
      options?: {
        componentStack?: string;
        severity?: ErrorSeverity;
        context?: string;
      }
    ) => {
      const entry = logError(
        error,
        options?.componentStack,
        options?.severity ?? "medium",
        options?.context
      );
      recentIdRef.current = entry.id;
      return entry;
    },
    []
  );

  return {
    reportError,
    getErrorLog,
    clearErrorLog,
    getErrorSummary,
    lastErrorId: recentIdRef.current,
  };
}
