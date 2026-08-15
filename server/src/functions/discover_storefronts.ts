/**
 * discover_storefronts (v3 §9): sanitized, OPT-IN shopper search. Open stores first.
 * Only allowlisted public fields leave this function (tested: a non-opted-in vendor
 * must never appear, and the field set fails closed).
 */
import { z } from "zod";
import { defineFn } from "./_fn.js";
import { entities, publicStorefront, publicItem, type Ctx } from "../entities.js";

const Input = z.object({
  q: z.string().max(60).optional(),
  lang: z.string().default("en"),
});

export type DiscoverOut = {
  storefronts: Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }>;
};

export const discover_storefronts = defineFn<z.infer<typeof Input>, DiscoverOut>("discover_storefronts", Input, async (input) => {
  const sys: Ctx = { kind: "system" };
  const q = (input.q ?? "").toLowerCase().trim();
  const stores = entities
    .list(sys, "Storefront")
    .filter((s) => s.discovery_opt_in === true && s.open_state !== "paused");
  const out = stores
    .map((s) => {
      const items = entities
        .list(sys, "CatalogItem", { storefront_id: s.id })
        .filter((i) => i.availability === "available")
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
      const hay = [
        s.public_name, s.category,
        ...items.flatMap((i) => Object.values((i.title_by_lang as Record<string, string>) ?? {})),
      ].join(" ").toLowerCase();
      if (q && !hay.includes(q)) return null;
      return {
        ...(publicStorefront(s) as Record<string, unknown>),
        items: items.slice(0, 6).map((i) => publicItem(i) as Record<string, unknown>),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) =>
      ((a as Record<string, unknown>).open_state === "open" ? -1 : 1) -
      ((b as Record<string, unknown>).open_state === "open" ? -1 : 1));
  return { storefronts: out.slice(0, 25) };
});
