import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";

/**
 * Initialises the i18next instance with the React adapter and bundled locale resources.
 * Import this module once (e.g. from `main.tsx`) as a side effect before rendering.
 * Additional locales are added to `resources` here and in the corresponding JSON files.
 */
i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: { translation: en },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
