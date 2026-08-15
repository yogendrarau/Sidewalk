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
  SHOPIFY_DISCLOSURE_VERSION,
  SellingAccessOutput,
  simulatedProvenance,
  updateAccess,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  confirmed: z.literal(true),
  disclosure_version: z.literal(SHOPIFY_DISCLOSURE_VERSION),
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
    const now = new Date().toISOString();
    const access = await updateAccess(base44, context.access, {
      certification_status: "self_attested_demo",
      selling_access_state: deriveSellingAccessState("self_attested_demo", context.connection),
      ordering_status: context.connection?.connection_status === "connected" ? "active" : "paused",
      attested_at: context.access.attested_at ?? now,
      disclosure_version: SHOPIFY_DISCLOSURE_VERSION,
    });
    context = { ...context, access };
    return jsonOk(
      parseShopifyOutput(SellingAccessOutput, publicSellingAccess(context)),
      simulatedProvenance("Vendor-confirmed self-attestation; not checked or verified by NYC"),
    );
  } catch (error) {
    return jsonError(error, "SIDEWALK confirm_certification_self_attestation");
  }
});
