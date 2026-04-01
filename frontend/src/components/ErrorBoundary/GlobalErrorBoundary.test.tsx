import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../test/utils";
import GlobalErrorBoundary from "./GlobalErrorBoundary";
import { clearErrorLog, getErrorLog } from "./errorReporting";

const originalConsoleError = console.error;
beforeEach(() => {
  clearErrorLog();
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

function ControlledThrower(): JSX.Element {
  throw new Error("Global crash");
}

describe("GlobalErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <GlobalErrorBoundary>
        <div>App content</div>
      </GlobalErrorBoundary>
    );
    expect(screen.getByText("App content")).toBeInTheDocument();
  });

  it("catches error and shows critical fallback", () => {
    render(
      <GlobalErrorBoundary>
        <ControlledThrower />
      </GlobalErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Application Error")).toBeInTheDocument();
    expect(screen.getByText(/Bridge Watch encountered an unexpected error/)).toBeInTheDocument();
  });

  it("logs error as critical", () => {
    render(
      <GlobalErrorBoundary>
        <ControlledThrower />
      </GlobalErrorBoundary>
    );
    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0].severity).toBe("critical");
    expect(log[0].context).toBe("GlobalErrorBoundary");
  });

  it("calls onError callback", () => {
    const onError = vi.fn();
    render(
      <GlobalErrorBoundary onError={onError}>
        <ControlledThrower />
      </GlobalErrorBoundary>
    );
    expect(onError).toHaveBeenCalledOnce();
  });

  it("shows Reload Page button", () => {
    render(
      <GlobalErrorBoundary>
        <ControlledThrower />
      </GlobalErrorBoundary>
    );
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
  });

  it("shows Try Again button", () => {
    render(
      <GlobalErrorBoundary>
        <ControlledThrower />
      </GlobalErrorBoundary>
    );

    expect(screen.getByText("Application Error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("displays full-screen centered fallback", () => {
    render(
      <GlobalErrorBoundary>
        <ControlledThrower />
      </GlobalErrorBoundary>
    );
    const alert = screen.getByRole("alert");
    const container = alert.closest(".min-h-screen");
    expect(container).not.toBeNull();
  });
});
