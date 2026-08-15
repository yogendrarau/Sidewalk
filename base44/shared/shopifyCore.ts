// SIDEWALK Shopify photo-to-store proof of concept.
// This module is deliberately limited to one prepared fictional Shopify test store.
// Browser prototype ids are lookup keys only; they never authorize arbitrary stores.

import {
  isSupportedLocale,
  makeProvenance,
  requireSession,
  sha256Hex,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "./demoCore.ts";
import { z, type ZodType } from "npm:zod";

export { requireSession, SUPPORTED_LOCALES };
export type { SupportedLocale };

export const SHOPIFY_API_VERSION = "2026-07";
export const SHOPIFY_DISCLOSURE_VERSION = "shopify-poc-v1";
export const FICTIONAL_VENDOR_KEY = "rosa-v1";

export const CERTIFICATION_STATUSES = [
  "unanswered",
  "not_verified",
  "self_attested_demo",
] as const;
export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

export const SELLING_ACCESS_STATES = [
  "locked_needs_status",
  "locked_needs_certification",
  "locked_needs_shopify",
  "active_demo",
] as const;
export type SellingAccessState = (typeof SELLING_ACCESS_STATES)[number];

export const SHOPIFY_SETUP_STATES = [
  "not_started",
  "signup_started",
  "merchant_action_required",
  "prepared_test_store_available",
  "connected_test_store",
  "connected_oauth",
  "reauthorization_required",
  "unavailable",
] as const;
export type ShopifySetupState = (typeof SHOPIFY_SETUP_STATES)[number];

export const MEDIA_KINDS = [
  "menu_or_price_board",
  "product_or_food_photo",
  "cart_truck_stand_or_venue",
  "other",
] as const;
export type VendorImageKind = (typeof MEDIA_KINDS)[number];

export type ShopifyMode = "shopify_test_store" | "fixture" | "unavailable";
export type ShopifyProvenance = {
  mode: ShopifyMode;
  source: string;
  retrievedAt: string;
  shopDomain?: string;
  apiVersion?: string;
  fixtureId?: string;
  fallbackReason?: string;
};

type GeneralProvenance = ReturnType<typeof makeProvenance>;

export type ShopifyResult<T> =
  | { ok: true; data: T; provenance: ShopifyProvenance | GeneralProvenance }
  | { ok: false; error: string; error_code: string; provenance: ShopifyProvenance };

export type SellingAccessRecord = {
  id: string;
  demo_session_id: string;
  prototype_account_id: string;
  vendor_key: typeof FICTIONAL_VENDOR_KEY;
  certification_status: CertificationStatus;
  selling_access_state: SellingAccessState;
  ordering_status: "active" | "paused";
  attested_at?: string;
  disclosure_version?: string;
  is_fictional: true;
  reset_at?: string;
  updated_at: string;
};

export type ConnectionRecord = {
  id: string;
  demo_session_id: string;
  prototype_account_id: string;
  vendor_key: typeof FICTIONAL_VENDOR_KEY;
  shop_domain?: string;
  setup_state: ShopifySetupState;
  integration_mode: ShopifyMode;
  connection_status: "not_connected" | "connected" | "needs_attention" | "unavailable";
  granted_scopes: string[];
  api_version?: string;
  publication_id?: string;
  connected_at?: string;
  updated_at: string;
  last_error_code?: string;
  provenance?: ShopifyProvenance;
};

type EntityHandler = {
  filter: (...args: unknown[]) => Promise<Record<string, unknown>[]>;
  create: (values: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (id: string, values: Record<string, unknown>) => Promise<Record<string, unknown>>;
  delete: (id: string) => Promise<unknown>;
  deleteMany: (query: Record<string, unknown>) => Promise<{ deleted?: number }>;
  bulkCreate?: (values: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
};

export type Base44ServiceClient = {
  auth: {
    me: () => Promise<{ id?: string; role?: string; account_role?: string }>;
  };
  asServiceRole: {
    entities: Record<string, EntityHandler>;
    integrations: {
      Core: {
        InvokeLLM: (input: Record<string, unknown>) => Promise<unknown>;
      };
    };
  };
};

export type VendorContext = {
  session: Record<string, unknown>;
  account: Record<string, unknown>;
  access: SellingAccessRecord;
  connection: ConnectionRecord | null;
};

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};
const PROTOTYPE_ID_PATTERN = /^proto_[0-9a-f]{32}$/;
const SHOP_DOMAIN_PATTERN = /^(?=.{4,255}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;
const GRAPHQL_GID_PATTERN = /^gid:\/\/shopify\/[A-Za-z][A-Za-z0-9]*\/[0-9]+$/;
const CART_HANDLE_PATTERN = /^cart_[0-9a-f]{32}$/;
const MAX_GRAPHQL_RESPONSE_BYTES = 1_500_000;
const MAX_PUBLIC_OUTPUT_BYTES = 1_500_000;
const PUBLIC_PROVENANCE_MODE_VALUES = [
  "shopify_test_store",
  "fixture",
  "unavailable",
  "live_ai",
  "simulated",
] as const;
const PUBLIC_PROVENANCE_MODES = new Set<string>(PUBLIC_PROVENANCE_MODE_VALUES);
const FORBIDDEN_PUBLIC_OUTPUT_KEY = /(?:^|_)(?:token|secret|access_token|refresh_token|admin_token|storefront_token|oauth_secret|webhook_secret|password|shopify_cart_id)(?:$|_)/i;

export class ShopifyPocError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400, message?: string) {
    super(message ?? code);
    this.name = "ShopifyPocError";
    this.code = code;
    this.status = status;
  }
}

const PublicProvenanceCommonOutput = {
  source: z.string().min(1).max(500),
  retrievedAt: z.string().datetime({ offset: true }),
};

/**
 * Strict schema for every provenance object that may leave a Shopify POC
 * backend function. The discriminated union prevents a fixture from being
 * mislabeled without a fixture id and prevents a live Shopify result from
 * omitting the exact prepared shop and API version that produced it.
 */
export const PublicProvenanceOutput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("shopify_test_store"),
    ...PublicProvenanceCommonOutput,
    shopDomain: z.string().regex(SHOP_DOMAIN_PATTERN),
    apiVersion: z.literal(SHOPIFY_API_VERSION),
  }).strict(),
  z.object({
    mode: z.literal("fixture"),
    ...PublicProvenanceCommonOutput,
    fixtureId: z.string().min(1).max(200),
  }).strict(),
  z.object({
    mode: z.literal("live_ai"),
    ...PublicProvenanceCommonOutput,
  }).strict(),
  z.object({
    mode: z.literal("simulated"),
    ...PublicProvenanceCommonOutput,
  }).strict(),
  z.object({
    mode: z.literal("unavailable"),
    ...PublicProvenanceCommonOutput,
    fallbackReason: z.string().min(1).max(160),
  }).strict(),
]);

