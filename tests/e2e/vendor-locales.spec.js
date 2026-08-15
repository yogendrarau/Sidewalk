import { expect, test } from "@playwright/test";

import { resources } from "../../src/i18n/resources.js";

const LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

async function forceSampleMode(page, { safetySeen = true } = {}) {
  if (safetySeen) {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("sidewalk-safety-seen", "yes");
    });
  }
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

for (const locale of LOCALES) {
  test(`${locale} completes the offline sample journey`, async ({ page }) => {
    await forceSampleMode(page, { safetySeen: false });
    await page.goto(
      `/?view=vendor&demo_session_id=E2E-LOCALE&lang=${encodeURIComponent(locale)}`,
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
  await forceSampleMode(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    await page.goto("/?view=vendor&demo_session_id=E2E-WIDTH&lang=ar", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("vendor-surface")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${width}px viewport horizontal overflow`).toBeLessThanOrEqual(1);
  }
});

test("vendor locale survives refresh, console reset, and the return journey", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?view=vendor&demo_session_id=E2E-PERSIST&lang=es", {
    waitUntil: "domcontentloaded",
  });
  const selector = page.getByTestId("vendor-language-select");
  await selector.selectOption("fr");
  await expect(selector).toHaveValue("fr");
  await expect(page).toHaveURL(/(?:\?|&)lang=fr(?:&|$)/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("vendor-language-select")).toHaveValue("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.getByRole("button", { name: resources.fr.common.consoleView }).click();
  await expect(page.getByTestId("console-surface")).toBeVisible();
  const qrUrl = await page.getByTestId("vendor-qr").getAttribute("data-qr-url");
  const parsedQrUrl = new URL(qrUrl);
  expect(parsedQrUrl.searchParams.get("demo_session_id")).toBe("E2E-PERSIST");
  expect(parsedQrUrl.searchParams.get("lang")).toBe("fr");
  await page.getByRole("button", { name: resources.en.console.reset }).click();
  await page.getByRole("button", { name: resources.en.common.vendorView }).click();
  await expect(page.getByTestId("vendor-language-select")).toHaveValue("fr");
});

test("routine guidance stays self-service and exceptional questions abstain", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?view=vendor&demo_session_id=E2E-SELF-SERVICE&lang=en", {
    waitUntil: "domcontentloaded",
  });

  const disclosure = await page.locator(".disclosure-bar").textContent();
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
  await forceSampleMode(page);
  await page.goto("/?view=vendor&demo_session_id=E2E-REFERRALS&lang=en", {
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
