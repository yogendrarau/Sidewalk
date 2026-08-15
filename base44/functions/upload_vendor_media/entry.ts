import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  fetchMediaHash,
  fixtureForHash,
  fixtureProvenance,
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
  simulatedProvenance,
  SUPPORTED_LOCALES,
} from "../../shared/shopifyCore.ts";

const Asset = z.object({
  source_file_url: z.string().url().max(2048),
  source_locale: z.enum(SUPPORTED_LOCALES),
  confirmed_kind: z.enum(MEDIA_KINDS),
  source_order: z.number().int().min(0).max(20),
  approved_for_storefront: z.boolean(),
}).strict();
const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
  assets: z.array(Asset).min(1).max(6),
}).strict();
const Output = z.object({
  assets: z.array(z.object({
    id: z.string().min(1).max(160),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    confirmed_kind: z.enum(MEDIA_KINDS),
    processing_status: z.literal("uploaded"),
    approved_for_storefront: z.boolean(),
    provenance: PublicProvenanceOutput,
  }).strict()).min(1).max(6),
}).strict();

Deno.serve(async (req) => {
  try {
    const input = Input.parse(await readStrictJson(req, 32_768));
    const base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    const context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireCertificationAnswered(context);
    const saved = [];
    for (const asset of input.assets) {
      const sha256 = await fetchMediaHash(asset.source_file_url);
      const fixture = fixtureForHash(sha256);
      const provenance = fixture
        ? fixtureProvenance(fixture.fixtureId, "Exact SHA-256 match to bundled fictional Shopify POC media")
        : simulatedProvenance("Vendor-confirmed fictional Base44-hosted demo media; not an exact fixture");
      const record = await serviceEntity(base44, "VendorMediaAsset").create({
        demo_session_id: input.demo_session_id,
        prototype_account_id: input.prototype_account_id,
        vendor_key: "rosa-v1",
        source_file_url: asset.source_file_url,
        sha256,
        confirmed_kind: asset.confirmed_kind,
        source_locale: asset.source_locale,
        source_order: asset.source_order,
        processing_status: "uploaded",
        approved_for_storefront: asset.approved_for_storefront,
        display_metadata: { crop: "center", exif_external_publication: "not_used" },
        provenance,
      });
      saved.push({
        id: record.id,
        sha256,
        confirmed_kind: asset.confirmed_kind,
        processing_status: "uploaded",
        approved_for_storefront: asset.approved_for_storefront,
        provenance,
      });
    }
    const envelopeProvenance = saved.every((asset) => asset.provenance.mode === "fixture")
      ? fixtureProvenance("vendor-media-registration-v1", "All registered media matched exact fictional fixtures")
      : simulatedProvenance("Session-scoped fictional media registration; contains non-fixture uploads");
    return jsonOk(parseShopifyOutput(Output, { assets: saved }), envelopeProvenance, 201);
  } catch (error) {
    return jsonError(error, "SIDEWALK upload_vendor_media");
  }
});
