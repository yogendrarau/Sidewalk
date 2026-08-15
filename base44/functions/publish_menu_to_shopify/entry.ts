import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  adminGraphQL,
  assertNoUserErrors,
  deterministicProductHandle,
  findScopedById,
  isGraphQLGid,
  jsonError,
  jsonOk,
  liveProvenance,
  parseShopifyOutput,
  readPreparedStoreConfig,
  readStrictJson,
  requireActiveSelling,
  requirePreparedStoreOperator,
  requireSession,
  requireVendorContext,
  scopedEntityRecords,
  serviceEntity,
  ShopifyPocError,
  type ConfirmedMenuItem,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  menu_import_id: z.string().min(1).max(160),
  confirmed: z.literal(true),
}).strict();
const PublishedResultOutput = z.object({
  local_item_key: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,80}$/),
  status: z.literal("published"),
  shopify_product_id: z.string().refine((value) => isGraphQLGid(value, "Product")),
  shopify_variant_ids: z.array(
    z.string().refine((value) => isGraphQLGid(value, "ProductVariant")),
  ).min(1).max(20),
}).strict();
const FailedResultOutput = z.object({
  local_item_key: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,80}$/),
  status: z.literal("failed"),
  error_code: z.string().min(1).max(160),
}).strict();
const Output = z.object({
  menu_import_id: z.string().min(1).max(160),
  sync_state: z.enum(["published", "partially_published", "sync_failed"]),
  results: z.array(z.discriminatedUnion("status", [PublishedResultOutput, FailedResultOutput])).min(1).max(30),
}).strict();

type ProductSetPayload = {
  productSet: {
    product: {
      id: string;
      handle: string;
      status: string;
      variants: { nodes: Array<{ id: string; price: string }> };
    } | null;
    userErrors: unknown[];
  };
};
type PublishPayload = {
  publishablePublish: {
    publishable: { publishedOnPublication: boolean } | null;
    userErrors: unknown[];
  };
};

function productInput(item: ConfirmedMenuItem, handle: string, status: "DRAFT" | "ACTIVE") {
  const option = item.options[0];
  const optionName = option?.name ?? "Title";
  const values = option?.values ?? ["Default Title"];
  return {
    title: item.originalName,
    handle,
    descriptionHtml: item.originalDescription ?? "",
    vendor: "Rosa — SIDEWALK fictional demo",
    status,
    tags: ["sidewalk-demo", "fictional-hackathon-product"],
    metafields: [{
      namespace: "sidewalk",
      key: "demo_item_key",
      type: "single_line_text_field",
      value: item.localItemKey,
    }],
    productOptions: [{
      name: optionName,
      position: 1,
      values: values.map((name) => ({ name })),
    }],
    variants: values.map((name) => ({
      optionValues: [{ optionName, name }],
      price: item.priceAmount,
    })),
  };
}

