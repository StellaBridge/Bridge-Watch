import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "../../test/utils";
import ComponentErrorBoundary from "./ComponentErrorBoundary";
import { clearErrorLog, getErrorLog } from "./errorReporting";

// Suppress console.error for intentional error throws
const originalConsoleError = console.error;
beforeEach(() => {
  clearErrorLog();
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

function ControlledThrower(): JSX.Element {
  throw new Error("Always throws");
}

describe("ComponentErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ComponentErrorBoundary>
        <div>Child content</div>
      </ComponentErrorBoundary>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("catches error and shows fallback UI", () => {
    render(
      <ComponentErrorBoundary context="TestSection">
        <ControlledThrower />
      </ComponentErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("logs error to error reporting", () => {
    render(
      <ComponentErrorBoundary context="TestSection" severity="high">
        <ControlledThrower />
      </ComponentErrorBoundary>
    );
    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0].severity).toBe("high");
    expect(log[0].context).toBe("TestSection");
  });

  it("calls onError callback", () => {
    const onError = vi.fn();
    render(
      <ComponentErrorBoundary onError={onError}>
        <ControlledThrower />
      </ComponentErrorBoundary>
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("calls onReset when Try Again is clicked", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(
      <ComponentErrorBoundary onReset={onReset}>
        <ControlledThrower />
      </ComponentErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("renders custom fallback ReactNode", () => {
    render(
      <ComponentErrorBoundary fallback={<div>Custom fallback</div>}>
        <ControlledThrower />
      </ComponentErrorBoundary>
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
  });

  it("renders custom fallback render function", () => {
    render(
      <ComponentErrorBoundary
        fallback={(props) => (
          <div>
            <p>Render fn: {props.error.message}</p>
            <button onClick={props.resetError}>Reset</button>
          </div>
        )}
      >
        <ControlledThrower />
      </ComponentErrorBoundary>
    );
    expect(screen.getByText("Render fn: Always throws")).toBeInTheDocument();
  });

  it("passes severity and compact to fallback", () => {
    render(
      <ComponentErrorBoundary severity="low" compact>
        <ControlledThrower />
      </ComponentErrorBoundary>
    );
    expect(screen.getByTestId("error-fallback-compact")).toBeInTheDocument();
  });

  it("defaults severity to medium", () => {
    render(
      <ComponentErrorBoundary>
        <ControlledThrower />
      </ComponentErrorBoundary>
    );
    const log = getErrorLog();
    expect(log[0].severity).toBe("medium");
  });
});
