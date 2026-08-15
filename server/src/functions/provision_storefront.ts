/**
 * provision_storefront (v3 §9): CONFIRM-GATED (invariant 9 — the gate physically blocks, tested).
 * Creates the merchant microstore: stable public slug, open state, discovery opt-in, QR to the
 * SHOPPER page (/shop/{slug}). Initial products (title + price only — §10.2) become CatalogItems
 * through the same Shopify-or-simulated path as catalog_item_upsert. Idempotent on retry.
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
import { catalog_item_upsert } from "./catalog_item_upsert.js";
import { publish } from "../realtime.js";

const Input = z.object({
  vendor_id: z.string(),
  display_name: z.string(),
  public_name: z.string().optional(), // shopper-facing store name; defaults to display_name
  category: z.string().default("food"),
  pickup_note: z.string().max(120).optional(),
  discovery_opt_in: z.boolean().default(true),
  public_nta: z.string().nullable().optional(),
  langs: z.array(z.string()).default(["es"]),
  lang: z.string().default("es"),
  products: z.array(z.object({ title: z.string().min(1), price_usd: z.number().positive() })).default([]),
  confirm: z.literal(true), // the human confirmation gate: absent/false → schema reject before any side effect
});

export type StorefrontOut = {
  storefront_id: string; slug: string; shopper_url: string; qr_url: string;
  mode: "shopify" | "simulated"; item_ids: string[];
};

export function slugFor(vendorId: string, name: string): string {
  const base = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "vendor";
  return `${base}-${createHash("sha256").update(vendorId).digest("hex").slice(0, 4)}`;
}

export const provision_storefront = defineFn<z.infer<typeof Input>, StorefrontOut>(
  "provision_storefront",
  Input,
  async (input) => {
    const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
    const base = env("PUBLIC_BASE_URL", `http://localhost:${env("PORT", "4477")}`);
    const publicName = input.public_name ?? input.display_name;
    const existing = entities.list(ctx, "Storefront", { vendor_id: input.vendor_id })[0];
    const slug = (existing?.slug as string) ?? slugFor(input.vendor_id, publicName);
    const shopper_url = `${base}/shop/${slug}`;
    const mode: "shopify" | "simulated" = process.env.SHOPIFY_ADMIN_TOKEN ? "shopify" : "simulated";

    const png = await QRCode.toBuffer(shopper_url, { width: 512, margin: 1 });
    const sha = createHash("sha256").update(png).digest("hex");
    writeFileSync(join(MEDIA_DIR, sha), png);
    const qr_url = signMediaUrl(sha, 7 * 24 * 3600 * 1000);

    const data = {
      vendor_id: input.vendor_id, slug, public_name: publicName, langs: input.langs,
      category: input.category, open_state: (existing?.open_state as string) ?? "open",
      pickup_note: input.pickup_note ?? (existing?.pickup_note as string) ?? null,
      discovery_opt_in: input.discovery_opt_in, public_nta: input.public_nta ?? (existing?.public_nta as string) ?? null,
      shopify_collection_id: (existing?.shopify_collection_id as string) ?? (mode === "shopify" ? "pending" : "simulated"),
      payment_link_url: shopper_url, qr_url,
    };
    const row = existing ? entities.update(ctx, "Storefront", existing.id, data) : entities.create(ctx, "Storefront", data);

    const item_ids: string[] = [];
    for (const [i, p] of input.products.entries()) {
      const r = await catalog_item_upsert({
        vendor_id: input.vendor_id, confirm: true, lang: input.lang,
        item: { title: p.title, price_usd: p.price_usd, availability: "available", sort_order: i },
      });
      if (r.ok) item_ids.push(r.data.item_id);
    }
    publish(`vendor:${input.vendor_id}`, "storefront_ready", { slug, shopper_url });
    return { storefront_id: row.id, slug, shopper_url, qr_url, mode, item_ids };
  },
);
