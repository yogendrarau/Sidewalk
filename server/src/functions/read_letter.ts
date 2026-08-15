/**
 * read_letter (§9): quarantined extract {sender, subject, amounts, deadlines, doc_category}
 * → deadlines filed → category routing → plain-language explanation.
 * Guard screens the EXTRACTED FIELDS (never raw text) for fake-fine patterns.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { extract_document } from "./extract_document.js";
import { guard_screen } from "./guard_screen.js";

const Input = z.object({
  vendor_id: z.string(),
  case_id: z.string().optional(),
  sha256: z.string(),
  ext: z.string(),
});

export type LetterOut = {
  sender: string | null;
  subject: string | null;
  amounts: string | null;
  deadlines: string[];
  doc_category: string;
  routing: "summons_flow" | "tax_checklist" | "license_notice" | "referral";
  guard_flag: string | null;
  document_id: string;
  deadline_ids: string[];
};

export const read_letter = defineFn<z.infer<typeof Input>, LetterOut>("read_letter", Input, async (input) => {
  const ex = await extract_document({
    vendor_id: input.vendor_id, case_id: input.case_id, sha256: input.sha256, ext: input.ext, doc_type_claimed: "letter",
  });
  if (!ex.ok) throw new Error(ex.error);
  const f = Object.fromEntries(ex.data.fields.map((x) => [x.schema_field, x.value]));

  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const deadlines = (f.deadlines ?? "")?.split(",").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)) ?? [];
  const deadline_ids = deadlines.map(
    (due) =>
      entities.create(ctx, "Deadline", {
        vendor_id: input.vendor_id, case_id: input.case_id ?? null, kind: "letter",
        due_at: `${due}T09:00:00.000Z`, source: `letter:${input.sha256.slice(0, 8)}`,
      }).id,
  );

  // Guard on structured fields only
  const guardRes = await guard_screen({ text: `${f.sender ?? ""} ${f.subject ?? ""} ${f.amounts ?? ""}` });
  const guard_flag = guardRes.ok ? guardRes.data.scam_pattern : null;

  const cat = f.doc_category ?? "other";
  const routing =
    cat === "dcwp_fine" ? "summons_flow" : cat === "tax" ? "tax_checklist" : cat === "license_notice" ? "license_notice" : "referral";

  return {
    sender: f.sender ?? null, subject: f.subject ?? null, amounts: f.amounts ?? null,
    deadlines, doc_category: cat, routing, guard_flag,
    document_id: ex.data.document_id, deadline_ids,
  };
});
