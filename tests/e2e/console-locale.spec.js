import { expect, test } from "@playwright/test";

import { resources } from "../../src/i18n/resources.js";
import { PROTOTYPE_ACCOUNT_STORAGE_KEY } from "../../src/lib/marketplaceAccount.js";
import { SHOPIFY_DEMO_CONTEXT_STORAGE_KEY } from "../../src/lib/shopifyPoc.js";

const LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

async function forceSampleMode(page) {
  await page.addInitScript(({ accountKey, contextKey }) => {
    window.sessionStorage.setItem("sidewalk-safety-seen", "yes");
    const accessKey = "sidewalk-shopify-desktop-e2e-access";
    if (!window.localStorage.getItem(accessKey)) {
      window.localStorage.setItem(accessKey, JSON.stringify({
        certification_status: "unanswered",
        selling_access_state: "locked_needs_status",
        shopify_setup_state: "not_started",
      }));
    }
    window.__SIDEWALK_SHOPIFY_TEST_INVOKE__ = async (name) => {
      const access = JSON.parse(window.localStorage.getItem(accessKey));
      const provenance = { mode: "fixture", source: "Playwright fictional demo state", retrievedAt: new Date().toISOString(), fixtureId: "desktop-e2e" };
      const payload = () => ({
        ...access,
        ordering_status: "paused",
        attested_at: access.certification_status === "self_attested_demo" ? "2026-08-15T12:00:00.000Z" : null,
        disclosure_version: access.certification_status === "self_attested_demo" ? "shopify-poc-v1" : null,
        is_fictional: true,
        can_access_get_verified: access.certification_status === "not_verified",
        can_prepare_menu: access.certification_status !== "unanswered",
        can_open_shopify_setup: access.certification_status === "self_attested_demo",
        can_publish: access.selling_access_state === "active_demo",
      });
      if (name === "get_selling_access") return { ok: true, data: payload(), provenance };
      if (name === "set_certification_status") {
        Object.assign(access, { certification_status: "not_verified", selling_access_state: "locked_needs_certification" });
        window.localStorage.setItem(accessKey, JSON.stringify(access));
        return { ok: true, data: payload(), provenance };
      }
      if (name === "confirm_certification_self_attestation") {
        Object.assign(access, { certification_status: "self_attested_demo", selling_access_state: "locked_needs_shopify" });
        window.localStorage.setItem(accessKey, JSON.stringify(access));
        return { ok: true, data: payload(), provenance };
      }
      return { ok: false, error: "e2e_unavailable", provenance: { ...provenance, mode: "unavailable" } };
    };
    window.__SIDEWALK_DESKTOP_CONTEXT_KEYS__ = { accountKey, contextKey };
  }, { accountKey: PROTOTYPE_ACCOUNT_STORAGE_KEY, contextKey: SHOPIFY_DEMO_CONTEXT_STORAGE_KEY });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isBackendRequest = ["fetch", "xhr"].includes(request.resourceType());
    const isExternalAsset = url.hostname !== "127.0.0.1" && url.hostname !== "localhost";
    if (isBackendRequest || isExternalAsset) await route.abort("internetdisconnected");
    else await route.continue();
  });
}

async function createMarketplaceAccount(page, role) {
  await expect(page.getByTestId("role-selection")).toBeVisible();
  await page.getByTestId("role-option-" + role).click();
  await expect(page.getByTestId("prototype-account-setup")).toBeVisible();
  await expect(page.getByTestId("prototype-role")).toContainText(
    role === "buyer"
      ? resources.en.marketplace.buyerRole
      : resources.en.marketplace.vendorRole,
  );
  await page.getByTestId("create-prototype-account").click();
  const shell = page.getByTestId("marketplace-shell");
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute("data-role", role);
  if (role === "vendor") {
    await page.evaluate(({ accountKey, contextKey }) => {
      const account = JSON.parse(window.localStorage.getItem(accountKey));
      window.localStorage.setItem(contextKey, JSON.stringify({
        schema_version: 1,
        demo_session_id: "E2E-DESKTOP",
        prototype_account_id: account.prototype_account_id,
        locale: account.locale,
        created_at: "2026-08-15T12:00:00.000Z",
      }));
    }, { accountKey: PROTOTYPE_ACCOUNT_STORAGE_KEY, contextKey: SHOPIFY_DEMO_CONTEXT_STORAGE_KEY });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(shell).toHaveAttribute("data-role", role);
  }
  return shell;
}

async function expectNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, label).toBeLessThanOrEqual(1);
}

