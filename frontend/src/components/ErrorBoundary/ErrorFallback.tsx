import { useState } from "react";
import type { ErrorFallbackProps } from "./types";

const isDev = import.meta.env.DEV;

const SEVERITY_STYLES: Record<string, { border: string; bg: string; text: string; btn: string }> = {
  low: {
    border: "border-yellow-500/30",
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    btn: "bg-yellow-600 hover:bg-yellow-500",
  },
  medium: {
    border: "border-red-500/30",
    bg: "bg-red-500/10",
    text: "text-red-400",
    btn: "bg-red-500 hover:bg-red-400",
  },
  high: {
    border: "border-red-500/40",
    bg: "bg-red-500/15",
    text: "text-red-400",
    btn: "bg-red-600 hover:bg-red-500",
  },
  critical: {
    border: "border-red-600/50",
    bg: "bg-red-600/20",
    text: "text-red-300",
    btn: "bg-red-700 hover:bg-red-600",
  },
};

export default function ErrorFallback({
  error,
  errorInfo,
  resetError,
  severity = "medium",
  compact = false,
  title,
  message,
}: ErrorFallbackProps) {
  const [showStack, setShowStack] = useState(false);
  const styles = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium;

  const displayTitle = title ?? (severity === "critical" ? "Application Error" : "Something went wrong");
  const displayMessage =
    message ??
    (severity === "critical"
      ? "A critical error occurred. Please refresh the page or try again."
      : "An unexpected error occurred while rendering this section.");

  if (compact) {
    return (
      <div
        role="alert"
        className={`${styles.bg} border ${styles.border} rounded-lg px-4 py-3 flex items-center justify-between gap-3`}
        data-testid="error-fallback-compact"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm font-medium ${styles.text}`} aria-hidden="true">
            ⚠
          </span>
          <span className={`text-sm ${styles.text} truncate`}>{displayTitle}</span>
        </div>
        <button
          type="button"
          onClick={resetError}
          className={`shrink-0 px-3 py-1 text-xs text-white rounded-md ${styles.btn}`}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`${styles.bg} border ${styles.border} rounded-lg p-6 text-center`}
      data-testid="error-fallback"
    >
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
        <span className="text-2xl" aria-hidden="true">
          {severity === "critical" ? "🚨" : "⚠️"}
        </span>
      </div>
      <p className={`${styles.text} font-semibold text-lg`}>{displayTitle}</p>
      <p className={`mt-1 text-sm ${styles.text}/80`}>{displayMessage}</p>

      {errorInfo?.id && (
        <p className="mt-2 text-xs text-stellar-text-secondary">
          Error ID: <code className="font-mono">{errorInfo.id}</code>
        </p>
      )}

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={resetError}
          className={`px-4 py-2 text-white rounded-md ${styles.btn} focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-stellar-dark`}
        >
          Try Again
        </button>
        {severity === "critical" && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-stellar-text-secondary border border-stellar-border rounded-md hover:bg-stellar-border focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-dark"
          >
            Reload Page
          </button>
        )}
      </div>

      {isDev && error.stack && (
        <div className="mt-4 text-left">
          <button
            type="button"
            onClick={() => setShowStack((v) => !v)}
            className="text-xs text-stellar-text-secondary hover:text-stellar-text-primary underline focus:outline-none"
            aria-expanded={showStack}
          >
            {showStack ? "Hide" : "Show"} stack trace
          </button>
          {showStack && (
            <pre className="mt-2 p-3 bg-stellar-dark/80 border border-stellar-border rounded text-xs text-red-300 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
              {error.stack}
              {errorInfo?.componentStack && (
                <>
                  {"\n\nComponent Stack:\n"}
                  {errorInfo.componentStack}
                </>
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
