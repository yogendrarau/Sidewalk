import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { NAMESPACES, resources } from "./resources";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: false,
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: false,
    ns: NAMESPACES,
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
  });
}

export function useSurfaceTranslation(locale, namespaces = NAMESPACES) {
  return useTranslation(namespaces, { lng: locale });
}

export { NAMESPACES, resources };
export * from "./locales";
export default i18n;
