import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import NotificationPreferences from "../components/NotificationPreferences";
import AlertSuppressionControls from "../components/AlertSuppressionControls";
import HelpTooltip from "../components/help/HelpTooltip";
import ThemePresetsSection from "../components/settings/ThemePresetsSection";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { usePreferences } from "../context/PreferencesContextValue";
import { useToast } from "../context/ToastContextValue";
import { useNotificationContext } from "../hooks/useNotificationContext";
import { useThemeStore, selectDensity } from "../stores/themeStore";
import { Tabs, TabList, Tab, TabPanel } from "../components/Tabs";
import HighContrastToggle from "../components/HighContrastToggle";

const refreshOptions = [
  { value: 30000, label: "30s" },
  { value: 60000, label: "1m" },
  { value: 120000, label: "2m" },
] as const;

export default function Settings() {
  const { t } = useTranslation();
  const { prefs, setPrefs } = usePreferences();
  const { showSuccess } = useToast();
  const { addNotification } = useNotificationContext();
  const density = useThemeStore(selectDensity);
  const setDensity = useThemeStore((state) => state.setDensity);

  useEffect(() => {
    if (prefs.reducedMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }
  }, [prefs.reducedMotion]);

  const triggerTestNotification = (type: "alert" | "system" | "info") => {
    addNotification({
      title: `Test ${type.charAt(0).toUpperCase() + type.slice(1)}`,
      message: `This is a test ${type} notification to verify the Notification Center functionality.`,
      type,
      link: type === "alert" ? "/dashboard" : undefined,
    });
  };

  return (
    <div className="space-y-density">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary mb-2">
          {t("settings.title")}
        </h1>
        <p className="text-stellar-text-secondary">
          {t("settings.pageDescription")}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section
            className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4"
            aria-labelledby="settings-language-heading"
          >
            <h2
              id="settings-language-heading"
              className="text-lg font-semibold text-stellar-text-primary"
            >
              {t("settings.language")}
            </h2>
            <p className="text-sm text-stellar-text-secondary">
              {t("settings.languageDescription")}
            </p>
            <LanguageSwitcher />
          </section>

          <section id="notifications" aria-labelledby="settings-notifications-heading">
            <h2
              id="settings-notifications-heading"
              className="text-xl font-semibold text-stellar-text-primary mb-4 flex items-center gap-2"
            >
              <svg className="w-5 h-5 text-stellar-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {t("settings.notificationsTitle")}
              <HelpTooltip label={t("settings.notificationsHelp")} />
            </h2>
            <NotificationPreferences />
          </section>

          <AlertSuppressionControls />

          <ThemePresetsSection />

          <section
            className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-6"
            aria-labelledby="settings-display-heading"
          >
            <h2 id="settings-display-heading" className="text-lg font-semibold text-stellar-text-primary">
              <span className="inline-flex items-center gap-2">
                {t("settings.displayTitle")}
                <HelpTooltip label={t("settings.displayHelp")} />
              </span>
            </h2>
            <p className="text-sm text-stellar-text-secondary -mt-2">
              {t("settings.displaySavedNote")}
            </p>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-stellar-text-secondary">
                {t("settings.compactNumbers")}
                <span className="block text-xs mt-1 text-stellar-text-secondary/80">
                  {t("settings.compactNumbersDesc")}
                </span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
                checked={prefs.compactNumbers}
                onChange={(e) => {
                  setPrefs({ compactNumbers: e.target.checked });
                  showSuccess(t("settings.preferenceSaved"));
                }}
              />
            </label>

            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-stellar-text-secondary">
                {t("settings.reduceMotion")}
                <span className="block text-xs mt-1 text-stellar-text-secondary/80">
                  {t("settings.reduceMotionDesc")}
                </span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-stellar-blue"
                checked={prefs.reducedMotion}
                onChange={(e) => {
                  setPrefs({ reducedMotion: e.target.checked });
                  showSuccess(t("settings.preferenceSaved"));
                }}
              />
            </label>
            <div className="flex items-center justify-between gap-4">
              <span className="text-stellar-text-secondary">
                High contrast mode
                <span className="block text-xs mt-1 text-stellar-text-secondary/80">
                  Increase text and border contrast for improved readability.
                </span>
              </span>
              <HighContrastToggle />
            </div>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span className="text-stellar-text-secondary">
                {t("settings.uiDensity")}
                <span className="block text-xs mt-1 text-stellar-text-secondary/80">
                  {t("settings.uiDensityDesc")}
                </span>
              </span>
              <select
                className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                value={density}
                onChange={(e) => {
                  setDensity(e.target.value as "compact" | "comfortable" | "spacious");
                  showSuccess(t("settings.densityUpdated"));
                }}
              >
                <option value="compact">{t("settings.densityCompact")}</option>
                <option value="comfortable">{t("settings.densityComfortable")}</option>
                <option value="spacious">{t("settings.densitySpacious")}</option>
              </select>
            </label>
          </section>

          <section
            className="rounded-xl border border-stellar-border bg-stellar-card p-6 space-y-4"
            aria-labelledby="settings-data-heading"
          >
            <h2 id="settings-data-heading" className="text-lg font-semibold text-stellar-text-primary">
              <span className="inline-flex items-center gap-2">
                {t("settings.dataRefresh")}
                <HelpTooltip label={t("settings.dataRefreshHelp")} />
              </span>
            </h2>
            <p className="text-sm text-stellar-text-secondary">
              {t("settings.dataRefreshDesc")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Tabs
                activeTab={String(prefs.dataRefreshMs)}
                onTabChange={(id) => {
                  setPrefs({ dataRefreshMs: Number(id) as 30000 | 60000 | 120000 });
                  showSuccess(t("settings.refreshIntervalUpdated"));
                }}
              >
                <TabList aria-label="Data refresh interval" className="flex flex-wrap gap-2">
                  {refreshOptions.map((opt) => (
                    <Tab
                      key={opt.value}
                      id={String(opt.value)}
                      activeClassName="bg-stellar-blue text-white border-stellar-blue"
                      inactiveClassName="bg-stellar-dark text-stellar-text-secondary hover:text-stellar-text-primary border border-stellar-border"
                    >
                      {opt.label}
                    </Tab>
                  ))}
                </TabList>
                {refreshOptions.map((opt) => (
                  <TabPanel key={opt.value} id={String(opt.value)} keepMounted />
                ))}
              </Tabs>
            </div>
          </section>

          <section aria-labelledby="settings-dev-heading">
            <h2
              id="settings-dev-heading"
              className="text-xl font-semibold text-stellar-text-primary mb-4 flex items-center gap-2"
            >
              <svg className="w-5 h-5 text-stellar-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a2 2 0 00-1.96 1.414l-.477 2.387a2 2 0 00.547 1.022l1.414 1.414a2 2 0 001.022.547l2.387.477a2 2 0 001.96-1.414l.477-2.387a2 2 0 00-.547-1.022l-1.414-1.414z"
                />
              </svg>
              {t("settings.developerTools")}
            </h2>
            <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
              <p className="text-sm text-stellar-text-secondary mb-4">
                {t("settings.developerToolsDesc")}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => triggerTestNotification("info")}
                  className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/30 transition-colors text-sm font-medium"
                >
                  {t("settings.testInfo")}
                </button>
                <button
                  type="button"
                  onClick={() => triggerTestNotification("system")}
                  className="px-4 py-2 bg-stellar-blue/20 text-stellar-blue border border-stellar-blue/30 rounded-md hover:bg-stellar-blue/30 transition-colors text-sm font-medium"
                >
                  {t("settings.testSystem")}
                </button>
                <button
                  type="button"
                  onClick={() => triggerTestNotification("alert")}
                  className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/30 transition-colors text-sm font-medium"
                >
                  {t("settings.testAlert")}
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
            <h3 className="text-stellar-text-primary font-medium mb-2">{t("settings.profileInfo")}</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-stellar-blue flex items-center justify-center text-xl font-bold text-white">
                JS
              </div>
              <div>
                <p className="text-stellar-text-primary font-medium">John Stellar</p>
                <p className="text-xs text-stellar-text-secondary">Network Operator</p>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="w-full py-2 bg-stellar-border text-stellar-text-muted rounded-md text-sm cursor-not-allowed"
            >
              {t("settings.editProfileLocked")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
