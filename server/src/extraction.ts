/**
 * Quarantined document extraction (invariants 2 + 11).
 * Chain: vlm (Anthropic vision + schema-constrained decode) → fixture (sha-matched gold) → manual.
 * Raw document text NEVER enters any planning context — only schema fields leave here.
 * Unreadable → null, never a plausible guess.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ROOT, MEDIA_DIR } from "./db.js";
import { extractFromImage, type ExtractionResult } from "./modelgw.js";

export const SCHEMAS: Record<string, { name: string; properties: Record<string, { type: string; description: string }> }> = {
  identity_document: {
    name: "identity_document",
    properties: {
      full_name: { type: "string", description: "person's full name as printed" },
      document_kind: { type: "string", description: "passport | drivers_license | non_driver_id | alien_registration | naturalization_certificate" },
      issuing_country_or_state: { type: "string", description: "issuer as printed" },
      expiry_date: { type: "string", description: "YYYY-MM-DD as printed, null if absent" },
    },
  },
  proof_of_address: {
    name: "proof_of_address",
    properties: {
      name: { type: "string", description: "addressee name" },
      address: { type: "string", description: "street address as printed" },
      document_date: { type: "string", description: "YYYY-MM-DD of the bill/statement" },
      issuer: { type: "string", description: "utility/bank/landlord name" },
    },
  },
  nys_sales_tax_certificate: {
    name: "nys_sales_tax_certificate",
    properties: {
      business_name: { type: "string", description: "registered business or person name" },
      certificate_number: { type: "string", description: "certificate of authority number" },
      effective_date: { type: "string", description: "YYYY-MM-DD" },
    },
  },
  food_protection_certificate: {
    name: "food_protection_certificate",
    properties: {
      name: { type: "string", description: "certificate holder" },
      completion_date: { type: "string", description: "YYYY-MM-DD" },
      certificate_number: { type: "string", description: "as printed" },
    },
  },
  summons: {
    name: "summons",
    properties: {
      ticket_number: { type: "string", description: "the summons/ticket number, digits only, exactly as printed; null unless every digit is clearly legible" },
      violation_date: { type: "string", description: "YYYY-MM-DD" },
      issuing_agency: { type: "string", description: "agency name as printed" },
      instrument_kind: { type: "string", description: "civil_oath if it names OATH/administrative hearing; criminal_court if it names criminal court appearance; null if unclear" },
    },
  },
  letter: {
    name: "letter",
    properties: {
      sender: { type: "string", description: "the agency or company that sent the letter" },
      subject: { type: "string", description: "one line: what the letter is about" },
      amounts: { type: "string", description: "comma-separated dollar amounts mentioned, null if none" },
      deadlines: { type: "string", description: "comma-separated YYYY-MM-DD deadlines mentioned, null if none" },
      doc_category: { type: "string", description: "dcwp_fine | tax | license_notice | other" },
    },
  },
  cart_voucher: {
    name: "cart_voucher",
    properties: {
      voucher_number: { type: "string", description: "property clerk voucher number" },
      precinct: { type: "string", description: "precinct if printed" },
      date: { type: "string", description: "YYYY-MM-DD" },
    },
  },
};

export function sha256Of(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function fixtureGold(sha: string): { doc_type: string; fields: Record<string, string | null> } | null {
  const p = join(ROOT, "fixtures", "gold_by_sha.json");
  if (!existsSync(p)) return null;
  const gold = JSON.parse(readFileSync(p, "utf8")) as Record<string, { doc_type: string; fields: Record<string, string | null> }>;
  return gold[sha] ?? null;
}

const MEDIA_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

export async function runExtraction(
  sha: string,
  docType: string,
  ext: string,
): Promise<ExtractionResult & { doc_type: string }> {
  const schema = SCHEMAS[docType] ?? SCHEMAS.letter;
  const mode = process.env.EXTRACT_MODE ?? "vlm";

  if (mode === "vlm") {
    const mediaPath = join(MEDIA_DIR, sha);
    const mediaType = MEDIA_TYPES[ext.toLowerCase()];
    if (existsSync(mediaPath) && mediaType) {
      const vlm = await extractFromImage({
        imageBase64: readFileSync(mediaPath).toString("base64"),
        mediaType,
        schema,
      });
      if (vlm) return { ...vlm, doc_type: docType };
    }
  }

  // fixture tier: sha-matched gold fields (deterministic demo/dev tier)
  const gold = fixtureGold(sha);
  if (gold) return { fields: gold.fields, model_tier: "fixture", doc_type: gold.doc_type };

  // manual tier: nothing readable by machine → all nulls, human fills in console
  const fields = Object.fromEntries(Object.keys(schema.properties).map((k) => [k, null]));
  return { fields, model_tier: "manual", doc_type: docType };
}

/**
 * Displayed confidence (invariant 8): calibrated empirical per-field accuracy measured on the
 * labeled docs eval set — never model self-report. Until an EvalRun calibrates a field, null → UI shows "unverified".
 */
export function calibratedConfidence(docType: string, field: string): number | null {
  const p = join(ROOT, "evals", "calibration.json");
  if (!existsSync(p)) return null;
  const cal = JSON.parse(readFileSync(p, "utf8")) as Record<string, Record<string, number>>;
  return cal[docType]?.[field] ?? null;
}
