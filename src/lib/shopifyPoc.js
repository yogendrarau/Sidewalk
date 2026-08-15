export const CERTIFICATION_STATUSES = Object.freeze([
  "unanswered",
  "not_verified",
  "self_attested_demo",
]);

export const SELLING_ACCESS_STATES = Object.freeze([
  "locked_needs_status",
  "locked_needs_certification",
  "locked_needs_shopify",
  "active_demo",
]);

export const SHOPIFY_SETUP_STATES = Object.freeze([
  "not_started",
  "signup_started",
  "merchant_action_required",
  "prepared_test_store_available",
  "connected_test_store",
  "connected_oauth",
  "reauthorization_required",
  "unavailable",
]);

export const SHOPIFY_MODES = Object.freeze([
  "shopify_test_store",
  "fixture",
  "unavailable",
]);
const SERVICE_PROVENANCE_MODES = Object.freeze([
  ...SHOPIFY_MODES,
  "simulated",
  "live_ai",
]);

export const VENDOR_IMAGE_KINDS = Object.freeze([
  "menu_or_price_board",
  "product_or_food_photo",
  "cart_truck_stand_or_venue",
  "other",
]);

export const SHOPIFY_FUNCTIONS = Object.freeze({
  getSellingAccess: "get_selling_access",
  setCertificationStatus: "set_certification_status",
  confirmAttestation: "confirm_certification_self_attestation",
  beginSignup: "begin_shopify_signup",
  connectPreparedStore: "connect_prepared_shopify_store",
  getConnection: "get_shopify_connection",
  uploadMedia: "upload_vendor_media",
  classifyMedia: "classify_vendor_media",
  extractMenu: "extract_menu_photos",
  confirmMenu: "confirm_menu_import",
  publishMenu: "publish_menu_to_shopify",
  getStorefront: "get_vendor_storefront",
  updateMenuItem: "update_shopify_menu_item",
  setStoreStatus: "set_shopify_store_status",
  createCart: "create_shopify_cart",
  getCheckout: "get_shopify_checkout_url",
  refreshOrders: "refresh_shopify_orders",
  resetDemo: "reset_shopify_demo",
});

export const SHOPIFY_DISCLOSURE_VERSION = "shopify-poc-v1";
export const SHOPIFY_LOGIN_URL = "https://www.shopify.com/store-login";
export const SHOPIFY_FIXTURE_ID = "rosa-shopify-store-v1";
export const SHOPIFY_DEMO_CONTEXT_STORAGE_KEY = "sidewalk-shopify-demo-context-v1";

const SHOP_DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,59}[a-z0-9])?\.myshopify\.com$/i;
const SESSION_PATTERN = /^(?:proto_[0-9a-f]{32}|[A-Za-z0-9][A-Za-z0-9_-]{2,79})$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/;

const SAMPLE_TRANSLATIONS = Object.freeze({
  tacos_de_pollo: Object.freeze({
    en: "Chicken tacos",
    es: "Tacos de pollo",
    wo: "Tacos yu ganaar",
    ar: "تاكو بالدجاج",
    bn: "চিকেন টাকো",
    "zh-Hans": "鸡肉塔可",
    fr: "Tacos au poulet",
  }),
  tamales: Object.freeze({
    en: "Tamales",
    es: "Tamales",
    wo: "Tamales",
    ar: "تاماليس",
    bn: "তামালে",
    "zh-Hans": "玉米粽",
    fr: "Tamales",
  }),
  agua_jamaica: Object.freeze({
    en: "Hibiscus drink",
    es: "Agua de jamaica",
    wo: "Naanu bissap",
    ar: "مشروب الكركديه",
    bn: "জবা ফুলের পানীয়",
    "zh-Hans": "洛神花饮料",
    fr: "Boisson à l’hibiscus",
  }),
  empanada_de_queso: Object.freeze({
    en: "Cheese empanada",
    es: "Empanada de queso",
    wo: "Empanada bu fromage",
    ar: "إمبانادا بالجبن",
    bn: "চিজ এমপানাদা",
    "zh-Hans": "奶酪馅饼",
    fr: "Empanada au fromage",
  }),
  elote_preparado: Object.freeze({
    en: "Prepared corn",
    es: "Elote preparado",
    wo: "Mbóq mi ñu waajal",
    ar: "ذرة محضّرة",
    bn: "প্রস্তুত ভুট্টা",
    "zh-Hans": "调味玉米",
    fr: "Maïs préparé",
  }),
});

