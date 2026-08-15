import { expect, test } from "@playwright/test";

import { resources } from "../../src/i18n/resources.js";
import { PROTOTYPE_ACCOUNT_STORAGE_KEY } from "../../src/lib/marketplaceAccount.js";
import { SHOPIFY_DEMO_CONTEXT_STORAGE_KEY } from "../../src/lib/shopifyPoc.js";

const LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

async function forceSampleMode(
  page,
  {
    safetySeen = true,
    accountRole = null,
    accountLocale = "es",
    bootstrapVendorSession = false,
  } = {},
) {
  await page.addInitScript(
    ({ shouldSkipSafety, role, locale, storageKey, shopifyContextKey }) => {
      if (shouldSkipSafety) window.sessionStorage.setItem("sidewalk-safety-seen", "yes");
      const prototypeAccountId = "proto_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
      if (role) {
        window.localStorage.setItem(storageKey, JSON.stringify({
          schema_version: 1,
          prototype_account_id: prototypeAccountId,
          account_role: role,
          locale,
          is_fictional: true,
          created_at: "2026-08-15T12:00:00.000Z",
          updated_at: "2026-08-15T12:00:00.000Z",
        }));
        if (role === "vendor") {
          window.localStorage.setItem(shopifyContextKey, JSON.stringify({
            schema_version: 1,
            demo_session_id: "E2E-LOCALE",
            prototype_account_id: prototypeAccountId,
            locale,
            created_at: "2026-08-15T12:00:00.000Z",
          }));
        }
      }
      const accessKey = "sidewalk-shopify-e2e-access";
      if (!window.localStorage.getItem(accessKey)) {
        window.localStorage.setItem(accessKey, JSON.stringify({
          certification_status: role === "vendor" ? "not_verified" : "unanswered",
          selling_access_state: role === "vendor" ? "locked_needs_certification" : "locked_needs_status",
          shopify_setup_state: "not_started",
        }));
      }
      window.__SIDEWALK_SHOPIFY_TEST_INVOKE__ = async (name) => {
        window.__SIDEWALK_SHOPIFY_E2E_CALLS__ = window.__SIDEWALK_SHOPIFY_E2E_CALLS__ || [];
        window.__SIDEWALK_SHOPIFY_E2E_CALLS__.push(name);
        const access = JSON.parse(window.localStorage.getItem(accessKey));
        const provenance = { mode: "simulated", source: "Playwright fictional demo state", retrievedAt: new Date().toISOString() };
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
        if (name === "begin_shopify_signup") return { ok: true, data: { setup_state: "signup_started", merchant_action_required: true, signup_url: "https://www.shopify.com/store-login" }, provenance };
        return { ok: false, error: "e2e_unavailable", provenance: { ...provenance, mode: "unavailable" } };
      };
    },
    {
      shouldSkipSafety: safetySeen,
      role: accountRole,
      locale: accountLocale,
      storageKey: PROTOTYPE_ACCOUNT_STORAGE_KEY,
      shopifyContextKey: SHOPIFY_DEMO_CONTEXT_STORAGE_KEY,
    },
  );
  const backendRequests = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isBackendRequest = ["fetch", "xhr"].includes(request.resourceType());
    const isExternalAsset = url.hostname !== "127.0.0.1" && url.hostname !== "localhost";
    if (isBackendRequest) backendRequests.push({ method: request.method(), pathname: url.pathname });
    if (bootstrapVendorSession && isBackendRequest && url.pathname.endsWith("/functions/start_demo_session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            demo_session_id: "E2E-FIRST-RUN",
            session_code: "E2E-FIRST-RUN",
            locale: accountLocale,
            started_at: "2026-08-15T12:00:00.000Z",
            qr_url: `/?view=vendor&demo_session_id=E2E-FIRST-RUN&lang=${encodeURIComponent(accountLocale)}`,
          },
          provenance: {
            mode: "fixture",
            source: "Playwright first-run session fixture",
            retrievedAt: "2026-08-15T12:00:00.000Z",
            fixtureId: "e2e-first-run",
          },
        }),
      });
      return;
    }
    if (isBackendRequest || isExternalAsset) await route.abort("internetdisconnected");
    else await route.continue();
  });
  return { backendRequests };
}

async function expectNoRawTranslationKeys(page) {
  const surface = page.getByTestId("vendor-surface");
  const text = await surface.innerText();
  expect(text).not.toMatch(
    /\b(?:common|vendor|console|safety|guidance|errors|proof|roadmap|marketplace|shopify)[.:][a-z][\w.-]+\b/,
  );
}

