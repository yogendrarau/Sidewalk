/**
 * provision_storefront (§9): CONFIRM-GATED (invariant 9 — the gate physically blocks, tested).
 * Shopify Admin API when credentials exist; otherwise the simulated storefront whose checkout
 * fires a real HMAC-signed orders/create webhook at our own endpoint.
 */
import { z } from "zod";
import QRCode from "qrcode";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { defineFn } from "./_fn.js";
import { entities, signMediaUrl, type Ctx } from "../entities.js";
import { MEDIA_DIR } from "../db.js";
import { env } from "../env.js";

const Input = z.object({
  vendor_id: z.string(),
  display_name: z.string(),
  products: z.array(z.object({ title: z.string(), price_usd: z.number() })).min(1),
  confirm: z.literal(true), // the human confirmation gate: absent/false → schema reject before any side effect
});

export type StorefrontOut = { storefront_id: string; payment_link_url: string; qr_url: string; mode: "shopify" | "simulated" };

export const provision_storefront = defineFn<z.infer<typeof Input>, StorefrontOut>(
  "provision_storefront",
  Input,
  async (input) => {
    const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
    const base = env("PUBLIC_BASE_URL", `http://localhost:${env("PORT", "4477")}`);

    let payment_link_url: string;
    let collection_id = "simulated";
    let mode: "shopify" | "simulated" = "simulated";

    const store = process.env.SHOPIFY_STORE;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    if (store && token) {
      const variantIds: string[] = [];
      for (const p of input.products) {
        const res = await fetch(`https://${store}/admin/api/2025-01/products.json`, {
          method: "POST",
          headers: { "X-Shopify-Access-Token": token, "content-type": "application/json" },
          body: JSON.stringify({
            product: { title: `${input.display_name} — ${p.title}`, variants: [{ price: p.price_usd.toFixed(2) }] },
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`shopify product create ${res.status}`);
        const out = (await res.json()) as { product: { id: number; variants: Array<{ id: number }> } };
        variantIds.push(`${out.product.variants[0].id}:1`);
        collection_id = String(out.product.id);
      }
      payment_link_url = `https://${store}/cart/${variantIds.join(",")}`;
      mode = "shopify";
    } else {
      payment_link_url = `${base}/pay/${input.vendor_id}`;
    }

    const png = await QRCode.toBuffer(payment_link_url, { width: 512, margin: 1 });
    const sha = createHash("sha256").update(png).digest("hex");
    writeFileSync(join(MEDIA_DIR, sha), png);
    const qr_url = signMediaUrl(sha, 7 * 24 * 3600 * 1000);

    const existing = entities.list(ctx, "Storefront", { vendor_id: input.vendor_id })[0];
    const row = existing
      ? entities.update(ctx, "Storefront", existing.id, { payment_link_url, qr_url, shopify_collection_id: collection_id, products: input.products })
      : entities.create(ctx, "Storefront", {
          vendor_id: input.vendor_id, shopify_collection_id: collection_id, payment_link_url, qr_url, products: input.products,
        });
    return { storefront_id: row.id, payment_link_url, qr_url, mode };
  },
);