export const SellingAccessOutput = z.object({
  certification_status: z.enum(CERTIFICATION_STATUSES),
  selling_access_state: z.enum(SELLING_ACCESS_STATES),
  shopify_setup_state: z.enum(SHOPIFY_SETUP_STATES),
  ordering_status: z.enum(["active", "paused"]),
  attested_at: z.string().datetime({ offset: true }).nullable(),
  disclosure_version: z.string().min(1).max(100).nullable(),
  is_fictional: z.literal(true),
  can_access_get_verified: z.boolean(),
  can_prepare_menu: z.boolean(),
  can_open_shopify_setup: z.boolean(),
  can_publish: z.boolean(),
}).strict();

export const ShopifyConnectionOutput = z.object({
  setup_state: z.enum(SHOPIFY_SETUP_STATES),
  connection_status: z.enum(["not_connected", "connected", "needs_attention", "unavailable"]),
  shop_domain: z.string().regex(SHOP_DOMAIN_PATTERN).nullable(),
  integration_mode: z.enum(["shopify_test_store", "fixture", "unavailable"]),
  granted_scopes: z.array(z.string().min(1).max(100)).max(100),
  api_version: z.literal(SHOPIFY_API_VERSION).nullable(),
  connected_at: z.string().datetime({ offset: true }).nullable(),
  last_error_code: z.string().min(1).max(160).nullable(),
}).strict();

/** Parse endpoint-specific success data and convert every schema failure into
 * the same fail-closed public error used by the generic secret/provenance gate. */
export function parseShopifyOutput<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ShopifyPocError("invalid_output", 500);
  return parsed.data;
}

export function makeShopifyProvenance(
  mode: ShopifyMode,
  source: string,
  options: Partial<Omit<ShopifyProvenance, "mode" | "source" | "retrievedAt">> = {},
): ShopifyProvenance {
  return {
    mode,
    source,
    retrievedAt: new Date().toISOString(),
    ...(options.shopDomain ? { shopDomain: options.shopDomain } : {}),
    ...(options.apiVersion ? { apiVersion: options.apiVersion } : {}),
    ...(options.fixtureId ? { fixtureId: options.fixtureId } : {}),
    ...(options.fallbackReason ? { fallbackReason: options.fallbackReason } : {}),
  };
}

function assertPublicJsonValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): void {
  if (depth > 12) throw new ShopifyPocError("invalid_output", 500);
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ShopifyPocError("invalid_output", 500);
    return;
  }
  if (typeof value !== "object") throw new ShopifyPocError("invalid_output", 500);
  if (seen.has(value)) throw new ShopifyPocError("invalid_output", 500);
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 500) throw new ShopifyPocError("invalid_output", 500);
    value.forEach((entry) => assertPublicJsonValue(entry, depth + 1, seen));
    seen.delete(value);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ShopifyPocError("invalid_output", 500);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 250) throw new ShopifyPocError("invalid_output", 500);
  for (const [key, entry] of entries) {
    const normalizedKey = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    if (!key || key.length > 120 || FORBIDDEN_PUBLIC_OUTPUT_KEY.test(normalizedKey)) {
      throw new ShopifyPocError("invalid_output", 500);
    }
    assertPublicJsonValue(entry, depth + 1, seen);
  }
  seen.delete(value);
}

export function assertPublicServiceOutput(
  data: unknown,
  provenance: ShopifyProvenance | GeneralProvenance,
): void {
  const mode = (provenance as { mode?: unknown }).mode;
  const source = (provenance as { source?: unknown }).source;
  const retrievedAt = (provenance as { retrievedAt?: unknown }).retrievedAt;
  if (
    typeof mode !== "string" ||
    !PUBLIC_PROVENANCE_MODES.has(mode) ||
    typeof source !== "string" ||
    source.length < 1 ||
    source.length > 500 ||
    typeof retrievedAt !== "string" ||
    Number.isNaN(Date.parse(retrievedAt))
  ) {
    throw new ShopifyPocError("invalid_output", 500);
  }
  assertPublicJsonValue(data, 0, new WeakSet());
  assertPublicJsonValue(provenance, 0, new WeakSet());
  let serialized: string;
  try {
    serialized = JSON.stringify({ data, provenance });
  } catch {
    throw new ShopifyPocError("invalid_output", 500);
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_PUBLIC_OUTPUT_BYTES) {
    throw new ShopifyPocError("invalid_output", 500);
  }
}

