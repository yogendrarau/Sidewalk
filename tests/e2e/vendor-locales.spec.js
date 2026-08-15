import { expect, test } from "@playwright/test";

import { resources } from "../../src/i18n/resources.js";
import { PROTOTYPE_ACCOUNT_STORAGE_KEY } from "../../src/lib/marketplaceAccount.js";

const LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

async function forceSampleMode(
  page,
  { safetySeen = true, accountRole = null, accountLocale = "es" } = {},
) {
  await page.addInitScript(
    ({ shouldSkipSafety, role, locale, storageKey }) => {
      if (shouldSkipSafety) window.sessionStorage.setItem("sidewalk-safety-seen", "yes");
      if (role) {
        window.localStorage.setItem(storageKey, JSON.stringify({
          schema_version: 1,
          prototype_account_id: "proto_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          account_role: role,
          locale,
          is_fictional: true,
          created_at: "2026-08-15T12:00:00.000Z",
          updated_at: "2026-08-15T12:00:00.000Z",
        }));
      }
    },
    {
      shouldSkipSafety: safetySeen,
      role: accountRole,
      locale: accountLocale,
      storageKey: PROTOTYPE_ACCOUNT_STORAGE_KEY,
    },
  );
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isBackendRequest = ["fetch", "xhr"].includes(request.resourceType());
    const isExternalAsset = url.hostname !== "127.0.0.1" && url.hostname !== "localhost";
    if (isBackendRequest || isExternalAsset) await route.abort("internetdisconnected");
    else await route.continue();
  });
}

async function expectNoRawTranslationKeys(page) {
  const surface = page.getByTestId("vendor-surface");
  const text = await surface.innerText();
  expect(text).not.toMatch(
    /\b(?:common|vendor|console|safety|guidance|errors|proof|roadmap)[.:][a-z][\w.-]+\b/,
  );
}

async function createMarketplaceAccount(page, role) {
  const marketplace = resources.en.marketplace;
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

  const disclosure = await page.getByTestId("prototype-disclosure").textContent();
  expect(disclosure.replace(/\s+/g, " ").trim()).toBe(
    "Hackathon prototype · Fictional demo data · Not affiliated with NYC · Not legal advice · No real payments, filings, referrals, or messages.",
  );

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
  expect(attemptedRequests).toHaveLength(requestCountBeforeHelp);
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

test("first-run vendor onboarding keeps zero metrics and embeds verification preparation", async ({ page }) => {
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
  await expect(page.getByTestId("seller-store-status")).toContainText("Store setup coming soon.");
  await expect(page.getByTestId("seller-orders-count")).toHaveText("0");
  await expect(page.getByTestId("seller-sales-total")).toHaveText("$0.00");
  await expect(page.getByTestId("seller-products-count")).toHaveText("0");
  await expect(page.getByTestId("seller-verification-status")).toContainText(
    resources.en.marketplace.officialDecisionPending,
  );
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
  await page.getByTestId("continue-verification").click();
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

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const destination of ["nav-dashboard", "nav-street-rules", "nav-orders", "nav-get-verified", "nav-account"]) {
      await page.getByTestId(destination).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "vendor " + destination + " at " + width + "px").toBeLessThanOrEqual(1);
    }
  }
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
    if (hostname === "tile.openstreetmap.org") continue;
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
