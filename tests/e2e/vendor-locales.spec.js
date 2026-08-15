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
