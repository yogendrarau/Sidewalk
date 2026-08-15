/**
 * Broker Verifier (§8): name normalization → exact + trigram fuzzy match against the city
 * business registry (w7w3-xahh) → registration verdict + advance-fee price check → teaching
 * reply + GuardEvent for Scam Radar.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { query, DATASETS } from "../socrata.js";
import { entities, type Ctx } from "../entities.js";
import { prices } from "../rulebook.js";

const Input = z.object({
  vendor_id: z.string(),
  business_name: z.string(),
  asked_price_usd: z.number().nullable().optional(),
  nta: z.string().nullable().optional(),
});

const normalize = (s: string) =>
  s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\b(LLC|INC|CORP|CO|LTD)\b/g, "").replace(/\s+/g, " ").trim();

function trigrams(s: string): Set<string> {
  const t = new Set<string>();
  const p = `  ${s} `;
  for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3));
  return t;
}
export function trigramSim(a: string, b: string): number {
  const ta = trigrams(normalize(a)), tb = trigrams(normalize(b));
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / (ta.size + tb.size - inter || 1);
}

export type BrokerOut = {
  result: "registered" | "not_registered";
  best_match: { business_name: string; similarity: number; license_status?: string } | null;
  price_warning: { asked: number; real_fee: number } | null;
  dataset_as_of: string;
  source: string;
  pattern_key: string | null;
  check_id: string;
};

export const verify_broker = defineFn<z.infer<typeof Input>, BrokerOut>("verify_broker", Input, async (input) => {
  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const name = normalize(input.business_name);

  // candidate fetch: full-text search, then local trigram ranking (exact + fuzzy)
  const res = await query(DATASETS.businesses, { $q: name.split(" ").slice(0, 3).join(" "), $limit: "50" });
  let best: { business_name: string; similarity: number; license_status?: string } | null = null;
  for (const row of res.rows as Array<Record<string, string | undefined>>) {
    for (const field of [row.business_name, row.business_name_2 ?? row.dba_trade_name]) {
      if (!field) continue;
      const sim = trigramSim(name, field);
      if (!best || sim > best.similarity) best = { business_name: field, similarity: Math.round(sim * 100) / 100, license_status: row.license_status };
    }
  }
  const registered = Boolean(best && best.similarity >= 0.45);

  const cfg = prices();
  const realFee = (cfg.legitimate as Record<string, { amount_usd: number }>).mfv_license.amount_usd;
  const minSus = (cfg.scam_anchors as Record<string, { min_suspicious_usd: number }>).advance_fee_broker.min_suspicious_usd;
  const price_warning =
    input.asked_price_usd && input.asked_price_usd >= minSus ? { asked: input.asked_price_usd, real_fee: realFee } : null;

  const pattern_key = price_warning ? "advance_fee_license" : registered ? null : "unregistered_broker";
  if (pattern_key) {
    entities.create(ctx, "GuardEvent", {
      vendor_id: input.vendor_id, pattern_key, nta: input.nta ?? null, kind: "broker_check", at: new Date().toISOString(),
    });
  }

  const check_id = entities.create(ctx, "VerificationCheck", {
    vendor_id: input.vendor_id, kind: "broker", input_ref: input.business_name,
    query: name, dataset_id: DATASETS.businesses, dataset_as_of: res.dataset_as_of,
    result: registered ? "found" : "not_found",
    payload: { best, price_warning },
  }).id;

  return { result: registered ? "registered" : "not_registered", best_match: best, price_warning, dataset_as_of: res.dataset_as_of, source: res.source, pattern_key, check_id };
});
