import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  jsonError,
  jsonOk,
  parseShopifyOutput,
  readStrictJson,
  requireActiveSelling,
  requirePreparedStoreOperator,
  requireSession,
  requireVendorContext,
  simulatedProvenance,
  updateAccess,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  ordering_status: z.enum(["active", "paused"]),
}).strict();
const Output = z.object({
  ordering_status: z.enum(["active", "paused"]),
  selling_access_state: z.literal("active_demo"),
}).strict();

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireActiveSelling(context);
    await requirePreparedStoreOperator(base44);
    const access = await updateAccess(base44, context.access, { ordering_status: input.ordering_status });
    return jsonOk(parseShopifyOutput(Output, {
      ordering_status: access.ordering_status,
      selling_access_state: access.selling_access_state,
    }), simulatedProvenance("SIDEWALK fictional test-ordering gate; no payment provider initialized"));
  } catch (error) {
    return jsonError(error, "SIDEWALK set_shopify_store_status");
  }
});
