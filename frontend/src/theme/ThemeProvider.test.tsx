import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ThemeProvider from "./ThemeProvider";
import { useTheme } from "./useTheme";
import { THEME_STORAGE_KEY } from "./themeStorage";

type ChangeListener = (e: MediaQueryListEvent) => void;

function mockSystemTheme(initialDark: boolean) {
  const listeners = new Set<ChangeListener>();
  const mql = {
    matches: initialDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_: string, cb: ChangeListener) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: ChangeListener) => listeners.delete(cb)),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);

  return {
    mql,
    listeners,
    setDark(dark: boolean) {
      mql.matches = dark;
      act(() => {
        listeners.forEach((cb) => cb({ matches: dark } as MediaQueryListEvent));
      });
    },
  };
}

function Probe() {
  const { mode, resolvedTheme, setMode, toggle } = useTheme();
  return (
    <div>
      <p data-testid="mode">{mode}</p>
      <p data-testid="resolved">{resolvedTheme}</p>
      <button onClick={() => setMode("light")}>light</button>
      <button onClick={() => setMode("dark")}>dark</button>
      <button onClick={() => setMode("system")}>system</button>
      <button onClick={toggle}>toggle</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
}

const root = document.documentElement;
const originalMatchMedia = window.matchMedia;

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    root.classList.remove("dark");
    root.removeAttribute("data-theme");
    root.removeAttribute("data-theme-mode");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("defaults to system mode and follows the OS preference", () => {
    mockSystemTheme(true);
    renderProbe();

    expect(screen.getByTestId("mode")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(root).toHaveClass("dark");
  });

  it("restores a persisted mode on mount", () => {
    mockSystemTheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderProbe();

    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(root).not.toHaveClass("dark");
  });

  it("falls back to system for an invalid persisted value", () => {
    mockSystemTheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    renderProbe();

    expect(screen.getByTestId("mode")).toHaveTextContent("system");
  });

  it.each(["light", "dark", "system"] as const)("persists the %s mode", (mode) => {
    mockSystemTheme(false);
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: mode }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(mode);
    expect(root).toHaveAttribute("data-theme-mode", mode);
  });

  it("toggles between explicit light and dark", () => {
    mockSystemTheme(false);
    renderProbe();

    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");

    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
  });

  it("reacts to OS theme changes while in system mode", () => {
    const system = mockSystemTheme(false);
    renderProbe();
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");

    system.setDark(true);
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(root).toHaveClass("dark");
    expect(root).toHaveAttribute("data-theme", "dark");

    system.setDark(false);
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(root).not.toHaveClass("dark");
  });

  it("ignores OS theme changes when an explicit mode is selected", () => {
    const system = mockSystemTheme(false);
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "light" }));

    system.setDark(true);

    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
    expect(root).not.toHaveClass("dark");
  });

  it("registers one change listener and removes it on unmount", () => {
    const system = mockSystemTheme(false);
    const { unmount } = renderProbe();

    expect(system.mql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(system.listeners.size).toBe(1);

    unmount();

    expect(system.mql.removeEventListener).toHaveBeenCalledWith(
      "change",
      system.mql.addEventListener.mock.calls[0][1]
    );
    expect(system.listeners.size).toBe(0);
  });

  it("keeps working when localStorage throws", () => {
    mockSystemTheme(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    renderProbe();
    expect(screen.getByTestId("mode")).toHaveTextContent("system");

    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
  });
});
