/**
 * placement_check (§9): restricted-street list TODO(data) + proximity rules (all statutory
 * values TODO(law) → abstain) + 311 complaint density as a RISK NOTE ONLY → partial verdict
 * + physical checklist with citations.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { loadRulebook } from "../rulebook.js";
import { evaluate } from "../engine.js";
import { query, DATASETS } from "../socrata.js";

const Input = z.object({ vendor_id: z.string(), lat: z.number(), lon: z.number() });

export type PlacementOut = {
  verdict: "partial";
  checklist: string[];
  abstain_reason: string;
  citation: string;
  complaint_density_note: string | null;
  dataset_as_of: string | null;
};

export const placement_check = defineFn<z.infer<typeof Input>, PlacementOut>("placement_check", Input, async (input) => {
  const rb = loadRulebook();
  const ev = evaluate(rb, { topic: "placement" });
  const pl = rb.records.find((r) => r.type === "placement")!;

  // 311 vending-related complaint density near the point — risk note only, never a legality claim
  let complaint_density_note: string | null = null;
  let dataset_as_of: string | null = null;
  try {
    const res = await query(DATASETS.complaints_311, {
      $where: `within_circle(location, ${input.lat}, ${input.lon}, 250) AND created_date > '2026-05-01T00:00:00'`,
      $select: "count(*) as c",
      $limit: "1",
    });
    dataset_as_of = res.dataset_as_of;
    const c = Number((res.rows[0] as { c?: string })?.c ?? 0);
    if (c > 0) complaint_density_note = `${c} 311 complaints of any kind within 250m since May — higher attention area`;
  } catch { /* optional */ }

  return {
    verdict: "partial",
    checklist: ev.placement?.checklist ?? [],
    abstain_reason: ev.placement?.abstain_reason ?? "placement rules not computable",
    citation: String(pl.citation),
    complaint_density_note,
    dataset_as_of,
  };
});