async function setProduct(
  config: ReturnType<typeof readPreparedStoreConfig>,
  identifier: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  const result = await adminGraphQL<ProductSetPayload>(config, `
    mutation SidewalkProductSet($identifier: ProductSetIdentifiers, $input: ProductSetInput!) {
      productSet(identifier: $identifier, synchronous: true, input: $input) {
        product { id handle status variants(first: 20) { nodes { id price } } }
        userErrors { field message code }
      }
    }
  `, { identifier, input });
  assertNoUserErrors(result.data.productSet);
  const product = result.data.productSet.product;
  if (
    !product ||
    !isGraphQLGid(product.id, "Product") ||
    product.variants.nodes.length < 1 ||
    product.variants.nodes.some((variant) => !isGraphQLGid(variant.id, "ProductVariant"))
  ) throw new ShopifyPocError("shopify_graphql_error", 503);
  return product;
}

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireActiveSelling(context);
    await requirePreparedStoreOperator(base44);
    const menuImport = await findScopedById(base44, "MenuImport", input.demo_session_id, input.menu_import_id);
    if (!menuImport) throw new ShopifyPocError("menu_import_not_found", 404);
    if (menuImport.prototype_account_id !== input.prototype_account_id) {
      throw new ShopifyPocError("session_owner_mismatch", 403);
    }
    if (menuImport.status !== "confirmed" && menuImport.status !== "partially_published" && menuImport.status !== "sync_failed") {
      throw new ShopifyPocError("menu_confirmation_required", 422);
    }
    const items = menuImport.structured_items as ConfirmedMenuItem[];
    if (!Array.isArray(items) || items.length < 1 || items.some((item) => item.priceConfirmed !== true)) {
      throw new ShopifyPocError("menu_confirmation_required", 422);
    }
    const config = readPreparedStoreConfig();
    if (
      context.connection?.shop_domain !== config.shopDomain ||
      context.connection.publication_id !== config.publicationId ||
      context.connection.api_version !== config.apiVersion
    ) throw new ShopifyPocError("shopify_connection_required", 403);

    await serviceEntity(base44, "MenuImport").update(input.menu_import_id, {
      status: "publishing",
      updated_at: new Date().toISOString(),
    });
    const results = [];
    for (const item of items) {
      const handle = deterministicProductHandle(input.demo_session_id, item.localItemKey);
      const mappings = await scopedEntityRecords(base44, "MenuItemMapping", input.demo_session_id, {
        local_item_key: item.localItemKey,
      }, 3);
      let mapping = mappings.find((row) => row.prototype_account_id === input.prototype_account_id) ?? null;
      try {
        let product;
        if (mapping && isGraphQLGid(mapping.shopify_product_id, "Product")) {
          product = await setProduct(config, { id: mapping.shopify_product_id }, productInput(item, handle, "ACTIVE"));
        } else {
          // The deterministic handle is a recovery guard for the first write; the persisted
          // Shopify product mapping becomes the primary identity for every later retry.
          product = await setProduct(config, { handle }, productInput(item, handle, "DRAFT"));
          const now = new Date().toISOString();
          const mappingValues = {
            demo_session_id: input.demo_session_id,
            prototype_account_id: input.prototype_account_id,
            menu_import_id: input.menu_import_id,
            local_item_key: item.localItemKey,
            deterministic_handle: handle,
            shopify_product_id: product.id,
            shopify_variant_ids: product.variants.nodes.map((variant) => variant.id),
            publication_status: "draft_created",
            last_synced_at: now,
            provenance: liveProvenance(config, "Shopify productSet confirmed a draft product"),
          };
          mapping = await serviceEntity(base44, "MenuItemMapping").create(mappingValues);
          product = await setProduct(config, { id: product.id }, productInput(item, handle, "ACTIVE"));
        }
        const published = await adminGraphQL<PublishPayload>(config, `
          mutation SidewalkPublish($id: ID!, $publicationId: ID!) {
            publishablePublish(id: $id, input: [{ publicationId: $publicationId }]) {
              publishable { publishedOnPublication(publicationId: $publicationId) }
              userErrors { field message }
            }
          }
        `, { id: product.id, publicationId: config.publicationId });
        assertNoUserErrors(published.data.publishablePublish);
        if (published.data.publishablePublish.publishable?.publishedOnPublication !== true) {
          throw new ShopifyPocError("shopify_user_error", 422);
        }
        const now = new Date().toISOString();
        mapping = mapping && mapping.id
          ? await serviceEntity(base44, "MenuItemMapping").update(String(mapping.id), {
            shopify_product_id: product.id,
            shopify_variant_ids: product.variants.nodes.map((variant) => variant.id),
            publication_status: "published",
            last_synced_at: now,
            provenance: liveProvenance(config, "Shopify confirmed active product publication"),
          })
          : mapping;
        results.push({
          local_item_key: item.localItemKey,
          status: "published",
          shopify_product_id: product.id,
          shopify_variant_ids: product.variants.nodes.map((variant) => variant.id),
        });
      } catch (error) {
        const errorCode = error instanceof ShopifyPocError ? error.code : "shopify_network_error";
        if (mapping?.id) {
          await serviceEntity(base44, "MenuItemMapping").update(String(mapping.id), {
            publication_status: "sync_failed",
            last_synced_at: new Date().toISOString(),
            last_error_code: errorCode,
          }).catch(() => undefined);
        }
        results.push({ local_item_key: item.localItemKey, status: "failed", error_code: errorCode });
      }
    }
    const publishedCount = results.filter((result) => result.status === "published").length;
    const syncState = publishedCount === results.length
      ? "published"
      : publishedCount > 0
      ? "partially_published"
      : "sync_failed";
    const now = new Date().toISOString();
    await serviceEntity(base44, "MenuImport").update(input.menu_import_id, {
      status: syncState,
      ...(publishedCount > 0 ? { published_at: now } : {}),
      updated_at: now,
    });
    return jsonOk(parseShopifyOutput(Output, {
      menu_import_id: input.menu_import_id,
      sync_state: syncState,
      results,
    }), liveProvenance(config, "Prepared Shopify test-store product synchronization"));
  } catch (error) {
    return jsonError(error, "SIDEWALK publish_menu_to_shopify");
  }
});
