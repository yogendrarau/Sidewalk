/**
 * scam_radar (§9): aggregate GuardEvents → AreaSignal by NTA+pattern (counts only, no vendor refs);
 * broadcast when count ≥3 in window and no broadcast in 72h → in-language warning to opted-in vendors.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { renderTemplate } from "../templates.js";

const sys: Ctx = { kind: "system" };
const Input = z.object({ mode: z.enum(["aggregate", "broadcast", "both"]).default("both") });

export type RadarOut = {
  signals: Array<{ nta: string; pattern_key: string; count: number }>;
  broadcasts: Array<{ nta: string; pattern_key: string; recipients: number }>;
};

export const scam_radar = defineFn<z.infer<typeof Input>, RadarOut>("scam_radar", Input, async ({ mode }) => {
  const now = Date.now();
  const windowStart = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

  // aggregate: counts only — AreaSignal carries no vendor references by design
  const events = entities.list(sys, "GuardEvent").filter((e) => String(e.at) >= windowStart && e.nta);
  const byKey = new Map<string, number>();
  for (const e of events) byKey.set(`${e.nta}|${e.pattern_key}`, (byKey.get(`${e.nta}|${e.pattern_key}`) ?? 0) + 1);

  const signals: RadarOut["signals"] = [];
  if (mode !== "broadcast") {
    for (const [key, count] of byKey) {
      const [nta, pattern_key] = key.split("|");
      const existing = entities.list(sys, "AreaSignal", { nta, pattern_key })[0];
      if (existing) entities.update(sys, "AreaSignal", existing.id, { window_start: windowStart, count });
      else entities.create(sys, "AreaSignal", { nta, pattern_key, window_start: windowStart, count, last_broadcast_at: null });
      signals.push({ nta, pattern_key, count });
    }
  }

  const broadcasts: RadarOut["broadcasts"] = [];
  if (mode !== "aggregate") {
    for (const sig of entities.list(sys, "AreaSignal")) {
      const count = Number(sig.count);
      const last = sig.last_broadcast_at ? Date.parse(String(sig.last_broadcast_at)) : 0;
      if (count >= 3 && now - last > 72 * 3600 * 1000) {
        const optedIn = entities.list(sys, "Vendor").filter((v) => v.radar_opt_in === true && v.area_nta === sig.nta);
        for (const v of optedIn) {
          const lang = (v.languages as string[] | undefined)?.[0] ?? "es";
          const t = renderTemplate(lang, "radar_broadcast", { count, pattern: sig.pattern_key });
          entities.create(sys, "Message", {
            vendor_id: v.vendor_id ?? v.id, role: "sidewalk", kind: "radar_broadcast",
            text: t.sentences.join(" "), lang, at: new Date().toISOString(),
          });
        }
        entities.update(sys, "AreaSignal", sig.id, { last_broadcast_at: new Date().toISOString() });
        broadcasts.push({ nta: String(sig.nta), pattern_key: String(sig.pattern_key), recipients: optedIn.length });
      }
    }
  }
  return { signals, broadcasts };
});
