import React from "react";
import ErrorFallback from "./ErrorFallback";
import { logError } from "./errorReporting";
import type { GlobalErrorBoundaryProps, ErrorInfo } from "./types";

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class GlobalErrorBoundary extends React.Component<
  GlobalErrorBoundaryProps,
  State
> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    this.resetError = this.resetError.bind(this);
    this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this);
    this.handleWindowError = this.handleWindowError.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidMount() {
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
    window.addEventListener("error", this.handleWindowError);
  }

  componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
    window.removeEventListener("error", this.handleWindowError);
  }

  componentDidCatch(error: Error, reactErrorInfo: React.ErrorInfo) {
    const entry = logError(
      error,
      reactErrorInfo.componentStack ?? undefined,
      "critical",
      "GlobalErrorBoundary"
    );
    this.setState({ errorInfo: entry });
    this.props.onError?.(error, reactErrorInfo);
  }

  handleUnhandledRejection(event: PromiseRejectionEvent) {
    const error =
      event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason ?? "Unhandled promise rejection"));
    logError(error, undefined, "high", "UnhandledRejection");
  }

  handleWindowError(event: ErrorEvent) {
    const error = event.error instanceof Error ? event.error : new Error(event.message);
    logError(error, undefined, "high", "WindowError");
  }

  resetError() {
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen bg-stellar-dark flex items-center justify-center p-4">
          <div className="max-w-lg w-full">
            <ErrorFallback
              error={this.state.error}
              errorInfo={this.state.errorInfo ?? undefined}
              resetError={this.resetError}
              severity="critical"
              title="Application Error"
              message="Bridge Watch encountered an unexpected error. You can try again or reload the page."
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
