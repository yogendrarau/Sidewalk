import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const ENTITY_FILES = Object.freeze({
  VendorSellingAccess: "vendor-selling-access.jsonc",
  ShopifyMerchantConnection: "shopify-merchant-connection.jsonc",
  VendorMediaAsset: "vendor-media-asset.jsonc",
  MenuImport: "menu-import.jsonc",
  MenuItemMapping: "menu-item-mapping.jsonc",
  ShopifyOrderSnapshot: "shopify-order-snapshot.jsonc",
  ShopifyCartSession: "shopify-cart-session.jsonc",
});

const SHOPIFY_FUNCTIONS = Object.freeze([
  "get_selling_access",
  "set_certification_status",
  "confirm_certification_self_attestation",
  "begin_shopify_signup",
  "begin_shopify_authorization",
  "complete_shopify_authorization",
  "connect_prepared_shopify_store",
  "get_shopify_connection",
  "upload_vendor_media",
  "classify_vendor_media",
  "extract_menu_photos",
  "confirm_menu_import",
  "publish_menu_to_shopify",
  "get_vendor_storefront",
  "update_shopify_menu_item",
  "set_shopify_store_status",
  "create_shopify_cart",
  "get_shopify_checkout_url",
  "refresh_shopify_orders",
  "reset_shopify_demo",
]);

const FAIL_CLOSED_SHOPIFY_FUNCTIONS = Object.freeze([
  "begin_shopify_authorization",
  "complete_shopify_authorization",
  "refresh_shopify_orders",
]);

const SUCCESS_SHOPIFY_FUNCTIONS = Object.freeze(
  SHOPIFY_FUNCTIONS.filter((name) => !FAIL_CLOSED_SHOPIFY_FUNCTIONS.includes(name)),
);

function read(relativePath) {
  return readFileSync(join(PROJECT_ROOT, relativePath), "utf8");
}

function stripJsonComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function entitySchema(fileName) {
  return JSON.parse(stripJsonComments(read(`base44/entities/${fileName}`)));
}

function functionSource(name) {
  return read(`base44/functions/${name}/entry.ts`);
}

function sha256(relativePath) {
  return createHash("sha256").update(readFileSync(join(PROJECT_ROOT, relativePath))).digest("hex");
}

function readTree(relativeDirectory, extensions = /\.(?:css|html|js|jsx|json|ts|tsx)$/i) {
  const root = join(PROJECT_ROOT, relativeDirectory);
  const sources = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (extensions.test(entry.name)) sources.push(readFileSync(path, "utf8"));
    }
  };
  visit(root);
  return sources.join("\n");
}

