/**
 * update_order_status (v3 §9): merchant order lifecycle new→accepted→ready→picked_up.
 * Cancellation is CONFIRM-GATED (invariant 9 — physically blocks, tested).
 * Realtime: every transition publishes to the merchant and to the shopper's order page.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { publish } from "../realtime.js";

const FLOW: Record<string, string[]> = {
  new: ["accepted", "cancelled"],
  accepted: ["ready", "cancelled"],
  ready: ["picked_up", "cancelled"],
  picked_up: [],
  cancelled: [],
};

const Input = z.object({
  vendor_id: z.string(),
  order_id: z.string(), // CommerceOrder row id
  to: z.enum(["accepted", "ready", "picked_up", "cancelled"]),
  confirm_cancel: z.boolean().optional(), // must be literal true for `cancelled` — checked in the handler so the error names the gate
});

export type OrderStatusOut = { order_id: string; fulfillment: string };

export const update_order_status = defineFn<z.infer<typeof Input>, OrderStatusOut>(
  "update_order_status",
  Input,
  async (input) => {
    if (input.to === "cancelled" && input.confirm_cancel !== true) {
      throw new Error("cancellation requires explicit merchant confirmation (confirm_cancel: true) — the gate physically blocks");
    }
    const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
    const order = entities.get(ctx, "CommerceOrder", input.order_id);
    if (!order) throw new Error("order not found");
    const from = String(order.fulfillment);
    if (!FLOW[from]?.includes(input.to)) throw new Error(`invalid transition ${from} → ${input.to}`);
    const row = entities.update(ctx, "CommerceOrder", input.order_id, { fulfillment: input.to });
    publish(`vendor:${input.vendor_id}`, "order_status", { order_id: input.order_id, fulfillment: input.to, order_number: row.order_number });
    if (row.token) publish(`order:${String(row.token)}`, "order_status", { fulfillment: input.to, order_number: row.order_number });
    return { order_id: input.order_id, fulfillment: input.to };
  },
);
