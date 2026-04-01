import React from "react";
import ErrorFallback from "./ErrorFallback";
import { logError } from "./errorReporting";
import type { ComponentErrorBoundaryProps, ErrorInfo } from "./types";

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ComponentErrorBoundary extends React.Component<
  ComponentErrorBoundaryProps,
  State
> {
  constructor(props: ComponentErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, reactErrorInfo: React.ErrorInfo) {
    const entry = logError(
      error,
      reactErrorInfo.componentStack ?? undefined,
      this.props.severity ?? "medium",
      this.props.context
    );
    this.setState({ errorInfo: entry });
    this.props.onError?.(error, reactErrorInfo);
  }

  resetError() {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const { fallback, severity, compact } = this.props;

      if (typeof fallback === "function") {
        return fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo ?? undefined,
          resetError: this.resetError,
          severity,
          compact,
        });
      }

      if (fallback) {
        return fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo ?? undefined}
          resetError={this.resetError}
          severity={severity}
          compact={compact}
        />
      );
    }

    return this.props.children;
  }
}
