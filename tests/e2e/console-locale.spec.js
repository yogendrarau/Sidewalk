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
  await expect(page.getByTestId("buyer-orders-empty")).toContainText(
    "You haven’t placed any orders yet.",
  );
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

test("desktop seller shell has exact zero metrics and preserves verification without legacy tools", async ({ page }) => {
  await forceSampleMode(page);
  await page.goto("/?lang=en", { waitUntil: "domcontentloaded" });
  const shell = await createMarketplaceAccount(page, "vendor");

  await expect(shell).toHaveAttribute("data-workspace", "dashboard");
  await expect(page.getByTestId("buyer-navigation")).toHaveCount(0);
  await expect(page.getByTestId("seller-store-status")).toContainText("Store setup coming soon.");
  await expect(page.getByTestId("seller-orders-count")).toHaveText("0");
  await expect(page.getByTestId("seller-sales-total")).toHaveText("$0.00");
  await expect(page.getByTestId("seller-products-count")).toHaveText("0");
  await expect(page.getByTestId("seller-dashboard")).toContainText(
    resources.en.marketplace.noActivityNote,
  );
  await expectNoHorizontalOverflow(page, "desktop seller Dashboard");

  await page.getByTestId("nav-orders").click();
  await expect(page.getByTestId("seller-orders-empty")).toContainText(
    "New orders will appear here once your store is live.",
  );
  await expect(page.getByTestId("seller-orders").locator("[data-order-id]")).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "desktop seller Orders");

  await page.getByTestId("nav-get-verified").click();
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
