import type { ErrorInfo, ErrorSeverity } from "./types";

const isDev = import.meta.env.DEV;

const errorLog: ErrorInfo[] = [];
const MAX_LOG_SIZE = 50;

function generateId(): string {
  return `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function logError(
  error: Error,
  componentStack?: string,
  severity: ErrorSeverity = "medium",
  context?: string
): ErrorInfo {
  const entry: ErrorInfo = {
    error,
    componentStack,
    severity,
    timestamp: Date.now(),
    id: generateId(),
    context,
    recovered: false,
  };

  errorLog.push(entry);
  if (errorLog.length > MAX_LOG_SIZE) {
    errorLog.shift();
  }

  if (isDev) {
    console.group(`[ErrorBoundary] ${severity.toUpperCase()} — ${context ?? "Unknown"}`);
    console.error(error);
    if (componentStack) {
      console.log("Component stack:", componentStack);
    }
    console.groupEnd();
  }

  return entry;
}

export function getErrorLog(): ReadonlyArray<ErrorInfo> {
  return errorLog;
}

export function clearErrorLog(): void {
  errorLog.length = 0;
}

export function getErrorSummary(): { total: number; bySeverity: Record<ErrorSeverity, number> } {
  const bySeverity: Record<ErrorSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  for (const entry of errorLog) {
    bySeverity[entry.severity]++;
  }
  return { total: errorLog.length, bySeverity };
}
