import { describe, expect, it } from "vitest";

import { LOCALE_META as BACKEND_LOCALE_META } from "../../base44/shared/demoCore.ts";
import {
  DEFAULT_CONSOLE_LOCALE,
  DEFAULT_VENDOR_LOCALE,
  LOCALE_REGISTRY,
  SUPPORTED_LOCALES,
  localeDirection,
  normalizeLocale,
} from "../../src/i18n/locales.js";
import { NAMESPACES, resources } from "../../src/i18n/resources.js";

const EXPECTED_LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];
const EXPECTED_NAMESPACES = [
  "common",
  "vendor",
  "console",
  "safety",
  "guidance",
  "errors",
  "proof",
  "roadmap",
  "marketplace",
  "shopify",
];

const EXPECTED_META = {
  en: { nativeName: "English", englishName: "English", direction: "ltr", speechTag: "en-US" },
  es: { nativeName: "Español", englishName: "Spanish", direction: "ltr", speechTag: "es-US" },
  wo: { nativeName: "Wolof", englishName: "Wolof", direction: "ltr", speechTag: "wo-SN" },
  ar: { nativeName: "العربية", englishName: "Arabic", direction: "rtl", speechTag: "ar-EG" },
  bn: { nativeName: "বাংলা", englishName: "Bangla", direction: "ltr", speechTag: "bn-BD" },
  "zh-Hans": {
    nativeName: "简体中文",
    englishName: "Simplified Chinese",
    direction: "ltr",
    speechTag: "zh-CN",
  },
  fr: { nativeName: "Français", englishName: "French", direction: "ltr", speechTag: "fr-FR" },
};

function flattenCatalog(value, prefix = "", target = new Map()) {
  if (typeof value === "string") {
    target.set(prefix, value);
    return target;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Catalog value at "${prefix || "<root>"}" must be an object or string.`);
  }

  for (const [key, child] of Object.entries(value)) {
    flattenCatalog(child, prefix ? `${prefix}.${key}` : key, target);
  }
  return target;
}

function interpolationVariables(value) {
  return [...value.matchAll(/{{\s*([\w.-]+)(?:\s*,[^}]*)?\s*}}/g)]
    .map((match) => match[1])
    .sort();
}

describe("seven-locale registry", () => {
  it("exposes exactly the supported locales and independent defaults", () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual([...EXPECTED_LOCALES].sort());
    expect(Object.keys(LOCALE_REGISTRY).sort()).toEqual([...EXPECTED_LOCALES].sort());
    expect(DEFAULT_VENDOR_LOCALE).toBe("es");
    expect(DEFAULT_CONSOLE_LOCALE).toBe("en");
  });

  it.each(EXPECTED_LOCALES)("defines complete, flag-free metadata for %s", (locale) => {
    const meta = LOCALE_REGISTRY[locale];
    expect(meta).toMatchObject({ id: locale, ...EXPECTED_META[locale] });
    expect(meta.fixtureAudioId).toEqual(expect.any(String));
    expect(meta.fixtureAudioId.length).toBeGreaterThan(0);
    expect(typeof meta.liveSpeechValidated).toBe("boolean");
    expect(meta).not.toHaveProperty("flag");
    expect(meta.nativeName).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
    expect(localeDirection(locale)).toBe(EXPECTED_META[locale].direction);
  });

  it("keeps Wolof fixture-first and labels Chinese precisely", () => {
    expect(LOCALE_REGISTRY.wo.liveSpeechValidated).toBe(false);
    expect(LOCALE_REGISTRY["zh-Hans"]).toMatchObject({
      englishName: "Simplified Chinese",
      speechTag: "zh-CN",
    });
  });

  it("keeps frontend and backend locale metadata on one shared contract", () => {
    for (const locale of EXPECTED_LOCALES) {
      const frontend = LOCALE_REGISTRY[locale];
      const backend = BACKEND_LOCALE_META[locale];
      expect(frontend.id, locale).toBe(backend.id);
      expect(frontend.nativeName, locale).toBe(backend.nativeName);
      expect(frontend.englishName, locale).toBe(backend.englishName);
      expect(frontend.direction, locale).toBe(backend.direction);
      expect(frontend.speechTag, locale).toBe(backend.speechTag);
      expect(frontend.fixtureAudioId, locale).toBe(backend.fixtureAudioId);
      expect(frontend.liveSpeechValidated, locale).toBe(backend.liveSpeechValidated);
    }
  });

  it("normalizes supported language tags without accepting unsupported languages", () => {
    for (const locale of EXPECTED_LOCALES) expect(normalizeLocale(locale)).toBe(locale);
    expect(normalizeLocale("ht")).toBeNull();
    expect(normalizeLocale("")).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
  });
});

describe("translation catalog contracts", () => {
  it("ships every required namespace for every supported locale", () => {
    expect([...NAMESPACES]).toEqual(EXPECTED_NAMESPACES);
    expect(Object.keys(resources).sort()).toEqual([...EXPECTED_LOCALES].sort());

    for (const locale of EXPECTED_LOCALES) {
      expect(Object.keys(resources[locale]).sort()).toEqual([...EXPECTED_NAMESPACES].sort());
    }
  });

  it.each(EXPECTED_NAMESPACES)("keeps %s keys and interpolation variables in parity", (namespace) => {
    const baseline = flattenCatalog(resources.en[namespace]);
    expect(baseline.size).toBeGreaterThan(0);

    for (const locale of EXPECTED_LOCALES) {
      const candidate = flattenCatalog(resources[locale][namespace]);
      expect([...candidate.keys()].sort(), `${locale}:${namespace} key set`).toEqual(
        [...baseline.keys()].sort(),
      );

      for (const [key, englishValue] of baseline) {
        const localizedValue = candidate.get(key);
        expect(localizedValue, `${locale}:${namespace}.${key}`).toEqual(expect.any(String));
        expect(localizedValue.trim(), `${locale}:${namespace}.${key}`).not.toBe("");
        expect(
          interpolationVariables(localizedValue),
          `${locale}:${namespace}.${key} interpolation variables`,
        ).toEqual(interpolationVariables(englishValue));
      }
    }
  });

  it("contains no unresolved i18next key-shaped values", () => {
    for (const locale of EXPECTED_LOCALES) {
      for (const namespace of EXPECTED_NAMESPACES) {
        for (const [key, value] of flattenCatalog(resources[locale][namespace])) {
          expect(value, `${locale}:${namespace}.${key}`).not.toMatch(
            /^(?:common|vendor|console|safety|guidance|errors|proof|roadmap|marketplace|shopify)\.[\w.-]+$/,
          );
        }
      }
    }
  });

  it("keeps speech modes explicit and scopes Chinese to Simplified Mandarin", () => {
    expect(resources.en.guidance.chineseVoiceLabel).toBe(
      "Simplified Chinese · Mandarin voice",
    );
    for (const locale of EXPECTED_LOCALES) {
      expect(resources[locale].guidance.deviceSpeech.trim()).not.toBe("");
      expect(resources[locale].guidance.sampleAudio.trim()).not.toBe("");
      expect(resources[locale].guidance.speechUnavailable.trim()).not.toBe("");
    }
  });
});
