import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error | null;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  reset() {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center"
        >
          <p className="text-red-400 font-semibold">Something went wrong.</p>
          <p className="mt-1 text-sm text-red-400/80">
            An unexpected error occurred while rendering this section.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-400"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
