import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  isCartHandle,
  assertPreparedConnection,
  jsonError,
  jsonOk,
  liveProvenance,
  parseShopifyOutput,
  readPreparedStoreConfig,
  readStrictJson,
  requirePublishedStorefront,
  requireSession,
  scopedEntityRecords,
  ShopifyPocError,
  storefrontGraphQL,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  cart_handle: z.string().refine(isCartHandle),
  confirmed_test_checkout: z.literal(true),
}).strict();
const Output = z.object({
  checkout_url: z.string().url().max(2048),
  label: z.literal("TEST CHECKOUT — NO REAL CHARGE"),
  use_fictional_information_only: z.literal(true),
  total_quantity: z.number().int().min(1).max(400),
  subtotal: z.object({
    amount: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/).max(20),
    currency: z.literal("USD"),
  }).strict(),
}).strict();

type CartQuery = {
  cart: {
    checkoutUrl: string;
    totalQuantity: number;
    cost: { subtotalAmount: { amount: string; currencyCode: string } };
  } | null;
};

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    await requireSession(base44, input.demo_session_id);
    const gate = await requirePublishedStorefront(base44, input.demo_session_id);
    if (gate.access.ordering_status !== "active") throw new ShopifyPocError("ordering_paused", 403);
    const rows = await scopedEntityRecords(base44, "ShopifyCartSession", input.demo_session_id, {
      cart_handle: input.cart_handle,
    }, 1);
    const cartSession = rows[0];
    if (!cartSession || typeof cartSession.shopify_cart_id !== "string") {
      throw new ShopifyPocError("cart_unavailable", 404);
    }
    const config = readPreparedStoreConfig();
    assertPreparedConnection(gate.connection, config);
    const response = await storefrontGraphQL<CartQuery>(config, `
      query SidewalkCheckout($cartId: ID!) {
        cart(id: $cartId) {
          checkoutUrl totalQuantity
          cost { subtotalAmount { amount currencyCode } }
        }
      }
    `, { cartId: cartSession.shopify_cart_id });
    if (!response.data.cart) throw new ShopifyPocError("checkout_unavailable", 404);
    let checkoutUrl;
    try {
      checkoutUrl = new URL(response.data.cart.checkoutUrl);
    } catch {
      throw new ShopifyPocError("checkout_unavailable", 503);
    }
    if (
      checkoutUrl.protocol !== "https:" ||
      checkoutUrl.hostname !== config.shopDomain
    ) throw new ShopifyPocError("checkout_unavailable", 503);
    return jsonOk(parseShopifyOutput(Output, {
      checkout_url: checkoutUrl.toString(),
      label: "TEST CHECKOUT — NO REAL CHARGE",
      use_fictional_information_only: true,
      total_quantity: response.data.cart.totalQuantity,
      subtotal: {
        amount: response.data.cart.cost.subtotalAmount.amount,
        currency: response.data.cart.cost.subtotalAmount.currencyCode,
      },
    }), liveProvenance(config, "Shopify Storefront API confirmed a hosted test-checkout URL"));
  } catch (error) {
    return jsonError(error, "SIDEWALK get_shopify_checkout_url", "checkout_unavailable");
  }
});
