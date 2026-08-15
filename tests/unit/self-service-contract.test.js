import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resources } from "../../src/i18n/resources.js";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LOCALES = ["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"];

const REQUIRED_PRODUCT_DESCRIPTION =
  "SIDEWALK is an AI-powered navigation and preparation layer for NYC street-vending processes. It helps vendors understand requirements, organize their information, and reach the right official service. Government agencies retain all authority over licenses, permits, filings, hearings, and eligibility decisions.";

const REQUIRED_DISCLOSURE =
  "Hackathon prototype · Fictional demo data · Not affiliated with NYC · Not legal advice · No real payments, filings, referrals, or messages.";

function strings(value, target = []) {
  if (typeof value === "string") target.push(value);
  else if (value && typeof value === "object") {
    for (const child of Object.values(value)) strings(child, target);
  }
  return target;
}

describe("self-service product positioning", () => {
  it("ships the required English product description and persistent disclosure verbatim", () => {
    expect(resources.en.common.productDescription).toBe(REQUIRED_PRODUCT_DESCRIPTION);
    expect(
      `${resources.en.common.prototype} · ${resources.en.common.disclosure}`,
    ).toBe(REQUIRED_DISCLOSURE);
  });

  it.each(LOCALES)("localizes the self-service, escalation, and referral contract in %s", (locale) => {
    const { common, console: consoleCatalog, guidance, vendor } = resources[locale];
    const requiredValues = [
      common.productDescription,
      common.disclosure,
      consoleCatalog.caseworkerConsole,
      consoleCatalog.caseworkerView,
      guidance.routineReviewOptional,
      guidance.abstainAnswer,
      vendor.getMoreHelp,
      vendor.helpWhy,
      vendor.helpCan,
      vendor.helpCannot,
      vendor.helpBring,
      vendor.helpContact,
      vendor.helpNoAffiliation,
      vendor.helpNoTransmit,
      vendor.helpOfficialDestination,
      vendor.helpSummonsDestination,
      vendor.helpLegalDestination,
      vendor.helpBusinessDestination,
    ];

    for (const value of requiredValues) {
      expect(value, `${locale} self-service catalog value`).toEqual(expect.any(String));
      expect(value.trim(), `${locale} self-service catalog value`).not.toBe("");
    }
  });

  it("frames the review surface around AI and never makes caseworkers the default product role", () => {
    expect(resources.en.console.caseworkerConsole).toMatch(/AI SUPPORT CONSOLE/i);
    expect(resources.en.console.caseworkerView).toMatch(/AI CASE REVIEW/i);
    expect(resources.en.common.consoleView).toMatch(/AI|review/i);

    const activeEnglishCopy = strings(resources.en).join("\n");
    expect(activeEnglishCopy).not.toMatch(/\bcaseworker(?:s)?\b/i);
    expect(activeEnglishCopy).not.toMatch(/human review (?:is )?(?:required|necessary)/i);
  });

  it("keeps normal guidance optional while preserving a clear exceptional abstention", () => {
    expect(resources.en.guidance.routineReviewOptional).toMatch(/optional/i);
    expect(resources.en.guidance.routineReviewOptional).not.toMatch(/required|necessary/i);
    expect(resources.en.guidance.knownAnswer).not.toMatch(/needs human|needs legal/i);
    expect(resources.en.guidance.abstainAnswer).toMatch(/human|legal/i);
    expect(resources.en.guidance.abstainAnswer).toMatch(/review/i);
  });
});

describe("referral and handoff safety contract", () => {
  it("contains verified contact details for all five referral destinations", () => {
    const source = readFileSync(join(PROJECT_ROOT, "src/pages/Sidewalk.jsx"), "utf8");

    expect(source).toContain("https://www.nyc.gov/site/doh/business/permits-licenses.page");
    expect(source).toContain(
      "https://www.nyc.gov/site/dca/businesses/license-checklist-general-vendor.page",
    );
    expect(source).toContain("https://www.streetvendor.org/legal-assistance");
    expect(source).toContain(
      "https://nyc-business.nyc.gov/nycbusiness/business-services/initiatives/street-vending-in-nyc",
    );
    expect(source).toContain("https://www.nyc.gov/site/oath/help-center/help-center.page");
    for (const phone of ["311", "(212) 487-4075", "(212) 436-0845", "646-602-5679", "888-727-4692"]) {
      expect(source, `verified referral phone ${phone}`).toContain(phone);
    }

    const englishVendorCopy = strings(resources.en.vendor).join("\n");
    expect(englishVendorCopy).toMatch(/Street Vendor Project/i);
    expect(englishVendorCopy).toMatch(/Office of Street Vendor Services/i);
    expect(englishVendorCopy).toMatch(/OATH Help Center/i);
    expect(englishVendorCopy).toMatch(/NYC Health Department|Department of Health and Mental Hygiene|DOHMH/i);
    expect(englishVendorCopy).toMatch(/NYC DCWP|Department of Consumer and Worker Protection|DCWP/i);
    expect(englishVendorCopy).toMatch(/Official contact verified/i);
  });

  it("labels referrals as unaffiliated and handoffs as local previews with no transmission", () => {
    expect(resources.en.vendor.helpNoAffiliation).toMatch(/not affiliated/i);
    expect(resources.en.vendor.helpNoTransmit).toMatch(
      /does not send|not (?:be )?sent|no .*sent|nothing .*sent/i,
    );

    const source = readFileSync(join(PROJECT_ROOT, "src/pages/Sidewalk.jsx"), "utf8");
    expect(source).toMatch(/data-testid=["']prepare-handoff["']/);
    expect(source).toMatch(/data-testid=["']handoff-preview["']/);
  });
});
