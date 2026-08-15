import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  adminGraphQL,
  assertPreparedConnection,
  assertNoUserErrors,
  findScopedById,
  isGraphQLGid,
  jsonError,
  jsonOk,
  liveProvenance,
  normalizePrice,
  parseShopifyOutput,
  readPreparedStoreConfig,
  readStrictJson,
  requireActiveSelling,
  requirePreparedStoreOperator,
  requireSession,
  requireVendorContext,
  safeText,
  scopedEntityRecords,
  serviceEntity,
  ShopifyPocError,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  local_item_key: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,80}$/),
  price_amount: z.union([z.string(), z.number()]).optional(),
  available: z.boolean().optional(),
  name: z.string().max(140).optional(),
}).strict().refine((value) => value.price_amount !== undefined || value.available !== undefined || value.name !== undefined);
const Output = z.object({
  local_item_key: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,80}$/),
  sync_state: z.literal("synced"),
  price_amount: z.string().regex(/^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]{2})$/)
    .refine((value) => Number(value) > 0 && Number(value) <= 10_000)
    .nullable(),
  available: z.boolean().nullable(),
  name: z.string().min(1).max(140).nullable(),
  synced_at: z.string().datetime({ offset: true }),
}).strict();

type MutationPayload = Record<string, { userErrors: unknown[] } | null>;

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireActiveSelling(context);
    await requirePreparedStoreOperator(base44);
    const mappings = await scopedEntityRecords(base44, "MenuItemMapping", input.demo_session_id, {
      local_item_key: input.local_item_key,
      publication_status: "published",
    }, 3);
    const mapping = mappings.find((row) => row.prototype_account_id === input.prototype_account_id);
    if (!mapping || !isGraphQLGid(mapping.shopify_product_id, "Product")) {
      throw new ShopifyPocError("menu_import_not_found", 404);
    }
    const config = readPreparedStoreConfig();
    assertPreparedConnection(context.connection, config);
    const name = input.name === undefined ? null : safeText(input.name, 140);
    const price = input.price_amount === undefined ? null : normalizePrice(input.price_amount);
    if (input.name !== undefined && !name) throw new ShopifyPocError("invalid_request", 400);
    if (input.price_amount !== undefined && !price) throw new ShopifyPocError("invalid_request", 400);

    let externalMutationAttempted = false;
    try {
      if (price) {
        const variantIds = Array.isArray(mapping.shopify_variant_ids) ? mapping.shopify_variant_ids : [];
        if (variantIds.length < 1 || variantIds.some((id) => !isGraphQLGid(id, "ProductVariant"))) {
          throw new ShopifyPocError("shopify_graphql_error", 503);
        }
        externalMutationAttempted = true;
        const changed = await adminGraphQL<MutationPayload>(config, `
          mutation SidewalkVariantPrices($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }
        `, {
          productId: mapping.shopify_product_id,
          variants: variantIds.map((id) => ({ id, price })),
        });
        assertNoUserErrors(changed.data.productVariantsBulkUpdate);
      }
      if (name || input.available !== undefined) {
        externalMutationAttempted = true;
        const changed = await adminGraphQL<MutationPayload>(config, `
          mutation SidewalkProductUpdate($product: ProductUpdateInput!) {
            productUpdate(product: $product) { userErrors { field message } }
          }
        `, {
          product: {
            id: mapping.shopify_product_id,
            ...(name ? { title: name } : {}),
            ...(input.available !== undefined ? { status: input.available ? "ACTIVE" : "DRAFT" } : {}),
          },
        });
        assertNoUserErrors(changed.data.productUpdate);
      }
      if (input.available === true) {
        externalMutationAttempted = true;
        const published = await adminGraphQL<MutationPayload>(config, `
          mutation SidewalkRepublish($id: ID!, $publicationId: ID!) {
            publishablePublish(id: $id, input: [{ publicationId: $publicationId }]) {
              userErrors { field message }
            }
          }
        `, { id: mapping.shopify_product_id, publicationId: config.publicationId });
        assertNoUserErrors(published.data.publishablePublish);
      }

      const menuImport = await findScopedById(base44, "MenuImport", input.demo_session_id, String(mapping.menu_import_id));
      if (menuImport && Array.isArray(menuImport.structured_items)) {
        const items = (menuImport.structured_items as Record<string, unknown>[]).map((item) =>
          item.localItemKey === input.local_item_key
            ? {
              ...item,
              ...(name ? { originalName: name } : {}),
              ...(price ? { priceAmount: price, priceConfirmed: true } : {}),
            }
            : item
        );
        await serviceEntity(base44, "MenuImport").update(String(menuImport.id), {
          structured_items: items,
          updated_at: new Date().toISOString(),
        });
      }
      const now = new Date().toISOString();
      await serviceEntity(base44, "MenuItemMapping").update(String(mapping.id), {
        last_synced_at: now,
        publication_status: input.available === false ? "draft_created" : "published",
        provenance: liveProvenance(config, "Shopify confirmed menu item update"),
      });
      return jsonOk(parseShopifyOutput(Output, {
        local_item_key: input.local_item_key,
        sync_state: "synced",
        price_amount: price,
        available: input.available ?? null,
        name,
        synced_at: now,
      }), liveProvenance(config, "Shopify confirmed menu item update"));
    } catch (error) {
      // Once a Shopify mutation has been attempted, local/external parity cannot
      // be asserted after any later failure (including an ambiguous network one).
      if (externalMutationAttempted) {
        const errorCode = error instanceof ShopifyPocError ? error.code : "shopify_network_error";
        await serviceEntity(base44, "MenuItemMapping").update(String(mapping.id), {
          publication_status: "sync_failed",
          last_synced_at: new Date().toISOString(),
          last_error_code: errorCode,
        }).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    return jsonError(error, "SIDEWALK update_shopify_menu_item");
  }
});
