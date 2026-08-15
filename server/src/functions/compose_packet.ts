/**
 * compose_packet (§9): application-ready packet — checklist (present/missing per Rulebook),
 * field summary with provenance, document images, graded sales-evidence summary, referral page.
 * FILING STAYS HUMAN-GATED: this composes; it never files (invariant 9).
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, signMediaUrl, type Ctx } from "../entities.js";
import { loadRulebook } from "../rulebook.js";
import { evaluate, type CaseFacts } from "../engine.js";
import { factsFor } from "../facts.js";

const Input = z.object({ vendor_id: z.string(), case_id: z.string() });

export type PacketOut = {
  vendor: { display_name: string };
  track: string | null;
  checklist: Array<{ doc: string; note: string; present: boolean }>;
  fields: Array<{ doc_type: string; field: string; value: string | null; confidence: number | null; corrected: boolean }>;
  documents: Array<{ id: string; doc_type: string; url: string }>;
  evidence: { total: number; a_count: number; b_count: number; sum_a: number; sum_b: number; recent: Array<{ kind: string; amount: number; at: string; grade: string }> };
  referrals: Array<{ name: string; kind: string; contact: string }>;
  rulebook_version: string;
  filing_note: string;
};

export const compose_packet = defineFn<z.infer<typeof Input>, PacketOut>("compose_packet", Input, async (input) => {
  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const vendor = entities.list(ctx, "Vendor", { vendor_id: input.vendor_id })[0];
  const docs = entities.list(ctx, "DocumentImage", { vendor_id: input.vendor_id });
  const presentTypes = new Set(docs.map((d) => String(d.doc_type ?? d.doc_type_claimed)));

  const facts = { ...factsFor(input.vendor_id), documents_present: [...presentTypes].sort() } as CaseFacts;
  const ev = evaluate(loadRulebook(), facts);

  const checklist = (ev.documents?.required ?? []).map((doc) => ({
    doc,
    note: ev.documents?.notes[doc] ?? "",
    present: presentTypes.has(doc),
  }));

  const fields = entities.list(ctx, "ExtractedField", { vendor_id: input.vendor_id }).map((f) => ({
    doc_type: String(docs.find((d) => d.id === f.document_id)?.doc_type ?? "unknown"),
    field: String(f.schema_field),
    value: (f.corrected_value ?? f.value) as string | null,
    confidence: f.value_confidence as number | null,
    corrected: Boolean(f.human_corrected),
  }));

  const evidence = entities.list(ctx, "EvidenceRecord", { vendor_id: input.vendor_id });
  const aRecs = evidence.filter((r) => r.grade === "A_card_verified");
  const bRecs = evidence.filter((r) => r.grade === "B_self_reported");

  return {
    vendor: { display_name: String(vendor?.display_name ?? "Vendor") },
    track: ev.track,
    checklist,
    fields,
    documents: docs.map((d) => ({ id: d.id, doc_type: String(d.doc_type ?? d.doc_type_claimed), url: signMediaUrl(String(d.sha256)) })),
    evidence: {
      total: evidence.length,
      a_count: aRecs.length,
      b_count: bRecs.length,
      sum_a: aRecs.reduce((s, r) => s + Number(r.amount), 0),
      sum_b: bRecs.reduce((s, r) => s + Number(r.amount), 0),
      recent: evidence.slice(-10).map((r) => ({ kind: String(r.kind), amount: Number(r.amount), at: String(r.at), grade: String(r.grade) })),
    },
    referrals: entities.list({ kind: "system" }, "ReferralPartner").slice(0, 5).map((r) => ({
      name: String(r.name), kind: String(r.kind), contact: String(r.contact),
    })),
    rulebook_version: ev.rulebook_version,
    filing_note: "This packet is assembled for review. Filing with the city requires explicit human confirmation and is never automatic.",
  };
});