describe("Shopify backend resource boundary", () => {
  it("ships the complete strict-schema endpoint and entity surface", () => {
    for (const [entityName, fileName] of Object.entries(ENTITY_FILES)) {
      const path = join(PROJECT_ROOT, "base44", "entities", fileName);
      expect(existsSync(path), `${entityName} schema exists`).toBe(true);
      expect(entitySchema(fileName).name).toBe(entityName);
    }

    for (const name of SHOPIFY_FUNCTIONS) {
      const path = join(PROJECT_ROOT, "base44", "functions", name, "entry.ts");
      expect(existsSync(path), `${name} endpoint exists`).toBe(true);
      const source = functionSource(name);
      expect(source, `${name} creates a request-bound Base44 client`).toMatch(/createClientFromRequest/);
      expect(source, `${name} rejects non-POST and oversized bodies through the shared reader`).toMatch(
        /readStrictJson\s*\(/,
      );
      expect(source, `${name} uses a closed request schema`).toMatch(/z\.object\s*\(/);
      expect(source, `${name} rejects extra request keys`).toMatch(/\.strict\s*\(\)/);
      expect(source, `${name} requires a synthetic session`).toMatch(/requireSession\s*\(/);
      expect(source, `${name} takes demo_session_id`).toMatch(/demo_session_id/);
    }
  });

  it("keeps every mutable entity session-scoped, admin-only, and unable to store credentials or PII", () => {
    const prohibitedFields = /(?:access|refresh|admin|oauth|webhook)?_?token|secret|password|customer_(?:name|email|phone)|email|phone|billing|shipping|street_address|government_id|social_security|tax_id|immigration|bank|card|payment_detail/i;

    for (const [entityName, fileName] of Object.entries(ENTITY_FILES)) {
      const schema = entitySchema(fileName);
      expect(schema.properties, `${entityName} has demo_session_id`).toHaveProperty("demo_session_id");
      for (const propertyName of Object.keys(schema.properties)) {
        expect(propertyName, `${entityName}.${propertyName} is not a secret/PII field`).not.toMatch(
          prohibitedFields,
        );
      }
      for (const operation of ["create", "read", "update", "delete"]) {
        expect(schema.rls?.[operation]?.user_condition, `${entityName} ${operation} is admin-only`).toEqual({
          role: "admin",
        });
      }
    }

    const order = entitySchema(ENTITY_FILES.ShopifyOrderSnapshot);
    expect(Object.keys(order.properties).sort()).toEqual([
      "created_at",
      "currency",
      "demo_session_id",
      "display_order_name",
      "financial_status",
      "fulfillment_status",
      "line_item_summary",
      "prototype_account_id",
      "provenance",
      "shopify_order_id",
      "test_order",
      "total_amount",
    ]);
  });

  it("never embeds Shopify credentials in browser code, schemas, or package dependencies", () => {
    const frontend = readTree("src");
    expect(frontend).not.toMatch(
      /SHOPIFY_(?:ADMIN_ACCESS_TOKEN|STOREFRONT_ACCESS_TOKEN|OAUTH_CLIENT_SECRET|WEBHOOK_SECRET)|X-Shopify-(?:Access|Storefront-Access)-Token/i,
    );
    expect(frontend).not.toMatch(
      /(?:js\.stripe\.com|paypal\.com\/sdk|squareup\.com\/v\d|new\s+Stripe\s*\(|ShopifyPayments)/i,
    );

    const entityText = Object.values(ENTITY_FILES).map((file) => read(`base44/entities/${file}`)).join("\n");
    expect(entityText).not.toMatch(/admin_access_token|storefront_access_token|oauth_client_secret|refresh_token/i);

    const packageJson = JSON.parse(read("package.json"));
    const dependencies = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
    expect(dependencies).not.toEqual(
      expect.arrayContaining([
        "stripe",
        "@stripe/stripe-js",
        "@paypal/paypal-js",
        "@square/web-sdk",
        "@shopify/shopify-api",
      ]),
    );
  });
});

describe("server-derived selling gate", () => {
  it("derives active_demo only from self-attestation plus a confirmed live test-store connection", () => {
    const core = read("base44/shared/shopifyCore.ts");
    expect(core).toMatch(/certificationStatus\s*===\s*["']unanswered["'][\s\S]*locked_needs_status/);
    expect(core).toMatch(/certificationStatus\s*===\s*["']not_verified["'][\s\S]*locked_needs_certification/);
    expect(core).toMatch(/connection\?\.setup_state\s*===\s*["']connected_test_store["']/);
    expect(core).toMatch(/connection\.connection_status\s*===\s*["']connected["']/);
    expect(core).toMatch(/connection\.integration_mode\s*===\s*["']shopify_test_store["']/);
    expect(core).toMatch(/return\s+["']active_demo["']/);
    expect(core).toMatch(/Browser prototype ids are lookup keys only; they never authorize arbitrary stores/);
  });

  it("independently gates every publication, catalog mutation, cart, checkout, and order path", () => {
    for (const name of [
      "publish_menu_to_shopify",
      "update_shopify_menu_item",
      "set_shopify_store_status",
      "refresh_shopify_orders",
    ]) {
      expect(functionSource(name), `${name} requires active selling in its own backend handler`).toMatch(
        /requireActiveSelling\s*\(/,
      );
    }

    for (const name of ["get_vendor_storefront", "create_shopify_cart", "get_shopify_checkout_url"]) {
      expect(functionSource(name), `${name} independently requires a published active storefront`).toMatch(
        /requirePublishedStorefront\s*\(/,
      );
    }

    for (const name of ["create_shopify_cart", "get_shopify_checkout_url"]) {
      expect(functionSource(name), `${name} also rejects paused test ordering`).toMatch(
        /ordering_status\s*!==\s*["']active["']/,
      );
    }

    for (const name of ["upload_vendor_media", "classify_vendor_media", "extract_menu_photos", "confirm_menu_import"]) {
      expect(functionSource(name), `${name} requires the certification question to be answered`).toMatch(
        /requireCertificationAnswered\s*\(/,
      );
    }
  });

  it("requires a request-authenticated Base44 admin for every prepared-store mutation", () => {
    const core = read("base44/shared/shopifyCore.ts");
    expect(core).toMatch(/requirePreparedStoreOperator[\s\S]*auth\.me\s*\(\)/);
    expect(core).toMatch(/user\.role\s*!==\s*["']admin["']/);
    expect(core).toMatch(/prepared_store_operator_required/);

    for (const name of [
      "connect_prepared_shopify_store",
      "publish_menu_to_shopify",
      "update_shopify_menu_item",
      "set_shopify_store_status",
      "refresh_shopify_orders",
      "reset_shopify_demo",
    ]) {
      expect(functionSource(name), `${name} rejects a forgeable browser prototype id without admin approval`).toMatch(
        /requirePreparedStoreOperator\s*\(/,
      );
    }

    const connect = functionSource("connect_prepared_shopify_store");
    expect(connect).toMatch(/operatorApproved\s*=\s*false/);
    expect(connect).toMatch(/operatorApproved\s*=\s*true/);
    expect(connect).toMatch(/if\s*\(base44\s*&&\s*context\s*&&\s*operatorApproved\)/);
  });

  it("accepts the authenticated vendor handoff without trusting a browser role or weakening session ownership", () => {
    const core = read("base44/shared/shopifyCore.ts");
    const accountLookup = core.indexOf('entity(base44, "MarketplacePrototypeAccount").filter');
    const missingAccountFallback = core.indexOf("if (!account)", accountLookup);
    const authenticatedUserLookup = core.indexOf("auth.me()", missingAccountFallback);
    const authenticatedVendorGate = core.indexOf(
      'user?.id && user.account_role === "vendor"',
      authenticatedUserLookup,
    );
    const sessionOwnershipLookup = core.indexOf("const sessionRows = await scopedRecords", authenticatedVendorGate);
    const crossOwnerRejection = core.indexOf(
      "row.prototype_account_id !== prototypeAccountId",
      sessionOwnershipLookup,
    );

    expect(accountLookup, "synthetic account remains the first authority").toBeGreaterThan(-1);
    expect(missingAccountFallback, "authenticated fallback runs only when no synthetic account exists")
      .toBeGreaterThan(accountLookup);
    expect(authenticatedUserLookup, "fallback uses the request-bound Base44 identity")
      .toBeGreaterThan(missingAccountFallback);
    expect(authenticatedVendorGate, "fallback requires both an authenticated id and vendor role")
      .toBeGreaterThan(authenticatedUserLookup);
    expect(sessionOwnershipLookup, "session binding still runs after the fallback")
      .toBeGreaterThan(authenticatedVendorGate);
    expect(crossOwnerRejection, "a different prototype account remains rejected")
      .toBeGreaterThan(sessionOwnershipLookup);
    expect(core).toMatch(/account_role:\s*["']vendor["'][\s\S]{0,120}is_fictional:\s*true/);
    expect(core).not.toMatch(/account\?\.account_role\s*===\s*["']vendor["'][\s\S]{0,160}auth\.me\s*\(\)/);
  });

  it("makes the certification transition closed, explicit, and never an official verification", () => {
    const choose = functionSource("set_certification_status");
    const attest = functionSource("confirm_certification_self_attestation");
    expect(choose).toMatch(/status:\s*z\.literal\(["']not_verified["']\)/);
    expect(choose).not.toMatch(/status:\s*z\.enum/);
    expect(attest).toMatch(/confirmed:\s*z\.literal\(true\)/);
    expect(attest).toMatch(/disclosure_version:\s*z\.literal\(SHOPIFY_DISCLOSURE_VERSION\)/);
    expect(attest).toMatch(/certification_status:\s*["']self_attested_demo["']/);
    expect(attest).not.toMatch(/certified_by_nyc|officially_verified|approved_by_nyc/i);

    const oauth = functionSource("begin_shopify_authorization") + functionSource("complete_shopify_authorization");
    expect(oauth).toMatch(/oauth_disabled_production_pilot/);
    expect(oauth).not.toMatch(/SHOPIFY_OAUTH_CLIENT_SECRET|token exchange|access_token/i);
  });
});

describe("prepared Shopify test-store integrity", () => {
  it("runtime-validates every successful public result before serialization", () => {
    const core = read("base44/shared/shopifyCore.ts");
    expect(SUCCESS_SHOPIFY_FUNCTIONS).toHaveLength(17);
    expect(core).toMatch(/function\s+assertPublicJsonValue\s*\(/);
    expect(core).toMatch(/export function\s+assertPublicServiceOutput\s*\(/);
    expect(core).toMatch(/PublicProvenanceOutput\s*=\s*z\.discriminatedUnion[\s\S]*\.strict\(\)/);
    expect(core).toMatch(/export function\s+parseShopifyOutput<[\s\S]*schema\.safeParse\(value\)/);
    expect(core).toMatch(
      /jsonOk<[\s\S]*parseShopifyOutput\(PublicProvenanceOutput,\s*provenance\)[\s\S]*assertPublicServiceOutput\(data,\s*strictProvenance\)[\s\S]*Response\.json/,
    );
    expect(core).toMatch(/PUBLIC_PROVENANCE_MODES[\s\S]*shopify_test_store[\s\S]*fixture[\s\S]*unavailable/);
    expect(core).toMatch(/normalizedKey\s*=\s*key\.replace\(\/\(\[a-z0-9\]\)\(\[A-Z\]\)\/g/);
    expect(core).toMatch(/FORBIDDEN_PUBLIC_OUTPUT_KEY/);
    for (const forbidden of ["access_token", "refresh_token", "secret", "password", "shopify_cart_id"]) {
      expect(core, `runtime output gate blocks ${forbidden}`).toContain(forbidden);
    }
    expect(core).toMatch(/Number\.isFinite\(value\)/);
    expect(core).toMatch(/MAX_PUBLIC_OUTPUT_BYTES/);
    expect(core).toMatch(/const ErrorOutput = z\.object\([\s\S]*\)\.strict\(\)[\s\S]*parseShopifyOutput\(ErrorOutput/);

    for (const name of SUCCESS_SHOPIFY_FUNCTIONS) {
      const source = functionSource(name);
      expect(source, `${name} parses endpoint-specific success data`).toMatch(/parseShopifyOutput\s*\(/);
      expect(source, `${name} validates before returning jsonOk`).toMatch(
        /jsonOk\(\s*parseShopifyOutput\s*\(/,
      );
    }
    for (const name of FAIL_CLOSED_SHOPIFY_FUNCTIONS) {
      expect(functionSource(name), `${name} remains fail-closed with no success envelope`).not.toMatch(/jsonOk\s*\(/);
    }
  });

  it("pins the current stable API and validates both APIs, scopes, publication, and returned version", () => {
    const core = read("base44/shared/shopifyCore.ts");
    const connect = functionSource("connect_prepared_shopify_store");
    expect(core).toMatch(/SHOPIFY_API_VERSION\s*=\s*["']2026-07["']/);
    expect(core).not.toMatch(/\/api\/(?:latest|unstable)\//);
    expect(core).toMatch(/SHOPIFY_STORE_DOMAIN/);
    expect(core).toMatch(/SHOPIFY_ADMIN_ACCESS_TOKEN/);
    expect(core).toMatch(/SHOPIFY_STOREFRONT_ACCESS_TOKEN/);
    expect(core).toMatch(/SHOPIFY_API_VERSION/);
    expect(core).toMatch(/SHOPIFY_PUBLICATION_ID/);
    expect(core).toMatch(/x-shopify-api-version/);
    expect(core).toMatch(/returnedVersion\s*!==\s*apiVersion/);

    for (const scope of ["write_products", "read_publications", "write_publications"]) {
      expect(connect, `prepared connection probes ${scope}`).toContain(scope);
    }
    const adminProbe = connect.indexOf("await adminGraphQL");
    const storefrontProbe = connect.indexOf("await storefrontGraphQL");
    const connectionWrite = connect.indexOf("await upsertConnection");
    const activationWrite = connect.indexOf("await updateAccess");
    expect(adminProbe).toBeGreaterThan(-1);
    expect(storefrontProbe).toBeGreaterThan(adminProbe);
    expect(connectionWrite).toBeGreaterThan(storefrontProbe);
    expect(activationWrite).toBeGreaterThan(connectionWrite);
  });

  it("treats top-level GraphQL errors, mutation userErrors, scope failures, and version mismatch as failures", () => {
    const core = read("base44/shared/shopifyCore.ts");
    expect(core).toMatch(/body\.errors\?\.length\s*\|\|\s*!body\.data/);
    expect(core).toMatch(/shopify_missing_scope/);
    expect(core).toMatch(/shopify_api_version_mismatch/);
    expect(core).toMatch(/payload\.userErrors\.length\s*>\s*0/);
    expect(core).toMatch(/throw new ShopifyPocError\(["']shopify_user_error["']/);

    for (const name of ["publish_menu_to_shopify", "update_shopify_menu_item", "create_shopify_cart"]) {
      expect(functionSource(name), `${name} checks mutation userErrors`).toMatch(/assertNoUserErrors\s*\(/);
    }
  });

  it("keeps live failure unavailable and exposes fixture storefront data only by an explicit sample request", () => {
    const storefront = functionSource("get_vendor_storefront");
    const sampleBranch = storefront.indexOf("input.sample_mode === true");
    const liveGate = storefront.indexOf("const gate = await requirePublishedStorefront");
    expect(sampleBranch).toBeGreaterThan(-1);
    expect(liveGate).toBeGreaterThan(sampleBranch);
    expect(storefront).toMatch(/Explicit user-selected sample storefront/);
    expect(storefront).toMatch(/jsonError\(error,[\s\S]*storefront_unavailable/);

    const hook = read("src/components/shopify/useShopifyPoc.js");
    expect(hook).toMatch(/if \(sample\)[\s\S]*sampleStorefront/);
    expect(hook).toMatch(/sample_mode:\s*false/);
    expect(hook).toMatch(/status:\s*["']unavailable["']/);
    expect(hook).not.toMatch(/if \(!result\.ok\)[\s\S]{0,220}sampleStorefront/);

    const orders = functionSource("refresh_shopify_orders");
    expect(orders).toMatch(/order_refresh_not_configured/);
    expect(orders).not.toMatch(/jsonOk|orders\s*:\s*\[\]|order_count\s*:\s*0/);
  });
});

describe("exact fixtures, idempotency, and reset", () => {
  it("keeps backend price confirmation aligned with the positive-money UI contract", () => {
    const core = read("base44/shared/shopifyCore.ts");
    expect(core).toMatch(/function\s+normalizePrice[\s\S]*amount\s*<=\s*0[\s\S]*return null/);
  });

  it("matches the server fixture allowlist to the exact bundled bytes and excludes the cart image from menu OCR", () => {
    const expected = {
      "rosa-menu-board-1.svg": sha256("public/shopify-fixtures/rosa-menu-board-1.svg"),
      "rosa-menu-board-2.svg": sha256("public/shopify-fixtures/rosa-menu-board-2.svg"),
      "rosa-cart-photo.svg": sha256("public/shopify-fixtures/rosa-cart-photo.svg"),
    };
    const core = read("base44/shared/shopifyCore.ts");
    for (const [fileName, digest] of Object.entries(expected)) {
      expect(core, `${fileName} exact SHA-256 is allowlisted`).toContain(digest);
    }
    expect(core).toMatch(/fixtureId:\s*["']rosa-cart-photo["'][\s\S]{0,100}kind:\s*["']cart_truck_stand_or_venue["']/);
    expect(core).toMatch(/fixture\.kind\s*!==\s*["']menu_or_price_board["'][\s\S]*fixture_not_matched/);
    expect(core).toMatch(/SHOPIFY_FIXTURE_HASHES\[hash as FixtureHash\]\s*\?\?\s*null/);

    const extraction = functionSource("extract_menu_photos");
    expect(extraction).toMatch(/media\.every\([\s\S]*fixtureForHash/);
    expect(extraction).toMatch(/catch\s*\{[\s\S]*ai_unavailable/);
    expect(extraction).not.toMatch(/catch\s*\{[\s\S]{0,220}fixtureMenuForMedia/);
  });

  it("publishes idempotently through a stable mapping, preserves partial work, and reports per-item failures", () => {
    const publish = functionSource("publish_menu_to_shopify");
    expect(publish).toMatch(/deterministicProductHandle\(input\.demo_session_id,\s*item\.localItemKey\)/);
    expect(publish).toMatch(/local_item_key:\s*item\.localItemKey/);
    expect(publish).toMatch(/identifier:\s*\$identifier/);
    expect(publish).toMatch(/\{\s*id:\s*mapping\.shopify_product_id\s*\}/);
    expect(publish).toMatch(/\{\s*handle\s*\}/);
    expect(publish).toMatch(/publication_status:\s*["']draft_created["']/);
    expect(publish).toMatch(/publication_status:\s*["']published["']/);
    expect(publish).toMatch(/publication_status:\s*["']sync_failed["']/);
    expect(publish).toMatch(/status:\s*["']failed["'],\s*error_code/);
    expect(publish).toMatch(/partially_published/);
    expect(publish).toMatch(/publishedOnPublication\s*!==\s*true/);

    const draftWrite = publish.indexOf('publication_status: "draft_created"');
    const publicationCall = publish.indexOf("mutation SidewalkPublish");
    expect(draftWrite).toBeGreaterThan(-1);
    expect(publicationCall).toBeGreaterThan(draftWrite);
  });

  it("returns only an opaque cart handle and resolves the secret-bearing Shopify cart ID server-side", () => {
    const create = functionSource("create_shopify_cart");
    const checkout = functionSource("get_shopify_checkout_url");
    const cartEntity = entitySchema(ENTITY_FILES.ShopifyCartSession);
    expect(cartEntity.properties).toHaveProperty("cart_handle");
    expect(cartEntity.properties).toHaveProperty("shopify_cart_id");
    for (const operation of ["create", "read", "update", "delete"]) {
      expect(cartEntity.rls[operation].user_condition).toEqual({ role: "admin" });
    }
    expect(create).toMatch(/shopify_cart_id:\s*cart\.id/);
    expect(create).toMatch(/cart_handle:\s*cartHandle/);
    expect(create).not.toMatch(/jsonOk\(\{[\s\S]{0,500}shopify_cart_id/);
    expect(checkout).toMatch(/cart_handle:\s*input\.cart_handle/);
    expect(checkout).toMatch(/cartId:\s*cartSession\.shopify_cart_id/);
    expect(checkout).toMatch(/TEST CHECKOUT — NO REAL CHARGE/);
  });

  it("resets only the current session, restores the locked seed, and never pretends Shopify cleanup occurred", () => {
    const reset = functionSource("reset_shopify_demo");
    for (const entityName of Object.keys(ENTITY_FILES)) {
      expect(reset, `reset deletes ${entityName} only by demo_session_id`).toMatch(
        new RegExp(`${entityName}[^;]+deleteMany\\(\\{\\s*demo_session_id:\\s*input\\.demo_session_id\\s*\\}\\)`),
      );
    }
    expect(reset).toMatch(/certification_status:\s*["']unanswered["']/);
    expect(reset).toMatch(/selling_access_state:\s*["']locked_needs_status["']/);
    expect(reset).toMatch(/external_cleanup_performed:\s*false/);
    expect(reset).not.toMatch(/adminGraphQL|storefrontGraphQL|publishableUnpublish|productDelete/);

    const legacyReset = read("base44/functions/reset_demo_session/entry.ts");
    for (const entityName of Object.keys(ENTITY_FILES)) {
      expect(legacyReset, `legacy session reset includes ${entityName}`).toContain(
        `entities.${entityName}.deleteMany({ demo_session_id: demoSessionId })`,
      );
    }
  });
});
