import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_MEDIA,
  SAMPLE_MENU_ITEMS,
  SHOPIFY_DISCLOSURE_VERSION,
  SHOPIFY_FUNCTIONS,
  createSampleActiveState,
  deriveSellingAccess,
  isExactBundledSampleMedia,
  isExactBundledMenuSampleSet,
  normalizeMoney,
  normalizeShopDomain,
  parseShopifyDemoContext,
  parseConnectedShopifyStoreData,
  parseShopifyResult,
  parseSellingAccessData,
  vendorWorkspacesFor,
} from "../../src/lib/shopifyPoc.js";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function read(relativePath) {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8");
}

describe("Shopify selling-access frontend contract", () => {
  it("derives the closed four-state selling gate", () => {
    expect(deriveSellingAccess("unanswered", "not_started")).toBe("locked_needs_status");
    expect(deriveSellingAccess("not_verified", "not_started")).toBe("locked_needs_certification");
    expect(deriveSellingAccess("self_attested_demo", "not_started")).toBe("locked_needs_shopify");
    expect(deriveSellingAccess("self_attested_demo", "connected_test_store")).toBe("active_demo");
  });

  it("exposes Get Verified only for not_verified and removes it after self-attestation", () => {
    expect(vendorWorkspacesFor({ certification_status: "unanswered" })).not.toContain("get-verified");
    expect(vendorWorkspacesFor({ certification_status: "not_verified" })).toContain("get-verified");
    expect(vendorWorkspacesFor({ certification_status: "self_attested_demo" })).not.toContain("get-verified");
    expect(vendorWorkspacesFor({ certification_status: "self_attested_demo" })).toContain("online-store");
  });

  it("keeps explicit sample mode outside every canonical access gate", () => {
    const sample = createSampleActiveState("es");
    expect(sample.sampleMode).toBe(true);
    expect(sample.certification_status).toBe("unanswered");
    expect(sample.selling_access_state).toBe("locked_needs_status");
    expect(sample.shopify_setup_state).toBe("not_started");
    expect(sample.attested_at).toBeNull();
    expect(sample.connection).toBeNull();
    expect(sample.provenance.mode).toBe("fixture");
  });

  it("validates a real shop subdomain and confirmed positive prices", () => {
    expect(normalizeShopDomain("https://rosa-demo.myshopify.com/")).toBe("rosa-demo.myshopify.com");
    expect(normalizeShopDomain("myshopify.com")).toBeNull();
    expect(normalizeShopDomain("rosa.example.com")).toBeNull();
    expect(normalizeMoney("5")).toBe("5.00");
    expect(normalizeMoney("0")).toBeNull();
    expect(normalizeMoney("$5")).toBeNull();
  });

  it("never turns an invalid or unavailable live response into a fixture success", () => {
    const invalid = parseShopifyResult({ ok: true, data: {} }, "test");
    expect(invalid).toMatchObject({ ok: false, error: "invalid_provenance" });
    expect(invalid.provenance.mode).toBe("unavailable");

    const unavailable = parseShopifyResult({
      ok: false,
      error: "shopify_timeout",
      provenance: {
        mode: "unavailable",
        source: "Shopify Admin GraphQL",
        retrievedAt: "2026-08-15T12:00:00.000Z",
      },
    });
    expect(unavailable).toMatchObject({ ok: false, error: "shopify_timeout" });
    expect(unavailable.provenance.mode).toBe("unavailable");
  });

  it("rejects inconsistent access flags and malformed connected-store success", () => {
    const access = {
      certification_status: "unanswered",
      selling_access_state: "locked_needs_status",
      shopify_setup_state: "not_started",
      ordering_status: "paused",
      attested_at: null,
      disclosure_version: null,
      is_fictional: true,
      can_access_get_verified: false,
      can_prepare_menu: false,
      can_open_shopify_setup: false,
      can_publish: false,
    };
    expect(parseSellingAccessData(access)).toMatchObject(access);
    expect(parseSellingAccessData({ ...access, can_publish: true })).toBeNull();
    expect(parseConnectedShopifyStoreData({}, { mode: "shopify_test_store" })).toBeNull();
    expect(parseConnectedShopifyStoreData({
      setup_state: "connected_test_store",
      connection_status: "connected",
      selling_access_state: "active_demo",
      shop_domain: "rosa-demo.myshopify.com",
      api_version: "2026-07",
      granted_scopes: ["write_products"],
    }, { mode: "fixture" })).toBeNull();
  });

  it("accepts only a closed, separately stored demo context", () => {
    const valid = {
      schema_version: 1,
      demo_session_id: "ROSA-2026",
      prototype_account_id: "proto_00000000000000000000000000000000",
      locale: "es",
      created_at: "2026-08-15T12:00:00.000Z",
    };
    expect(parseShopifyDemoContext(valid)).toEqual(valid);
    expect(parseShopifyDemoContext({ ...valid, certification_status: "self_attested_demo" })).toBeNull();
  });
});

