import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  jsonError,
  jsonOk,
  makeShopifyProvenance,
  parseShopifyOutput,
  publicConnection,
  readStrictJson,
  requireSession,
  requireVendorContext,
  simulatedProvenance,
  ShopifyConnectionOutput,
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
    const provenance = context.connection?.integration_mode === "shopify_test_store"
      ? makeShopifyProvenance("shopify_test_store", "Stored result of a confirmed prepared Shopify test-store probe", {
        shopDomain: context.connection.shop_domain,
        apiVersion: context.connection.api_version,
      })
      : simulatedProvenance("SIDEWALK fictional setup state; no Shopify connection result is being represented");
    return jsonOk(parseShopifyOutput(ShopifyConnectionOutput, publicConnection(context.connection)), provenance);
  } catch (error) {
    return jsonError(error, "SIDEWALK get_shopify_connection");
  }
});