export function jsonOk<T>(
  data: T,
  provenance: ShopifyProvenance | GeneralProvenance,
  status = 200,
): Response {
  const strictProvenance = parseShopifyOutput(PublicProvenanceOutput, provenance);
  assertPublicServiceOutput(data, strictProvenance);
  return Response.json({ ok: true, data, provenance: strictProvenance } satisfies ShopifyResult<T>, {
    status,
    headers: RESPONSE_HEADERS,
  });
}

export function publicErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    method_not_allowed: "Method not allowed.",
    request_too_large: "The request is too large.",
    invalid_json: "The request body is invalid.",
    invalid_request: "The request is invalid.",
    invalid_session: "The fictional demo session is invalid.",
    session_owner_mismatch: "This fictional account does not belong to the current demo session.",
    vendor_account_required: "A fictional SIDEWALK vendor account is required.",
    certification_status_required: "Answer the certification-status question first.",
    certification_required: "Certification self-attestation is required for this demo action.",
    shopify_connection_required: "Connect the prepared Shopify test store first.",
    selling_access_locked: "Selling access is still locked.",
    prepared_store_operator_required: "An authenticated demo administrator must approve prepared-store changes.",
    ordering_paused: "Test ordering is paused.",
    menu_confirmation_required: "Confirm every menu item and price first.",
    empty_menu: "Add at least one complete menu item.",
    invalid_shop_domain: "Enter a valid myshopify.com store domain.",
    shopify_configuration_missing: "The prepared Shopify test store is not configured.",
    shopify_invalid_token: "The Shopify test-store connection needs attention.",
    shopify_missing_scope: "The Shopify test-store app is missing a required permission.",
    shopify_api_version_mismatch: "The Shopify API version did not match the configured stable version.",
    shopify_rate_limited: "Shopify is temporarily rate limiting this request.",
    shopify_timeout: "Shopify did not respond in time.",
    shopify_network_error: "The Shopify test store is unavailable.",
    shopify_graphql_error: "Shopify rejected the request.",
    shopify_user_error: "Shopify could not apply one or more changes.",
    fixture_not_matched: "The selected file is not a bundled fictional demo fixture.",
    media_fetch_failed: "The fictional image could not be read.",
    media_not_menu: "Only confirmed menu or price-board images can be extracted.",
    ai_unavailable: "Live AI is unavailable and this file did not match an exact demo fixture.",
    menu_import_not_found: "The menu draft was not found in this demo session.",
    storefront_unavailable: "The Shopify-backed storefront is unavailable.",
    cart_unavailable: "The Shopify test cart is unavailable.",
    checkout_unavailable: "The Shopify test checkout is unavailable.",
    oauth_disabled_production_pilot: "Multi-merchant Shopify OAuth is reserved for a production pilot.",
    order_refresh_not_configured: "Test-order refresh is not configured because protected customer data access is disabled.",
    invalid_output: "The prototype blocked an invalid service response.",
  };
  return messages[code] ?? "This prototype action is unavailable.";
}

export function jsonError(
  error: unknown,
  source: string,
  fallbackCode = "shopify_unavailable",
): Response {
  let code = fallbackCode;
  let status = 503;
  if (error instanceof ShopifyPocError) {
    code = error.code;
    status = error.status;
  } else if (error instanceof Error && /session/i.test(error.message)) {
    code = "invalid_session";
    status = 404;
  }
  const provenance = makeShopifyProvenance("unavailable", source, {
    fallbackReason: code,
  });
  const ErrorOutput = z.object({
    ok: z.literal(false),
    error: z.string().min(1).max(500),
    error_code: z.string().min(1).max(160),
    provenance: PublicProvenanceOutput,
  }).strict();
  const body = parseShopifyOutput(ErrorOutput, {
    ok: false,
    error: publicErrorMessage(code),
    error_code: code,
    provenance,
  } satisfies ShopifyResult<never>);
  assertPublicServiceOutput({ error: body.error, error_code: body.error_code }, body.provenance);
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

export async function readStrictJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  if (req.method !== "POST") throw new ShopifyPocError("method_not_allowed", 405);
  const announced = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(announced) && announced > maxBytes) {
    throw new ShopifyPocError("request_too_large", 413);
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ShopifyPocError("request_too_large", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ShopifyPocError("invalid_json", 400);
  }
}

function entity(base44: unknown, name: string): EntityHandler {
  return (base44 as Base44ServiceClient).asServiceRole.entities[name];
}

async function scopedRecords(
  base44: unknown,
  name: string,
  demoSessionId: string,
  extra: Record<string, unknown> = {},
  limit = 20,
): Promise<Record<string, unknown>[]> {
  return await entity(base44, name).filter(
    { demo_session_id: demoSessionId, ...extra },
    "-updated_date",
    limit,
    0,
  );
}

export async function getConnectionRecord(
  base44: unknown,
  demoSessionId: string,
  prototypeAccountId?: string,
): Promise<ConnectionRecord | null> {
  const rows = await scopedRecords(
    base44,
    "ShopifyMerchantConnection",
    demoSessionId,
    prototypeAccountId ? { prototype_account_id: prototypeAccountId } : {},
    1,
  );
  return (rows[0] as ConnectionRecord | undefined) ?? null;
}