export const SAMPLE_MEDIA = Object.freeze([
  Object.freeze({
    id: "fixture-menu-board-1",
    localMediaKey: "fixture-menu-board-1",
    previewUrl: "/shopify-fixtures/rosa-menu-board-1.svg",
    fileName: "rosa-menu-board-1.svg",
    confirmedKind: "menu_or_price_board",
    suggestedKind: "menu_or_price_board",
    status: "confirmed",
    sha256: "7a1363a0362e5fb014aab4696775b922d6f9432c17ebc9920df3adcf1f782fbc",
    approvedForStorefront: false,
    provenance: Object.freeze({
      mode: "fixture",
      source: "Bundled fictional SIDEWALK menu image",
      retrievedAt: "2026-08-15T12:00:00.000Z",
      fixtureId: "rosa-menu-board-1",
    }),
  }),
  Object.freeze({
    id: "fixture-menu-board-2",
    localMediaKey: "fixture-menu-board-2",
    previewUrl: "/shopify-fixtures/rosa-menu-board-2.svg",
    fileName: "rosa-menu-board-2.svg",
    confirmedKind: "menu_or_price_board",
    suggestedKind: "menu_or_price_board",
    status: "confirmed",
    sha256: "16f91ff14df98e163c1a80a7add05344a54682b6367323d3d2e56771cd59c639",
    approvedForStorefront: false,
    provenance: Object.freeze({
      mode: "fixture",
      source: "Bundled fictional SIDEWALK menu image",
      retrievedAt: "2026-08-15T12:00:00.000Z",
      fixtureId: "rosa-menu-board-2",
    }),
  }),
  Object.freeze({
    id: "fixture-cart-photo",
    localMediaKey: "fixture-cart-photo",
    previewUrl: "/shopify-fixtures/rosa-cart-photo.svg",
    fileName: "rosa-fictional-cart.svg",
    confirmedKind: "cart_truck_stand_or_venue",
    suggestedKind: "cart_truck_stand_or_venue",
    status: "confirmed",
    sha256: "14f183857ce3b3eefcdf86dc54fd172a0ae0e2056a0ee04a60adac66b30450a2",
    approvedForStorefront: true,
    provenance: Object.freeze({
      mode: "fixture",
      source: "Bundled fictional SIDEWALK storefront image",
      retrievedAt: "2026-08-15T12:00:00.000Z",
      fixtureId: "rosa-cart-photo",
    }),
  }),
]);

export function isExactBundledSampleMedia(asset) {
  if (!isPlainObject(asset)) return false;
  return SAMPLE_MEDIA.some((fixture) => (
    fixture.id === asset.id
    && fixture.sha256 === asset.sha256
    && fixture.confirmedKind === asset.confirmedKind
    && fixture.provenance.fixtureId === asset.provenance?.fixtureId
  ));
}

export function isExactBundledMenuSampleSet(assets) {
  if (!Array.isArray(assets) || assets.length < 2 || assets.length > 3) return false;
  if (!assets.every(isExactBundledSampleMedia)) return false;
  const ids = assets.map((asset) => asset.id).sort();
  if (new Set(ids).size !== ids.length) return false;
  const required = ["fixture-menu-board-1", "fixture-menu-board-2"];
  return required.every((id) => ids.includes(id))
    && ids.every((id) => required.includes(id) || id === "fixture-cart-photo");
}

