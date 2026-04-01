export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export interface ErrorInfo {
  error: Error;
  componentStack?: string;
  severity: ErrorSeverity;
  timestamp: number;
  id: string;
  context?: string;
  recovered: boolean;
}

export interface ErrorFallbackProps {
  error: Error;
  errorInfo?: ErrorInfo;
  resetError: () => void;
  severity?: ErrorSeverity;
  compact?: boolean;
  title?: string;
  message?: string;
}

export interface ComponentErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((props: ErrorFallbackProps) => React.ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
  context?: string;
  severity?: ErrorSeverity;
  compact?: boolean;
}

export interface GlobalErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}
