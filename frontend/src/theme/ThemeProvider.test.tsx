import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTheme } from "./useTheme";
import ThemeProvider from "./ThemeProvider";
import { THEME_STORAGE_KEY, HIGH_CONTRAST_STORAGE_KEY } from "./themeStorage";

function TestComponent() {
  const context = useTheme();
  return (
    <div>
      <p data-testid="current-mode">Mode: {context.mode}</p>
      <p data-testid="resolved-theme">Theme: {context.resolvedTheme}</p>
      <p data-testid="contrast">Contrast: {context.highContrast ? "high" : "normal"}</p>
      <button onClick={() => context.setMode("light")}>Light</button>
      <button onClick={() => context.setMode("dark")}>Dark</button>
      <button onClick={() => context.setMode("system")}>System</button>
      <button onClick={() => context.toggle()}>Toggle</button>
      <button onClick={() => context.setHighContrast(!context.highContrast)}>
        Toggle Contrast
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    // Clear localStorage and DOM state
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-mode");
    document.documentElement.removeAttribute("data-contrast");
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Theme Mode Persistence", () => {
    it("persists selected theme to localStorage", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      const darkButton = screen.getByRole("button", { name: "Dark" });
      await user.click(darkButton);

      await waitFor(() => {
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
      });
    });

    it("reads initial theme from localStorage", async () => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("current-mode")).toHaveTextContent("Mode: light");
      });
    });

    it("defaults to system theme when localStorage is empty", async () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("current-mode")).toHaveTextContent("Mode: system");
      });
    });

    it("normalizes invalid localStorage values to system", async () => {
      localStorage.setItem(THEME_STORAGE_KEY, "invalid-mode");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("current-mode")).toHaveTextContent("Mode: system");
      });
    });
  });

  describe("Theme Switching", () => {
    it("switches theme mode via setMode", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Dark" }));

      await waitFor(() => {
        expect(screen.getByTestId("current-mode")).toHaveTextContent("Mode: dark");
      });

      await user.click(screen.getByRole("button", { name: "Light" }));

      await waitFor(() => {
        expect(screen.getByTestId("current-mode")).toHaveTextContent("Mode: light");
      });
    });

    it("resolves system theme to dark when prefers-color-scheme is dark", async () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: dark");
      });
    });

    it("resolves system theme to light when prefers-color-scheme is light", async () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query !== "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: light");
      });
    });

    it("does not resolve explicit light/dark modes from system preference", async () => {
      const user = userEvent.setup();
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Light" }));

      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: light");
      });
    });

    it("toggles between light and dark themes", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Light" }));
      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: light");
      });

      await user.click(screen.getByRole("button", { name: "Toggle" }));
      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: dark");
      });

      await user.click(screen.getByRole("button", { name: "Toggle" }));
      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: light");
      });
    });
  });

  describe("System Theme Listener", () => {
    it("sets up media query listener for system theme changes", () => {
      const addEventListenerSpy = jest.fn();
      window.matchMedia = jest.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: addEventListenerSpy,
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("cleans up media query listener on unmount", () => {
      const removeEventListenerSpy = jest.fn();
      window.matchMedia = jest.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: removeEventListenerSpy,
        dispatchEvent: jest.fn(),
      }));

      const { unmount } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));
    });

    it("responds to system theme changes when mode is system", async () => {
      let mqListener: ((e: MediaQueryListEvent) => void) | null = null;
      window.matchMedia = jest.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          mqListener = listener;
        },
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: light");
      });

      if (mqListener) {
        mqListener(new MediaQueryListEvent("change", { matches: true }));
      }

      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: dark");
      });
    });

    it("does not respond to system theme changes when mode is explicit", async () => {
      const user = userEvent.setup();
      let mqListener: ((e: MediaQueryListEvent) => void) | null = null;
      window.matchMedia = jest.fn().mockImplementation(() => ({
        matches: true,
        media: "",
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
          mqListener = listener;
        },
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Light" }));
      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: light");
      });

      if (mqListener) {
        mqListener(new MediaQueryListEvent("change", { matches: false }));
      }

      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("Theme: light");
      });
    });
  });

  describe("DOM Application", () => {
    it("applies dark class to documentElement for dark theme", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Dark" }));

      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(true);
      });
    });

    it("removes dark class for light theme", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Dark" }));
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(true);
      });

      await user.click(screen.getByRole("button", { name: "Light" }));
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(false);
      });
    });

    it("sets data-theme and data-theme-mode attributes", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Dark" }));

      await waitFor(() => {
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(document.documentElement.getAttribute("data-theme-mode")).toBe("dark");
      });
    });
  });

  describe("High Contrast Mode", () => {
    it("persists high contrast preference to localStorage", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Toggle Contrast" }));

      await waitFor(() => {
        expect(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY)).toBe("true");
      });
    });

    it("reads initial high contrast from localStorage", () => {
      localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, "true");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      expect(screen.getByTestId("contrast")).toHaveTextContent("Contrast: high");
    });

    it("sets data-contrast attribute when high contrast is enabled", async () => {
      const user = userEvent.setup();
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Toggle Contrast" }));

      await waitFor(() => {
        expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
      });
    });

    it("removes data-contrast attribute when high contrast is disabled", async () => {
      const user = userEvent.setup();
      localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, "true");

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Toggle Contrast" }));

      await waitFor(() => {
        expect(document.documentElement.getAttribute("data-contrast")).toBeNull();
      });
    });
  });

  describe("Storage Error Handling", () => {
    it("handles localStorage.getItem exceptions gracefully", () => {
      const getItemSpy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });

      expect(() => {
        render(
          <ThemeProvider>
            <TestComponent />
          </ThemeProvider>
        );
      }).not.toThrow();

      expect(screen.getByTestId("current-mode")).toHaveTextContent("Mode: system");

      getItemSpy.mockRestore();
    });

    it("handles localStorage.setItem exceptions gracefully", async () => {
      const user = userEvent.setup();
      const setItemSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      );

      await user.click(screen.getByRole("button", { name: "Dark" }));

      await waitFor(() => {
        expect(screen.getByTestId("current-mode")).toHaveTextContent("Mode: dark");
      });

      setItemSpy.mockRestore();
    });
  });
});