describe("exact fictional Shopify fixture contract", () => {
  it("pins the three coordinated SHA-256 fixtures", () => {
    expect(SAMPLE_MEDIA.map((asset) => asset.sha256)).toEqual([
      "7a1363a0362e5fb014aab4696775b922d6f9432c17ebc9920df3adcf1f782fbc",
      "16f91ff14df98e163c1a80a7add05344a54682b6367323d3d2e56771cd59c639",
      "14f183857ce3b3eefcdf86dc54fd172a0ae0e2056a0ee04a60adac66b30450a2",
    ]);
  });

  it("requires the exact fixture id, hash, and provenance id together", () => {
    expect(SAMPLE_MEDIA.every(isExactBundledSampleMedia)).toBe(true);
    expect(isExactBundledSampleMedia({ ...SAMPLE_MEDIA[0], sha256: "0".repeat(64) })).toBe(false);
    expect(isExactBundledSampleMedia({ ...SAMPLE_MEDIA[0], id: "unknown-upload" })).toBe(false);
    expect(isExactBundledSampleMedia({
      ...SAMPLE_MEDIA[0],
      provenance: { ...SAMPLE_MEDIA[0].provenance, fixtureId: "wrong-fixture" },
    })).toBe(false);
  });

  it("requires both exact menu boards before injecting the full fixture menu", () => {
    expect(isExactBundledMenuSampleSet(SAMPLE_MEDIA)).toBe(true);
    expect(isExactBundledMenuSampleSet([SAMPLE_MEDIA[0]])).toBe(false);
    expect(isExactBundledMenuSampleSet([SAMPLE_MEDIA[0], SAMPLE_MEDIA[2]])).toBe(false);
    expect(isExactBundledMenuSampleSet([SAMPLE_MEDIA[0], SAMPLE_MEDIA[1], SAMPLE_MEDIA[1]])).toBe(false);
  });

  it("matches the menu boards without invented options or a guessed Elote price", () => {
    const byKey = Object.fromEntries(SAMPLE_MENU_ITEMS.map((item) => [item.localItemKey, item]));
    expect(Object.keys(byKey).sort()).toEqual([
      "agua_jamaica",
      "elote_preparado",
      "empanada_de_queso",
      "tacos_de_pollo",
      "tamales",
    ]);
    expect(byKey.agua_jamaica.sourceImageIds).toEqual(["fixture-menu-board-1"]);
    expect(byKey.agua_jamaica.options).toEqual([]);
    expect(byKey.elote_preparado.priceAmount).toBeNull();
    expect(byKey.tamales.sourceImageIds).toHaveLength(2);
    for (const item of SAMPLE_MENU_ITEMS) expect(item.category).toBeNull();
  });

  it("uses the exact attestation version and required Base44 function names", () => {
    expect(SHOPIFY_DISCLOSURE_VERSION).toBe("shopify-poc-v1");
    expect(Object.values(SHOPIFY_FUNCTIONS)).toContain("confirm_certification_self_attestation");
    expect(Object.values(SHOPIFY_FUNCTIONS)).toContain("publish_menu_to_shopify");
    expect(Object.values(SHOPIFY_FUNCTIONS)).toContain("get_shopify_checkout_url");
  });

  it("keeps fixture identifiers out of the live cart and checkout path", () => {
    const hook = read("src/components/shopify/useShopifyPoc.js");
    expect(hook).toMatch(/fixture_variant_rejected/);
    expect(hook).toMatch(/fixture_cart_rejected/);
    expect(hook).toMatch(/sampleMode[\s\S]*fixture-cart/);
  });

  it("classifies uploaded live media before extracting only confirmed menu images", () => {
    const hook = read("src/components/shopify/useShopifyPoc.js");
    const upload = hook.indexOf("SHOPIFY_FUNCTIONS.uploadMedia");
    const classify = hook.indexOf("SHOPIFY_FUNCTIONS.classifyMedia", upload);
    const confirmedMenuFilter = hook.indexOf('asset.confirmed_kind === "menu_or_price_board"', classify);
    const extract = hook.indexOf("SHOPIFY_FUNCTIONS.extractMenu", confirmedMenuFilter);
    expect(upload).toBeGreaterThan(-1);
    expect(classify).toBeGreaterThan(upload);
    expect(confirmedMenuFilter).toBeGreaterThan(classify);
    expect(extract).toBeGreaterThan(confirmedMenuFilter);
  });
});
