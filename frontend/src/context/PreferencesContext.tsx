import { createContext, useContext, type ReactNode } from "react";
import { useUserPreferences, type UserPreferences } from "../hooks/useUserPreferences";

type PreferencesContextValue = {
  prefs: UserPreferences;
  setPrefs: (next: Partial<UserPreferences>) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useUserPreferences();
  return (
    <PreferencesContext.Provider value={{ prefs, setPrefs }}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
