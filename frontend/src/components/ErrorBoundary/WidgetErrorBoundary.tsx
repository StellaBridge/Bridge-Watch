import React from "react";
import ComponentErrorBoundary from "./ComponentErrorBoundary";
import ErrorFallback from "./ErrorFallback";
import type { ComponentErrorBoundaryProps } from "./types";

interface WidgetErrorBoundaryProps extends Omit<ComponentErrorBoundaryProps, "severity" | "compact"> {
  widgetId: string;
  widgetTitle?: string;
}

export default function WidgetErrorBoundary({
  widgetId,
  widgetTitle,
  children,
  ...props
}: WidgetErrorBoundaryProps) {
  return (
    <ComponentErrorBoundary
      severity="medium"
      compact={true}
      context={`widget:${widgetId}`}
      fallback={({ error, resetError, errorInfo }) => (
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6 min-h-64 flex flex-col items-center justify-center">
          <div className="max-w-md text-center">
            <div className="mb-4 text-3xl">⚠️</div>
            <h3 className="text-lg font-semibold text-stellar-text-primary mb-2">
              {widgetTitle ? `${widgetTitle} Error` : "Widget Error"}
            </h3>
            <p className="text-sm text-stellar-text-secondary mb-4">
              {error.message || "An unexpected error occurred in this widget."}
            </p>
            {process.env.NODE_ENV === "development" && errorInfo && (
              <details className="mb-4 text-left">
                <summary className="text-xs text-stellar-text-secondary cursor-pointer hover:text-stellar-text-primary mb-2">
                  Error details
                </summary>
                <pre className="text-xs overflow-auto bg-stellar-dark/50 rounded p-2 max-h-40">
                  {error.toString()}
                </pre>
              </details>
            )}
            <div className="flex gap-2 justify-center flex-wrap">
              <button
                type="button"
                onClick={resetError}
                className="inline-flex items-center justify-center rounded-md border border-stellar-border px-3 py-2 text-sm font-medium text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-stellar-blue focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                Try again
              </button>
              <a
                href={`https://github.com/StellaBridge/Bridge-Watch/issues/new?labels=bug&title=${encodeURIComponent(`Widget error in ${widgetTitle || widgetId}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-stellar-border px-3 py-2 text-sm font-medium text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-stellar-blue focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                Report issue
              </a>
            </div>
          </div>
        </div>
      )}
      {...props}
    >
      {children}
    </ComponentErrorBoundary>
  );
}
