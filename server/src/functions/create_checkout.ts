/**
 * create_checkout (v3 §9): shopper cart → server-side price/availability revalidation →
 * Shopify-hosted checkout. Client-sent prices are IGNORED — the server prices the cart
 * from its own catalog rows (commerce20-tested). Pickup only. No shopper PII is logged.
 *
 * With Shopify credentials: returns the hosted cart permalink; the order then arrives on
 * the real orders/create webhook. Without: the simulated card step fires the same
 * HMAC-signed webhook at our own endpoint, so the verify path is identical end to end.
 */
import { z } from "zod";
import { createHmac, randomUUID } from "node:crypto";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { env } from "../env.js";
import { shopifyCreds, webhookSecret } from "../shopify.js";
import { pickupCodeFor } from "./shopify_webhook.js";

const Input = z.object({
  slug: z.string(),
  items: z.array(z.object({ item_id: z.string(), qty: z.number().int().min(1).max(20) })).min(1),
  lang: z.string().default("en"),
  // Optional buyer capability ref (device-held, no PII): attaches the order to the
  // shopper's local account so /api/buyer/orders can list their history.
  buyer_ref: z.string().max(64).optional(),
});

export type CheckoutOut =
  | { mode: "shopify"; checkout_url: string; total: number; currency: string }
  | { mode: "simulated"; order_token: string; order_number: string; pickup_code: string; total: number; currency: string };

export const create_checkout = defineFn<z.infer<typeof Input>, CheckoutOut>("create_checkout", Input, async (input) => {
  const sys: Ctx = { kind: "system" };
  const store = entities.list(sys, "Storefront").find((s) => s.slug === input.slug);
  if (!store) throw new Error("storefront not found");
  if (store.open_state !== "open") throw new Error("this store is not taking orders right now");
  const vendorId = String(store.vendor_id);

  // Revalidate every line against the server's catalog: price and availability come from here only.
  const catalog = entities.list(sys, "CatalogItem", { storefront_id: store.id });
  const lines = input.items.map(({ item_id, qty }) => {
    const row = catalog.find((c) => c.id === item_id);
    if (!row) throw new Error("item not found");
    if (row.availability !== "available") throw new Error(`"${Object.values(row.title_by_lang as object)[0]}" is sold out`);
    return { shopify_product_id: String(row.shopify_product_id), title: String(Object.values(row.title_by_lang as object)[0] ?? "Item"), qty, unit_price: Number(row.price) };
  });
  const total = Math.round(lines.reduce((s, l) => s + l.unit_price * l.qty, 0) * 100) / 100;
  const currency = String(catalog[0]?.currency ?? "USD");

  const creds = shopifyCreds();
  if (creds && !lines.some((l) => l.shopify_product_id.startsWith("SIMP-"))) {
    const cart = lines.map((l) => `${l.shopify_product_id}:${l.qty}`).join(",");
    return { mode: "shopify", checkout_url: `https://${creds.shop}/cart/${cart}`, total, currency };
  }

  // Simulated card step: fire the real HMAC-signed orders/create webhook at ourselves.
  const orderId = `SIM-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
  const orderNumber = `#${1000 + (entities.list(sys, "CommerceOrder").length % 9000)}`;
  const token = randomUUID();
  const payload = Buffer.from(JSON.stringify({
    id: orderId, order_number: orderNumber, total_price: total.toFixed(2), currency,
    line_items: lines.map((l) => ({ product_id: l.shopify_product_id, title: l.title, quantity: l.qty, price: l.unit_price.toFixed(2) })),
    note_attributes: [
      { name: "vendor_id", value: vendorId },
      { name: "order_token", value: token },
      ...(input.buyer_ref ? [{ name: "buyer_ref", value: input.buyer_ref }] : []),
    ],
  }));
  const hmac = createHmac("sha256", webhookSecret()).update(payload).digest("base64");
  const port = env("PORT", "4477");
  const r = await fetch(`http://localhost:${port}/webhooks/shopify`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-hmac-sha256": hmac, "x-shopify-webhook-id": randomUUID() },
    body: payload,
  });
  if (!r.ok) throw new Error(`webhook rejected: ${r.status}`);
  return { mode: "simulated", order_token: token, order_number: orderNumber, pickup_code: pickupCodeFor(orderId), total, currency };
});
