import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resources } from "../../src/i18n/resources.js";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function read(relativePath) {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8");
}

function codeFiles(relativeDirectory) {
  const root = join(PROJECT_ROOT, relativeDirectory);
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extname(entry.name))) {
        files.push(path);
      }
    }
  }

  visit(root);
  return files;
}

function stripJsonComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("Base44 session and locale contracts", () => {
  it("uses demo_session_id consistently in the speech endpoint", () => {
    const source = read("base44/functions/transcribe_audio/entry.ts");
    expect(source).toMatch(/demo_session_id/);
    expect(source).toMatch(/requireSession\(base44,\s*(?:body|input)\.demo_session_id\)/);
    expect(source).not.toMatch(/\b(?:body|input)\.session_code\b/);
  });

  it("guards every session-scoped backend function", () => {
    const functionRoot = join(PROJECT_ROOT, "base44/functions");
    const exempt = new Set([
      "start_demo_session",
      "answer-demo-question",
      // Marketplace accounts are deliberately pre-session and contain only an
      // opaque prototype id plus closed synthetic role/locale fields. Their
      // separate admin-RLS gateway is asserted in marketplace-contract.test.js.
      "sync_marketplace_account",
    ]);

    for (const entry of readdirSync(functionRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || exempt.has(entry.name)) continue;
      const relativePath = `base44/functions/${entry.name}/entry.ts`;
      if (!existsSync(join(PROJECT_ROOT, relativePath))) continue;
      const source = read(relativePath);
      expect(/await\s+requireSession\s*\(/.test(source), `${entry.name} calls requireSession`).toBe(true);
      expect(/\.entities\.[A-Za-z0-9_]+\.list\s*\(/.test(source), `${entry.name} avoids unscoped list()`).toBe(false);
      for (const match of source.matchAll(/\.filter\(\s*\{([\s\S]*?)\}\s*,/g)) {
        expect(/demo_session_id/.test(match[1]), `${entry.name} filter is session-scoped`).toBe(true);
      }
    }
  });

  it("defines seven-locale enums on session and vendor entities", () => {
    const expected = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"].sort();
    const session = JSON.parse(stripJsonComments(read("base44/entities/DemoSession.jsonc")));
    const vendor = JSON.parse(stripJsonComments(read("base44/entities/DemoVendor.jsonc")));
    expect([...session.properties.locale.enum].sort()).toEqual(expected);
    expect([...vendor.properties.language.enum].sort()).toEqual(expected);
  });

  it("stores canonical case keys and the English audit rendering", () => {
    const vendor = JSON.parse(stripJsonComments(read("base44/entities/DemoVendor.jsonc")));
    const evaluation = JSON.parse(stripJsonComments(read("base44/entities/DemoRuleEvaluation.jsonc")));
    expect(vendor.properties).toHaveProperty("case_status_key");
    expect(vendor.properties).toHaveProperty("next_step_key");
    expect(vendor.properties).toHaveProperty("missing_item_key");
    expect(evaluation.properties).toHaveProperty("answer_key");
    expect(evaluation.properties).toHaveProperty("answer_text");
    expect(evaluation.properties).toHaveProperty("answer_text_en");
    expect(evaluation.properties).toHaveProperty("question");
  });

  it("resolves every displayed canonical key in every locale", () => {
    const app = read("src/pages/Sidewalk.jsx");
    const start = app.indexOf("function canonicalVendorText");
    const end = app.indexOf("function ModeBadge", start);
    const helper = app.slice(start, end);
    const mappings = [...helper.matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)]
      .map((match) => ({ canonical: match[1], translation: match[2] }));
    expect(mappings.map((item) => item.canonical).sort()).toEqual([
      "case.missing.sales_tax_certificate",
      "case.status.preparing",
      "guidance.prepare_sales_tax_certificate",
      "sales.seed.card_simulated",
      "sales.seed.cash_tacos",
    ]);
    for (const { canonical, translation } of mappings) {
      const [namespace, key] = translation.split(":");
      for (const locale of Object.keys(resources)) {
        expect(resources[locale]?.[namespace]?.[key], `${locale}:${canonical}`).toEqual(expect.any(String));
      }
    }
  });

  it("provides a locale mutation endpoint and preserves locale during reset", () => {
    const setLocale = read("base44/functions/set_demo_locale/entry.ts");
    const reset = read("base44/functions/reset_demo_session/entry.ts");
    expect(setLocale).toMatch(/requireSession/);
    expect(setLocale).toMatch(/DemoSession\.update/);
    expect(setLocale).toMatch(/DemoVendor\.update/);
    expect(reset).toMatch(/rosaSeed\([\s\S]{0,160}\.locale/);
  });

  it("retires the stale hyphenated guidance endpoint", () => {
    const retired = read("base44/functions/answer-demo-question/entry.ts");
    expect(retired).toMatch(/status:\s*410/);
    expect(retired).toMatch(/answer_demo_question/);
    expect(retired).not.toMatch(/createClientFromRequest|requireSession|evaluateDemo/);
  });

  it("includes the selected vendor locale in generated QR URLs", () => {
    const app = read("src/pages/Sidewalk.jsx");
    expect(/searchParams\.set\(\s*["']lang["']|["'][?&]lang=/.test(app)).toBe(true);
  });

  it("turns a missing critical guidance translation into abstention", () => {
    const answer = read("base44/functions/answer_demo_question/entry.ts");
    expect(answer).toMatch(/hasGuidanceTranslation/);
    expect(answer).toMatch(/translation[^\n]*(?:abstain|missing)|(?:abstain|missing)[^\n]*translation/i);
  });

  it("keeps the legal guidance engine free of model and external-provider calls", () => {
    const legalSources = [
      read("base44/shared/demoCore.ts"),
      read("base44/functions/answer_demo_question/entry.ts"),
    ].join("\n");
    expect(/InvokeLLM|OpenAI|Anthropic|generateText|integrations\.Core|\bfetch\s*\(/i.test(legalSources)).toBe(false);
  });
});

describe("safe fixture and integration boundaries", () => {
  it("only admits exact-hash audio fixtures and leaves unknown failures unavailable", () => {
    const source = read("base44/functions/transcribe_audio/entry.ts");
    expect(source).toMatch(/sha256/i);
    expect(source).toMatch(/AUDIO_FIXTURES|audioFixtures|fixtureByHash/i);
    expect(source).toMatch(/makeProvenance\(\s*["']unavailable["']/);
    expect(source).not.toMatch(/\bfixture_id\s*:\s*z\./);
    expect(source).not.toMatch(/\bfixture_hash\s*:\s*z\./);
    expect(source).toMatch(/8_?000|8000/);
  });

  it("contains no payment, messaging, filing, or outreach provider initialization", () => {
    const sources = [...codeFiles("src"), ...codeFiles("base44")]
      .map((path) => `${path}\n${readFileSync(path, "utf8")}`)
      .join("\n");

    const forbiddenCallPatterns = [
      /from\s+["']@stripe\//,
      /\bloadStripe\s*\(/,
      /new\s+Stripe\s*\(/,
      /integrations\.Core\.(?:SendEmail|SendSMS)\s*\(/,
      /connectors\.(?:getAccessToken|getConnection)\s*\(/,
      /new\s+Twilio\s*\(/,
      /(?:graph\.facebook\.com|api\.twilio\.com)[^\s"']*/,
      /\b(?:submit|file)(?:Application|Filing)\s*\(/,
    ];

    for (const pattern of forbiddenCallPatterns) {
      expect(sources).not.toMatch(pattern);
    }
  });

  it("keeps cash confirmation gated and evidence grades structurally distinct", () => {
    const cash = read("base44/functions/record_cash_sale/entry.ts");
    const checkout = read("base44/functions/complete_demo_checkout/entry.ts");
    const evidence = JSON.parse(stripJsonComments(read("base44/entities/DemoEvidenceRecord.jsonc")));
    expect(/confirmed\s*:\s*z\.literal\(true\)|if\s*\([^)]*!\s*(?:input|body)\.confirmed/.test(cash)).toBe(true);
    expect(cash).toMatch(/cash_self_reported/);
    expect(checkout).toMatch(/card_simulated/);
    expect([...evidence.properties.kind.enum].sort()).toEqual([
      "card_simulated",
      "cash_self_reported",
    ]);
  });
});

describe("RTL-safe styling contract", () => {
  it("uses logical box properties for direction-sensitive layout", () => {
    const css = read("src/sidewalk.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const app = read("src/pages/Sidewalk.jsx");
    expect(/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(css)).toBe(false);
    expect(/Noto Sans/.test(css)).toBe(true);
    for (const fontPackage of [
      "@fontsource-variable/noto-sans",
      "@fontsource/noto-sans-arabic",
      "@fontsource/noto-sans-bengali",
      "@fontsource/noto-sans-sc",
    ]) {
      expect(app, fontPackage).toContain(fontPackage);
    }
    expect(/(?:margin|padding|border|inset)-inline/.test(css)).toBe(true);
    expect(/\bmargin-(?:left|right)\s*:/.test(css)).toBe(false);
    expect(/\bpadding-(?:left|right)\s*:/.test(css)).toBe(false);
    expect(/\bborder-(?:left|right)(?:-\w+)?\s*:/.test(css)).toBe(false);
  });

  it("includes explicit LTR isolation for source identifiers", () => {
    const css = read("src/sidewalk.css");
    const app = read("src/pages/Sidewalk.jsx");
    expect(/unicode-bidi\s*:\s*(?:isolate|isolate-override)|dir=[{"']ltr/.test(`${css}\n${app}`)).toBe(true);
  });
});