test("first-run role chooser is fully localized across all seven locales", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?lang=en", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-root")).toBeVisible();
  await expect(page.getByTestId("role-selection")).toBeVisible();

  for (const locale of LOCALES) {
    await page.getByTestId("marketplace-language-select").selectOption(locale);
    await expect(page.getByTestId("marketplace-language-select")).toHaveValue(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    const roleSelection = page.getByTestId("role-selection");
    await expect(roleSelection).toContainText(resources[locale].marketplace.roleHeading);
    await expect(roleSelection).toContainText(resources[locale].marketplace.buyChoice);
    await expect(roleSelection).toContainText(resources[locale].marketplace.buyDescription);
    await expect(roleSelection).toContainText(resources[locale].marketplace.sellChoice);
    await expect(roleSelection).toContainText(resources[locale].marketplace.sellDescription);
    const text = await roleSelection.innerText();
    expect(text).not.toMatch(
      /\b(?:common|vendor|console|safety|guidance|errors|proof|roadmap|marketplace)[.:][a-z][\w.-]+\b/,
    );
  }
});

test("desktop buyer shell is role-safe, empty, persistent, and never exposes legacy tools", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?lang=en", { waitUntil: "domcontentloaded" });
  const shell = await createMarketplaceAccount(page, "buyer");

  await expect(shell).toHaveAttribute("data-workspace", "explore");
  await expect(page.getByTestId("buyer-navigation")).toBeVisible();
  await expect(page.getByTestId("vendor-navigation")).toHaveCount(0);
  await expect(page.getByTestId("marketplace-empty-state")).toContainText(
    "Vendor stores will appear here as they join SIDEWALK.",
  );
  await expect(
    page.getByTestId("buyer-explore").locator("[data-store-id], [data-product-id]"),
  ).toHaveCount(0);
  await expect(page.getByTestId("console-surface")).toHaveCount(0);
  await expect(page.getByTestId("proof-surface")).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "desktop buyer Explore");

  await page.getByTestId("nav-orders").click();
  // Order history opens seeded with one demo order; no real order machinery.
  await expect(page.getByTestId("buyer-orders-list")).toContainText("Ming's Chinese Skewers");
  await expect(page.getByTestId("buyer-orders").locator("[data-order-id]")).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "desktop buyer Orders");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "buyer");
  await page.goto("/?workspace=get-verified", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "buyer");
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-workspace", "explore");
  await expect(page.getByTestId("seller-get-verified")).toHaveCount(0);
  await expect(page.getByTestId("console-surface")).toHaveCount(0);
  await expect(page.getByTestId("proof-surface")).toHaveCount(0);
});

test("desktop seller shell marks unloaded metrics unavailable and preserves verification without legacy tools", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?lang=en", { waitUntil: "domcontentloaded" });
  const shell = await createMarketplaceAccount(page, "vendor");

  await expect(shell).toHaveAttribute("data-workspace", "dashboard");
  await expect(page.getByTestId("buyer-navigation")).toHaveCount(0);
  await expect(page.getByTestId("seller-store-status")).toContainText(resources.en.shopify.notConnected);
  await expect(page.getByTestId("seller-orders-count")).toHaveText(resources.en.shopify.unavailableBadge);
  await expect(page.getByTestId("seller-sales-total")).toHaveText(resources.en.shopify.unavailableBadge);
  await expect(page.getByTestId("seller-products-count")).toHaveText(resources.en.shopify.unavailableBadge);
  await expect(page.getByTestId("seller-verification-status")).toContainText(resources.en.shopify.sellingLocked);
  await expect(page.getByTestId("nav-get-verified")).toHaveCount(0);
  await expect(page.getByTestId("certification-gate")).toBeVisible();
  await expectNoHorizontalOverflow(page, "desktop seller Dashboard");

  await page.getByTestId("nav-orders").click();
  await expect(page.getByTestId("seller-orders-empty")).toContainText(
    "New orders will appear here once your store is live.",
  );
  await expect(page.getByTestId("seller-orders").locator("[data-order-id]")).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "desktop seller Orders");

  await page.getByTestId("nav-dashboard").click();
  await page.getByTestId("certification-help").click();
  await expect(page.getByTestId("nav-get-verified")).toBeVisible();
  await expect(page.getByTestId("seller-get-verified")).toContainText(
    resources.en.marketplace.verificationTitle,
  );
  await expect(page.getByTestId("embedded-verification")).toBeVisible();
  await expect(page.getByTestId("vendor-surface")).toBeVisible();
  await expect(page.getByTestId("vendor-language-select")).toBeVisible();
  await expect(page.getByTestId("get-more-help")).toBeVisible();
  await expect(page.getByTestId("console-surface")).toHaveCount(0);
  await expect(page.getByTestId("proof-surface")).toHaveCount(0);
  await expect(page.getByRole("button", { name: resources.en.common.consoleView })).toHaveCount(0);
  await expect(page.getByRole("button", { name: resources.en.common.proofView })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "desktop seller Get Verified");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "vendor");
  await page.goto("/?workspace=explore", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "vendor");
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-workspace", "dashboard");
  await expect(page.getByTestId("buyer-explore")).toHaveCount(0);
  await expect(page.getByTestId("console-surface")).toHaveCount(0);
  await expect(page.getByTestId("proof-surface")).toHaveCount(0);
});
