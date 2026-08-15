import { expect, test } from "@playwright/test";

import { resources } from "../../src/i18n/resources.js";

const LIVE_BASE_URL = process.env.LIVE_BASE_URL;
const LIVE_DEMO_SESSION_ID = process.env.LIVE_DEMO_SESSION_ID;
const HAS_LIVE_TARGET = Boolean(LIVE_BASE_URL && LIVE_DEMO_SESSION_ID);

test.describe("opt-in live NYC OATH rehearsal", () => {
  test.skip(
    !HAS_LIVE_TARGET,
    "Set LIVE_BASE_URL and LIVE_DEMO_SESSION_ID to run a genuine public-data rehearsal.",
  );

  for (const locale of ["en", "es"]) {
    test(`${locale} reaches a provenance-labeled live public lookup`, async ({ page }) => {
      await page.addInitScript(() => {
        window.sessionStorage.setItem("sidewalk-safety-seen", "yes");
      });
      const url = new URL(LIVE_BASE_URL);
      url.searchParams.set("view", "vendor");
      url.searchParams.set("demo_session_id", LIVE_DEMO_SESSION_ID);
      url.searchParams.set("lang", locale);
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

      await expect(page.getByTestId("vendor-surface")).toBeVisible();
      await page.getByTestId("vendor-tab-check").click();
      await page.getByTestId("sample-summons").click();
      await page.getByTestId("check-public-records").click();

      const result = page.getByTestId("lookup-result");
      await expect(result).toBeVisible({ timeout: 20_000 });
      await expect(result).toContainText(resources[locale].common.modeLivePublic);
      await expect(result).toContainText("jz4z-kudi");
    });
  }
});
