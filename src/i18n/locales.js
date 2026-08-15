export const SUPPORTED_LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

export const DEFAULT_VENDOR_LOCALE = "es";
export const DEFAULT_CONSOLE_LOCALE = "en";

export const LOCALE_REGISTRY = Object.freeze({
  en: {
    id: "en",
    nativeName: "English",
    englishName: "English",
    direction: "ltr",
    speechTag: "en-US",
    fixtureAudioId: "prepare_question_en",
    cashFixtureAudioId: "cash_sale_en",
    liveSpeechValidated: true,
  },
  es: {
    id: "es",
    nativeName: "Español",
    englishName: "Spanish",
    direction: "ltr",
    speechTag: "es-US",
    fixtureAudioId: "prepare_question_es",
    cashFixtureAudioId: "cash_sale_es",
    liveSpeechValidated: true,
  },
  wo: {
    id: "wo",
    nativeName: "Wolof",
    englishName: "Wolof",
    direction: "ltr",
    speechTag: "wo-SN",
    fixtureAudioId: "prepare_question_wo",
    cashFixtureAudioId: "cash_sale_wo",
    liveSpeechValidated: false,
  },
  ar: {
    id: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    direction: "rtl",
    speechTag: "ar-EG",
    fixtureAudioId: "prepare_question_ar",
    cashFixtureAudioId: "cash_sale_ar",
    liveSpeechValidated: false,
  },
  bn: {
    id: "bn",
    nativeName: "বাংলা",
    englishName: "Bangla",
    direction: "ltr",
    speechTag: "bn-BD",
    fixtureAudioId: "prepare_question_bn",
    cashFixtureAudioId: "cash_sale_bn",
    liveSpeechValidated: false,
  },
  "zh-Hans": {
    id: "zh-Hans",
    nativeName: "简体中文",
    englishName: "Simplified Chinese",
    direction: "ltr",
    speechTag: "zh-CN",
    fixtureAudioId: "prepare_question_zh_hans",
    cashFixtureAudioId: "cash_sale_zh_hans",
    liveSpeechValidated: false,
  },
  fr: {
    id: "fr",
    nativeName: "Français",
    englishName: "French",
    direction: "ltr",
    speechTag: "fr-FR",
    fixtureAudioId: "prepare_question_fr",
    cashFixtureAudioId: "cash_sale_fr",
    liveSpeechValidated: false,
  },
});

export function normalizeLocale(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (SUPPORTED_LOCALES.includes(raw)) return raw;
  const lower = raw.toLowerCase().replace("_", "-");
  if (lower === "zh" || lower === "zh-cn" || lower === "zh-hans") return "zh-Hans";
  return SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === lower) || null;
}

export function localeDirection(locale) {
  return (LOCALE_REGISTRY[normalizeLocale(locale) || DEFAULT_VENDOR_LOCALE] || LOCALE_REGISTRY.es).direction;
}

export function localeSpeechMeta(locale) {
  return LOCALE_REGISTRY[normalizeLocale(locale) || DEFAULT_VENDOR_LOCALE] || LOCALE_REGISTRY.es;
}

export function fixtureAudioUrl(locale, kind) {
  const id = normalizeLocale(locale) || DEFAULT_VENDOR_LOCALE;
  const filename = kind === "cash" ? "cash-sale.mp3" : kind === "answer" ? "prepare-response.mp3" : "prepare-question.mp3";
  return "/audio/" + encodeURIComponent(id) + "/" + filename;
}
