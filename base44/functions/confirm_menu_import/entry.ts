import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  findScopedById,
  jsonError,
  jsonOk,
  parseShopifyOutput,
  readStrictJson,
  requireCertificationAnswered,
  requireSession,
  requireVendorContext,
  serviceEntity,
  ShopifyPocError,
  simulatedProvenance,
  validateConfirmedMenuItems,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  menu_import_id: z.string().min(1).max(160),
  items: z.array(z.unknown()).min(1).max(30),
}).strict();
const Output = z.object({
  menu_import_id: z.string().min(1).max(160),
  status: z.literal("confirmed"),
  item_count: z.number().int().min(1).max(30),
  confirmed_at: z.string().datetime({ offset: true }),
}).strict();

function applyDuplicateDecisions(
  items: ReturnType<typeof validateConfirmedMenuItems>,
  groups: unknown,
) {
  if (!Array.isArray(groups)) return items;
  let resolved = [...items];
  for (const rawGroup of groups) {
    if (!rawGroup || typeof rawGroup !== "object" || Array.isArray(rawGroup)) continue;
    const keys = Array.isArray((rawGroup as Record<string, unknown>).local_item_keys)
      ? ((rawGroup as Record<string, unknown>).local_item_keys as unknown[]).map(String)
      : [];
    const grouped = keys.flatMap((key) => {
      const item = resolved.find((candidate) => candidate.localItemKey === key);
      return item ? [item] : [];
    });
    if (grouped.length < 2 || !grouped.some((item) => item.duplicateResolution === "merge")) continue;
    const canonical = grouped.find((item) => item.duplicateResolution !== "merge") ?? grouped[0];
    const mergedSourceIds = [...new Set(grouped.flatMap((item) => item.sourceImageIds))];
    const groupedKeys = new Set(grouped.map((item) => item.localItemKey));
    resolved = resolved
      .filter((item) => !groupedKeys.has(item.localItemKey) || item.localItemKey === canonical.localItemKey)
      .map((item) => item.localItemKey === canonical.localItemKey
        ? { ...item, sourceImageIds: mergedSourceIds, duplicateResolution: "merge" as const }
        : item);
  }
  return resolved;
}

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req, 131_072));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireCertificationAnswered(context);
    const menuImport = await findScopedById(base44, "MenuImport", input.demo_session_id, input.menu_import_id);
    if (!menuImport) throw new ShopifyPocError("menu_import_not_found", 404);
    if (menuImport.prototype_account_id !== input.prototype_account_id) {
      throw new ShopifyPocError("session_owner_mismatch", 403);
    }
    if (menuImport.status !== "review_required" && menuImport.status !== "confirmed") {
      throw new ShopifyPocError("invalid_request", 409);
    }
    const validatedItems = validateConfirmedMenuItems(input.items);
    const sourceIds = new Set(menuImport.source_media_ids as string[]);
    if (validatedItems.some((item) => item.sourceImageIds.some((id) => !sourceIds.has(id)))) {
      throw new ShopifyPocError("session_owner_mismatch", 403);
    }
    // validateConfirmedMenuItems requires an explicit duplicateResolution for every
    // item. `not_duplicate` is a valid vendor decision and is not second-guessed.
    const items = applyDuplicateDecisions(validatedItems, menuImport.duplicate_groups);
    const confirmedAt = new Date().toISOString();
    await serviceEntity(base44, "MenuImport").update(input.menu_import_id, {
      status: "confirmed",
      structured_items: items,
      confirmed_at: confirmedAt,
      updated_at: confirmedAt,
    });
    return jsonOk(parseShopifyOutput(Output, {
      menu_import_id: input.menu_import_id,
      status: "confirmed",
      item_count: items.length,
      confirmed_at: confirmedAt,
    }), simulatedProvenance("Explicit vendor confirmation of names, duplicate decisions, and every price"));
  } catch (error) {
    return jsonError(error, "SIDEWALK confirm_menu_import");
  }
});
