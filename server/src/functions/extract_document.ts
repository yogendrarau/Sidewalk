import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, signMediaUrl, type Ctx } from "../entities.js";
import { runExtraction, calibratedConfidence } from "../extraction.js";

const Input = z.object({
  vendor_id: z.string(),
  case_id: z.string().optional(),
  sha256: z.string(),
  ext: z.string(),
  doc_type_claimed: z.string(),
});

export type ExtractDocOut = {
  document_id: string;
  doc_type: string;
  model_tier: string;
  fields: Array<{ schema_field: string; value: string | null; value_confidence: number | null }>;
  nulls: string[];
  file_url: string;
};

export const extract_document = defineFn<z.infer<typeof Input>, ExtractDocOut>("extract_document", Input, async (input) => {
  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const doc = entities.create(ctx, "DocumentImage", {
    vendor_id: input.vendor_id,
    case_id: input.case_id ?? null,
    file_url: `internal:${input.sha256}`,
    doc_type_claimed: input.doc_type_claimed,
    quarantine_state: "raw",
    sha256: input.sha256,
  });

  const res = await runExtraction(input.sha256, input.doc_type_claimed, input.ext);

  const fields = Object.entries(res.fields).map(([schema_field, value]) => {
    const value_confidence = value === null ? null : calibratedConfidence(res.doc_type, schema_field);
    entities.create(ctx, "ExtractedField", {
      vendor_id: input.vendor_id,
      document_id: doc.id,
      schema_field,
      value,
      value_confidence,
      model_tier: res.model_tier,
      human_corrected: false,
    });
    return { schema_field, value, value_confidence };
  });

  entities.update(ctx, "DocumentImage", doc.id, { quarantine_state: "extracted", doc_type: res.doc_type });

  return {
    document_id: doc.id,
    doc_type: res.doc_type,
    model_tier: res.model_tier,
    fields,
    nulls: fields.filter((f) => f.value === null).map((f) => f.schema_field),
    file_url: signMediaUrl(input.sha256),
  };
});
