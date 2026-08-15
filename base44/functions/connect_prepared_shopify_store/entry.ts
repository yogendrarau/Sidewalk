import { createClientFromRequest } from "npm:@base44/sdk";
import { z } from "npm:zod";
import {
  adminGraphQL,
  deriveSellingAccessState,
  jsonError,
  jsonOk,
  liveProvenance,
  parseShopifyOutput,
  publicConnection,
  readPreparedStoreConfig,
  readStrictJson,
  requirePreparedStoreOperator,
  requireSelfAttested,
  requireSession,
  requireVendorContext,
  ShopifyPocError,
  ShopifyConnectionOutput,
  storefrontGraphQL,
  updateAccess,
  upsertConnection,
} from "../../shared/shopifyCore.ts";

const Input = z.object({
  demo_session_id: z.string().trim().min(6).max(32),
  prototype_account_id: z.string().regex(/^proto_[0-9a-f]{32}$/),
}).strict();
const Output = ShopifyConnectionOutput.extend({
  selling_access_state: z.literal("active_demo"),
}).strict();

type Probe = {
  shop: { myshopifyDomain: string };
  currentAppInstallation: { accessScopes: Array<{ handle: string }> };
  publications: { nodes: Array<{ id: string; name?: string }> };
};

Deno.serve(async (req) => {
  let base44: ReturnType<typeof createClientFromRequest> | null = null;
  let context: Awaited<ReturnType<typeof requireVendorContext>> | null = null;
  let operatorApproved = false;
  try {
    const input = Input.parse(await readStrictJson(req));
    base44 = createClientFromRequest(req);
    const session = await requireSession(base44, input.demo_session_id);
    context = await requireVendorContext(base44, input.demo_session_id, input.prototype_account_id, { session });
    requireSelfAttested(context);
    await requirePreparedStoreOperator(base44);
    operatorApproved = true;
    const config = readPreparedStoreConfig();
    const admin = await adminGraphQL<Probe>(config, `
      query SidewalkPreparedStoreProbe {
        shop { myshopifyDomain }
        currentAppInstallation { accessScopes { handle } }
        publications(first: 50) { nodes { id name } }
      }
    `);
    if (admin.data.shop.myshopifyDomain.toLowerCase() !== config.shopDomain) {
      throw new ShopifyPocError("invalid_shop_domain", 503);
    }
    const scopes = [...new Set(admin.data.currentAppInstallation.accessScopes.map((scope) => scope.handle))].sort();
    for (const required of ["write_products", "read_publications", "write_publications"]) {
      if (!scopes.includes(required)) throw new ShopifyPocError("shopify_missing_scope", 503);
    }
    if (!admin.data.publications.nodes.some((publication) => publication.id === config.publicationId)) {
      throw new ShopifyPocError("shopify_missing_scope", 503);
    }
    await storefrontGraphQL(config, `query SidewalkStorefrontProbe { shop { name } products(first: 1) { nodes { id } } }`);
    const provenance = liveProvenance(config, "Confirmed Shopify Admin and Storefront GraphQL probes");
    const connection = await upsertConnection(base44, context, {
      shop_domain: config.shopDomain,
      setup_state: "connected_test_store",
      integration_mode: "shopify_test_store",
      connection_status: "connected",
      granted_scopes: scopes,
      api_version: config.apiVersion,
      publication_id: config.publicationId,
      connected_at: new Date().toISOString(),
      provenance,
    });
    const access = await updateAccess(base44, context.access, {
      selling_access_state: deriveSellingAccessState("self_attested_demo", connection),
      ordering_status: "active",
    });
    return jsonOk(parseShopifyOutput(Output, {
      ...publicConnection(connection),
      selling_access_state: access.selling_access_state,
    }), provenance);
  } catch (error) {
    if (base44 && context && operatorApproved) {
      const errorCode = error instanceof ShopifyPocError ? error.code : "shopify_network_error";
      await upsertConnection(base44, context, {
        setup_state: "unavailable",
        integration_mode: "unavailable",
        connection_status: "needs_attention",
        granted_scopes: [],
        last_error_code: errorCode,
      }).catch(() => undefined);
      await updateAccess(base44, context.access, {
        selling_access_state: "locked_needs_shopify",
        ordering_status: "paused",
      }).catch(() => undefined);
    }
    return jsonError(error, "Prepared Shopify test-store connection");
  }
});
