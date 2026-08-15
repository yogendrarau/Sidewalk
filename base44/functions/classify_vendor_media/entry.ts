import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  aiProvenance,
  fixtureForHash,
  fixtureProvenance,
  findScopedById,
  jsonError,
  jsonOk,
  MEDIA_KINDS,
  parseShopifyOutput,
  PublicProvenanceOutput,
  readStrictJson,
  requireCertificationAnswered,
  requireSession,
  requireVendorContext,
  serviceEntity,
  ShopifyPocError,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  media_ids: z.array(z.string().min(1).max(160)).min(1).max(6),
}).strict();
const Classification = z.object({
  suggested_kind: z.enum(MEDIA_KINDS),
  confidence: z.number().min(0).max(1),
}).strict();
const Output = z.object({
  suggestions: z.array(z.object({
    media_id: z.string().min(1).max(160),
    suggested_kind: z.enum(MEDIA_KINDS),
    confidence: z.number().min(0).max(1),
    requires_confirmation: z.literal(true),
    extraction_provenance: PublicProvenanceOutput,
  }).strict()).min(1).max(6),
}).strict();

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireCertificationAnswered(context);
    const suggestions = [];
    for (const mediaId of input.media_ids) {
      const media = await findScopedById(base44, "VendorMediaAsset", input.demo_session_id, mediaId);
      if (!media || media.prototype_account_id !== input.prototype_account_id) {
        throw new ShopifyPocError("session_owner_mismatch", 403);
      }
      if (typeof media.source_file_url !== "string" || !media.source_file_url) {
        throw new ShopifyPocError("media_fetch_failed", 422);
      }
      const fixture = fixtureForHash(media.sha256);
      let classification;
      let extractionProvenance;
      if (fixture) {
        classification = { suggested_kind: fixture.kind, confidence: 1 };
        extractionProvenance = aiProvenance("fixture", "Exact-hash fictional media classification", {
          fixtureId: fixture.fixtureId,
        });
      } else {
        try {
          const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: "Classify this fictional vendor image as exactly one of menu_or_price_board, product_or_food_photo, cart_truck_stand_or_venue, or other. Do not infer identity, address, licensing, ownership, health grade, or legal status.",
            file_urls: [media.source_file_url],
            response_json_schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                suggested_kind: { type: "string", enum: MEDIA_KINDS },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["suggested_kind", "confidence"],
            },
          });
          classification = Classification.parse(raw);
          extractionProvenance = aiProvenance("live_ai", "Base44 multimodal fictional media classification");
        } catch {
          throw new ShopifyPocError("ai_unavailable", 503);
        }
      }
      await serviceEntity(base44, "VendorMediaAsset").update(String(media.id), {
        ai_suggested_kind: classification.suggested_kind,
        processing_status: "classified",
      });
      suggestions.push({
        media_id: mediaId,
        suggested_kind: classification.suggested_kind,
        confidence: classification.confidence,
        requires_confirmation: true,
        extraction_provenance: extractionProvenance,
      });
    }
    const envelopeProvenance = suggestions.every((suggestion) =>
        suggestion.extraction_provenance.mode === "fixture"
      )
      ? fixtureProvenance("media-classification-fixtures-v1", "All classifications matched exact fictional fixtures")
      : aiProvenance("live_ai", "Classification includes a live Base44 AI result; each image retains its own provenance");
    return jsonOk(parseShopifyOutput(Output, { suggestions }), envelopeProvenance);
  } catch (error) {
    return jsonError(error, "SIDEWALK classify_vendor_media");
  }
});