export function deriveSellingAccessState(
  certificationStatus: CertificationStatus,
  connection: ConnectionRecord | null,
): SellingAccessState {
  if (certificationStatus === "unanswered") return "locked_needs_status";
  if (certificationStatus === "not_verified") return "locked_needs_certification";
  if (
    connection?.setup_state === "connected_test_store" &&
    connection.connection_status === "connected" &&
    connection.integration_mode === "shopify_test_store"
  ) return "active_demo";
  return "locked_needs_shopify";
}

async function createInitialAccess(
  base44: unknown,
  demoSessionId: string,
  prototypeAccountId: string,
): Promise<SellingAccessRecord> {
  const now = new Date().toISOString();
  return await entity(base44, "VendorSellingAccess").create({
    demo_session_id: demoSessionId,
    prototype_account_id: prototypeAccountId,
    vendor_key: FICTIONAL_VENDOR_KEY,
    certification_status: "unanswered",
    selling_access_state: "locked_needs_status",
    ordering_status: "paused",
    is_fictional: true,
    updated_at: now,
  }) as SellingAccessRecord;
}

export async function requireVendorContext(
  base44: unknown,
  demoSessionId: unknown,
  prototypeAccountId: unknown,
  options: { createAccess?: boolean; session?: Record<string, unknown> } = {},
): Promise<VendorContext> {
  if (typeof prototypeAccountId !== "string" || !PROTOTYPE_ID_PATTERN.test(prototypeAccountId)) {
    throw new ShopifyPocError("vendor_account_required", 403);
  }
  const session = options.session ?? await requireSession(base44, demoSessionId);
  const accounts = await entity(base44, "MarketplacePrototypeAccount").filter(
    { prototype_account_id: prototypeAccountId },
    "-updated_date",
    2,
    0,
  );
  let account = accounts[0];
  if (!account) {
    // Defensive recovery for an authenticated client whose routing role was
    // saved but whose parallel synthetic account write did not complete. The
    // supplied prototype id is still bound below to one demo session and never
    // authorizes prepared-store mutations.
    let user: { id?: string; account_role?: string } | null = null;
    try {
      user = await (base44 as Base44ServiceClient).auth.me();
    } catch {
      user = null;
    }
    if (user?.id && user.account_role === "vendor") {
      account = {
        id: user.id,
        prototype_account_id: prototypeAccountId,
        account_role: "vendor",
        is_fictional: true,
      };
    }
  }
  if (account?.account_role !== "vendor" || account.is_fictional !== true) {
    throw new ShopifyPocError("vendor_account_required", 403);
  }

  const sessionRows = await scopedRecords(
    base44,
    "VendorSellingAccess",
    String(demoSessionId),
    {},
    3,
  );
  if (
    sessionRows.length > 0 &&
    sessionRows.some((row) => row.prototype_account_id !== prototypeAccountId)
  ) {
    throw new ShopifyPocError("session_owner_mismatch", 403);
  }
  let access = sessionRows.find(
    (row) => row.prototype_account_id === prototypeAccountId,
  ) as SellingAccessRecord | undefined;
  if (!access && options.createAccess) {
    access = await createInitialAccess(base44, String(demoSessionId), prototypeAccountId);
  }
  if (!access) throw new ShopifyPocError("session_owner_mismatch", 403);

  const connection = await getConnectionRecord(
    base44,
    String(demoSessionId),
    prototypeAccountId,
  );
  const canonicalState = deriveSellingAccessState(access.certification_status, connection);
  if (canonicalState !== access.selling_access_state) {
    access = await entity(base44, "VendorSellingAccess").update(access.id, {
      selling_access_state: canonicalState,
      updated_at: new Date().toISOString(),
    }) as SellingAccessRecord;
  }
  return { session, account, access, connection };
}

export function publicSellingAccess(context: VendorContext) {
  const { access, connection } = context;
  const state = deriveSellingAccessState(access.certification_status, connection);
  return {
    certification_status: access.certification_status,
    selling_access_state: state,
    shopify_setup_state: connection?.setup_state ?? "not_started",
    ordering_status: access.ordering_status,
    attested_at: access.attested_at ?? null,
    disclosure_version: access.disclosure_version ?? null,
    is_fictional: true,
    can_access_get_verified: access.certification_status === "not_verified",
    can_prepare_menu: access.certification_status !== "unanswered",
    can_open_shopify_setup: access.certification_status === "self_attested_demo",
    can_publish: state === "active_demo",
  };
}

export function requireCertificationAnswered(context: VendorContext): void {
  if (context.access.certification_status === "unanswered") {
    throw new ShopifyPocError("certification_status_required", 403);
  }
}

export function requireSelfAttested(context: VendorContext): void {
  if (context.access.certification_status !== "self_attested_demo") {
    throw new ShopifyPocError("certification_required", 403);
  }
}

export function requireActiveSelling(context: VendorContext): void {
  requireSelfAttested(context);
  if (deriveSellingAccessState(context.access.certification_status, context.connection) !== "active_demo") {
    throw new ShopifyPocError("selling_access_locked", 403);
  }
}

export async function requirePreparedStoreOperator(base44: unknown): Promise<void> {
  let user: { id?: string; role?: string } | null = null;
  try {
    user = await (base44 as Base44ServiceClient).auth.me();
  } catch {
    user = null;
  }
  if (!user?.id || user.role !== "admin") {
    throw new ShopifyPocError("prepared_store_operator_required", 403);
  }
}

