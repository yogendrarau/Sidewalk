export const LOCALE_ORDER = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

export function tr(...values) {
  if (values.length !== LOCALE_ORDER.length) {
    throw new Error("Every catalog row must contain exactly seven translations.");
  }
  return Object.fromEntries(LOCALE_ORDER.map((locale, index) => [locale, values[index]]));
}
