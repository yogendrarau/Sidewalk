import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  aiProvenance,
  fixtureForHash,
  fixtureMenuForMedia,
  findScopedById,
  jsonError,
  jsonOk,
  normalizePrice,
  parseShopifyOutput,
  PublicProvenanceOutput,
  readStrictJson,
  requireCertificationAnswered,
  requireSession,
  requireVendorContext,
  safeText,
  serviceEntity,
  ShopifyPocError,
  SUPPORTED_LOCALES,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  media_ids: z.array(z.string().min(1).max(160)).min(1).max(6),
}).strict();

const AiItem = z.object({
  originalName: z.string().max(140).nullable(),
  localizedNames: z.record(z.string(), z.string().max(140)),
  originalDescription: z.string().max(500).nullable(),
  localizedDescriptions: z.record(z.string(), z.string().max(500)),
  priceAmount: z.string().max(20).nullable(),
  category: z.string().max(80).nullable(),
  options: z.array(z.object({
    name: z.string().max(40),
    values: z.array(z.string().max(40)).min(1).max(10),
  }).strict()).max(1),
  sourceImageIndexes: z.array(z.number().int().min(0).max(5)).min(1).max(6),
  confidence: z.object({
    name: z.number().min(0).max(1),
    price: z.number().min(0).max(1),
    description: z.number().min(0).max(1),
    options: z.number().min(0).max(1),
  }).strict(),
}).strict();
const AiOutput = z.object({ items: z.array(AiItem).max(30) }).strict();

const LocalizedNamesOutput = z.object({
  en: z.string().min(1).max(140),
  es: z.string().min(1).max(140),
  wo: z.string().min(1).max(140),
  ar: z.string().min(1).max(140),
  bn: z.string().min(1).max(140),
  "zh-Hans": z.string().min(1).max(140),
  fr: z.string().min(1).max(140),
}).strict();
const LocalizedDescriptionsOutput = z.object({
  en: z.string().min(1).max(500).optional(),
  es: z.string().min(1).max(500).optional(),
  wo: z.string().min(1).max(500).optional(),
  ar: z.string().min(1).max(500).optional(),
  bn: z.string().min(1).max(500).optional(),
  "zh-Hans": z.string().min(1).max(500).optional(),
  fr: z.string().min(1).max(500).optional(),
}).strict();
const MenuItemOutput = z.object({
  localItemKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,80}$/),
  sourceImageIds: z.array(z.string().min(1).max(160)).min(1).max(6),
  originalName: z.string().min(1).max(140).nullable(),
  localizedNames: LocalizedNamesOutput,
  originalDescription: z.string().min(1).max(500).nullable(),
  localizedDescriptions: LocalizedDescriptionsOutput,
  priceAmount: z.string().regex(/^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]{2})$/)
    .refine((value) => Number(value) > 0 && Number(value) <= 10_000)
    .nullable(),
  currency: z.literal("USD"),
  category: z.string().min(1).max(80).nullable(),
  options: z.array(z.object({
    name: z.string().min(1).max(40),
    values: z.array(z.string().min(1).max(40)).min(1).max(10),
  }).strict()).max(1),
  confidence: z.object({
    name: z.number().min(0).max(1),
    price: z.number().min(0).max(1),
    description: z.number().min(0).max(1),
    options: z.number().min(0).max(1),
  }).strict(),
  needsConfirmation: z.array(z.enum(["price", "unclear_price", "likely_duplicate"])).min(1).max(3),
  fieldOrigins: z.object({
    name: z.enum(["ai_extracted", "unclear"]),
    price: z.enum(["ai_extracted", "unclear"]),
  }).strict(),
}).strict();
const DuplicateGroupOutput = z.object({
  group_id: z.string().min(1).max(160),
  local_item_keys: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{2,80}$/)).min(2).max(30),
  reason: z.string().min(1).max(500),
  requires_confirmation: z.literal(true),
}).strict();
const Output = z.object({
  menu_import: z.object({
    id: z.string().min(1).max(160),
    status: z.literal("review_required"),
    currency: z.literal("USD"),
    items: z.array(MenuItemOutput).min(1).max(30),
  }).strict(),
  duplicate_groups: z.array(DuplicateGroupOutput).max(15),
  extraction_provenance: PublicProvenanceOutput,
}).strict();

function duplicateGroups(items: Array<Record<string, unknown>>) {
  const buckets = new Map<string, string[]>();
  for (const item of items) {
    const name = String(item.originalName ?? "").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const key = name ? `${name}|${item.priceAmount ?? "?"}` : "";
    if (!key) continue;
    buckets.set(key, [...(buckets.get(key) ?? []), String(item.localItemKey)]);
  }
  return [...buckets.entries()]
    .filter(([, keys]) => keys.length > 1)
    .map(([key, keys], index) => ({
      group_id: `duplicate-${index + 1}`,
      local_item_keys: keys,
      reason: `same_normalized_name_and_price:${key}`,
      requires_confirmation: true,
    }));
}

