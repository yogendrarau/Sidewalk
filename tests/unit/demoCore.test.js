import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import * as core from "../../base44/shared/demoCore.ts";

const LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];
const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function transcriptOf(sample) {
  return typeof sample === "string" ? sample : sample?.transcript;
}

function entriesOfFixtureManifest(manifest) {
  if (Array.isArray(manifest)) return manifest;
  return Object.entries(manifest || {}).map(([id, fixture]) => ({ id, ...fixture }));
}

function estimatedMp3DurationSeconds(bytes) {
  let offset = -1;
  for (let index = 0; index < Math.min(bytes.length - 4, 4096); index += 1) {
    if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) {
      offset = index;
      break;
    }
  }
  if (offset < 0) return null;
  const versionBits = (bytes[offset + 1] >> 3) & 0x03;
  const layerBits = (bytes[offset + 1] >> 1) & 0x03;
  const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }
  const mpeg1Layer3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Layer3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const bitrateKbps = (versionBits === 3 ? mpeg1Layer3 : mpeg2Layer3)[bitrateIndex];
  return (bytes.length * 8) / (bitrateKbps * 1000);
}

function preparedFacts(intent = "prepare_first") {
  return {
    intent,
    vendor_type: "food",
    has_sales_tax_certificate: false,
  };
}

describe("deterministic seven-language guidance", () => {
  it("exposes one preparation and cash fixture transcript per locale", () => {
    expect(Object.keys(core.PREPARATION_QUESTIONS).sort()).toEqual([...LOCALES].sort());
    expect(Object.keys(core.CASH_SALE_SAMPLES).sort()).toEqual([...LOCALES].sort());

    for (const locale of LOCALES) {
      expect(transcriptOf(core.PREPARATION_QUESTIONS[locale])).toEqual(expect.any(String));
      expect(transcriptOf(core.PREPARATION_QUESTIONS[locale]).trim()).not.toBe("");
      expect(transcriptOf(core.CASH_SALE_SAMPLES[locale])).toEqual(expect.any(String));
      expect(transcriptOf(core.CASH_SALE_SAMPLES[locale]).trim()).not.toBe("");
    }
  });

  it("produces the same answer key, facts, trace, and rulebook hash in all seven languages", async () => {
    const results = [];

    for (const locale of LOCALES) {
      const transcript = transcriptOf(core.PREPARATION_QUESTIONS[locale]);
      const intent = core.classifyIntent(transcript, locale);
      const evaluation = core.evaluateDemo(preparedFacts(intent));
      const rulebookHash = await core.computeRulebookHash();
      expect(evaluation.rulebookHash, locale).toBe(rulebookHash);
      results.push({ locale, intent, evaluation, rulebookHash });
    }

    const baseline = results[0];
    expect(baseline.intent).toBe("prepare_first");
    expect(baseline.evaluation).toMatchObject({
      decision: "answer",
      answerKey: "prepare_sales_tax_certificate",
      missingFacts: [],
    });
    expect(baseline.rulebookHash).toMatch(/^[a-f0-9]{64}$/);

    for (const result of results.slice(1)) {
      expect(result.intent, result.locale).toBe(baseline.intent);
      expect(result.evaluation.answerKey, result.locale).toBe(baseline.evaluation.answerKey);
      expect(result.evaluation.missingFacts, result.locale).toEqual(baseline.evaluation.missingFacts);
      expect(JSON.stringify(result.evaluation.trace), result.locale).toBe(
        JSON.stringify(baseline.evaluation.trace),
      );
      expect(result.rulebookHash, result.locale).toBe(baseline.rulebookHash);
    }
  });

  it("renders a localized fixed answer plus a deterministic English audit rendering", () => {
    const englishAudit = core.renderAnswer("prepare_sales_tax_certificate", "en", false);
    expect(englishAudit).toEqual(expect.any(String));
    expect(englishAudit.trim()).not.toBe("");

    for (const locale of LOCALES) {
      const answer = core.renderAnswer("prepare_sales_tax_certificate", locale, false);
      expect(answer, locale).toEqual(expect.any(String));
      expect(answer.trim(), locale).not.toBe("");
    }
  });

  it("never silently falls back when a critical answer translation is missing", () => {
    for (const locale of LOCALES) {
      expect(core.hasGuidanceTranslation("translation_that_does_not_exist", locale), locale).toBe(false);
      expect(core.renderAnswer("translation_that_does_not_exist", locale, false), locale).toBeNull();
    }
  });

  it("abstains on unknown language input or a missing fact", () => {
    for (const locale of LOCALES) {
      const intent = core.classifyIntent(`unrecognized-${locale}-phrase`, locale);
      expect(intent, locale).toBe("unknown");
      expect(core.evaluateDemo(preparedFacts(intent)).decision, locale).toBe("abstain");
    }

    const missingCertificateFact = core.evaluateDemo({
      intent: "prepare_first",
      vendor_type: "food",
    });
    expect(missingCertificateFact.decision).toBe("abstain");
    expect(missingCertificateFact.missingFacts).toContain("has_sales_tax_certificate:false");
  });

  it("parses the localized twelve-dollar phrase and universal digits for every locale", () => {
    for (const locale of LOCALES) {
      expect(core.parseAmount(transcriptOf(core.CASH_SALE_SAMPLES[locale]), locale), locale).toBe(12);
      expect(core.parseAmount("$12.00", locale), locale).toBe(12);
    }
    expect(core.parseAmount("not an amount", "en")).toBeNull();
  });

  it("never guesses an unclear or incomplete ticket number", () => {
    for (const value of [null, "", "35088?21A0", "350882", "3508821A0-extra-long"]) {
      expect(core.normalizeTicket(value), String(value)).toBeNull();
    }
    expect(core.normalizeTicket("350 8821-A0")).toBe("3508821A0");
  });
});

