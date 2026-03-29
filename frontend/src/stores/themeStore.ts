import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { devtools } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface FontSettings {
  family: string;
  size: "sm" | "md" | "lg";
  lineHeight: "tight" | "normal" | "relaxed";
}

export interface ThemeState {
  // Theme mode
  mode: ThemeMode;
  resolvedMode: "light" | "dark";

  // Color scheme
  colors: ThemeColors;

  // Font settings
  font: FontSettings;

  // UI density
  density: "compact" | "comfortable" | "spacious";

  // Animation preferences
  animationsEnabled: boolean;
  reducedMotion: boolean;

  // Custom CSS variables
  customCssVars: Record<string, string>;
}

export interface ThemeActions {
  // Mode actions
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setResolvedMode: (mode: "light" | "dark") => void;

  // Color actions
  setPrimaryColor: (color: string) => void;
  setAccentColor: (color: string) => void;
  resetColors: () => void;

  // Font actions
  setFontFamily: (family: string) => void;
  setFontSize: (size: FontSettings["size"]) => void;
  setLineHeight: (lineHeight: FontSettings["lineHeight"]) => void;

  // Density actions
  setDensity: (density: ThemeState["density"]) => void;

  // Animation actions
  setAnimationsEnabled: (enabled: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;

  // Custom CSS actions
  setCustomCssVar: (name: string, value: string) => void;
  removeCustomCssVar: (name: string) => void;

  // Apply theme to document
  applyTheme: () => void;

  // Reset
  resetTheme: () => void;
}

const defaultLightColors: ThemeColors = {
  primary: "#3b82f6",
  secondary: "#64748b",
  accent: "#8b5cf6",
  background: "#ffffff",
  surface: "#f8fafc",
  error: "#ef4444",
  warning: "#f59e0b",
  success: "#10b981",
  info: "#3b82f6",
};

const defaultDarkColors: ThemeColors = {
  primary: "#60a5fa",
  secondary: "#94a3b8",
  accent: "#a78bfa",
  background: "#0f172a",
  surface: "#1e293b",
  error: "#f87171",
  warning: "#fbbf24",
  success: "#34d399",
  info: "#60a5fa",
};

const initialThemeState: ThemeState = {
  mode: "system",
  resolvedMode: "dark",
  colors: defaultDarkColors,
  font: {
    family: "Inter, system-ui, sans-serif",
    size: "md",
    lineHeight: "normal",
  },
  density: "comfortable",
  animationsEnabled: true,
  reducedMotion: false,
  customCssVars: {},
};

const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export const useThemeStore = create<ThemeState & ThemeActions>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialThemeState,

        setMode: (mode) => {
          const resolvedMode = mode === "system" ? getSystemTheme() : mode;
          const colors = resolvedMode === "dark" ? defaultDarkColors : defaultLightColors;
          set({ mode, resolvedMode, colors }, false, `setMode/${mode}`);
          get().applyTheme();
        },

        toggleMode: () => {
          const current = get().resolvedMode;
          const newMode = current === "dark" ? "light" : "dark";
          const colors = newMode === "dark" ? defaultDarkColors : defaultLightColors;
          set(
            { resolvedMode: newMode, colors, mode: newMode },
            false,
            "toggleMode"
          );
          get().applyTheme();
        },

        setResolvedMode: (mode) => {
          const colors = mode === "dark" ? defaultDarkColors : defaultLightColors;
          set({ resolvedMode: mode, colors }, false, "setResolvedMode");
          get().applyTheme();
        },

        setPrimaryColor: (color) => {
          set(
            { colors: { ...get().colors, primary: color } },
            false,
            "setPrimaryColor"
          );
          get().applyTheme();
        },

        setAccentColor: (color) => {
          set(
            { colors: { ...get().colors, accent: color } },
            false,
            "setAccentColor"
          );
          get().applyTheme();
        },

        resetColors: () => {
          const colors =
            get().resolvedMode === "dark" ? defaultDarkColors : defaultLightColors;
          set({ colors }, false, "resetColors");
          get().applyTheme();
        },

        setFontFamily: (family) => {
          set(
            { font: { ...get().font, family } },
            false,
            "setFontFamily"
          );
        },

        setFontSize: (size) => {
          set({ font: { ...get().font, size } }, false, "setFontSize");
        },

        setLineHeight: (lineHeight) => {
          set(
            { font: { ...get().font, lineHeight } },
            false,
            "setLineHeight"
          );
        },

        setDensity: (density) => {
          set({ density }, false, "setDensity");
        },

        setAnimationsEnabled: (enabled) => {
          set({ animationsEnabled: enabled }, false, "setAnimationsEnabled");
        },

        setReducedMotion: (reduced) => {
          set({ reducedMotion: reduced }, false, "setReducedMotion");
        },

        setCustomCssVar: (name, value) => {
          set(
            {
              customCssVars: { ...get().customCssVars, [name]: value },
            },
            false,
            "setCustomCssVar"
          );
        },

        removeCustomCssVar: (name) => {
          const customCssVars = { ...get().customCssVars };
          delete customCssVars[name];
          set({ customCssVars }, false, "removeCustomCssVar");
        },

        applyTheme: () => {
          if (typeof document === "undefined") return;

          const { resolvedMode, colors, customCssVars } = get();
          const root = document.documentElement;

          // Set theme attribute
          root.setAttribute("data-theme", resolvedMode);

          // Apply color variables
          Object.entries(colors).forEach(([key, value]) => {
            root.style.setProperty(`--color-${key}`, value);
          });

          // Apply custom CSS variables
          Object.entries(customCssVars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
          });
        },

        resetTheme: () => {
          set(initialThemeState, false, "resetTheme");
          get().applyTheme();
        },
      }),
      {
        name: "bridge-watch-theme",
        storage: createJSONStorage(() => localStorage),
        version: 1,
        partialize: (state) => ({
          mode: state.mode,
          colors: state.colors,
          font: state.font,
          density: state.density,
          animationsEnabled: state.animationsEnabled,
          reducedMotion: state.reducedMotion,
          customCssVars: state.customCssVars,
        }),
      }
    ),
    { name: "ThemeStore" }
  )
);

// Selectors for optimized re-renders
export const selectThemeMode = (state: ThemeState & ThemeActions) =>
  state.mode;

export const selectResolvedMode = (state: ThemeState & ThemeActions) =>
  state.resolvedMode;

export const selectIsDarkMode = (state: ThemeState & ThemeActions) =>
  state.resolvedMode === "dark";

export const selectThemeColors = (state: ThemeState & ThemeActions) =>
  state.colors;

export const selectFontSettings = (state: ThemeState & ThemeActions) =>
  state.font;

export const selectDensity = (state: ThemeState & ThemeActions) =>
  state.density;

export const selectAnimationSettings = (state: ThemeState & ThemeActions) => ({
  animationsEnabled: state.animationsEnabled,
  reducedMotion: state.reducedMotion,
});