export async function updateAccess(
  base44: unknown,
  access: SellingAccessRecord,
  patch: Record<string, unknown>,
): Promise<SellingAccessRecord> {
  return await entity(base44, "VendorSellingAccess").update(access.id, {
    ...patch,
    demo_session_id: access.demo_session_id,
    prototype_account_id: access.prototype_account_id,
    vendor_key: FICTIONAL_VENDOR_KEY,
    is_fictional: true,
    updated_at: new Date().toISOString(),
  }) as SellingAccessRecord;
}

export async function upsertConnection(
  base44: unknown,
  context: VendorContext,
  patch: Record<string, unknown>,
): Promise<ConnectionRecord> {
  const now = new Date().toISOString();
  const values = {
    demo_session_id: context.access.demo_session_id,
    prototype_account_id: context.access.prototype_account_id,
    vendor_key: FICTIONAL_VENDOR_KEY,
    setup_state: "not_started",
    integration_mode: "unavailable",
    connection_status: "not_connected",
    granted_scopes: [],
    ...patch,
    updated_at: now,
  };
  if (context.connection) {
    return await entity(base44, "ShopifyMerchantConnection").update(
      context.connection.id,
      values,
    ) as ConnectionRecord;
  }
  return await entity(base44, "ShopifyMerchantConnection").create(values) as ConnectionRecord;
}

export function publicConnection(record: ConnectionRecord | null) {
  return {
    setup_state: record?.setup_state ?? "not_started",
    connection_status: record?.connection_status ?? "not_connected",
    shop_domain: record?.shop_domain ?? null,
    integration_mode: record?.integration_mode ?? "unavailable",
    granted_scopes: record?.granted_scopes ?? [],
    api_version: record?.api_version ?? null,
    connected_at: record?.connected_at ?? null,
    last_error_code: record?.last_error_code ?? null,
  };
}

export function assertPreparedConnection(
  connection: ConnectionRecord | null,
  config: ShopifyConfig,
): void {
  if (
    !connection ||
    connection.connection_status !== "connected" ||
    connection.integration_mode !== "shopify_test_store" ||
    connection.shop_domain !== config.shopDomain ||
    connection.api_version !== config.apiVersion ||
    connection.publication_id !== config.publicationId
  ) throw new ShopifyPocError("shopify_connection_required", 403);
}

export type ShopifyConfig = {
  shopDomain: string;
  adminToken: string;
  storefrontToken: string;
  apiVersion: typeof SHOPIFY_API_VERSION;
  publicationId: string;
};

export function normalizeShopDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return SHOP_DOMAIN_PATTERN.test(normalized) ? normalized : null;
}

export function readPreparedStoreConfig(): ShopifyConfig {
  const shopDomain = normalizeShopDomain(Deno.env.get("SHOPIFY_STORE_DOMAIN"));
  const adminToken = Deno.env.get("SHOPIFY_ADMIN_ACCESS_TOKEN")?.trim() ?? "";
  const storefrontToken = Deno.env.get("SHOPIFY_STOREFRONT_ACCESS_TOKEN")?.trim() ?? "";
  const apiVersion = Deno.env.get("SHOPIFY_API_VERSION")?.trim() ?? "";
  const publicationId = Deno.env.get("SHOPIFY_PUBLICATION_ID")?.trim() ?? "";
  if (
    !shopDomain ||
    adminToken.length < 16 ||
    storefrontToken.length < 16 ||
    apiVersion !== SHOPIFY_API_VERSION ||
    !isGraphQLGid(publicationId, "Publication")
  ) {
    throw new ShopifyPocError("shopify_configuration_missing", 503);
  }
  return {
    shopDomain,
    adminToken,
    storefrontToken,
    apiVersion: SHOPIFY_API_VERSION,
    publicationId,
  };
}

type GraphQLResult<T> = {
  data: T;
  apiVersion: string;
};

async function graphQLRequest<T>(
  url: string,
  tokenHeader: string,
  token: string,
  apiVersion: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphQLResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          [tokenHeader]: token,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ShopifyPocError("shopify_timeout", 504);
      }
      throw new ShopifyPocError("shopify_network_error", 503);
    }
    if (response.status === 429) throw new ShopifyPocError("shopify_rate_limited", 503);
    if (response.status === 401) throw new ShopifyPocError("shopify_invalid_token", 503);
    if (response.status === 403) throw new ShopifyPocError("shopify_missing_scope", 503);
    if (!response.ok) throw new ShopifyPocError("shopify_network_error", 503);
    const announced = Number(response.headers.get("content-length") ?? 0);
    if (announced > MAX_GRAPHQL_RESPONSE_BYTES) throw new ShopifyPocError("shopify_graphql_error", 503);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_GRAPHQL_RESPONSE_BYTES) {
      throw new ShopifyPocError("shopify_graphql_error", 503);
    }
    let body: { data?: T; errors?: Array<{ message?: string }> };
    try {
      body = JSON.parse(text);
    } catch {
      throw new ShopifyPocError("shopify_graphql_error", 503);
    }
    if (body.errors?.length || !body.data) {
      const messages = (body.errors ?? []).map((item) => item.message ?? "").join(" ");
      if (/access denied|permission|scope/i.test(messages)) {
        throw new ShopifyPocError("shopify_missing_scope", 503);
      }
      throw new ShopifyPocError("shopify_graphql_error", 503);
    }
    const returnedVersion = response.headers.get("x-shopify-api-version") ?? apiVersion;
    if (returnedVersion !== apiVersion) {
      throw new ShopifyPocError("shopify_api_version_mismatch", 503);
    }
    return { data: body.data, apiVersion: returnedVersion };
  } finally {
    clearTimeout(timer);
  }
}