async function createMarketplaceAccount(
  page,
  role,
  locale = "en",
  { injectVendorContext = true } = {},
) {
  const marketplace = resources[locale].marketplace;
  const roleSelection = page.getByTestId("role-selection");
  await expect(roleSelection).toBeVisible();
  await expect(roleSelection).toContainText(marketplace.roleHeading);
  await expect(roleSelection).toContainText(marketplace.buyDescription);
  await expect(roleSelection).toContainText(marketplace.sellDescription);

  await page.getByTestId("role-option-" + role).click();
  const setup = page.getByTestId("prototype-account-setup");
  await expect(setup).toBeVisible();
  await expect(setup).toContainText(marketplace.accountHeading);
  await expect(setup).toContainText(marketplace.accountIntro);
  await expect(page.getByTestId("prototype-role")).toContainText(
    role === "buyer" ? marketplace.buyerRole : marketplace.vendorRole,
  );
  await expect(
    setup.locator('input[type="email"], input[type="password"], input[name*="phone"]'),
  ).toHaveCount(0);
  await page.getByTestId("create-prototype-account").click();

  const shell = page.getByTestId("marketplace-shell");
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute("data-role", role);
  if (role === "vendor" && injectVendorContext) {
    await page.evaluate(({ accountKey, contextKey }) => {
      const account = JSON.parse(window.localStorage.getItem(accountKey));
      window.localStorage.setItem(contextKey, JSON.stringify({
        schema_version: 1,
        demo_session_id: "E2E-FIRST-RUN",
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

function marketplaceProviderPattern() {
  return /(?:api\.stripe\.com|paypal\.com\/sdk|squareup(?:sandbox)?\.com|api\.twilio\.com|shopify\.com\/api|api\.shippo\.com|api\.easypost\.com)/i;
}

for (const locale of LOCALES) {
  test(`${locale} completes the offline sample journey`, async ({ page }) => {
    await forceSampleMode(page, {
      safetySeen: false,
      accountRole: "vendor",
      accountLocale: locale,
    });
    await page.goto(
      `/?workspace=get-verified&demo_session_id=E2E-LOCALE&lang=${encodeURIComponent(locale)}`,
      { waitUntil: "domcontentloaded" },
    );

    const safetyDialog = page.getByRole("dialog");
    await expect(safetyDialog).toBeVisible();
    await expect(safetyDialog).toContainText(resources[locale].safety.title);
    await expect(safetyDialog).toContainText(resources[locale].safety.body);
    await page.getByRole("button", { name: resources[locale].safety.continue }).click();
    await expect(safetyDialog).toBeHidden();

    await expect(page.getByTestId("vendor-surface")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(page.getByTestId("vendor-language-select")).toHaveValue(locale);
    await expect(page.getByTestId("vendor-surface")).toContainText(resources[locale].vendor.need);

    await page.getByTestId("sample-question").click();
    await expect(page.getByTestId("guidance-result")).toBeVisible();
    await expect(page.getByTestId("guidance-result")).toContainText(
      resources[locale].vendor.sampleQuestion,
    );

    await page.getByTestId("vendor-tab-check").click();
    await expect(page.getByTestId("vendor-surface")).toContainText(resources[locale].vendor.checkTitle);
    await page.getByTestId("sample-summons").click();
    await expect(page.getByTestId("ticket-number")).toHaveValue("3508821A0");
    await expect(page.getByTestId("ticket-number")).toHaveCSS("direction", "ltr");
    await page.getByTestId("check-public-records").click();
    await expect(page.getByTestId("lookup-result")).toHaveClass(/unavailable/);
    await expect(page.getByTestId("sample-lookup-result")).toBeVisible();
    await page.getByTestId("sample-lookup-result").click();
    await expect(page.getByTestId("lookup-result")).toHaveClass(/ok/);

    await page.getByTestId("vendor-tab-sales").click();
    await expect(page.getByTestId("vendor-surface")).toContainText(resources[locale].vendor.salesTitle);
    const evidenceRows = page.getByTestId("evidence-list").locator(".evidence-row");
    const evidenceCountBefore = await evidenceRows.count();
    await page.getByTestId("sample-cash-sale").click();
    await expect(page.getByTestId("cash-confirmation")).toBeVisible();
    await expect(evidenceRows).toHaveCount(evidenceCountBefore);
    await page.getByTestId("confirm-cash-sale").click();
    await expect(evidenceRows).toHaveCount(evidenceCountBefore + 1);
    await expect(page.getByTestId("evidence-list")).toContainText("12");
    await expect(page.getByTestId("evidence-list").locator(".evidence-icon.cash")).toHaveCount(1);
    await expect(page.getByTestId("evidence-list").locator(".evidence-icon.card")).toHaveCount(1);
    await expect(page.getByTestId("evidence-list")).toContainText(resources[locale].vendor.confirmed);
    await expect(page.getByTestId("evidence-list")).toContainText(resources[locale].vendor.simulatedCard);

    await expectNoRawTranslationKeys(page);
  });
}

test("vendor layout renders without horizontal overflow at target widths", async ({ page }) => {
  await forceSampleMode(page, { accountRole: "vendor", accountLocale: "ar" });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    await page.goto("/?workspace=get-verified&demo_session_id=E2E-WIDTH&lang=ar", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("vendor-surface")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${width}px viewport horizontal overflow`).toBeLessThanOrEqual(1);
  }
});

test("vendor role and verification locale survive refresh without exposing internal views", async ({ page }) => {
  await forceSampleMode(page, { accountRole: "vendor", accountLocale: "es" });
  await page.goto("/?workspace=get-verified&demo_session_id=E2E-PERSIST&lang=es", {
    waitUntil: "domcontentloaded",
  });
  const selector = page.getByTestId("vendor-language-select");
  await selector.selectOption("fr");
  await expect(selector).toHaveValue("fr");
  await expect(page).toHaveURL(/(?:\?|&)lang=fr(?:&|$)/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "vendor");
  await expect(page.getByTestId("vendor-language-select")).toHaveValue("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByTestId("console-surface")).toHaveCount(0);
  await expect(page.getByTestId("proof-surface")).toHaveCount(0);
  await expect(page.getByRole("button", { name: resources.fr.common.consoleView })).toHaveCount(0);
  await expect(page.getByRole("button", { name: resources.fr.common.proofView })).toHaveCount(0);
});

test("routine guidance stays self-service and exceptional questions abstain", async ({ page }) => {
  await forceSampleMode(page, { accountRole: "vendor", accountLocale: "en" });
  await page.goto("/?workspace=get-verified&demo_session_id=E2E-SELF-SERVICE&lang=en", {
    waitUntil: "domcontentloaded",
  });

  await page.getByTestId("sample-question").click();
  const routineResult = page.getByTestId("guidance-result");
  await expect(routineResult).toBeVisible();
  await expect(page.getByTestId("source-linked-checklist")).toBeVisible();
  await expect(routineResult).toContainText(resources.en.guidance.routineReviewOptional);
  await expect(routineResult).not.toContainText(resources.en.guidance.abstainAnswer);
  await expect(routineResult).not.toHaveClass(/abstained/);

  const typedQuestion = page.getByRole("textbox", { name: resources.en.vendor.typeQuestion });
  await typedQuestion.fill("Can you guarantee that NYC will approve my license?");
  await page.getByRole("button", { name: resources.en.vendor.sendQuestion }).click();

  const abstention = page.getByTestId("guidance-result");
  await expect(abstention).toHaveClass(/abstained/);
  await expect(abstention).toContainText(resources.en.guidance.abstainAnswer);
  await expect(abstention).not.toContainText(resources.en.guidance.routineReviewOptional);
});

test("help routing explains verified destinations and prepares a local-only handoff", async ({ page }) => {
  const attemptedRequests = [];
  page.on("request", (request) => {
    if (["fetch", "xhr", "websocket"].includes(request.resourceType())) {
      attemptedRequests.push(request.url());
    }
  });
  await forceSampleMode(page, { accountRole: "vendor", accountLocale: "en" });
  await page.goto("/?workspace=get-verified&demo_session_id=E2E-REFERRALS&lang=en", {
    waitUntil: "domcontentloaded",
  });

  const help = page.getByTestId("get-more-help");
  await expect(help).toBeVisible();
  const requestCountBeforeHelp = attemptedRequests.length;
  await help.locator(":scope > button").click();

  const verifiedRoutes = [
    {
      id: "summons",
      destination: /OATH Help Center/i,
      url: "https://www.nyc.gov/site/oath/help-center/help-center.page",
      phone: "(212) 436-0845",
      caveat: /procedural|hearing process/i,
      limit: /legal advice or representation/i,
    },
    {
      id: "legal",
      destination: /Street Vendor Project/i,
      url: "https://www.streetvendor.org/legal-assistance",
      phone: "646-602-5679",
    },
    {
      id: "business",
      destination: /Office of Street Vendor Services/i,
      url: "https://nyc-business.nyc.gov/nycbusiness/business-services/initiatives/street-vending-in-nyc",
      phone: "888-727-4692",
    },
  ];

  for (const route of verifiedRoutes) {
    await page.getByTestId(`help-route-${route.id}`).click();
    const destination = page.getByTestId("referral-destination");
    await expect(destination).toContainText(route.destination);
    await expect(destination).toContainText(resources.en.vendor.helpWhy);
    await expect(destination).toContainText(resources.en.vendor.helpCan);
    await expect(destination).toContainText(resources.en.vendor.helpCannot);
    await expect(destination).toContainText(resources.en.vendor.helpBring);
    await expect(destination).toContainText(resources.en.vendor.helpNoAffiliation);
    await expect(destination).toContainText(resources.en.vendor.officialContactVerified);
    await expect(destination).not.toContainText(resources.en.vendor.officialNeedsVerification);
    await expect(destination).toContainText(route.phone);
    if (route.caveat) await expect(destination).toContainText(route.caveat);
    if (route.limit) await expect(destination).toContainText(route.limit);

    const href = await page.getByTestId("official-referral-link").getAttribute("href");
    expect(new URL(href).toString()).toBe(new URL(route.url).toString());
  }

  await page.getByTestId("help-route-official").click();
  const officialDestination = page.getByTestId("referral-destination");
  await expect(officialDestination).toContainText(/NYC Health Department|Department of Health and Mental Hygiene|DOHMH/i);
  await expect(officialDestination).toContainText(/NYC DCWP|Department of Consumer and Worker Protection|DCWP/i);
  await expect(officialDestination).toContainText(resources.en.vendor.helpWhy);
  await expect(officialDestination).toContainText(resources.en.vendor.helpCan);
  await expect(officialDestination).toContainText(resources.en.vendor.helpCannot);
  await expect(officialDestination).toContainText(resources.en.vendor.helpBring);
  await expect(officialDestination).toContainText(resources.en.vendor.helpNoAffiliation);
  await expect(officialDestination).toContainText(resources.en.vendor.officialContactVerified);
  await expect(officialDestination).not.toContainText(resources.en.vendor.officialNeedsVerification);
  await expect(officialDestination).toContainText("311");
  await expect(officialDestination).toContainText("(212) 487-4075");
  await expect(page.getByTestId("official-referral-link")).toHaveAttribute(
    "href",
    "https://www.nyc.gov/site/doh/business/permits-licenses.page",
  );
  await expect(page.getByTestId("dcwp-official-referral-link")).toHaveAttribute(
    "href",
    "https://www.nyc.gov/site/dca/businesses/license-checklist-general-vendor.page",
  );

  await page.getByTestId("help-route-legal").click();
  await page.getByTestId("prepare-handoff").click();
  const handoff = page.getByTestId("handoff-preview");
  await expect(handoff).toBeVisible();
  await expect(handoff).toContainText(/Street Vendor Project/i);
  await expect(handoff).toContainText(resources.en.vendor.helpNoTransmit);
  await expect(handoff.getByRole("button")).toHaveCount(0);
  const requestsDuringHelp = attemptedRequests.slice(requestCountBeforeHelp);
  expect(requestsDuringHelp.filter((url) => {
    const target = new URL(url);
    return !["127.0.0.1", "localhost"].includes(target.hostname);
  })).toEqual([]);
});

test("first-run buyer onboarding reaches truthful empty states and keeps its role", async ({ page }) => {
  const attemptedProviderRequests = [];
  page.on("request", (request) => {
    if (marketplaceProviderPattern().test(request.url())) attemptedProviderRequests.push(request.url());
  });
  await forceSampleMode(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("marketplace-root")).toBeVisible();
  const shell = await createMarketplaceAccount(page, "buyer");
  await expect(shell).toHaveAttribute("data-workspace", "explore");
  await expect(page.getByTestId("buyer-navigation")).toBeVisible();
  await expect(page.getByTestId("vendor-navigation")).toHaveCount(0);
  await expect(page.getByTestId("buyer-explore")).toContainText(
    resources.en.marketplace.buyerExploreTitle,
  );
  await expect(page.getByTestId("marketplace-empty-state")).toContainText(
    resources.en.marketplace.buyerEmpty,
  );
  await expect(page.getByTestId("marketplace-empty-state")).toContainText(
    resources.en.marketplace.buyerEmptySecondary,
  );
  await expect(
    page.getByTestId("buyer-explore").getByRole("button", { name: /buy|checkout|order now/i }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("buyer-explore").locator("[data-store-id], [data-product-id], [data-order-id]"),
  ).toHaveCount(0);

  await page.getByTestId("nav-orders").click();
  await expect(shell).toHaveAttribute("data-workspace", "orders");
  // Order history opens seeded with one demo order (Ming's, lamb skewers);
  // it stays session-only and carries no real order machinery.
  await expect(page.getByTestId("buyer-orders-list")).toContainText("Lamb skewers (2)");
  await expect(page.getByTestId("buyer-orders-list")).toContainText("Ming's Chinese Skewers");
  await expect(page.getByTestId("buyer-orders").locator("[data-order-id]")).toHaveCount(0);

  await page.getByTestId("nav-account").click();
  await expect(page.getByTestId("account-role")).toContainText(/buyer/i);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "buyer");
  await expect(page.getByTestId("role-selection")).toHaveCount(0);

  await page.goto("/?workspace=seller-dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "buyer");
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-workspace", "explore");
  await expect(page.getByTestId("seller-dashboard")).toHaveCount(0);
  await expect(page.getByTestId("vendor-navigation")).toHaveCount(0);
  expect(attemptedProviderRequests).toEqual([]);

  await page.getByTestId("nav-account").click();
  await page.getByTestId("logout").click();
  await expect(page.getByTestId("role-selection")).toBeVisible();
});

test("first-run vendor onboarding marks unloaded metrics unavailable and embeds verification preparation", async ({ page }) => {
  const attemptedProviderRequests = [];
  page.on("request", (request) => {
    if (marketplaceProviderPattern().test(request.url())) attemptedProviderRequests.push(request.url());
  });
  await forceSampleMode(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const shell = await createMarketplaceAccount(page, "vendor");
  await expect(shell).toHaveAttribute("data-workspace", "dashboard");
  await expect(page.getByTestId("vendor-navigation")).toBeVisible();
  await expect(page.getByTestId("buyer-navigation")).toHaveCount(0);
  const dashboard = page.getByTestId("seller-dashboard");
  await expect(dashboard).toBeVisible();
  await expect(page.getByTestId("seller-store-status")).toContainText(resources.en.shopify.notConnected);
  await expect(page.getByTestId("seller-orders-count")).toHaveText(resources.en.shopify.unavailableBadge);
  await expect(page.getByTestId("seller-sales-total")).toHaveText(resources.en.shopify.unavailableBadge);
  await expect(page.getByTestId("seller-products-count")).toHaveText(resources.en.shopify.unavailableBadge);
  await expect(page.getByTestId("seller-verification-status")).toContainText(resources.en.shopify.sellingLocked);
  await expect(page.getByTestId("nav-get-verified")).toHaveCount(0);
  await expect(page.getByTestId("certification-gate")).toBeVisible();
  await expect(dashboard).toContainText(resources.en.marketplace.noActivityNote);
  await expect(
    dashboard.locator("[data-customer-id], [data-order-id], [data-product-id], [data-store-id]"),
  ).toHaveCount(0);

  await page.getByTestId("nav-orders").click();
  await expect(page.getByTestId("seller-orders-empty")).toContainText(
    "New orders will appear here once your store is live.",
  );
  await expect(
    page.getByTestId("seller-orders").getByRole("button", {
      name: /fulfill|refund|message|pay|deliver/i,
    }),
  ).toHaveCount(0);

  await page.getByTestId("nav-dashboard").click();
  await page.getByTestId("certification-help").click();
  await expect(shell).toHaveAttribute("data-workspace", "get-verified");
  await expect(page.getByTestId("seller-get-verified")).toBeVisible();
  await expect(page.getByTestId("embedded-verification")).toBeVisible();
  await expect(page.getByTestId("vendor-surface")).toBeVisible();
  await expect(page.getByTestId("vendor-tab-ask")).toBeVisible();
  await expect(page.getByTestId("vendor-tab-check")).toBeVisible();
  await expect(page.getByTestId("vendor-tab-sales")).toBeVisible();
  await expect(page.getByTestId("get-more-help")).toBeVisible();
  await expect(page.getByTestId("console-surface")).toHaveCount(0);
  await expect(page.getByTestId("proof-surface")).toHaveCount(0);
  await expect(page.getByRole("button", { name: resources.en.common.consoleView })).toHaveCount(0);
  await expect(page.getByRole("button", { name: resources.en.common.proofView })).toHaveCount(0);

  await page.getByTestId("sample-question").click();
  await expect(page.getByTestId("source-linked-checklist")).toBeVisible();
  await page.getByTestId("nav-account").click();
  await expect(page.getByTestId("account-role")).toContainText(/vendor/i);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "vendor");
  await expect(page.getByTestId("role-selection")).toHaveCount(0);

  await page.goto("/?workspace=explore", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-role", "vendor");
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-workspace", "dashboard");
  await expect(page.getByTestId("buyer-explore")).toHaveCount(0);
  await expect(page.getByTestId("buyer-navigation")).toHaveCount(0);
  expect(attemptedProviderRequests).toEqual([]);
});

test("buyer marketplace has no horizontal overflow at 320 and 390 pixels", async ({ page }) => {
  await forceSampleMode(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("role-selection")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      "role selection at " + width + "px",
    ).toBeLessThanOrEqual(1);
    await page.getByTestId("role-option-buyer").click();
    await expect(page.getByTestId("prototype-account-setup")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      "prototype account setup at " + width + "px",
    ).toBeLessThanOrEqual(1);
    await page.getByTestId("account-setup-back").click();
  }

  await createMarketplaceAccount(page, "buyer");

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const destination of ["nav-explore", "nav-street-rules", "nav-orders", "nav-account"]) {
      await page.getByTestId(destination).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "buyer " + destination + " at " + width + "px").toBeLessThanOrEqual(1);
    }
  }
});

test("seller marketplace has no horizontal overflow at 320 and 390 pixels", async ({ page }) => {
  await forceSampleMode(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createMarketplaceAccount(page, "vendor");

  await page.getByTestId("certification-help").click();
  await expect(page.getByTestId("nav-get-verified")).toBeVisible();

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const destination of ["nav-dashboard", "nav-street-rules", "nav-orders", "nav-get-verified", "nav-account"]) {
      await page.getByTestId(destination).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "vendor " + destination + " at " + width + "px").toBeLessThanOrEqual(1);
    }
  }
});

test("vendor certification to explicit Shopify sample preview remains locked and truthful", async ({ page }) => {
  await forceSampleMode(page, { accountRole: "vendor", accountLocale: "en" });
  await page.goto("/?workspace=get-verified&demo_session_id=E2E-SHOPIFY&lang=en", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByTestId("seller-get-verified")).toBeVisible();
  await expect(page.getByTestId("nav-get-verified")).toBeVisible();
  await expect(page.getByTestId("nav-online-store")).toHaveCount(0);

  await page.getByTestId("certification-complete-button").click();
  const dialog = page.getByTestId("certification-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("certification-submit")).toBeDisabled();
  await page.getByTestId("certification-confirmation").check();
  await page.getByTestId("certification-submit").click();

  await expect(page.getByTestId("vendor-online-store")).toBeVisible();
  await expect(page.getByTestId("nav-online-store")).toBeVisible();
  await expect(page.getByTestId("nav-get-verified")).toHaveCount(0);
  await expect(page.getByTestId("shopify-provenance-badge")).toContainText(
    resources.en.shopify.simulatedBadge,
  );
  await expect(page.getByTestId("shopify-provenance-badge")).toHaveAttribute(
    "data-provenance-mode",
    "simulated",
  );
  await expect(page.getByTestId("shopify-setup")).not.toContainText(
    resources.en.shopify.sampleBadge,
  );
  await page.getByTestId("connect-prepared-store").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("view-sample-store")).toBeVisible();
  await expect(page.getByTestId("shopify-provenance-badge")).toHaveAttribute(
    "data-provenance-mode",
    "unavailable",
  );
  await expect(page.getByTestId("shopify-setup")).not.toContainText(
    resources.en.shopify.sampleBadge,
  );

  await page.getByTestId("view-sample-store").click();
  await expect(page.getByTestId("selling-access-badge")).toContainText(resources.en.shopify.sellingLocked);
  await expect(page.getByTestId("shopify-provenance-badge").first()).toHaveAttribute("data-provenance-mode", "fixture");
  await expect(page.getByTestId("menu-review")).toHaveCount(0);

  await page.getByTestId("load-shopify-menu-fixtures").click();
  await expect(page.getByTestId("media-card-fixture-menu-board-1")).toBeVisible();
  await expect(page.getByTestId("media-card-fixture-menu-board-2")).toBeVisible();
  await expect(page.getByTestId("media-card-fixture-cart-photo")).toBeVisible();
  await page.getByTestId("approve-media-fixture-cart-photo").check();
  await page.getByTestId("confirm-media-kinds").click();

  const review = page.getByTestId("menu-review");
  await expect(review).toBeVisible();
  await expect(page.getByTestId("menu-item-tacos_de_pollo")).toContainText("Tacos de pollo");
  await expect(page.getByTestId("menu-item-tamales")).toContainText("Tamales");
  await expect(page.getByTestId("menu-item-agua_jamaica")).toContainText("Agua de jamaica");
  await expect(page.getByTestId("menu-item-empanada_de_queso")).toContainText("Empanada de queso");
  await expect(page.getByTestId("menu-price-elote_preparado")).toHaveValue("");
  await page.getByTestId("menu-price-elote_preparado").fill("5.00");
  await page.getByTestId("menu-item-tamales").getByTestId("duplicate-resolution").locator("select").selectOption("merge");
  for (const key of ["tacos_de_pollo", "tamales", "agua_jamaica", "empanada_de_queso", "elote_preparado"]) {
    await page.getByTestId(`confirm-price-${key}`).check();
  }
  await page.getByTestId("confirm-menu-import").click();
  await expect(page.getByTestId("confirm-menu-import")).toBeDisabled();
  await page.getByTestId("publish-menu").click();

  await expect(page.getByTestId("publish-status")).toHaveAttribute("data-sync-state", "sample_preview");
  await expect(page.getByTestId("publish-status")).toContainText(resources.en.shopify.sampleOnly);
  await expect(page.getByTestId("selling-access-badge")).toContainText(resources.en.shopify.sellingLocked);
  await expect(page.getByTestId("copy-buyer-menu-link")).toBeVisible();
  await expect(page.getByTestId("console-surface")).toHaveCount(0);
  await expect(page.getByTestId("proof-surface")).toHaveCount(0);
});

test("buyer explicitly opens the fictional store and reaches a no-charge sample checkout", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?lang=ar", { waitUntil: "domcontentloaded" });
  await createMarketplaceAccount(page, "buyer", "ar");

  await expect(page.getByTestId("marketplace-empty-state")).toBeVisible();
  await page.getByTestId("view-sample-store").click();
  await expect(page.getByTestId("buyer-storefront")).toBeVisible();
  await expect(page.getByTestId("shopify-provenance-badge").first()).toHaveAttribute("data-provenance-mode", "fixture");
  await page.getByTestId("add-to-cart-tacos_de_pollo").click();
  await expect(page.getByTestId("cart-subtotal")).toContainText("$5.00");
  await page.getByTestId("test-checkout").click();
  await expect(page.getByRole("dialog")).toContainText(resources.ar.shopify.sampleCheckout);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("console-surface")).toHaveCount(0);
  await expect(page.getByTestId("proof-surface")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("first-run vendor No persists the closed certification choice and opens Get Verified", async ({ page }) => {
  const diagnostics = await forceSampleMode(page, {
    accountLocale: "en",
    bootstrapVendorSession: true,
  });
  await page.goto("/?lang=en", { waitUntil: "domcontentloaded" });
  const shell = await createMarketplaceAccount(page, "vendor", "en", {
    injectVendorContext: false,
  });

  await expect.poll(() => new URL(page.url()).searchParams.get("demo_session_id"))
    .toBe("E2E-FIRST-RUN");
  await expect(page.getByTestId("certification-gate"))
    .toHaveAttribute("data-certification-status", "unanswered");
  expect(diagnostics.backendRequests.filter(({ pathname }) =>
    pathname.endsWith("/functions/start_demo_session"))).toHaveLength(1);

  await page.getByTestId("certification-help").click();

  await expect(shell).toHaveAttribute("data-workspace", "get-verified");
  await expect(page.getByTestId("seller-get-verified")).toBeVisible();
  await expect(page.getByTestId("certification-gate").getByRole("alert")).toHaveCount(0);
  expect(await page.evaluate(() => window.__SIDEWALK_SHOPIFY_E2E_CALLS__)).toContain(
    "set_certification_status",
  );
});

test("first-run vendor Yes confirms before opening Online Store and official Shopify login", async ({ page }) => {
  const diagnostics = await forceSampleMode(page, {
    accountLocale: "en",
    bootstrapVendorSession: true,
  });
  await page.goto("/?lang=en", { waitUntil: "domcontentloaded" });
  const shell = await createMarketplaceAccount(page, "vendor", "en", {
    injectVendorContext: false,
  });

  await expect.poll(() => new URL(page.url()).searchParams.get("demo_session_id"))
    .toBe("E2E-FIRST-RUN");
  expect(diagnostics.backendRequests.filter(({ pathname }) =>
    pathname.endsWith("/functions/start_demo_session"))).toHaveLength(1);

  await page.evaluate(() => {
    window.__SIDEWALK_E2E_OPENED_URLS__ = [];
    window.open = (url) => ({
      opener: null,
      closed: false,
      close() { this.closed = true; },
      location: {
        replace(nextUrl) {
          window.__SIDEWALK_E2E_OPENED_URLS__.push(String(nextUrl));
        },
      },
      initialUrl: url,
    });
  });

  await page.getByTestId("certification-yes").click();
  const dialog = page.getByTestId("certification-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("certification-submit")).toBeDisabled();
  expect(await page.evaluate(() => window.__SIDEWALK_SHOPIFY_E2E_CALLS__ || []))
    .not.toContain("confirm_certification_self_attestation");

  await page.getByTestId("certification-confirmation").check();
  await page.getByTestId("certification-submit").click();

  await expect(dialog).toBeHidden();
  await expect(shell).toHaveAttribute("data-workspace", "online-store");
  await expect(page.getByTestId("vendor-online-store")).toBeVisible();
  const calls = await page.evaluate(() => window.__SIDEWALK_SHOPIFY_E2E_CALLS__);
  expect(calls).toContain("confirm_certification_self_attestation");
  expect(calls).toContain("begin_shopify_signup");
  await expect.poll(() => page.evaluate(() => window.__SIDEWALK_E2E_OPENED_URLS__))
    .toEqual(["https://www.shopify.com/store-login"]);
});

test("street rules workspace reports without deciding and never requests a tile server", async ({ page }) => {
  const attemptedRequests = [];
  page.on("request", (request) => attemptedRequests.push(request.url()));
  await forceSampleMode(page, { accountRole: "buyer", accountLocale: "en" });
  await page.goto("/?workspace=street-rules&lang=en", { waitUntil: "domcontentloaded" });

  const marketplace = resources.en.marketplace;
  const workspace = page.getByTestId("buyer-street-rules");
  await expect(workspace).toBeVisible();
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-workspace", "street-rules");
  await expect(page.getByTestId("rules-authority-banner")).toContainText(marketplace.rulesAuthority);

  // Map-first. Tiles are aborted by the offline harness, so the bundled
  // vector floor and every restricted segment must render regardless.
  await expect(page.getByTestId("rules-map-canvas")).toBeVisible();
  await expect(page.locator(".rules-map-canvas.leaflet-container")).toHaveCount(1);
  expect(
    await page.locator(".rules-map-canvas .leaflet-overlay-pane path").count(),
  ).toBeGreaterThan(100);

  // The report panel is report-only, entered deterministically.
  await page.getByTestId("rules-sample-block").click();
  const report = page.getByTestId("rules-report");
  await expect(report).toBeVisible();
  await expect(report).toContainText(marketplace.ruleOnListTitle);
  await expect(report).toContainText(marketplace.ruleNotADecision);
  await expect(report).toContainText(marketplace.caveatScopeMobileFood);
  await expect(report).toContainText(resources.en.common.modeBundledSnapshot);

  // Sample vendors are fictional, labeled, and toggleable; a vendor card
  // never offers commerce, only the rules report for that spot.
  await expect(page.locator("[data-sample-vendor]").first()).toBeVisible();
  await page.locator('[data-sample-vendor="sv-01"]').click();
  const vendorCard = page.getByTestId("rules-vendor-card");
  await expect(vendorCard).toBeVisible();
  await expect(vendorCard).toContainText(marketplace.sampleVendorTitle);

  // The demo menu adds session-only order entries; checkout is an explicit
  // external handoff link (never an in-app payment button).
  await expect(page.getByTestId("rules-vendor-menu")).toBeVisible();
  await expect(vendorCard.getByRole("button", { name: /buy|checkout|order now|pay\b/i })).toHaveCount(0);
  await vendorCard.locator(".rules-simulate-button").first().click();
  const receipts = page.getByTestId("rules-demo-receipts");
  await expect(receipts).toBeVisible();
  await expect(receipts).toContainText(marketplace.orderTotal);
  await expect(page.getByTestId("rules-checkout-link")).toHaveAttribute("href", /myshopify\.com/);

  // The order flows into the buyer Orders workspace, and Explore's vendor
  // cards deep-link back into a street-rules vendor profile.
  await page.getByTestId("nav-orders").click();
  const ordersList = page.getByTestId("buyer-orders-list");
  await expect(ordersList).toBeVisible();
  await expect(ordersList).toContainText(marketplace.orderTotal);
  await expect(page.getByTestId("orders-checkout-link")).toHaveAttribute("href", /myshopify\.com/);
  await page.getByTestId("nav-explore").click();
  await expect(page.getByTestId("explore-vendor-grid")).toBeVisible();
  await expect(page.getByTestId("marketplace-empty-state")).toBeVisible();
  await page.getByTestId("buyer-explore").locator('[data-sample-vendor="sv-15"]').click();
  await expect(page.getByTestId("marketplace-shell")).toHaveAttribute("data-workspace", "street-rules");
  await expect(page.getByTestId("rules-vendor-card")).toContainText("Ming's Chinese Skewers");
  await page.getByTestId("nav-street-rules").click();

  await page.getByTestId("rules-vendors-toggle").click();
  await expect(page.locator("[data-sample-vendor]")).toHaveCount(0);
  await page.getByTestId("rules-vendors-toggle").click();

  // The list view carries every entry and drives the same report panel.
  await page.getByTestId("rules-view-list").click();
  await expect(page.getByTestId("rules-list")).toBeVisible();
  await page.getByTestId("rules-list").locator("button").first().click();
  await expect(report).toBeVisible();

  // Commerce and inventory guards extend to the new surface.
  await expect(
    workspace.getByRole("button", { name: /buy|checkout|order now/i }),
  ).toHaveCount(0);
  await expect(
    workspace.locator("[data-store-id], [data-product-id], [data-order-id], [data-customer-id]"),
  ).toHaveCount(0);
  expect(await workspace.innerText()).not.toMatch(
    /\b(?:common|vendor|console|safety|guidance|errors|proof|roadmap|marketplace)[.:][a-z][\w.-]+\b/,
  );

  // OSM tiles are the sole permitted external dependency (aborted here by
  // the offline harness); everything else stays on this machine, and no
  // commerce provider is ever contacted.
  for (const url of attemptedRequests) {
    const hostname = new URL(url).hostname;
    // OSM tiles and the Google Fonts stylesheet are the only permitted
    // external dependencies (both aborted by the offline harness).
    if (hostname === "tile.openstreetmap.org") continue;
    if (hostname === "fonts.googleapis.com" || hostname === "fonts.gstatic.com") continue;
    expect(hostname, url).toMatch(/^(?:127\.0\.0\.1|localhost)$/);
  }
  expect(attemptedRequests.filter((url) => marketplaceProviderPattern().test(url))).toEqual([]);
});

test("street rules map stays inside the viewport at 320 and 390 pixels in Arabic", async ({ page }) => {
  await forceSampleMode(page, { accountRole: "vendor", accountLocale: "ar" });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?workspace=street-rules&lang=ar", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("seller-street-rules")).toBeVisible();
    await expect(page.getByTestId("rules-map-canvas")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".rules-map-shell")).toHaveAttribute("dir", "ltr");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "street rules at " + width + "px in Arabic").toBeLessThanOrEqual(1);
  }
});

test("street rules framing follows the account role", async ({ page }) => {
  await forceSampleMode(page, { accountRole: "vendor", accountLocale: "en" });
  await page.goto("/?workspace=street-rules&lang=en", { waitUntil: "domcontentloaded" });
  const seller = page.getByTestId("seller-street-rules");
  await expect(seller).toBeVisible();
  await expect(seller).toContainText(resources.en.marketplace.vendorRulesIntro);
  await expect(seller).not.toContainText(resources.en.marketplace.buyerRulesIntro);
  await expect(page.getByTestId("buyer-street-rules")).toHaveCount(0);
});