export const SAMPLE_MENU_ITEMS = Object.freeze([
  Object.freeze({
    localItemKey: "tacos_de_pollo",
    sourceImageIds: ["fixture-menu-board-1"],
    originalName: "Tacos de pollo",
    localizedNames: SAMPLE_TRANSLATIONS.tacos_de_pollo,
    originalDescription: null,
    localizedDescriptions: Object.freeze({}),
    priceAmount: "5.00",
    currency: "USD",
    category: null,
    options: [],
    confidence: { name: 0.98, price: 0.96, description: 0, options: 1 },
    needsConfirmation: ["price"],
    priceConfirmed: false,
    vendorCorrectedFields: [],
  }),
  Object.freeze({
    localItemKey: "tamales",
    sourceImageIds: ["fixture-menu-board-1", "fixture-menu-board-2"],
    originalName: "Tamales",
    localizedNames: SAMPLE_TRANSLATIONS.tamales,
    originalDescription: null,
    localizedDescriptions: Object.freeze({}),
    priceAmount: "4.00",
    currency: "USD",
    category: null,
    options: [],
    confidence: { name: 0.99, price: 0.97, description: 0, options: 1 },
    needsConfirmation: ["price", "likely_duplicate"],
    priceConfirmed: false,
    vendorCorrectedFields: [],
  }),
  Object.freeze({
    localItemKey: "agua_jamaica",
    sourceImageIds: ["fixture-menu-board-1"],
    originalName: "Agua de jamaica",
    localizedNames: SAMPLE_TRANSLATIONS.agua_jamaica,
    originalDescription: null,
    localizedDescriptions: Object.freeze({}),
    priceAmount: "3.00",
    currency: "USD",
    category: null,
    options: [],
    confidence: { name: 0.99, price: 0.94, description: 0, options: 0.81 },
    needsConfirmation: ["price"],
    priceConfirmed: false,
    vendorCorrectedFields: [],
  }),
  Object.freeze({
    localItemKey: "empanada_de_queso",
    sourceImageIds: ["fixture-menu-board-2"],
    originalName: "Empanada de queso",
    localizedNames: SAMPLE_TRANSLATIONS.empanada_de_queso,
    originalDescription: null,
    localizedDescriptions: Object.freeze({}),
    priceAmount: "6.00",
    currency: "USD",
    category: null,
    options: [],
    confidence: { name: 0.99, price: 0.95, description: 0, options: 1 },
    needsConfirmation: ["price"],
    priceConfirmed: false,
    vendorCorrectedFields: [],
  }),
  Object.freeze({
    localItemKey: "elote_preparado",
    sourceImageIds: ["fixture-menu-board-2"],
    originalName: "Elote preparado",
    localizedNames: SAMPLE_TRANSLATIONS.elote_preparado,
    originalDescription: null,
    localizedDescriptions: Object.freeze({}),
    priceAmount: null,
    currency: "USD",
    category: null,
    options: [],
    confidence: { name: 0.98, price: 0.18, description: 0, options: 1 },
    needsConfirmation: ["price"],
    priceConfirmed: false,
    vendorCorrectedFields: [],
  }),
]);

export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isDemoSessionId(value) {
  return typeof value === "string" && SESSION_PATTERN.test(value);
}

