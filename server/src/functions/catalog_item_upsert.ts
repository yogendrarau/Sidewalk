/**
 * catalog_item_upsert (v3 §9): merchant-first catalog creation.
 * Two entry points:
 *  - catalog_draft: menu photo → quarantined schema-constrained extraction → DRAFT items
 *    (no writes; prices stay null unless printed — invariant 2, §10.2 "never invent a price").
 *  - catalog_item_upsert: CONFIRM-GATED write (invariant 9 — publishing/changing a price
 *    physically blocks without `confirm: true` and an explicit numeric price).
 * Shopify is source of truth (invariant 14): Admin API product create/update when credentials
 * exist; otherwise a simulated product id so the loop still runs end to end.
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, type Ctx } from "../entities.js";
import { runExtraction } from "../extraction.js";
import { publish } from "../realtime.js";

const DraftInput = z.object({
  vendor_id: z.string(),
  sha256: z.string(),
  ext: z.string().default("png"),
});

export type DraftItem = { title: string; price_usd: number | null };
export type DraftOut = { items: DraftItem[]; model_tier: string; needs_price_count: number };

export const catalog_draft = defineFn<z.infer<typeof DraftInput>, DraftOut>("catalog_draft", DraftInput, async (input) => {
  const ex = await runExtraction(input.sha256, "menu", input.ext);
  let items: DraftItem[] = [];
  const raw = ex.fields.items_json;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as Array<{ title?: unknown; price_usd?: unknown }>;
      items = parsed
        .filter((p) => typeof p.title === "string" && (p.title as string).trim().length > 0)
        .map((p) => ({
          title: String(p.title).slice(0, 80),
          price_usd: typeof p.price_usd === "number" && p.price_usd > 0 ? p.price_usd : null,
        }));
    } catch {
      items = []; // unreadable → empty draft, manual entry path (never a guess)
    }
  }
  return { items, model_tier: ex.model_tier, needs_price_count: items.filter((i) => i.price_usd === null).length };
});

const UpsertInput = z.object({
  vendor_id: z.string(),
  confirm: z.literal(true), // the merchant confirmation gate: absent/false → schema reject before any side effect
  item: z.object({
    id: z.string().optional(), // existing CatalogItem id → update
    title: z.string().min(1).max(80),
    price_usd: z.number().positive(), // a price is never inferred; publishing requires an explicit number
    availability: z.enum(["available", "sold_out", "hidden"]).default("available"),
    description: z.string().max(300).optional(),
    image_sha: z.string().optional(),
    sort_order: z.number().int().default(0),
  }),
  lang: z.string().default("es"),
});

export type UpsertOut = { item_id: string; shopify_product_id: string; mode: "shopify" | "simulated" };

async function shopifyProductUpsert(existingId: string | null, title: string, priceUsd: number): Promise<{ id: string; mode: "shopify" | "simulated" }> {
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!store || !token) return { id: existingId ?? `SIMP-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, mode: "simulated" };
  const isUpdate = existingId && !existingId.startsWith("SIMP-");
  const url = isUpdate
    ? `https://${store}/admin/api/2025-01/products/${existingId}.json`
    : `https://${store}/admin/api/2025-01/products.json`;
  const res = await fetch(url, {
    method: isUpdate ? "PUT" : "POST",
    headers: { "X-Shopify-Access-Token": token, "content-type": "application/json" },
    body: JSON.stringify({ product: { ...(isUpdate ? { id: Number(existingId) } : {}), title, variants: [{ price: priceUsd.toFixed(2) }] } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`shopify product ${isUpdate ? "update" : "create"} ${res.status}`);
  const out = (await res.json()) as { product: { id: number } };
  return { id: String(out.product.id), mode: "shopify" };
}

export const catalog_item_upsert = defineFn<z.infer<typeof UpsertInput>, UpsertOut>(
  "catalog_item_upsert",
  UpsertInput,
  async (input) => {
    const ctx: Ctx = { kind: "vendor", vendor_id: input.vendor_id };
    const storefront = entities.list(ctx, "Storefront", { vendor_id: input.vendor_id })[0];
    if (!storefront) throw new Error("no storefront yet — provision it first (also confirm-gated)");

    const existing = input.item.id ? entities.get(ctx, "CatalogItem", input.item.id) : null;
    if (input.item.id && !existing) throw new Error("item not found");

    const sp = await shopifyProductUpsert(existing ? String(existing.shopify_product_id) : null, input.item.title, input.item.price_usd);
    const data = {
      vendor_id: input.vendor_id,
      storefront_id: storefront.id,
      shopify_product_id: sp.id,
      title_by_lang: { ...((existing?.title_by_lang as Record<string, string>) ?? {}), [input.lang]: input.item.title },
      description_by_lang: input.item.description
        ? { ...((existing?.description_by_lang as Record<string, string>) ?? {}), [input.lang]: input.item.description }
        : ((existing?.description_by_lang as Record<string, string>) ?? undefined),
      price: input.item.price_usd,
      currency: "USD",
      image_url: input.item.image_sha ? `/media/${input.item.image_sha}` : ((existing?.image_url as string) ?? null),
      availability: input.item.availability,
      sort_order: input.item.sort_order,
    };
    const row = existing
      ? entities.update(ctx, "CatalogItem", existing.id, data)
      : entities.create(ctx, "CatalogItem", data);
    publish(`vendor:${input.vendor_id}`, "catalog_changed", { item_id: row.id, availability: input.item.availability });
    return { item_id: row.id, shopify_product_id: sp.id, mode: sp.mode };
  },
);
