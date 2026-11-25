import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import App from "../../App";
import CommandPalette from "../CommandPalette";

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: vi.fn(),
}));

describe("CommandPalette Global Shortcut (Issue #1701)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("toggles CommandPalette open and closed on Meta+K and prevents default", () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();

    const opened = fireEvent.keyDown(window, {
      key: "k",
      metaKey: true,
    });
    expect(opened).toBe(false); // preventDefault was called
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();

    // Second press toggles it closed
    const closed = fireEvent.keyDown(window, {
      key: "k",
      metaKey: true,
    });
    expect(closed).toBe(false);
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("toggles CommandPalette open on Ctrl+K and prevents default", () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();

    const opened = fireEvent.keyDown(window, {
      key: "k",
      ctrlKey: true,
    });
    expect(opened).toBe(false);
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
  });

  it("does not trigger shortcut when user is typing inside an input element", () => {
    render(
      <BrowserRouter>
        <div>
          <input data-testid="test-input" />
          <App />
        </div>
      </BrowserRouter>
    );

    const input = screen.getByTestId("test-input");
    input.focus();

    const allowed = fireEvent.keyDown(input, {
      key: "k",
      metaKey: true,
    });

    expect(allowed).toBe(true); // preventDefault was NOT called
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("does not trigger shortcut when user is typing inside a textarea element", () => {
    render(
      <BrowserRouter>
        <div>
          <textarea data-testid="test-textarea" />
          <App />
        </div>
      </BrowserRouter>
    );

    const textarea = screen.getByTestId("test-textarea");
    textarea.focus();

    const allowed = fireEvent.keyDown(textarea, {
      key: "k",
      ctrlKey: true,
    });

    expect(allowed).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("closes on Escape key press", () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // Open palette
    fireEvent.keyDown(window, {
      key: "k",
      metaKey: true,
    });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(window, {
      key: "Escape",
    });
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("supports controlled open and onClose props on CommandPalette directly", () => {
    const handleClose = vi.fn();
    const handleOpenChange = vi.fn();

    const { rerender } = render(
      <BrowserRouter>
        <CommandPalette open={false} onClose={handleClose} onOpenChange={handleOpenChange} />
      </BrowserRouter>
    );

    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();

    rerender(
      <BrowserRouter>
        <CommandPalette open={true} onClose={handleClose} onOpenChange={handleOpenChange} />
      </BrowserRouter>
    );

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();

    // Click outside backdrop
    const backdrop = document.querySelector(".bg-black\\/60");
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalled();
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    }
  });
});
