import type { ThemeMode, ThemeName } from "./ThemeContext";

export type { ThemeMode, ThemeName };

export const THEME_STORAGE_KEY = "bridge-watch:theme:v1";
export const HIGH_CONTRAST_STORAGE_KEY = "bridge-watch:theme:high-contrast:v1";

/** Local-only user id used to sync theme settings to the profile endpoint. */
export const PROFILE_SYNC_USER_ID_KEY = "bridge-watch:profile-sync-user-id:v1";

export function getSystemTheme(): ThemeName {
  if (typeof window === "undefined") return "dark";
  const preference = window.matchMedia?.("(prefers-color-scheme: dark)");
  return preference?.matches ? "dark" : "light";
}

export function normalizeMode(value: string | null): ThemeMode {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function resolveTheme(mode: ThemeMode): ThemeName {
  return mode === "system" ? getSystemTheme() : mode;
}

export function readHighContrastPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeHighContrastPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(enabled));
  } catch {
    // Private-mode / quota failures should not break theming.
  }
}

/**
 * Apply the theme to <html>.
 *
 * `data-contrast` drives the high-contrast variable overrides in index.css, so
 * contrast is a pure CSS concern rather than something each component has to
 * branch on.
 */
export function applyThemeToDocument(mode: ThemeMode, highContrast = false) {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;

  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-mode", mode);

  if (highContrast) root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");
}
