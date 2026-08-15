/** shopify_webhook (§9): HMAC verify → EvidenceRecord{grade:"A_card_verified"}. */
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { env } from "../env.js";

export function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string): boolean {
  const secret = env("SHOPIFY_WEBHOOK_SECRET", "dev-secret-change-me");
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

const Input = z.object({
  vendor_id: z.string(),
  order_id: z.string(),
  amount: z.number(),
  currency: z.string().default("USD"),
  hmac_verified: z.literal(true), // route layer verifies the raw-body HMAC before calling
});

export type WebhookOut = { record_id: string; counts: { total: number; a: number; b: number } };

export const shopify_webhook = defineFn<z.infer<typeof Input>, WebhookOut>("shopify_webhook", Input, async (input) => {
  const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
  const dup = entities.list(ctx, "EvidenceRecord", { vendor_id: input.vendor_id, order_id: input.order_id });
  const rec =
    dup[0] ??
    entities.create(ctx, "EvidenceRecord", {
      vendor_id: input.vendor_id, kind: "order", order_id: input.order_id,
      amount: input.amount, currency: input.currency, at: new Date().toISOString(), grade: "A_card_verified",
    });
  const all = entities.list(ctx, "EvidenceRecord", { vendor_id: input.vendor_id });
  const a = all.filter((r) => r.grade === "A_card_verified").length;
  return { record_id: rec.id, counts: { total: all.length, a, b: all.length - a } };
});