export async function adminGraphQL<T>(
  config: ShopifyConfig,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphQLResult<T>> {
  return await graphQLRequest<T>(
    `https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
    "X-Shopify-Access-Token",
    config.adminToken,
    config.apiVersion,
    query,
    variables,
  );
}

export async function storefrontGraphQL<T>(
  config: ShopifyConfig,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphQLResult<T>> {
  return await graphQLRequest<T>(
    `https://${config.shopDomain}/api/${config.apiVersion}/graphql.json`,
    "X-Shopify-Storefront-Access-Token",
    config.storefrontToken,
    config.apiVersion,
    query,
    variables,
  );
}

export function assertNoUserErrors(payload: { userErrors?: unknown[] } | null | undefined): void {
  if (!payload || !Array.isArray(payload.userErrors) || payload.userErrors.length > 0) {
    throw new ShopifyPocError("shopify_user_error", 422);
  }
}

export function isGraphQLGid(value: unknown, kind?: string): value is string {
  if (typeof value !== "string" || !GRAPHQL_GID_PATTERN.test(value)) return false;
  return kind ? value.startsWith(`gid://shopify/${kind}/`) : true;
}

export function isCartHandle(value: unknown): value is string {
  return typeof value === "string" && CART_HANDLE_PATTERN.test(value);
}

export function randomHandle(prefix: "cart" = "cart"): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function deterministicProductHandle(demoSessionId: string, localItemKey: string): string {
  const safeSession = demoSessionId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const safeItem = localItemKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `sidewalk-${safeSession}-${safeItem}`.slice(0, 200).replace(/-+$/g, "");
}

export function normalizePrice(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) return null;
  return amount.toFixed(2);
}

export function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > maxLength) return null;
  return text;
}

export function fixtureProvenance(fixtureId: string, source: string): ShopifyProvenance {
  return makeShopifyProvenance("fixture", source, { fixtureId });
}

export function liveProvenance(config: ShopifyConfig, source: string): ShopifyProvenance {
  return makeShopifyProvenance("shopify_test_store", source, {
    shopDomain: config.shopDomain,
    apiVersion: config.apiVersion,
  });
}

export const SHOPIFY_FIXTURE_HASHES = Object.freeze({
  // GitHub/local LF bytes.
  "7a1363a0362e5fb014aab4696775b922d6f9432c17ebc9920df3adcf1f782fbc": {
    fixtureId: "rosa-menu-board-1",
    kind: "menu_or_price_board" as VendorImageKind,
  },
  "16f91ff14df98e163c1a80a7add05344a54682b6367323d3d2e56771cd59c639": {
    fixtureId: "rosa-menu-board-2",
    kind: "menu_or_price_board" as VendorImageKind,
  },
  "14f183857ce3b3eefcdf86dc54fd172a0ae0e2056a0ee04a60adac66b30450a2": {
    fixtureId: "rosa-cart-photo",
    kind: "cart_truck_stand_or_venue" as VendorImageKind,
  },
  // Base44's sandbox normalizes text fixtures to CRLF. These remain exact
  // hashes of the same three bundled files; no fuzzy/content-based fallback is
  // permitted in either environment.
  "d7c1d3587bc9e4d38276cd1469ab2f1b2f18b611e8e3f49abe9c1a4adcd5332a": {
    fixtureId: "rosa-menu-board-1",
    kind: "menu_or_price_board" as VendorImageKind,
  },
  "3324b830a40b58c63daed83f19b9a9d96b14dedc4e179619404928f739884535": {
    fixtureId: "rosa-menu-board-2",
    kind: "menu_or_price_board" as VendorImageKind,
  },
  "1682a6498f6d3477b998f7bbece8c169d421cf8186c8b6563ac1022ff6810f78": {
    fixtureId: "rosa-cart-photo",
    kind: "cart_truck_stand_or_venue" as VendorImageKind,
  },
});

export type FixtureHash = keyof typeof SHOPIFY_FIXTURE_HASHES;

export function fixtureForHash(hash: unknown) {
  if (typeof hash !== "string") return null;
  return SHOPIFY_FIXTURE_HASHES[hash as FixtureHash] ?? null;
}

export function allowedMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "media.base44.com" || url.hostname.endsWith(".base44.app"));
  } catch {
    return false;
  }
}

export async function fetchMediaHash(url: string): Promise<string> {
  if (!allowedMediaUrl(url)) throw new ShopifyPocError("media_fetch_failed", 400);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "image/png,image/jpeg,image/webp,image/svg+xml" },
      signal: controller.signal,
    });
    if (!response.ok) throw new ShopifyPocError("media_fetch_failed", 422);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(contentType)) {
      throw new ShopifyPocError("media_fetch_failed", 422);
    }
    const announced = Number(response.headers.get("content-length") ?? 0);
    if (announced > 10 * 1024 * 1024) throw new ShopifyPocError("media_fetch_failed", 413);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024) throw new ShopifyPocError("media_fetch_failed", 413);
    return await sha256Hex(bytes);
  } catch (error) {
    if (error instanceof ShopifyPocError) throw error;
    throw new ShopifyPocError("media_fetch_failed", 422);
  } finally {
    clearTimeout(timer);
  }
}

type LocalizedText = Record<SupportedLocale, string>;

