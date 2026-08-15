import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  deriveSellingAccessState,
  jsonError,
  jsonOk,
  parseShopifyOutput,
  publicSellingAccess,
  readStrictJson,
  requireSession,
  requireVendorContext,
  SellingAccessOutput,
  ShopifyPocError,
  simulatedProvenance,
  updateAccess,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  status: z.literal("not_verified"),
}).strict();

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    let context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, {
      createAccess: true,
      session,
    });
    if (context.access.certification_status === "self_attested_demo") {
      throw new ShopifyPocError("invalid_request", 409);
    }
    const access = await updateAccess(base44, context.access, {
      certification_status: "not_verified",
      selling_access_state: deriveSellingAccessState("not_verified", context.connection),
      ordering_status: "paused",
    });
    context = { ...context, access };
    return jsonOk(
      parseShopifyOutput(SellingAccessOutput, publicSellingAccess(context)),
      simulatedProvenance("Vendor-selected fictional certification state; not verified by NYC or Shopify"),
    );
  } catch (error) {
    return jsonError(error, "SIDEWALK set_certification_status");
  }
});
