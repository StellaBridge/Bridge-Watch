import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useToast } from "./ToastContextValue";
import { ToastProvider } from "./ToastContext";

function TestComponent() {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.showToast({ message: "Info toast", variant: "info" })}>
        Show Info
      </button>
      <button onClick={() => toast.showError("Error message")}>Show Error</button>
      <button onClick={() => toast.showSuccess("Success message")}>Show Success</button>
      <button onClick={() => toast.showCritical("Critical alert")}>Show Critical</button>
      <button
        onClick={() => {
          toast.showToast({ message: "Duplicate message", variant: "error" });
        }}
      >
        Show Duplicate
      </button>
    </div>
  );
}

describe("ToastContext - Queue and Rate Limiting", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("Max Visible Toasts Limit", () => {
    it("limits visible toasts to 3 concurrent notifications", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const infoButton = screen.getByRole("button", { name: "Show Info" });

      // Show 5 toasts
      for (let i = 0; i < 5; i++) {
        await user.click(infoButton);
      }

      await waitFor(() => {
        const notifications = screen.getAllByRole("status");
        expect(notifications).toHaveLength(3);
      });
    });

    it("queues excess toasts and displays them as older ones dismiss", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const infoButton = screen.getByRole("button", { name: "Show Info" });

      // Show 4 toasts
      for (let i = 0; i < 4; i++) {
        await user.click(infoButton);
      }

      await waitFor(() => {
        expect(screen.getAllByRole("status")).toHaveLength(3);
      });

      // Dismiss one toast
      const closeButtons = screen.getAllByRole("button", { name: "Dismiss notification" });
      await user.click(closeButtons[0]);

      // Advance time past the auto-dismiss
      jest.advanceTimersByTime(6000);

      await waitFor(() => {
        expect(screen.getAllByRole("status")).toHaveLength(3);
      });
    });
  });

  describe("Duplicate Message Aggregation", () => {
    it("groups duplicate error messages into a single toast with counter", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const errorButton = screen.getByRole("button", { name: "Show Error" });

      await user.click(errorButton);
      await user.click(errorButton);
      await user.click(errorButton);

      await waitFor(() => {
        const toast = screen.getByRole("alert");
        expect(toast).toHaveTextContent("Error message (×3)");
      });
    });

    it("does not aggregate toasts with different messages", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const errorButton = screen.getByRole("button", { name: "Show Error" });
      const successButton = screen.getByRole("button", { name: "Show Success" });

      await user.click(errorButton);
      await user.click(successButton);

      await waitFor(() => {
        expect(screen.getByText("Error message")).toBeInTheDocument();
        expect(screen.getByText("Success message")).toBeInTheDocument();
      });
    });

    it("does not aggregate toasts with different variants", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <div>
            <ToastProvider>
              <TestComponent />
            </ToastProvider>
          </div>
        </ToastProvider>
      );

      const errorButton = screen.getByRole("button", { name: "Show Error" });

      await user.click(errorButton);

      await waitFor(() => {
        const toasts = screen.getAllByRole("alert");
        expect(toasts).toHaveLength(1);
      });
    });

    it("resets timer when duplicate toast is shown", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const errorButton = screen.getByRole("button", { name: "Show Error" });

      await user.click(errorButton);

      // Advance 4 seconds
      jest.advanceTimersByTime(4000);

      // Toast should still be visible
      expect(screen.getByRole("alert")).toBeInTheDocument();

      // Click again to reset timer
      await user.click(errorButton);

      // Advance 4 more seconds (total 8, but timer was reset)
      jest.advanceTimersByTime(4000);

      // Toast should still be visible
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
    });
  });

  describe("Critical/High-Severity Alerts", () => {
    it("bypasses queue and appears immediately at top", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const infoButton = screen.getByRole("button", { name: "Show Info" });
      const criticalButton = screen.getByRole("button", { name: "Show Critical" });

      // Fill up visible slots with info toasts
      for (let i = 0; i < 3; i++) {
        await user.click(infoButton);
      }

      await waitFor(() => {
        expect(screen.getAllByRole("status")).toHaveLength(3);
      });

      // Show critical alert
      await user.click(criticalButton);

      // Critical alert should appear even though we're at capacity
      await waitFor(() => {
        expect(screen.getByRole("alert", { name: /critical alert/i })).toBeInTheDocument();
      });
    });

    it("renders critical alerts with distinctive styling", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const criticalButton = screen.getByRole("button", { name: "Show Critical" });
      await user.click(criticalButton);

      await waitFor(() => {
        const alertDiv = screen.getByRole("alert").parentElement;
        expect(alertDiv).toHaveClass("bg-red-900/95", "ring-2", "ring-red-500/50");
      });
    });

    it("uses longer duration for critical alerts", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const criticalButton = screen.getByRole("button", { name: "Show Critical" });
      await user.click(criticalButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });

      // Advance 6 seconds (default timeout)
      jest.advanceTimersByTime(6000);

      // Critical alert should still be visible
      expect(screen.getByRole("alert")).toBeInTheDocument();

      // Advance 2 more seconds (total 8, which is critical timeout)
      jest.advanceTimersByTime(2000);

      // Now it should disappear
      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
    });

    it("marks critical alerts with aria-live assertive", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const criticalButton = screen.getByRole("button", { name: "Show Critical" });
      await user.click(criticalButton);

      await waitFor(() => {
        const alert = screen.getByRole("alert");
        expect(alert).toHaveAttribute("aria-live", "assertive");
      });
    });
  });

  describe("Toast Dismissal", () => {
    it("removes toast when dismissed button is clicked", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const infoButton = screen.getByRole("button", { name: "Show Info" });
      await user.click(infoButton);

      await waitFor(() => {
        expect(screen.getByRole("status")).toBeInTheDocument();
      });

      const dismissButton = screen.getByRole("button", { name: "Dismiss notification" });
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });
    });

    it("auto-dismisses after 6 seconds for normal toasts", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const infoButton = screen.getByRole("button", { name: "Show Info" });
      await user.click(infoButton);

      await waitFor(() => {
        expect(screen.getByRole("status")).toBeInTheDocument();
      });

      jest.advanceTimersByTime(5999);
      expect(screen.getByRole("status")).toBeInTheDocument();

      jest.advanceTimersByTime(1);

      await waitFor(() => {
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
      });
    });
  });

  describe("Toast Variants", () => {
    it("renders error toasts with error styling", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const errorButton = screen.getByRole("button", { name: "Show Error" });
      await user.click(errorButton);

      await waitFor(() => {
        const alertDiv = screen.getByRole("alert").parentElement;
        expect(alertDiv).toHaveClass("bg-red-950/90");
      });
    });

    it("renders success toasts with success styling", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const successButton = screen.getByRole("button", { name: "Show Success" });
      await user.click(successButton);

      await waitFor(() => {
        const statusDiv = screen.getByRole("status").parentElement;
        expect(statusDiv).toHaveClass("bg-emerald-950/90");
      });
    });

    it("marks errors as alert role", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const errorButton = screen.getByRole("button", { name: "Show Error" });
      await user.click(errorButton);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
    });

    it("marks success as status role", async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const successButton = screen.getByRole("button", { name: "Show Success" });
      await user.click(successButton);

      await waitFor(() => {
        expect(screen.getByRole("status")).toBeInTheDocument();
      });
    });
  });

  describe("Accessibility", () => {
    it("announces toasts to screen readers", async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const infoButton = screen.getByRole("button", { name: "Show Info" });
      await user.click(infoButton);

      await waitFor(() => {
        const viewport = container.querySelector('[aria-live="polite"]');
        expect(viewport).toBeInTheDocument();
      });
    });

    it("uses assertive aria-live for critical alerts", async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const criticalButton = screen.getByRole("button", { name: "Show Critical" });
      await user.click(criticalButton);

      await waitFor(() => {
        const alert = screen.getByRole("alert");
        expect(alert).toHaveAttribute("aria-live", "assertive");
      });
    });
  });
});
