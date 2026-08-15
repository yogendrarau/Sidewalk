import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  allowedMediaUrl,
  fixtureMenuForMedia,
  fixtureProvenance,
  assertPreparedConnection,
  isGraphQLGid,
  jsonError,
  jsonOk,
  liveProvenance,
  MEDIA_KINDS,
  parseShopifyOutput,
  readPreparedStoreConfig,
  readStrictJson,
  requirePublishedStorefront,
  requireSession,
  scopedEntityRecords,
  ShopifyPocError,
  storefrontGraphQL,
  SUPPORTED_LOCALES,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  locale: z.enum(SUPPORTED_LOCALES),
  sample_mode: z.boolean().optional(),
}).strict();
const MoneyAmount = z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/).max(20)
  .refine((value) => Number(value) > 0 && Number(value) <= 10_000);
const MediaOutput = z.object({
  previewUrl: z.union([
    z.literal("/shopify-fixtures/rosa-cart-photo.svg"),
    z.string().max(2048).refine(allowedMediaUrl),
  ]),
  kind: z.enum(MEDIA_KINDS),
}).strict();
const Output = z.object({
  vendor_key: z.literal("rosa-v1"),
  store_status: z.enum(["sample", "active", "paused"]),
  items: z.array(z.object({
    shopify_product_id: z.string().refine((value) => isGraphQLGid(value, "Product")).nullable(),
    shopify_variant_id: z.string().refine((value) => isGraphQLGid(value, "ProductVariant")).nullable(),
    handle: z.string().min(1).max(255),
    original_name: z.string().min(1).max(140),
    localized_name: z.string().min(1).max(140),
    price_amount: MoneyAmount,
    currency: z.literal("USD"),
    available: z.boolean(),
    image_url: z.string().url().max(2048).nullable(),
  }).strict()).min(1).max(500),
  cart_enabled: z.boolean(),
  media: z.array(MediaOutput).max(6).optional(),
}).strict();

type StorefrontNodes = {
  nodes: Array<{
    id: string;
    handle: string;
    title: string;
    availableForSale: boolean;
    featuredImage: { url: string; altText: string | null } | null;
    variants: { nodes: Array<{
      id: string;
      title: string;
      availableForSale: boolean;
      price: { amount: string; currencyCode: string };
    }> };
  } | null>;
};

function sampleItems(locale: string) {
  const sample = fixtureMenuForMedia([
    { id: "fixture-board-1", sha256: "7a1363a0362e5fb014aab4696775b922d6f9432c17ebc9920df3adcf1f782fbc" },
    { id: "fixture-board-2", sha256: "16f91ff14df98e163c1a80a7add05344a54682b6367323d3d2e56771cd59c639" },
  ]);
  return sample.items
    .filter((item) => item.priceAmount !== null && item.localItemKey !== "rosa-tamales-board-2")
    .map((item) => ({
      shopify_product_id: null,
      shopify_variant_id: null,
      handle: `sample-${item.localItemKey}`,
      original_name: item.originalName,
      localized_name: (item.localizedNames as Record<string, string>)[locale] ?? item.originalName,
      price_amount: item.priceAmount,
      currency: "USD",
      available: true,
      image_url: null,
    }));
}

async function approvedStorefrontMedia(base44: unknown, demoSessionId: string) {
  const rows = await scopedEntityRecords(base44, "VendorMediaAsset", demoSessionId, {
    vendor_key: "rosa-v1",
    approved_for_storefront: true,
  }, 6);
  return rows
    .sort((left, right) => Number(left.source_order ?? 0) - Number(right.source_order ?? 0))
    .flatMap((row) => {
      if (
        !allowedMediaUrl(row.source_file_url) ||
        typeof row.confirmed_kind !== "string" ||
        !MEDIA_KINDS.includes(row.confirmed_kind as (typeof MEDIA_KINDS)[number])
      ) return [];
      return [{ previewUrl: row.source_file_url, kind: row.confirmed_kind }];
    });
}

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    await requireSession(base44, input.demo_session_id);
    if (input.sample_mode === true) {
      return jsonOk(parseShopifyOutput(Output, {
        vendor_key: "rosa-v1",
        store_status: "sample",
        items: sampleItems(input.locale),
        cart_enabled: false,
        media: [{
          previewUrl: "/shopify-fixtures/rosa-cart-photo.svg",
          kind: "cart_truck_stand_or_venue",
        }],
      }), fixtureProvenance("rosa-sample-store-v1", "Explicit user-selected sample storefront; not a failed live result"));
    }
    const gate = await requirePublishedStorefront(base44, input.demo_session_id);
    const mappings = await scopedEntityRecords(base44, "MenuItemMapping", input.demo_session_id, {
      publication_status: "published",
    }, 100);
    const productIds = [...new Set(mappings.map((mapping) => mapping.shopify_product_id).filter((id) => isGraphQLGid(id, "Product")))] as string[];
    if (productIds.length < 1) throw new ShopifyPocError("storefront_unavailable", 404);
    const config = readPreparedStoreConfig();
    assertPreparedConnection(gate.connection, config);
    const response = await storefrontGraphQL<StorefrontNodes>(config, `
      query SidewalkStorefront($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id handle title availableForSale
            featuredImage { url altText }
            variants(first: 20) {
              nodes { id title availableForSale price { amount currencyCode } }
            }
          }
        }
      }
    `, { ids: productIds });
    const importItems = new Map<string, Record<string, unknown>>();
    for (const menuImport of gate.imports) {
      for (const item of (menuImport.structured_items as Record<string, unknown>[] ?? [])) {
        importItems.set(String(item.localItemKey), item);
      }
    }
    const mappingByProduct = new Map(mappings.map((mapping) => [mapping.shopify_product_id, mapping]));
    const items = response.data.nodes.flatMap((product) => {
      if (!product) return [];
      const mapping = mappingByProduct.get(product.id);
      const local = mapping ? importItems.get(String(mapping.local_item_key)) : null;
      return product.variants.nodes.map((variant) => ({
        shopify_product_id: product.id,
        shopify_variant_id: variant.id,
        handle: product.handle,
        original_name: local?.originalName ?? product.title,
        localized_name: (local?.localizedNames as Record<string, string> | undefined)?.[input.locale] ?? local?.originalName ?? product.title,
        price_amount: variant.price.amount,
        currency: variant.price.currencyCode,
        available: product.availableForSale && variant.availableForSale,
        image_url: product.featuredImage?.url ?? null,
      }));
    });
    if (items.length < 1) throw new ShopifyPocError("storefront_unavailable", 503);
    const media = await approvedStorefrontMedia(base44, input.demo_session_id);
    return jsonOk(parseShopifyOutput(Output, {
      vendor_key: "rosa-v1",
      store_status: gate.access.ordering_status,
      items,
      cart_enabled: gate.access.ordering_status === "active" && items.some((item) => item.available),
      media,
    }), liveProvenance(config, "Shopify Storefront API authoritative catalog read"));
  } catch (error) {
    return jsonError(error, "SIDEWALK get_vendor_storefront", "storefront_unavailable");
  }
});
