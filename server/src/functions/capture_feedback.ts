/**
 * capture_feedback (v3 §9 / §3.4): one-tap merchant feedback after important flows.
 * The optional note is quarantined data (never planner context). Feeds the console
 * correction queue — the Eniac "rapid customer feedback" loop made visible.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";

const Input = z.object({
  vendor_id: z.string(),
  flow: z.enum(["case", "guard", "store", "order"]),
  rating: z.enum(["helpful", "wrong", "confusing"]),
  note: z.string().max(300).optional(),
  context_ref: z.string().optional(),
});

export const capture_feedback = defineFn<z.infer<typeof Input>, { feedback_id: string }>(
  "capture_feedback",
  Input,
  async (input) => {
    const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
    const row = entities.create(ctx, "MerchantFeedback", {
      vendor_id: input.vendor_id, flow: input.flow, rating: input.rating,
      note: input.note ?? null, context_ref: input.context_ref ?? null, resolution: "open",
    });
    return { feedback_id: row.id };
  },
);
