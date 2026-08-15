import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resources } from "../../src/i18n/resources.js";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

function read(relativePath) {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8");
}

function listFiles(relativeDir) {
  return readdirSync(join(PROJECT_ROOT, relativeDir)).map((name) => join(relativeDir, name));
}

function walkSourceFiles(relativeDir, collected = []) {
  for (const entry of readdirSync(join(PROJECT_ROOT, relativeDir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(relativeDir, entry.name);
    if (entry.isDirectory()) walkSourceFiles(path, collected);
    else if (/\.(?:jsx?|ts|css)$/.test(entry.name)) collected.push(path);
  }
  return collected;
}

const RULES_KEYS = [
  "rulesNav",
  "buyerRulesTitle",
  "vendorRulesTitle",
  "buyerRulesIntro",
  "vendorRulesIntro",
  "rulesAuthority",
  "rulesNoDetermination",
  "rulesViewMap",
  "rulesViewList",
  "statusRestrictedNow",
  "statusRestrictedLater",
  "statusNotRestrictedToday",
  "statusOutOfSeason",
  "statusUnknown",
  "ruleOnListTitle",
  "ruleNotOnListTitle",
  "ruleRestrictedNowBody",
  "ruleRestrictedLaterBody",
  "ruleNotRestrictedTodayBody",
  "ruleUnknownBody",
  "ruleNotOnListBody",
  "ruleNotADecision",
  "rulesSampleBlock",
  "caveatScopeMobileFood",
  "caveatCenterline",
  "caveatNotOnlyRule",
  "rulesUnmappedNote",
];

function interpolationVariables(value) {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

describe("street-rules i18n contract", () => {
  it("ships every rules key non-empty in all seven locales", () => {
    for (const locale of LOCALES) {
      for (const key of RULES_KEYS) {
        const value = resources[locale].marketplace[key];
        expect(typeof value, `${locale}:marketplace.${key}`).toBe("string");
        expect(value.trim(), `${locale}:marketplace.${key}`).not.toBe("");
      }
      expect(resources[locale].common.modeBundledSnapshot).toEqual(expect.any(String));
    }
  });

  it("locks the report-only tone: a negative answer can never read as permission", () => {
    const en = resources.en.marketplace;
    expect(en.ruleNotOnListBody).toMatch(/does not establish that vending is allowed/i);
    expect(en.ruleNotOnListTitle).not.toMatch(/\ballowed\b|\blegal\b|\byou can\b|\bok to\b/i);
    expect(en.ruleNotADecision).toMatch(/does not decide/i);
    expect(en.ruleNotADecision).toMatch(/not legal advice/i);
    expect(en.rulesAuthority).toMatch(/only the city|responsible agency/i);
    expect(en.caveatScopeMobileFood).toMatch(/mobile food vending only/i);
    expect(en.ruleUnknownBody).toMatch(/treat it as restricted/i);
  });

  it("keeps {{hours}} interpolation intact in every locale's status bodies", () => {
    for (const key of ["ruleRestrictedNowBody", "ruleRestrictedLaterBody"]) {
      for (const locale of LOCALES) {
        expect(
          interpolationVariables(resources[locale].marketplace[key]),
          `${locale}:marketplace.${key}`,
        ).toEqual(["hours"]);
      }
    }
    for (const locale of LOCALES) {
      expect(
        interpolationVariables(resources[locale].marketplace.rulesUnmappedNote),
        `${locale}:marketplace.rulesUnmappedNote`,
      ).toEqual(["count"]);
    }
  });

  it("keeps guard words and raw URLs out of the new English copy", () => {
    for (const key of RULES_KEYS) {
      const value = resources.en.marketplace[key];
      expect(value, `marketplace.${key}`).not.toMatch(/\bbuy\b|\bcheckout\b|\border now\b/i);
      expect(value, `marketplace.${key}`).not.toMatch(/\bcaseworker/i);
      expect(value, `marketplace.${key}`).not.toMatch(/human review (?:is )?(?:required|necessary)/i);
      expect(value, `marketplace.${key}`).not.toMatch(/https?:\/\//i);
    }
  });
});

describe("street-rules source contract", () => {
  const componentFiles = listFiles("src/components/marketplace");
  const legalityFiles = listFiles("src/lib/legality");
  const allSource = walkSourceFiles("src");

  it("confines Leaflet to the lazy map chunk and keeps it RTL- and offline-safe", () => {
    const MAP_FILE = join("src/components/marketplace", "StreetRulesMap.jsx");
    for (const file of allSource) {
      if (file === MAP_FILE) continue;
      const source = read(file);
      expect(source, file).not.toMatch(/from\s+["']leaflet["']|leaflet\/dist/);
      expect(source, file).not.toMatch(/react-leaflet/);
      expect(source, file).not.toMatch(/openstreetmap\.org|mapbox|maptiler|arcgis|stadiamaps/i);
    }
    const map = read(MAP_FILE);
    // No default marker image icons (broken under bundlers) and no popups
    // (RTL + focus hazards); markers are vector/HTML divIcons only and
    // selection goes to the external report panel.
    expect(map).not.toMatch(/Icon\.Default|iconUrl|marker-icon|bindPopup/);
    expect(map).toMatch(/divIcon/);
    // Leaflet's own controls carry physical-margin CSS that breaks RTL —
    // they must stay disabled, with the canvas pinned LTR.
    expect(map).toMatch(/zoomControl:\s*false/);
    expect(map).toMatch(/attributionControl:\s*false/);
    expect(map).toMatch(/dir="ltr"/);
    // The offline floor and lifecycle hygiene the demo depends on.
    expect(map).toMatch(/createPane\("floor"\)/);
    expect(map).toMatch(/invalidateSize/);
    expect(map).toMatch(/ResizeObserver/);
    expect(map).toMatch(/map\.remove\(\)/);
    // The workspace must load this chunk lazily.
    const workspace = read("src/components/marketplace/StreetRulesWorkspace.jsx");
    expect(workspace).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(/);
    expect(workspace).not.toMatch(/^import StreetRulesMap/m);
  });

  it("keeps the legality library free of network access", () => {
    for (const file of legalityFiles) {
      const source = read(file);
      expect(source, file).not.toMatch(/\bfetch\s*\(/);
      expect(source, file).not.toMatch(/XMLHttpRequest|WebSocket/);
      expect(source, file).not.toMatch(/from\s+["']@\/api/);
    }
  });

  it("keeps commerce identifiers and dead-tree imports out of the new components", () => {
    for (const file of componentFiles) {
      const source = read(file);
      expect(source, file).not.toMatch(/data-store-id|data-product-id|data-order-id|data-customer-id/);
      expect(source, file).not.toMatch(/components\/sidewalk\//);
      expect(source, file).not.toMatch(/react-router-dom/);
      expect(source, file).not.toMatch(/@\/components\/ui\//);
    }
  });

  it("keeps the duplicated mode->label map in agreement with Sidewalk.jsx", () => {
    // ModeBadge in Sidewalk.jsx must not move (a source contract slices
    // around it), so StreetRuleReport carries a deliberate duplicate.
    const extractMap = (source, name) => {
      const match = source.match(new RegExp(name + "\\s*=\\s*\\{([\\s\\S]*?)\\}"));
      expect(match, name).not.toBeNull();
      return Object.fromEntries(
        [...match[1].matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
      );
    };
    const sidewalkMap = extractMap(read("src/pages/Sidewalk.jsx"), "MODE_KEYS");
    const rulesMap = extractMap(
      read("src/components/marketplace/StreetRuleReport.jsx"),
      "RULES_MODE_KEYS",
    );
    expect(rulesMap).toEqual(sidewalkMap);
    expect(rulesMap.bundled_public_snapshot).toBe("common:modeBundledSnapshot");
  });

  it("keeps every sample vendor fictional, labeled, and commerce-free", () => {
    const seed = JSON.parse(read("src/data/sample-vendors.json"));
    expect(seed.meta.is_fictional).toBe(true);
    expect(seed.vendors.length).toBeGreaterThan(0);
    for (const vendor of seed.vendors) {
      expect(vendor.is_fictional, vendor.id).toBe(true);
      // Menus are fictional and display-only: labeled prices, no order,
      // payment, or inventory machinery of any kind.
      for (const key of Object.keys(vendor)) {
        expect(key).not.toMatch(/order|checkout|payment|inventory|stock|store/i);
      }
      for (const item of vendor.menu ?? []) {
        expect(item.is_fictional, item.id).toBe(true);
        expect(Object.keys(item).sort()).toEqual(["emoji", "id", "is_fictional", "name", "price_label"]);
      }
    }
    expect(seed.meta.note).toMatch(/purchases are simulated only/i);
    // The vendor data stays fictional at the data level (the app-wide
    // "Fictional demo data" disclosure banner covers every surface), and
    // checkout is an explicit external handoff — the app itself never takes
    // a payment.
    const workspace = read("src/components/marketplace/StreetRulesWorkspace.jsx");
    expect(workspace).toMatch(/sampleVendorTitle/);
    expect(workspace).toMatch(/SHOPIFY_CHECKOUT_URL/);
    expect(workspace).toMatch(/rel="noopener noreferrer"/);
    expect(workspace).not.toMatch(/loadStripe|Square\.payments|paypal\.Buttons/);
  });

  it("renders the disclosure surface: authority banner, caveats, and sample entry point", () => {
    const workspace = read("src/components/marketplace/StreetRulesWorkspace.jsx");
    expect(workspace).toMatch(/data-testid="rules-authority-banner"/);
    expect(workspace).toMatch(/data-testid="rules-sample-block"/);
    expect(workspace).toMatch(/rulesUnmappedNote/);
    const report = read("src/components/marketplace/StreetRuleReport.jsx");
    expect(report).toMatch(/ruleNotADecision/);
    expect(report).toMatch(/caveatScopeMobileFood/);
    const map = read("src/components/marketplace/StreetRulesMap.jsx");
    expect(map).toMatch(/data-testid="rules-map-canvas"/);
    expect(map).toMatch(/OpenStreetMap contributors/); // required tile attribution
  });
});