export function normalizeShopDomain(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return SHOP_DOMAIN_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeMoney(value) {
  const normalized = String(value ?? "").trim();
  if (!MONEY_PATTERN.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
}

export function deriveSellingAccess(certificationStatus, shopifySetupState) {
  if (certificationStatus === "not_verified") return "locked_needs_certification";
  if (certificationStatus !== "self_attested_demo") return "locked_needs_status";
  if (shopifySetupState === "connected_test_store" || shopifySetupState === "connected_oauth") {
    return "active_demo";
  }
  return "locked_needs_shopify";
}

export function vendorWorkspacesFor(access) {
  const status = access?.certification_status ?? "unanswered";
  const selling = access?.selling_access_state ?? deriveSellingAccess(status, access?.shopify_setup_state);
  // "street-rules" is ungated: the published restricted-streets map is
  // reference material available to every vendor state.
  const result = ["dashboard", "street-rules", "orders", "account"];
  if (status === "not_verified") result.splice(2, 0, "get-verified");
  if (status === "self_attested_demo") result.splice(1, 0, "online-store");
  if (selling === "active_demo" && !result.includes("online-store")) result.splice(1, 0, "online-store");
  return result;
}

export function parseSellingAccessData(value) {
  if (!isPlainObject(value)) return null;
  const {
    certification_status: certificationStatus,
    selling_access_state: sellingAccessState,
    shopify_setup_state: setupState,
    ordering_status: orderingStatus,
  } = value;
  if (
    !CERTIFICATION_STATUSES.includes(certificationStatus)
    || !SELLING_ACCESS_STATES.includes(sellingAccessState)
    || !SHOPIFY_SETUP_STATES.includes(setupState)
    || !["active", "paused"].includes(orderingStatus)
    || value.is_fictional !== true
    || typeof value.can_access_get_verified !== "boolean"
    || typeof value.can_prepare_menu !== "boolean"
    || typeof value.can_open_shopify_setup !== "boolean"
    || typeof value.can_publish !== "boolean"
  ) return null;
  const expectedState = deriveSellingAccess(certificationStatus, setupState);
  if (
    sellingAccessState !== expectedState
    || value.can_access_get_verified !== (certificationStatus === "not_verified")
    || value.can_prepare_menu !== (certificationStatus !== "unanswered")
    || value.can_open_shopify_setup !== (certificationStatus === "self_attested_demo")
    || value.can_publish !== (sellingAccessState === "active_demo")
  ) return null;
  if (value.attested_at != null && (typeof value.attested_at !== "string" || Number.isNaN(Date.parse(value.attested_at)))) return null;
  if (value.disclosure_version != null && typeof value.disclosure_version !== "string") return null;
  return Object.freeze({
    certification_status: certificationStatus,
    selling_access_state: sellingAccessState,
    shopify_setup_state: setupState,
    ordering_status: orderingStatus,
    attested_at: value.attested_at ?? null,
    disclosure_version: value.disclosure_version ?? null,
    is_fictional: true,
    can_access_get_verified: value.can_access_get_verified,
    can_prepare_menu: value.can_prepare_menu,
    can_open_shopify_setup: value.can_open_shopify_setup,
    can_publish: value.can_publish,
  });
}

export function parseConnectedShopifyStoreData(value, provenance) {
  if (!isPlainObject(value) || provenance?.mode !== "shopify_test_store") return null;
  if (
    !["connected_test_store", "connected_oauth"].includes(value.setup_state)
    || value.connection_status !== "connected"
    || value.selling_access_state !== "active_demo"
    || !normalizeShopDomain(value.shop_domain)
    || typeof value.api_version !== "string"
    || !Array.isArray(value.granted_scopes)
    || !value.granted_scopes.every((scope) => typeof scope === "string" && scope.length > 0)
  ) return null;
  return Object.freeze({
    setup_state: value.setup_state,
    connection_status: "connected",
    selling_access_state: "active_demo",
    shop_domain: normalizeShopDomain(value.shop_domain),
    api_version: value.api_version,
    granted_scopes: Object.freeze([...new Set(value.granted_scopes)].sort()),
  });
}

export function makeUnavailableProvenance(source, fallbackReason) {
  return Object.freeze({
    mode: "unavailable",
    source,
    retrievedAt: new Date().toISOString(),
    ...(fallbackReason ? { fallbackReason } : {}),
  });
}

export function makeFixtureProvenance(source = "Bundled fictional SIDEWALK Shopify fixture") {
  return Object.freeze({
    mode: "fixture",
    source,
    retrievedAt: new Date().toISOString(),
    fixtureId: SHOPIFY_FIXTURE_ID,
  });
}

export function parseShopifyProvenance(value) {
  if (!isPlainObject(value) || !SERVICE_PROVENANCE_MODES.includes(value.mode)) return null;
  if (typeof value.source !== "string" || !value.source.trim()) return null;
  if (typeof value.retrievedAt !== "string" || Number.isNaN(new Date(value.retrievedAt).valueOf())) return null;
  const result = {
    mode: value.mode,
    source: value.source,
    retrievedAt: new Date(value.retrievedAt).toISOString(),
  };
  for (const key of ["shopDomain", "apiVersion", "fixtureId", "fallbackReason"]) {
    if (typeof value[key] === "string" && value[key].trim()) result[key] = value[key];
  }
  return Object.freeze(result);
}

function unwrapInvocation(value) {
  if (isPlainObject(value) && typeof value.ok === "boolean") return value;
  if (isPlainObject(value?.data) && typeof value.data.ok === "boolean") return value.data;
  return null;
}

export function parseShopifyResult(value, source = "Base44 Shopify function") {
  const envelope = unwrapInvocation(value);
  if (!envelope) {
    return Object.freeze({
      ok: false,
      error: "invalid_service_response",
      provenance: makeUnavailableProvenance(source, "invalid_service_response"),
    });
  }
  const provenance = parseShopifyProvenance(envelope.provenance);
  if (!provenance) {
    return Object.freeze({
      ok: false,
      error: "invalid_provenance",
      provenance: makeUnavailableProvenance(source, "invalid_provenance"),
    });
  }
  if (envelope.ok !== true) {
    return Object.freeze({
      ok: false,
      error: typeof envelope.error === "string" ? envelope.error : "service_unavailable",
      provenance,
    });
  }
  if (!("data" in envelope)) {
    return Object.freeze({ ok: false, error: "missing_service_data", provenance });
  }
  return Object.freeze({ ok: true, data: envelope.data, provenance });
}

async function resolveClient(requestedClient) {
  if (requestedClient) return requestedClient;
  const module = await import("../api/base44Client.js");
  return module.base44;
}

export async function invokeShopifyFunction(name, body, options = /** @type {any} */ ({})) {
  const requestedClient = options.client;
  if (!Object.values(SHOPIFY_FUNCTIONS).includes(name)) {
    throw new TypeError("Unknown Shopify POC function.");
  }
  if (!isPlainObject(body) || !isDemoSessionId(body.demo_session_id)) {
    throw new TypeError("A valid demo_session_id is required.");
  }
  const developmentWindow = typeof window !== "undefined" ? /** @type {any} */ (window) : null;
  const developmentTestInvoke = import.meta.env?.DEV
    ? developmentWindow?.__SIDEWALK_SHOPIFY_TEST_INVOKE__
    : null;
  if (typeof developmentTestInvoke === "function") {
    try {
      return parseShopifyResult(await developmentTestInvoke(name, body), name);
    } catch (error) {
      return Object.freeze({
        ok: false,
        error: "development_test_invoke_failed",
        provenance: makeUnavailableProvenance(name, error instanceof Error ? error.message : "request_failed"),
      });
    }
  }
  let client;
  try {
    client = await resolveClient(requestedClient);
  } catch {
    client = null;
  }
  if (!client?.functions?.invoke) {
    return Object.freeze({
      ok: false,
      error: "base44_function_unavailable",
      provenance: makeUnavailableProvenance(name, "base44_function_unavailable"),
    });
  }
  try {
    const response = await client.functions.invoke(name, body);
    return parseShopifyResult(response, name);
  } catch (error) {
    return Object.freeze({
      ok: false,
      error: "base44_function_unavailable",
      provenance: makeUnavailableProvenance(
        name,
        error instanceof Error ? error.message : "request_failed",
      ),
    });
  }
}

function defaultStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseShopifyDemoContext(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isPlainObject(parsed)) return null;
  const keys = Object.keys(parsed).sort();
  const expected = [
    "created_at",
    "demo_session_id",
    "locale",
    "prototype_account_id",
    "schema_version",
  ].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return null;
  if (
    parsed.schema_version !== 1 ||
    !isDemoSessionId(parsed.demo_session_id) ||
    typeof parsed.prototype_account_id !== "string" ||
    !/^proto_[0-9a-f]{32}$/.test(parsed.prototype_account_id) ||
    !["en", "es", "wo", "ar", "bn", "zh-Hans", "fr"].includes(parsed.locale) ||
    typeof parsed.created_at !== "string" ||
    Number.isNaN(new Date(parsed.created_at).valueOf())
  ) {
    return null;
  }
  return Object.freeze({
    schema_version: 1,
    demo_session_id: parsed.demo_session_id,
    prototype_account_id: parsed.prototype_account_id,
    locale: parsed.locale,
    created_at: new Date(parsed.created_at).toISOString(),
  });
}

export function readShopifyDemoContext(storage = defaultStorage()) {
  if (!storage?.getItem) return null;
  try {
    const context = parseShopifyDemoContext(storage.getItem(SHOPIFY_DEMO_CONTEXT_STORAGE_KEY));
    if (!context) storage.removeItem?.(SHOPIFY_DEMO_CONTEXT_STORAGE_KEY);
    return context;
  } catch {
    return null;
  }
}

export function saveShopifyDemoContext(context, storage = defaultStorage()) {
  const parsed = parseShopifyDemoContext(context);
  if (!parsed) throw new TypeError("Invalid Shopify demo context.");
  try {
    storage?.setItem?.(SHOPIFY_DEMO_CONTEXT_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // The returned in-memory context remains usable in the current tab.
  }
  return parsed;
}

export function clearShopifyDemoContext(storage = defaultStorage()) {
  try {
    storage?.removeItem?.(SHOPIFY_DEMO_CONTEXT_STORAGE_KEY);
  } catch {
    // Logout still clears the in-memory account even if storage is unavailable.
  }
}

export async function ensureShopifyDemoContext(options = /** @type {any} */ ({})) {
  const {
    account,
    locale,
    client: requestedClient,
    storage = defaultStorage(),
  } = options;
  const prototypeAccountId = account?.prototype_account_id;
  if (!/^proto_[0-9a-f]{32}$/.test(prototypeAccountId ?? "")) return null;
  const existing = readShopifyDemoContext(storage);
  if (existing?.prototype_account_id === prototypeAccountId) return existing;
  try {
    const client = await resolveClient(requestedClient);
    if (!client?.functions?.invoke) return null;
    const response = await client.functions.invoke("start_demo_session", { locale });
    const envelope = unwrapInvocation(response);
    const demoSessionId = envelope?.ok === true && envelope.data?.demo_session_id;
    if (!isDemoSessionId(demoSessionId)) return null;
    return saveShopifyDemoContext({
      schema_version: 1,
      demo_session_id: demoSessionId,
      prototype_account_id: prototypeAccountId,
      locale,
      created_at: new Date().toISOString(),
    }, storage);
  } catch {
    return null;
  }
}

export function createInitialShopifyState() {
  return {
    status: "loading",
    certification_status: "unanswered",
    selling_access_state: "locked_needs_status",
    shopify_setup_state: "not_started",
    attested_at: null,
    disclosure_version: null,
    ordering_status: "paused",
    connection: null,
    media: [],
    menuImport: null,
    storefront: null,
    cart: null,
    orders: null,
    ordersStatus: "not_loaded",
    resetNotice: null,
    itemSync: {},
    provenance: makeUnavailableProvenance("Base44 Shopify POC", "not_loaded"),
    error: null,
    sampleMode: false,
  };
}

export function sampleStorefront(locale = "es") {
  return {
    vendorKey: "rosa-fixture",
    vendorName: "Rosa’s Tamales",
    originalLocale: "es",
    locale,
    status: "open_for_test_orders",
    media: SAMPLE_MEDIA.filter((asset) => asset.approvedForStorefront),
    items: SAMPLE_MENU_ITEMS.map((item) => ({
      ...item,
      priceAmount: item.priceAmount || "5.00",
      priceConfirmed: true,
      availableForSale: true,
      shopifyProductId: `fixture:${item.localItemKey}`,
      shopifyVariantId: `fixture:${item.localItemKey}:default`,
    })),
    provenance: makeFixtureProvenance(),
  };
}

export function createSampleActiveState(locale = "es") {
  const provenance = makeFixtureProvenance();
  return {
    status: "ready",
    certification_status: "unanswered",
    selling_access_state: "locked_needs_status",
    shopify_setup_state: "not_started",
    attested_at: null,
    disclosure_version: null,
    ordering_status: "paused",
    connection: null,
    media: SAMPLE_MEDIA.map((item) => ({ ...item })),
    menuImport: {
      id: "fixture-menu-import",
      status: "review",
      currency: "USD",
      items: SAMPLE_MENU_ITEMS.map((item) => ({
        ...item,
        localizedNames: { ...item.localizedNames },
        localizedDescriptions: { ...item.localizedDescriptions },
        confidence: { ...item.confidence },
        options: item.options.map((option) => ({ ...option, values: [...option.values] })),
        needsConfirmation: [...item.needsConfirmation],
        vendorCorrectedFields: [...item.vendorCorrectedFields],
      })),
      duplicateGroups: [["tamales"]],
      provenance,
    },
    storefront: sampleStorefront(locale),
    cart: null,
    orders: null,
    ordersStatus: "not_loaded",
    resetNotice: null,
    itemSync: {},
    provenance,
    error: null,
    sampleMode: true,
  };
}

export async function stripImageMetadata(file) {
  if (!(file instanceof Blob) || typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }
  if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return file;
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), type, 0.9);
  });
}
