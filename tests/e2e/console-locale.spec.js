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

test("the default review surface is an AI trace with optional human escalation", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?view=console&demo_session_id=E2E-AI-REVIEW&lang=es", {
    waitUntil: "domcontentloaded",
  });

  const consoleSurface = page.getByTestId("console-surface");
  await expect(consoleSurface).toBeVisible();
  await expect(page.getByTestId("console-language-select")).toHaveValue("en");
  await expect(consoleSurface).toContainText(/AI SUPPORT CONSOLE/i);
  await expect(consoleSurface).toContainText(/AI CASE REVIEW/i);
  await expect(consoleSurface).not.toContainText(/\bcaseworker(?:s)?\b/i);
  await expect(page.getByTestId("product-description")).toContainText(
    resources.en.common.productDescription,
  );

  const summary = page.getByTestId("ai-review-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/Original input/i);
  await expect(summary).toContainText(/Recommended official destination/i);
  await expect(summary).toContainText(/Human review/i);
  await expect(summary).toContainText(/Optional/i);
  await expect(summary).not.toContainText(/Needs human\/legal review/i);
  await expect(consoleSurface).not.toContainText(/Needs human(?:\/| or )legal review/i);
});

test("an exceptional abstention is marked for recommended review in the AI trace", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?view=vendor&demo_session_id=E2E-ESCALATION&lang=en&ui_lang=en", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("textbox", { name: resources.en.vendor.typeQuestion }).fill(
    "Guarantee that this permit will be approved and represent me at the hearing.",
  );
  await page.getByRole("button", { name: resources.en.vendor.sendQuestion }).click();
  await expect(page.getByTestId("guidance-result")).toHaveClass(/abstained/);

  await page.getByRole("button", { name: resources.en.common.consoleView }).click();
  const summary = page.getByTestId("ai-review-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/Recommended official destination/i);
  await expect(summary).toContainText(/Street Vendor Project/i);
  await expect(summary).toContainText(/Human review/i);
  await expect(summary).toContainText(/Recommended/i);
  await expect(summary).not.toContainText(/Human review.*Optional/i);
});