const NAMES: Record<string, LocalizedText> = {
  tacos: {
    en: "Chicken tacos", es: "Tacos de pollo", wo: "Tacos yu ganaar", ar: "تاكوس الدجاج",
    bn: "চিকেন টাকোস", "zh-Hans": "鸡肉塔可", fr: "Tacos au poulet",
  },
  tamales: {
    en: "Tamales", es: "Tamales", wo: "Tamales", ar: "تاماليس", bn: "তামালেস",
    "zh-Hans": "塔马利", fr: "Tamales",
  },
  jamaica: {
    en: "Hibiscus drink", es: "Agua de jamaica", wo: "Ndoxu bissap", ar: "مشروب الكركديه",
    bn: "জবা ফুলের পানীয়", "zh-Hans": "洛神花饮料", fr: "Boisson à l’hibiscus",
  },
  empanada: {
    en: "Cheese empanada", es: "Empanada de queso", wo: "Empanada bu fromaas", ar: "إمبانادا بالجبن",
    bn: "চিজ এমপানাদা", "zh-Hans": "奶酪馅饼", fr: "Empanada au fromage",
  },
  elote: {
    en: "Prepared corn", es: "Elote preparado", wo: "Mboq bu ñu waajal", ar: "ذرة مُحضّرة",
    bn: "প্রস্তুত ভুট্টা", "zh-Hans": "调味玉米", fr: "Maïs préparé",
  },
};

function fixtureItem(
  localItemKey: string,
  sourceImageId: string,
  names: LocalizedText,
  priceAmount: string | null,
) {
  return {
    localItemKey,
    sourceImageIds: [sourceImageId],
    originalName: names.es,
    localizedNames: names,
    originalDescription: null,
    localizedDescriptions: {},
    priceAmount,
    currency: "USD",
    category: null,
    options: [],
    confidence: {
      name: 1,
      price: priceAmount ? 1 : 0,
      description: 0,
      options: 1,
    },
    needsConfirmation: priceAmount ? ["price"] : ["price", "unclear_price"],
    fieldOrigins: {
      name: "ai_extracted",
      price: priceAmount ? "ai_extracted" : "unclear",
    },
  };
}

export function fixtureMenuForMedia(
  media: Array<{ id: string; sha256?: unknown }>,
) {
  const items: Record<string, unknown>[] = [];
  let firstTamaleKey: string | null = null;
  let secondTamaleKey: string | null = null;
  const fixtureIds: string[] = [];
  for (const asset of media) {
    const fixture = fixtureForHash(asset.sha256);
    if (!fixture || fixture.kind !== "menu_or_price_board") {
      throw new ShopifyPocError("fixture_not_matched", 422);
    }
    if (fixtureIds.includes(fixture.fixtureId)) continue;
    fixtureIds.push(fixture.fixtureId);
    if (fixture.fixtureId === "rosa-menu-board-1") {
      items.push(fixtureItem("rosa-tacos-pollo", asset.id, NAMES.tacos, "5.00"));
      firstTamaleKey = "rosa-tamales-board-1";
      items.push(fixtureItem(firstTamaleKey, asset.id, NAMES.tamales, "4.00"));
      items.push(fixtureItem("rosa-agua-jamaica", asset.id, NAMES.jamaica, "3.00"));
    }
    if (fixture.fixtureId === "rosa-menu-board-2") {
      secondTamaleKey = "rosa-tamales-board-2";
      items.push(fixtureItem(secondTamaleKey, asset.id, NAMES.tamales, "4.00"));
      items.push(fixtureItem("rosa-empanada-queso", asset.id, NAMES.empanada, "6.00"));
      items.push(fixtureItem("rosa-elote-preparado", asset.id, NAMES.elote, null));
    }
  }
  const duplicateGroups = firstTamaleKey && secondTamaleKey
    ? [{
      group_id: "duplicate-tamales",
      local_item_keys: [firstTamaleKey, secondTamaleKey],
      reason: "same_normalized_name_and_price",
      requires_confirmation: true,
    }]
    : [];
  return {
    items,
    duplicateGroups,
    fixtureIds: [...new Set(fixtureIds)].sort(),
  };
}

export type ConfirmedMenuItem = {
  localItemKey: string;
  sourceImageIds: string[];
  originalName: string;
  localizedNames: Record<string, string>;
  originalDescription: string | null;
  localizedDescriptions: Record<string, string>;
  priceAmount: string;
  currency: "USD";
  category: string | null;
  options: Array<{ name: string; values: string[] }>;
  priceConfirmed: true;
  duplicateResolution: "keep" | "merge" | "not_duplicate";
  correctedFields: string[];
};

