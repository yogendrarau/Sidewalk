import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  assertNoUserErrors,
  assertPreparedConnection,
  isGraphQLGid,
  isCartHandle,
  jsonError,
  jsonOk,
  liveProvenance,
  parseShopifyOutput,
  randomHandle,
  readPreparedStoreConfig,
  readStrictJson,
  requirePublishedStorefront,
  requireSession,
  scopedEntityRecords,
  serviceEntity,
  ShopifyPocError,
  storefrontGraphQL,
} from "../../shared/shopifyCore.ts";

const Line = z.object({
  shopify_variant_id: z.string().max(160).refine((value) => isGraphQLGid(value, "ProductVariant")),
  quantity: z.number().int().min(1).max(20),
}).strict();
const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  lines: z.array(Line).min(1).max(20),
}).strict();
const Output = z.object({
  cart_handle: z.string().refine(isCartHandle),
  lines: z.array(z.object({
    shopify_variant_id: z.string().refine((value) => isGraphQLGid(value, "ProductVariant")),
    quantity: z.number().int().min(1).max(20),
  }).strict()).min(1).max(50),
  total_quantity: z.number().int().min(1).max(400),
  subtotal: z.object({
    amount: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/).max(20),
    currency: z.literal("USD"),
  }).strict(),
  checkout_available: z.literal(true),
}).strict();

type CartPayload = {
  cartCreate: {
    cart: {
      id: string;
      totalQuantity: number;
      cost: { subtotalAmount: { amount: string; currencyCode: string } };
      lines: { nodes: Array<{
        quantity: number;
        merchandise: { id: string };
      }> };
    } | null;
    userErrors: unknown[];
    warnings: unknown[];
  };
};

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    await requireSession(base44, input.demo_session_id);
    const gate = await requirePublishedStorefront(base44, input.demo_session_id);
    if (gate.access.ordering_status !== "active") throw new ShopifyPocError("ordering_paused", 403);
    const mappings = await scopedEntityRecords(base44, "MenuItemMapping", input.demo_session_id, {
      publication_status: "published",
    }, 100);
    const allowedVariants = new Set(
      mappings.flatMap((mapping) => Array.isArray(mapping.shopify_variant_ids) ? mapping.shopify_variant_ids : []),
    );
    if (input.lines.some((line) => !allowedVariants.has(line.shopify_variant_id))) {
      throw new ShopifyPocError("session_owner_mismatch", 403);
    }
    const config = readPreparedStoreConfig();
    assertPreparedConnection(gate.connection, config);
    const result = await storefrontGraphQL<CartPayload>(config, `
      mutation SidewalkCartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id totalQuantity
            cost { subtotalAmount { amount currencyCode } }
            lines(first: 50) {
              nodes { quantity merchandise { ... on ProductVariant { id } } }
            }
          }
          userErrors { field message code }
          warnings { message code }
        }
      }
    `, {
      input: {
        lines: input.lines.map((line) => ({ merchandiseId: line.shopify_variant_id, quantity: line.quantity })),
        attributes: [{ key: "sidewalk_demo", value: "fictional_hackathon" }],
      },
    });
    assertNoUserErrors(result.data.cartCreate);
    const cart = result.data.cartCreate.cart;
    if (!cart || typeof cart.id !== "string" || cart.id.length < 20) {
      throw new ShopifyPocError("cart_unavailable", 503);
    }
    const now = new Date().toISOString();
    const cartHandle = randomHandle();
    // The raw Shopify cart id contains a ?key= secret. It is stored only in this
    // admin-RLS entity and is never returned to the browser or written to logs.
    await serviceEntity(base44, "ShopifyCartSession").create({
      demo_session_id: input.demo_session_id,
      cart_handle: cartHandle,
      shopify_cart_id: cart.id,
      created_at: now,
      updated_at: now,
    });
    return jsonOk(parseShopifyOutput(Output, {
      cart_handle: cartHandle,
      lines: cart.lines.nodes.map((line) => ({
        shopify_variant_id: line.merchandise.id,
        quantity: line.quantity,
      })),
      total_quantity: cart.totalQuantity,
      subtotal: {
        amount: cart.cost.subtotalAmount.amount,
        currency: cart.cost.subtotalAmount.currencyCode,
      },
      checkout_available: true,
    }), liveProvenance(config, "Shopify Storefront API confirmed a fictional test cart"), 201);
  } catch (error) {
    return jsonError(error, "SIDEWALK create_shopify_cart", "cart_unavailable");
  }
});
