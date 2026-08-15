import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  jsonError,
  jsonOk,
  parseShopifyOutput,
  readStrictJson,
  requirePreparedStoreOperator,
  requireSession,
  requireVendorContext,
  scopedEntityRecords,
  serviceEntity,
  simulatedProvenance,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
}).strict();
const Output = z.object({
  reset: z.literal(true),
  reset_at: z.string().datetime({ offset: true }),
  certification_status: z.literal("unanswered"),
  selling_access_state: z.literal("locked_needs_status"),
  shopify_setup_state: z.literal("not_started"),
  external_cleanup_performed: z.literal(false),
  external_cleanup_required: z.boolean(),
  external_mapped_product_count: z.number().int().min(0).max(100),
}).strict();

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    // Recreate a missing access row before reset so a retry remains possible if a
    // previous reset stopped after deletion but before reseeding.
    await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, {
      session,
      createAccess: true,
    });
    await requirePreparedStoreOperator(base44);
    const mappings = await scopedEntityRecords(base44, "MenuItemMapping", input.demo_session_id, {}, 100);
    await Promise.all([
      serviceEntity(base44, "ShopifyCartSession").deleteMany({ demo_session_id: input.demo_session_id }),
      serviceEntity(base44, "ShopifyOrderSnapshot").deleteMany({ demo_session_id: input.demo_session_id }),
      serviceEntity(base44, "MenuItemMapping").deleteMany({ demo_session_id: input.demo_session_id }),
      serviceEntity(base44, "MenuImport").deleteMany({ demo_session_id: input.demo_session_id }),
      serviceEntity(base44, "VendorMediaAsset").deleteMany({ demo_session_id: input.demo_session_id }),
      serviceEntity(base44, "ShopifyMerchantConnection").deleteMany({ demo_session_id: input.demo_session_id }),
      serviceEntity(base44, "VendorSellingAccess").deleteMany({ demo_session_id: input.demo_session_id }),
    ]);
    const resetAt = new Date().toISOString();
    await serviceEntity(base44, "VendorSellingAccess").create({
      demo_session_id: input.demo_session_id,
      prototype_account_id: input.prototype_account_id,
      vendor_key: "rosa-v1",
      certification_status: "unanswered",
      selling_access_state: "locked_needs_status",
      ordering_status: "paused",
      is_fictional: true,
      reset_at: resetAt,
      updated_at: resetAt,
    });
    return jsonOk(parseShopifyOutput(Output, {
      reset: true,
      reset_at: resetAt,
      certification_status: "unanswered",
      selling_access_state: "locked_needs_status",
      shopify_setup_state: "not_started",
      external_cleanup_performed: false,
      external_cleanup_required: mappings.length > 0,
      external_mapped_product_count: mappings.length,
    }), simulatedProvenance("Session-only local reset; Shopify products were not modified"));
  } catch (error) {
    return jsonError(error, "SIDEWALK reset_shopify_demo");
  }
});
