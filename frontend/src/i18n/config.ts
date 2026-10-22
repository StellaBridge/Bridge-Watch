/**
 * i18n Configuration
 * Multi-language support infrastructure
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { applyDocumentDirection } from "./documentDirection";

import enTranslations from "./locales/en.json";
import esTranslations from "./locales/es.json";
import frTranslations from "./locales/fr.json";
import deTranslations from "./locales/de.json";
import zhTranslations from "./locales/zh.json";
import jaTranslations from "./locales/ja.json";
import koTranslations from "./locales/ko.json";
import arTranslations from "./locales/ar.json";
import heTranslations from "./locales/he.json";
import faTranslations from "./locales/fa.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "ar", name: "Arabic", nativeName: "العربية", rtl: true },
  { code: "he", name: "Hebrew", nativeName: "עברית", rtl: true },
  { code: "fa", name: "Persian", nativeName: "فارسی", rtl: true },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LOCALE_RESOURCES = {
  en: { translation: enTranslations },
  es: { translation: esTranslations },
  fr: { translation: frTranslations },
  de: { translation: deTranslations },
  zh: { translation: zhTranslations },
  ja: { translation: jaTranslations },
  ko: { translation: koTranslations },
  ar: { translation: arTranslations },
  he: { translation: heTranslations },
  fa: { translation: faTranslations },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: LOCALE_RESOURCES,
    fallbackLng: "en",
    defaultNS: "translation",
    supportedLngs: SUPPORTED_LANGUAGES.map((lang) => lang.code),

    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: true,
    },

    load: "languageOnly",

    saveMissing: process.env.NODE_ENV === "development",
    missingKeyHandler: (lng: readonly string[], ns: string, key: string) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`Missing translation: ${lng}.${ns}.${key}`);
      }
    },
  });

i18n.on("initialized", () => {
  applyDocumentDirection(i18n.language);
});

i18n.on("languageChanged", (languageCode) => {
  applyDocumentDirection(languageCode);
});

export default i18n;
