import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeContext, type ThemeMode, type ThemeName } from "./ThemeContext";
import {
  HIGH_CONTRAST_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  getSystemTheme,
  normalizeMode,
  readHighContrastPreference,
  resolveTheme,
  writeHighContrastPreference,
} from "./themeStorage";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      return normalizeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return "system";
    }
  });

  const [systemTheme, setSystemTheme] = useState<ThemeName>(() => getSystemTheme());

  const [highContrast, setHighContrastState] = useState<boolean>(() =>
    readHighContrastPreference()
  );

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;

    const onChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = useMemo<ThemeName>(() => {
    return mode === "system" ? systemTheme : mode;
  }, [mode, systemTheme]);

  useEffect(() => {
    applyThemeToDocument(mode, highContrast);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      window.localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(highContrast));
    } catch {
      // ignore
    }
  }, [mode, resolvedTheme, highContrast]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
  }, []);

  const setHighContrast = useCallback((enabled: boolean) => {
    setHighContrastState(enabled);
    writeHighContrastPreference(enabled);
  }, []);

  const toggleHighContrast = useCallback(() => {
    setHighContrastState((prev) => {
      const next = !prev;
      writeHighContrastPreference(next);
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const currentResolved = resolveTheme(prev);
      return currentResolved === "dark" ? "light" : "dark";
    });
  }, []);

  const value = useMemo(
    () => ({
      mode,
      resolvedTheme,
      setMode,
      toggle,
      highContrast,
      setHighContrast,
      toggleHighContrast,
    }),
    [mode, resolvedTheme, setMode, toggle, highContrast, setHighContrast, toggleHighContrast]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
