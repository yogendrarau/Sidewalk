/**
 * MCP export (§11): read-only tools list_cases, get_case, hearings_this_week, guard_summary —
 * RLS-scoped through the same entity layer as everything else. Bearer token → org ctx.
 * (OAuth upgrade path documented in README; bearer is the local-demo tier per BLOCKERS.md.)
 */
import { entities, type Ctx } from "./entities.js";

export const MCP_TOOLS = [
  {
    name: "list_cases",
    description: "List vendor case files visible to this caseworker org (RLS-scoped). Returns track, status, blocking defects.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_case",
    description: "Get one vendor's case detail: documents, extracted fields, deadlines, evidence summary.",
    inputSchema: { type: "object", properties: { vendor_id: { type: "string" } }, required: ["vendor_id"], additionalProperties: false },
  },
  {
    name: "hearings_this_week",
    description: "OATH hearings in the next 7 days across the org's caseload.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "guard_summary",
    description: "Guard verification checks and area scam signals (aggregate counts only).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export function callMcpTool(ctx: Ctx, name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "list_cases":
      return entities.list(ctx, "CaseFile").map((c) => ({
        vendor_id: c.vendor_id, track: c.track, status: c.status, blocking_defects: c.blocking_defects,
      }));
    case "get_case": {
      const vendorId = String(args.vendor_id ?? "");
      const docs = entities.list(ctx, "DocumentImage", { vendor_id: vendorId });
      if (!docs.length && !entities.list(ctx, "CaseFile", { vendor_id: vendorId }).length) {
        return { error: "not visible to this org (RLS)" };
      }
      const evidence = entities.list(ctx, "EvidenceRecord", { vendor_id: vendorId });
      return {
        case: entities.list(ctx, "CaseFile", { vendor_id: vendorId })[0] ?? null,
        documents: docs.map((d) => ({ id: d.id, doc_type: d.doc_type ?? d.doc_type_claimed, quarantine_state: d.quarantine_state })),
        fields: entities.list(ctx, "ExtractedField", { vendor_id: vendorId }).map((f) => ({
          field: f.schema_field, value: f.corrected_value ?? f.value, confidence: f.value_confidence, tier: f.model_tier,
        })),
        deadlines: entities.list(ctx, "Deadline", { vendor_id: vendorId }).map((d) => ({ kind: d.kind, due_at: d.due_at })),
        evidence_summary: {
          total: evidence.length,
          a_card_verified: evidence.filter((e) => e.grade === "A_card_verified").length,
          b_self_reported: evidence.filter((e) => e.grade === "B_self_reported").length,
        },
      };
    }
    case "hearings_this_week": {
      const now = Date.now();
      return entities
        .list(ctx, "Deadline", { kind: "hearing" })
        .filter((d) => {
          const t = Date.parse(String(d.due_at));
          return t > now && t < now + 7 * 86400_000;
        })
        .map((d) => ({ vendor_id: d.vendor_id, due_at: d.due_at, source: d.source }));
    }
    case "guard_summary":
      return {
        checks: entities.list(ctx, "VerificationCheck").slice(-25).map((c) => ({
          kind: c.kind, result: c.result, dataset_as_of: c.dataset_as_of, at: c.created_at,
        })),
        area_signals: entities.list(ctx, "AreaSignal").map((s) => ({ nta: s.nta, pattern_key: s.pattern_key, count: s.count })),
      };
    default:
      return { error: `unknown tool ${name}` };
  }
}
