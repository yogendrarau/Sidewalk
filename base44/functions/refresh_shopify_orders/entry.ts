import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  jsonError,
  readStrictJson,
  requireActiveSelling,
  requirePreparedStoreOperator,
  requireSession,
  requireVendorContext,
  ShopifyPocError,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
}).strict();

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireActiveSelling(context);
    await requirePreparedStoreOperator(base44);
    // Protected-customer-data order access is deliberately not enabled in the
    // reliable hackathon path. This endpoint fails closed rather than showing a
    // fabricated zero-order result.
    throw new ShopifyPocError("order_refresh_not_configured", 501);
  } catch (error) {
    return jsonError(error, "SIDEWALK refresh_shopify_orders");
  }
});