export function validateConfirmedMenuItems(value: unknown): ConfirmedMenuItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    throw new ShopifyPocError("empty_menu", 422);
  }
  const seen = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ShopifyPocError("invalid_request", 400);
    }
    const item = raw as Record<string, unknown>;
    const expected = [
      "localItemKey", "sourceImageIds", "originalName", "localizedNames",
      "originalDescription", "localizedDescriptions", "priceAmount", "currency",
      "category", "options", "priceConfirmed", "duplicateResolution", "correctedFields",
    ].sort();
    const actual = Object.keys(item).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      throw new ShopifyPocError("invalid_request", 400);
    }
    const key = safeText(item.localItemKey, 80);
    if (!key || !/^[a-z0-9][a-z0-9_-]{2,80}$/.test(key) || seen.has(key)) {
      throw new ShopifyPocError("invalid_request", 400);
    }
    seen.add(key);
    const originalName = safeText(item.originalName, 140);
    const priceAmount = normalizePrice(item.priceAmount);
    if (!originalName || !priceAmount || item.currency !== "USD" || item.priceConfirmed !== true) {
      throw new ShopifyPocError("menu_confirmation_required", 422);
    }
    const names = item.localizedNames;
    if (!names || typeof names !== "object" || Array.isArray(names)) {
      throw new ShopifyPocError("menu_confirmation_required", 422);
    }
    const localizedNames: Record<string, string> = {};
    for (const locale of SUPPORTED_LOCALES) {
      const translated = safeText((names as Record<string, unknown>)[locale], 140);
      if (!translated) throw new ShopifyPocError("menu_confirmation_required", 422);
      localizedNames[locale] = translated;
    }
    if (!Array.isArray(item.sourceImageIds) || item.sourceImageIds.length < 1 || item.sourceImageIds.length > 8) {
      throw new ShopifyPocError("invalid_request", 400);
    }
    const sourceImageIds = item.sourceImageIds.map((id) => {
      const normalized = safeText(id, 160);
      if (!normalized) throw new ShopifyPocError("invalid_request", 400);
      return normalized;
    });
    const resolution = item.duplicateResolution;
    if (resolution !== "keep" && resolution !== "merge" && resolution !== "not_duplicate") {
      throw new ShopifyPocError("menu_confirmation_required", 422);
    }
    if (!Array.isArray(item.options) || item.options.length > 1) {
      throw new ShopifyPocError("menu_confirmation_required", 422);
    }
    const options = item.options.map((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) {
        throw new ShopifyPocError("invalid_request", 400);
      }
      const record = option as Record<string, unknown>;
      const name = safeText(record.name, 40);
      if (!name || !Array.isArray(record.values) || record.values.length < 1 || record.values.length > 10) {
        throw new ShopifyPocError("menu_confirmation_required", 422);
      }
      return {
        name,
        values: record.values.map((entry) => {
          const text = safeText(entry, 40);
          if (!text) throw new ShopifyPocError("menu_confirmation_required", 422);
          return text;
        }),
      };
    });
    const originalDescription = item.originalDescription === null
      ? null
      : safeText(item.originalDescription, 500);
    if (item.originalDescription !== null && !originalDescription) {
      throw new ShopifyPocError("invalid_request", 400);
    }
    const descriptions = item.localizedDescriptions;
    if (!descriptions || typeof descriptions !== "object" || Array.isArray(descriptions)) {
      throw new ShopifyPocError("invalid_request", 400);
    }
    const localizedDescriptions: Record<string, string> = {};
    for (const [locale, description] of Object.entries(descriptions as Record<string, unknown>)) {
      if (!isSupportedLocale(locale)) throw new ShopifyPocError("invalid_request", 400);
      const text = safeText(description, 500);
      if (!text) throw new ShopifyPocError("invalid_request", 400);
      localizedDescriptions[locale] = text;
    }
    const category = item.category === null ? null : safeText(item.category, 80);
    if (item.category !== null && !category) throw new ShopifyPocError("invalid_request", 400);
    if (!Array.isArray(item.correctedFields) || item.correctedFields.length > 8) {
      throw new ShopifyPocError("invalid_request", 400);
    }
    return {
      localItemKey: key,
      sourceImageIds,
      originalName,
      localizedNames,
      originalDescription,
      localizedDescriptions,
      priceAmount,
      currency: "USD",
      category,
      options,
      priceConfirmed: true,
      duplicateResolution: resolution,
      correctedFields: item.correctedFields.map((field) => safeText(field, 40)).filter(Boolean) as string[],
    };
  });
}

export async function requirePublishedStorefront(
  base44: unknown,
  demoSessionId: string,
) {
  const accessRows = await scopedRecords(base44, "VendorSellingAccess", demoSessionId, {}, 1);
  const access = accessRows[0] as SellingAccessRecord | undefined;
  const connection = await getConnectionRecord(base44, demoSessionId);
  if (!access || deriveSellingAccessState(access.certification_status, connection) !== "active_demo") {
    throw new ShopifyPocError("selling_access_locked", 403);
  }
  const imports = await scopedRecords(
    base44,
    "MenuImport",
    demoSessionId,
    { status: "published" },
    10,
  );
  const partial = imports.length === 0
    ? await scopedRecords(base44, "MenuImport", demoSessionId, { status: "partially_published" }, 10)
    : [];
  if (imports.length === 0 && partial.length === 0) {
    throw new ShopifyPocError("storefront_unavailable", 404);
  }
  return { access, connection: connection as ConnectionRecord, imports: [...imports, ...partial] };
}

export async function findScopedById(
  base44: unknown,
  entityName: string,
  demoSessionId: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  const rows = await scopedRecords(base44, entityName, demoSessionId, {}, 100);
  return rows.find((row) => row.id === id) ?? null;
}

export async function scopedEntityRecords(
  base44: unknown,
  entityName: string,
  demoSessionId: string,
  extra: Record<string, unknown> = {},
  limit = 100,
) {
  return await scopedRecords(base44, entityName, demoSessionId, extra, limit);
}

export function serviceEntity(base44: unknown, entityName: string): EntityHandler {
  return entity(base44, entityName);
}

// Kept separate from Shopify provenance because menu extraction is a Base44 AI operation.
export function aiProvenance(mode: "live_ai" | "fixture" | "unavailable", source: string, options = {}) {
  return makeProvenance(mode, source, options);
}

export function simulatedProvenance(source: string) {
  return makeProvenance("simulated", source);
}
