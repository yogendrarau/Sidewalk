import { expect, test } from "@playwright/test";

import { resources } from "../../src/i18n/resources.js";

const LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

async function forceSampleMode(page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("sidewalk-safety-seen", "yes");
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isBackendRequest = ["fetch", "xhr"].includes(request.resourceType());
    const isExternalAsset = url.hostname !== "127.0.0.1" && url.hostname !== "localhost";
    if (isBackendRequest || isExternalAsset) await route.abort("internetdisconnected");
    else await route.continue();
  });
}

for (const locale of LOCALES) {
  test(`${locale} renders the complete console and proof surfaces`, async ({ page }) => {
    await forceSampleMode(page);
    const encodedLocale = encodeURIComponent(locale);
    await page.goto(
      `/?view=console&demo_session_id=E2E-CONSOLE&lang=es&ui_lang=${encodedLocale}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByTestId("console-surface")).toBeVisible();
    await expect(page.getByTestId("console-language-select")).toHaveValue(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(page.getByTestId("console-surface")).toContainText(
      resources[locale].console.caseworkerView,
    );

    await page.goto(
      `/?view=proof&demo_session_id=E2E-CONSOLE&lang=es&ui_lang=${encodedLocale}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByTestId("proof-surface")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByTestId("proof-surface")).toContainText(resources[locale].proof.titleA);
    const text = await page.getByTestId("proof-surface").innerText();
    await expect(page.getByTestId("proof-surface")).toContainText(
      resources[locale].roadmap.broaderVision,
    );
    expect(text).not.toMatch(
      /\b(?:common|vendor|console|safety|guidance|errors|proof|roadmap)[.:][a-z][\w.-]+\b/,
    );
  });
}

test("console locale stays independent from the vendor locale and persists", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?view=console&demo_session_id=E2E-CONSOLE&lang=es&ui_lang=fr", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByTestId("console-surface")).toBeVisible();
  await expect(page.getByTestId("console-language-select")).toHaveValue("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("ui_lang");
    window.history.replaceState({}, "", url);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("console-language-select")).toHaveValue("fr");

  await page.goto("/?view=vendor&demo_session_id=E2E-CONSOLE&lang=es", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("vendor-language-select")).toHaveValue("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  await page.goto("/?view=console&demo_session_id=E2E-CONSOLE&lang=es&ui_lang=ar", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("console-language-select")).toHaveValue("ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("console-surface")).toHaveCSS("direction", "rtl");
});

test("console renders without horizontal overflow on a laptop viewport", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?view=console&demo_session_id=E2E-CONSOLE&ui_lang=ar", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("console-surface")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