type StoredMedia = { id: string; sha256: string; source_file_url: string };

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireCertificationAnswered(context);
    const media: StoredMedia[] = [];
    for (const id of input.media_ids) {
      const record = await findScopedById(base44, "VendorMediaAsset", input.demo_session_id, id);
      if (!record || record.prototype_account_id !== input.prototype_account_id) {
        throw new ShopifyPocError("session_owner_mismatch", 403);
      }
      if (record.confirmed_kind !== "menu_or_price_board") {
        throw new ShopifyPocError("media_not_menu", 422);
      }
      const exactFixture = fixtureForHash(record.sha256);
      if (exactFixture && exactFixture.kind !== "menu_or_price_board") {
        throw new ShopifyPocError("media_not_menu", 422);
      }
      if (
        typeof record.id !== "string" ||
        typeof record.sha256 !== "string" ||
        typeof record.source_file_url !== "string"
      ) throw new ShopifyPocError("media_fetch_failed", 422);
      media.push({
        id: record.id,
        sha256: record.sha256,
        source_file_url: record.source_file_url,
      });
    }

    let items: Array<Record<string, unknown>>;
    let duplicates: Array<Record<string, unknown>>;
    let extractionProvenance;
    if (media.every((asset) => fixtureForHash(asset.sha256)?.kind === "menu_or_price_board")) {
      const fixture = fixtureMenuForMedia(media);
      items = fixture.items;
      duplicates = fixture.duplicateGroups;
      extractionProvenance = aiProvenance("fixture", "Exact SHA-256 fictional two-page menu extraction", {
        fixtureId: fixture.fixtureIds.join("+"),
      });
    } else {
      let parsed;
      try {
        const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Extract menu items only from these fictional menu/price-board images. Preserve exact original wording. Translate each non-null item name into exactly these locales: ${SUPPORTED_LOCALES.join(", ")}. Use null for unclear names, descriptions, or prices and never guess digits. Every price requires vendor confirmation. Do not infer allergens, ingredients, dietary or religious status, health, nutrition, food safety, address, identity, ownership, or legal status. Allow at most one simple option; put complex modifiers aside by omitting them. sourceImageIndexes are zero-based indexes into the supplied image list.`,
          file_urls: media.map((asset) => asset.source_file_url),
          response_json_schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              items: {
                type: "array",
                maxItems: 30,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    originalName: { type: ["string", "null"] },
                    localizedNames: { type: "object" },
                    originalDescription: { type: ["string", "null"] },
                    localizedDescriptions: { type: "object" },
                    priceAmount: { type: ["string", "null"] },
                    category: { type: ["string", "null"] },
                    options: { type: "array" },
                    sourceImageIndexes: { type: "array", items: { type: "integer" } },
                    confidence: { type: "object" },
                  },
                  required: ["originalName", "localizedNames", "originalDescription", "localizedDescriptions", "priceAmount", "category", "options", "sourceImageIndexes", "confidence"],
                },
              },
            },
            required: ["items"],
          },
        });
        parsed = AiOutput.parse(raw);
      } catch {
        throw new ShopifyPocError("ai_unavailable", 503);
      }
      items = parsed.items.map((item, index) => {
        const localizedNames: Record<string, string> = {};
        for (const locale of SUPPORTED_LOCALES) {
          const text = safeText(item.localizedNames[locale], 140);
          if (text) localizedNames[locale] = text;
        }
        if (Object.keys(localizedNames).length !== SUPPORTED_LOCALES.length) {
          throw new ShopifyPocError("ai_unavailable", 503);
        }
        const sourceImageIds = item.sourceImageIndexes
          .map((sourceIndex) => media[sourceIndex]?.id)
          .filter((id): id is string => typeof id === "string");
        if (sourceImageIds.length < 1) throw new ShopifyPocError("ai_unavailable", 503);
        const price = normalizePrice(item.priceAmount);
        return {
          localItemKey: `ai-item-${index + 1}-${media[0].sha256.slice(0, 8)}`,
          sourceImageIds,
          originalName: item.originalName ? safeText(item.originalName, 140) : null,
          localizedNames,
          originalDescription: item.originalDescription ? safeText(item.originalDescription, 500) : null,
          localizedDescriptions: Object.fromEntries(
            SUPPORTED_LOCALES.flatMap((locale) => {
              const description = safeText(item.localizedDescriptions[locale], 500);
              return description ? [[locale, description]] : [];
            }),
          ),
          priceAmount: price,
          currency: "USD",
          category: item.category ? safeText(item.category, 80) : null,
          options: item.options,
          confidence: item.confidence,
          needsConfirmation: price ? ["price"] : ["price", "unclear_price"],
          fieldOrigins: { name: "ai_extracted", price: price ? "ai_extracted" : "unclear" },
        };
      });
      duplicates = duplicateGroups(items);
      extractionProvenance = aiProvenance("live_ai", "Base44 constrained multimodal menu extraction");
    }
    const duplicateItemKeys = new Set(
      duplicates.flatMap((group) =>
        Array.isArray(group.local_item_keys) ? group.local_item_keys.map(String) : []
      ),
    );
    items = items.map((item) => {
      if (!duplicateItemKeys.has(String(item.localItemKey))) return item;
      const needsConfirmation = Array.isArray(item.needsConfirmation)
        ? item.needsConfirmation.map(String)
        : [];
      return {
        ...item,
        needsConfirmation: [...new Set([...needsConfirmation, "likely_duplicate"])],
      };
    });
    if (items.length === 0) throw new ShopifyPocError("empty_menu", 422);
    const now = new Date().toISOString();
    const record = await serviceEntity(base44, "MenuImport").create({
      demo_session_id: input.demo_session_id,
      prototype_account_id: input.prototype_account_id,
      vendor_key: "rosa-v1",
      source_media_ids: input.media_ids,
      status: "review_required",
      currency: "USD",
      structured_items: items,
      duplicate_groups: duplicates,
      extraction_provenance: extractionProvenance,
      updated_at: now,
    });
    return jsonOk(parseShopifyOutput(Output, {
      menu_import: {
        id: record.id,
        status: "review_required",
        currency: "USD",
        items,
      },
      duplicate_groups: duplicates,
      extraction_provenance: extractionProvenance,
    }), extractionProvenance, 201);
  } catch (error) {
    return jsonError(error, "SIDEWALK extract_menu_photos");
  }
});
