import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  jsonError,
  readStrictJson,
  requireSelfAttested,
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
    requireSelfAttested(context);
    // OAuth callback handling is intentionally absent: this prototype has no
    // authenticated merchant ownership or encrypted per-merchant token vault.
    throw new ShopifyPocError("oauth_disabled_production_pilot", 501);
  } catch (error) {
    return jsonError(error, "SIDEWALK Shopify OAuth callback production-pilot gate");
  }
});