describe("exact audio fixture contract", () => {
  it("declares one preparation and one cash fixture with a concrete SHA-256 per locale", () => {
    const fixtures = entriesOfFixtureManifest(core.AUDIO_FIXTURES);
    expect(fixtures).toHaveLength(LOCALES.length * 2);

    const hashes = new Set();
    for (const locale of LOCALES) {
      for (const kind of ["preparation_question", "cash_sale"]) {
        const matches = fixtures.filter((fixture) => fixture.locale === locale && fixture.kind === kind);
        expect(matches, `${locale}:${kind}`).toHaveLength(1);
        expect(matches[0].transcript, `${locale}:${kind}`).toEqual(expect.any(String));
        expect(matches[0].sha256, `${locale}:${kind}`).toMatch(/^[a-f0-9]{64}$/);
        hashes.add(matches[0].sha256);
      }
    }
    expect(hashes.size).toBe(fixtures.length);
  });

  it("matches every declared hash to the bundled audio bytes", () => {
    const fixtures = entriesOfFixtureManifest(core.AUDIO_FIXTURES);

    for (const fixture of fixtures) {
      expect(fixture.publicPath, `${fixture.locale}:${fixture.kind}`).toMatch(/^\/audio\//);
      const path = join(PROJECT_ROOT, "public", ...fixture.publicPath.split("/").filter(Boolean));
      const bytes = readFileSync(path);
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      expect(actualHash, `${fixture.locale}:${fixture.kind}`).toBe(fixture.sha256);
      expect(core.AUDIO_FIXTURE_HASHES[actualHash], actualHash).toBe(fixture.id);
      expect(estimatedMp3DurationSeconds(bytes), `${fixture.locale}:${fixture.kind} MP3 duration`).toBeGreaterThan(0.2);
    }
    expect(core.AUDIO_FIXTURE_HASHES["0".repeat(64)]).toBeUndefined();
  });

  it("bundles a parseable spoken guidance response for every locale", () => {
    for (const locale of LOCALES) {
      const path = join(PROJECT_ROOT, "public", "audio", locale, "prepare-response.mp3");
      expect(statSync(path).size, locale).toBeGreaterThan(128);
      const duration = estimatedMp3DurationSeconds(readFileSync(path));
      expect(duration, `${locale} response MP3 duration`).toBeGreaterThan(0.5);
      expect(duration, `${locale} response MP3 duration`).toBeLessThan(60);
    }
  });
});

describe("prototype session isolation", () => {
  it("filters sessions by the exact current demo_session_id", async () => {
    const filter = vi.fn().mockResolvedValue([{ demo_session_id: "SESSION-A" }]);
    const base44 = {
      asServiceRole: {
        entities: {
          DemoSession: { filter },
        },
      },
    };

    await expect(core.requireSession(base44, "SESSION-A")).resolves.toMatchObject({
      demo_session_id: "SESSION-A",
    });
    expect(filter).toHaveBeenCalledTimes(1);
    expect(filter).toHaveBeenCalledWith({ demo_session_id: "SESSION-A" }, "-created_date", 1, 0);
  });

  it("rejects invalid or cross-session identifiers before data access", async () => {
    const filter = vi.fn().mockResolvedValue([]);
    const base44 = {
      asServiceRole: {
        entities: {
          DemoSession: { filter },
        },
      },
    };

    await expect(core.requireSession(base44, "../other-session")).rejects.toThrow(/invalid/i);
    expect(filter).not.toHaveBeenCalled();

    await expect(core.requireSession(base44, "SESSION-B")).rejects.toThrow(/invalid demo session/i);
    expect(filter).toHaveBeenCalledWith({ demo_session_id: "SESSION-B" }, "-created_date", 1, 0);
  });

  it("re-seeds canonical language-neutral case keys while preserving the chosen locale", () => {
    const expectedVendorKeys = {
      case_status_key: "case.status.preparing",
      case_summary_key: "case.summary.rosa_food_vendor",
      next_step_key: "guidance.prepare_sales_tax_certificate",
      missing_item_key: "case.missing.sales_tax_certificate",
    };
    for (const locale of LOCALES) {
      const seed = core.rosaSeed("SESSION-A", locale);
      expect(seed.vendor.language, locale).toBe(locale);
      expect(seed.vendor, locale).toMatchObject(expectedVendorKeys);
      expect(seed.evidence.map((item) => item.note_key), locale).toEqual([
        "sales.seed.cash_tacos",
        "sales.seed.card_simulated",
      ]);
    }
  });

  it("produces an idempotent seed without duplicate activity records", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T16:00:00.000Z"));
    try {
      const first = core.rosaSeed("SESSION-A", "fr");
      const second = core.rosaSeed("SESSION-A", "fr");
      expect(second).toEqual(first);
      expect(second.evidence).toHaveLength(2);
      expect(new Set(second.evidence.map((item) => item.kind)).size).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
