/**
 * shopify_webhook (v3 §9): HMAC verify (route layer, raw body) + REPLAY PROTECTION +
 * idempotency → exactly one minimal CommerceOrder mirror + exactly one grade-A
 * EvidenceRecord. Invalid signature or replayed delivery produces ZERO writes (§14).
 * No shopper PII is mirrored (invariant 14). Publishes Base44-style realtime events.
 */
import { z } from "zod";
import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { env } from "../env.js";
import { publish } from "../realtime.js";

export function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string): boolean {
  const secret = env("SHOPIFY_WEBHOOK_SECRET", "dev-secret-change-me");
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export function pickupCodeFor(orderId: string): string {
  const h = createHash("sha256").update(`pickup:${orderId}:${env("SHOPIFY_WEBHOOK_SECRET", "dev-secret-change-me")}`).digest("hex");
  return String(parseInt(h.slice(0, 8), 16) % 10000).padStart(4, "0");
}

const Input = z.object({
  vendor_id: z.string(),
  order_id: z.string(), // Shopify order id
  order_number: z.string().optional(),
  amount: z.number(),
  currency: z.string().default("USD"),
  items: z.array(z.object({ shopify_product_id: z.string(), title: z.string(), qty: z.number().int().positive(), unit_price: z.number() })).default([]),
  webhook_id: z.string().optional(), // X-Shopify-Webhook-Id; replayed deliveries reuse it
  order_token: z.string().optional(), // shopper order-page capability (simulated checkout threads it through)
  hmac_verified: z.literal(true), // route layer verifies the raw-body HMAC before calling
});

export type WebhookOut = {
  record_id: string | null;
  order_row_id: string | null;
  deduped: boolean;
  counts: { total: number; a: number; b: number };
};

export const shopify_webhook = defineFn<z.infer<typeof Input>, WebhookOut>("shopify_webhook", Input, async (input) => {
  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const sys: Ctx = { kind: "system" };
  const webhookId = input.webhook_id ?? `wh-${input.order_id}`;

  const counts = () => {
    const all = entities.list(ctx, "EvidenceRecord", { vendor_id: input.vendor_id });
    const a = all.filter((r) => r.grade === "A_card_verified").length;
    return { total: all.length, a, b: all.length - a };
  };

  // Replay protection: a delivery id we've seen writes nothing (recorded for provenance).
  const seen = entities.list(sys, "WebhookReceipt", { webhook_id: webhookId })[0];
  if (seen) return { record_id: null, order_row_id: null, deduped: true, counts: counts() };
  // Idempotency: same order under a fresh delivery id also writes nothing new.
  const dupOrder = entities.list(ctx, "CommerceOrder", { vendor_id: input.vendor_id, shopify_order_id: input.order_id })[0];
  entities.create(sys, "WebhookReceipt", {
    webhook_id: webhookId, order_id: input.order_id, vendor_id: input.vendor_id,
    hmac_ok: true, deduped: Boolean(dupOrder), at: new Date().toISOString(),
  });
  if (dupOrder) {
    const rec = entities.list(ctx, "EvidenceRecord", { vendor_id: input.vendor_id, order_id: input.order_id })[0];
    return { record_id: rec ? rec.id : null, order_row_id: dupOrder.id, deduped: true, counts: counts() };
  }

  const storefront = entities.list(ctx, "Storefront", { vendor_id: input.vendor_id })[0];
  const orderNumber = input.order_number ?? `#${input.order_id.slice(-6).toUpperCase()}`;
  const token = input.order_token ?? randomUUID();
  const code = pickupCodeFor(input.order_id);
  const order = entities.create(ctx, "CommerceOrder", {
    vendor_id: input.vendor_id, storefront_id: storefront?.id ?? null,
    shopify_order_id: input.order_id, order_number: orderNumber,
    items: input.items, total: input.amount, currency: input.currency,
    fulfillment: "new", placed_at: new Date().toISOString(),
    token, pickup_code: code, fulfillment_code_hash: createHash("sha256").update(code).digest("hex"),
  });
  const rec = entities.create(ctx, "EvidenceRecord", {
    vendor_id: input.vendor_id, kind: "order", order_id: input.order_id,
    amount: input.amount, currency: input.currency, at: new Date().toISOString(), grade: "A_card_verified",
  });

  const eventBody = { order_id: order.id, order_number: orderNumber, total: input.amount, currency: input.currency, fulfillment: "new", items: input.items };
  publish(`vendor:${input.vendor_id}`, "order_created", eventBody);
  publish(`order:${token}`, "order_status", { fulfillment: "new", order_number: orderNumber });
  publish("org:*", "order_created", { ...eventBody, vendor_id: input.vendor_id });

  entities.create(ctx, "AppNotification", {
    vendor_id: input.vendor_id, kind: "order", title: orderNumber,
    body: `${input.items.map((i) => `${i.qty}× ${i.title}`).join(", ") || "New order"} — $${input.amount.toFixed(2)}`,
    action_route: "/app/store", dedupe_key: `order:${input.order_id}`,
  });

  return { record_id: rec.id, order_row_id: order.id, deduped: false, counts: counts() };
});
