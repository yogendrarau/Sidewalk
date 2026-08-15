/**
 * deadline_nudges (v3 §8 scheduler): emulates a Base44 scheduled automation.
 * Deduplicated in-app notifications at 30/14/7 days before every upcoming deadline.
 * Each run writes an AutomationRun row — the visible proof for /demo/platform (§11).
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { publish } from "../realtime.js";

const THRESHOLDS = [30, 14, 7] as const;

const Input = z.object({ now: z.string().optional() });

export type NudgeOut = { created: number; scanned: number };

export const deadline_nudges = defineFn<z.infer<typeof Input>, NudgeOut>("deadline_nudges", Input, async (input) => {
  const sys: Ctx = { kind: "system" };
  const now = input.now ? Date.parse(input.now) : Date.now();
  let created = 0;
  const deadlines = entities.list(sys, "Deadline").filter((d) => Date.parse(String(d.due_at)) > now);
  for (const d of deadlines) {
    const daysOut = (Date.parse(String(d.due_at)) - now) / 86400_000;
    for (const t of THRESHOLDS) {
      if (daysOut > t) continue;
      const dedupe = `nudge:${d.id}:${t}`;
      const vendorId = String(d.vendor_id);
      const ctx: Ctx = { kind: "vendor", vendor_id: vendorId };
      if (entities.list(ctx, "AppNotification", { dedupe_key: dedupe })[0]) break;
      entities.create(ctx, "AppNotification", {
        vendor_id: vendorId, kind: String(d.kind), dedupe_key: dedupe,
        title: `${String(d.kind).replace(/_/g, " ")} — ${String(d.due_at).slice(0, 10)}`,
        body: `Due in ${Math.ceil(daysOut)} days (source: ${String(d.source ?? "case")}).`,
        action_route: d.kind === "hearing" ? "/app/guard" : "/app/case",
      });
      publish(`vendor:${vendorId}`, "notification", { kind: d.kind, due_at: d.due_at });
      created += 1;
      break; // one active threshold per deadline per run
    }
  }
  entities.create(sys, "AutomationRun", {
    name: "deadline_nudges", at: new Date().toISOString(), ok: true,
    note: `scanned ${deadlines.length} deadlines, created ${created} notifications`,
  });
  return { created, scanned: deadlines.length };
});
