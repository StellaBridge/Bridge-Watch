import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "../../test/utils";
import ErrorFallback from "./ErrorFallback";

const defaultProps = {
  error: new Error("Test error"),
  resetError: vi.fn(),
};

describe("ErrorFallback", () => {
  it("renders default title and message", () => {
    render(<ErrorFallback {...defaultProps} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error occurred while rendering this section.")
    ).toBeInTheDocument();
  });

  it("renders custom title and message", () => {
    render(
      <ErrorFallback {...defaultProps} title="Custom Title" message="Custom message text" />
    );
    expect(screen.getByText("Custom Title")).toBeInTheDocument();
    expect(screen.getByText("Custom message text")).toBeInTheDocument();
  });

  it("renders critical title and message for critical severity", () => {
    render(<ErrorFallback {...defaultProps} severity="critical" />);
    expect(screen.getByText("Application Error")).toBeInTheDocument();
    expect(
      screen.getByText("A critical error occurred. Please refresh the page or try again.")
    ).toBeInTheDocument();
  });

  it("calls resetError on Try Again click", async () => {
    const resetError = vi.fn();
    const user = userEvent.setup();
    render(<ErrorFallback {...defaultProps} resetError={resetError} />);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(resetError).toHaveBeenCalledOnce();
  });

  it("shows Reload Page button for critical severity", () => {
    render(<ErrorFallback {...defaultProps} severity="critical" />);
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
  });

  it("does not show Reload Page button for non-critical severity", () => {
    render(<ErrorFallback {...defaultProps} severity="medium" />);
    expect(screen.queryByRole("button", { name: /reload page/i })).not.toBeInTheDocument();
  });

  it("displays error ID when errorInfo is provided", () => {
    render(
      <ErrorFallback
        {...defaultProps}
        errorInfo={{
          error: defaultProps.error,
          severity: "medium",
          timestamp: Date.now(),
          id: "err-abc123",
          recovered: false,
        }}
      />
    );
    expect(screen.getByText("err-abc123")).toBeInTheDocument();
  });

  it("has role=alert for accessibility", () => {
    render(<ErrorFallback {...defaultProps} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders compact variant", () => {
    render(<ErrorFallback {...defaultProps} compact />);
    expect(screen.getByTestId("error-fallback-compact")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("compact variant calls resetError on Retry click", async () => {
    const resetError = vi.fn();
    const user = userEvent.setup();
    render(<ErrorFallback {...defaultProps} resetError={resetError} compact />);
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(resetError).toHaveBeenCalledOnce();
  });

  it("applies warning styles for low severity", () => {
    render(<ErrorFallback {...defaultProps} severity="low" />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("yellow-500");
  });

  it("applies red styles for high severity", () => {
    render(<ErrorFallback {...defaultProps} severity="high" />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("red-500");
  });
});
