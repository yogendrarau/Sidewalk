import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  jsonError,
  jsonOk,
  parseShopifyOutput,
  readStrictJson,
  requireSelfAttested,
  requireSession,
  requireVendorContext,
  simulatedProvenance,
  upsertConnection,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
}).strict();
const Output = z.object({
  setup_state: z.literal("signup_started"),
  merchant_action_required: z.literal(true),
  signup_url: z.literal("https://www.shopify.com/free-trial"),
  account_created: z.literal(false),
}).strict();

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireSelfAttested(context);
    await upsertConnection(base44, context, {
      setup_state: "signup_started",
      integration_mode: "unavailable",
      connection_status: "not_connected",
      granted_scopes: [],
    });
    return jsonOk(parseShopifyOutput(Output, {
      setup_state: "signup_started",
      merchant_action_required: true,
      signup_url: "https://www.shopify.com/free-trial",
      account_created: false,
    }), simulatedProvenance("Shopify-hosted signup handoff; no account was created or connected by SIDEWALK"));
  } catch (error) {
    return jsonError(error, "SIDEWALK begin_shopify_signup");
  }
});
