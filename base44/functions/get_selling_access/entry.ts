import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  jsonError,
  jsonOk,
  parseShopifyOutput,
  publicSellingAccess,
  readStrictJson,
  requireSession,
  requireVendorContext,
  SellingAccessOutput,
  simulatedProvenance,
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
    const context = await requireVendorContext(
      base44,
      input.demo_session_id,
      input.prototype_account_id,
      { createAccess: true, session },
    );
    return jsonOk(
      parseShopifyOutput(SellingAccessOutput, publicSellingAccess(context)),
      simulatedProvenance("SIDEWALK fictional selling-access state; no Shopify result was requested"),
    );
  } catch (error) {
    return jsonError(error, "SIDEWALK get_selling_access");
  }
});
