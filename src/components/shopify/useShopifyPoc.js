import { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  SAMPLE_MEDIA,
  SAMPLE_MENU_ITEMS,
  SHOPIFY_DISCLOSURE_VERSION,
  SHOPIFY_FUNCTIONS,
  SHOPIFY_LOGIN_URL,
  createInitialShopifyState,
  createSampleActiveState,
  invokeShopifyFunction,
  isDemoSessionId,
  isExactBundledMenuSampleSet,
  makeFixtureProvenance,
  makeUnavailableProvenance,
  normalizeMoney,
  parseConnectedShopifyStoreData,
  parseSellingAccessData,
  parseShopifyProvenance,
  sampleStorefront,
  stripImageMetadata,
} from "@/lib/shopifyPoc";

const invokeService = /** @type {(...args: any[]) => Promise<any>} */ (invokeShopifyFunction);

function accessPatch(data, provenance) {
  const parsed = parseSellingAccessData(data);
  if (!parsed) return null;
  return {
    status: "ready",
    ...parsed,
    provenance,
    error: null,
  };
}

function invalidServiceData(source) {
  return {
    ok: false,
    error: "invalid_service_data",
    provenance: makeUnavailableProvenance(source, "invalid_service_data"),
  };
}

function parsePublishData(data, menuImportId, expectedKeys) {
  if (
    !data
    || data.menu_import_id !== menuImportId
    || !["published", "partially_published", "sync_failed"].includes(data.sync_state)
    || !Array.isArray(data.results)
    || data.results.length !== expectedKeys.length
  ) return null;
  const expected = new Set(expectedKeys);
  const seen = new Set();
  let publishedCount = 0;
  for (const item of data.results) {
    if (!item || typeof item.local_item_key !== "string" || !expected.has(item.local_item_key) || seen.has(item.local_item_key)) return null;
    seen.add(item.local_item_key);
    if (item.status === "published") {
      if (typeof item.shopify_product_id !== "string" || !Array.isArray(item.shopify_variant_ids) || item.shopify_variant_ids.length < 1) return null;
      publishedCount += 1;
    } else if (item.status === "failed") {
      if (typeof item.error_code !== "string" || !item.error_code) return null;
    } else return null;
  }
  const expectedState = publishedCount === data.results.length
    ? "published"
    : publishedCount > 0 ? "partially_published" : "sync_failed";
  return data.sync_state === expectedState ? data : null;
}

function parseLiveStorefrontData(data, provenance) {
  if (
    provenance?.mode !== "shopify_test_store"
    || !data
    || data.vendor_key !== "rosa-v1"
    || !["active", "paused"].includes(data.store_status)
    || typeof data.cart_enabled !== "boolean"
    || !Array.isArray(data.items)
    || data.items.length < 1
  ) return null;
  for (const item of data.items) {
    if (
      !item
      || typeof item.shopify_product_id !== "string"
      || typeof item.shopify_variant_id !== "string"
      || typeof item.handle !== "string"
      || typeof item.original_name !== "string"
      || typeof item.localized_name !== "string"
      || !normalizeMoney(item.price_amount)
      || item.currency !== "USD"
      || typeof item.available !== "boolean"
      || (item.image_url != null && typeof item.image_url !== "string")
    ) return null;
  }
  return data;
}

function parseCartData(data, expectedLines, provenance) {
  if (
    provenance?.mode !== "shopify_test_store"
    || !data
    || typeof data.cart_handle !== "string"
    || !/^cart_[0-9a-f]{32}$/.test(data.cart_handle)
    || !Array.isArray(data.lines)
    || data.lines.length !== expectedLines.length
    || !data.subtotal
    || !normalizeMoney(data.subtotal.amount)
    || data.subtotal.currency !== "USD"
    || data.checkout_available !== true
  ) return null;
  const expected = new Map(expectedLines.map((line) => [line.shopify_variant_id, line.quantity]));
  if (data.lines.some((line) => (
    !line
    || typeof line.shopify_variant_id !== "string"
    || expected.get(line.shopify_variant_id) !== line.quantity
  ))) return null;
  return {
    cart_handle: data.cart_handle,
    lines: data.lines.map((line) => ({ shopify_variant_id: line.shopify_variant_id, quantity: line.quantity })),
    subtotal: { amount: normalizeMoney(data.subtotal.amount), currency: "USD" },
    checkout_available: true,
  };
}

function shopifyContext(account, demoSessionId) {
  const prototypeAccountId = account?.prototype_account_id;
  if (!isDemoSessionId(demoSessionId) || !/^proto_[0-9a-f]{32}$/.test(prototypeAccountId ?? "")) {
    return null;
  }
  return {
    demo_session_id: demoSessionId,
    prototype_account_id: prototypeAccountId,
  };
}

function localAsset(file, index) {
  return {
    id: `local-media-${Date.now()}-${index}`,
    localMediaKey: `local-media-${Date.now()}-${index}`,
    file,
    fileName: file.name || `vendor-image-${index + 1}`,
    previewUrl: URL.createObjectURL(file),
    suggestedKind: null,
    confirmedKind: "other",
    status: "needs_kind_confirmation",
    approvedForStorefront: false,
    provenance: makeUnavailableProvenance("Local image awaiting upload", "not_processed"),
  };
}

export function useShopifyPoc({ account, demoSessionId, locale, role }) {
  const [state, setState] = useState(/** @type {any} */ (createInitialShopifyState()));
  const [busyAction, setBusyAction] = useState(null);
  const context = useMemo(
    () => shopifyContext(account, demoSessionId),
    [account?.prototype_account_id, account?.sync_status, account?.persistence, demoSessionId],
  );

  const invokeVendor = /** @type {(name: string, extra?: Record<string, any>) => Promise<any>} */ (useCallback(async (name, extra = {}) => {
    if (!context) {
      return {
        ok: false,
        error: "demo_context_unavailable",
        provenance: makeUnavailableProvenance(name, "demo_context_unavailable"),
      };
    }
    return invokeService(name, { ...context, ...extra });
  }, [context]));

  const loadSellingAccess = useCallback(async () => {
    if (role !== "vendor") return null;
    if (!context) {
      setState((current) => ({
        ...current,
        status: "unavailable",
        error: "demo_context_unavailable",
        provenance: makeUnavailableProvenance("get_selling_access", "demo_context_unavailable"),
      }));
      return null;
    }
    setState((current) => ({ ...current, status: "loading", error: null }));
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.getSellingAccess);
    if (!result.ok) {
      setState((current) => ({
        ...current,
        status: "unavailable",
        error: result.error,
        provenance: result.provenance,
      }));
      return result;
    }
    const patch = accessPatch(result.data, result.provenance);
    if (!patch) {
      const invalid = invalidServiceData(SHOPIFY_FUNCTIONS.getSellingAccess);
      setState((current) => ({ ...current, status: "unavailable", error: invalid.error, provenance: invalid.provenance }));
      return invalid;
    }
    setState((current) => ({ ...current, ...patch }));
    return result;
  }, [context, invokeVendor, role]);

  useEffect(() => {
    if (role === "vendor") loadSellingAccess();
    else setState(createInitialShopifyState());
  }, [loadSellingAccess, role]);

  const chooseNeedsHelp = useCallback(async () => {
    setBusyAction("certification-help");
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.setCertificationStatus, {
      status: "not_verified",
    });
    const patch = result.ok ? accessPatch(result.data, result.provenance) : null;
    const resolved = result.ok && !patch ? invalidServiceData(SHOPIFY_FUNCTIONS.setCertificationStatus) : result;
    if (resolved.ok) setState((current) => ({ ...current, ...patch }));
    else setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    setBusyAction(null);
    return resolved;
  }, [invokeVendor]);

  const confirmAttestation = useCallback(async () => {
    setBusyAction("certification-submit");
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.confirmAttestation, {
      confirmed: true,
      disclosure_version: SHOPIFY_DISCLOSURE_VERSION,
    });
    const patch = result.ok ? accessPatch(result.data, result.provenance) : null;
    const resolved = result.ok && !patch ? invalidServiceData(SHOPIFY_FUNCTIONS.confirmAttestation) : result;
    if (resolved.ok) setState((current) => ({ ...current, ...patch }));
    else setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    setBusyAction(null);
    return resolved;
  }, [invokeVendor]);

  const beginSignup = useCallback(async () => {
    setBusyAction("shopify-signup");
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.beginSignup);
    const validSignup = result.ok
      && result.data?.setup_state === "signup_started"
      && result.data?.merchant_action_required === true
      && result.data?.signup_url === SHOPIFY_LOGIN_URL;
    const resolved = result.ok && !validSignup ? invalidServiceData(SHOPIFY_FUNCTIONS.beginSignup) : result;
    if (resolved.ok) {
      setState((current) => ({
        ...current,
        shopify_setup_state: resolved.data.setup_state,
        provenance: resolved.provenance,
        error: null,
      }));
    } else {
      setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    }
    setBusyAction(null);
    return resolved;
  }, [invokeVendor]);

  const connectPreparedStore = useCallback(async () => {
    setBusyAction("connect-prepared-store");
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.connectPreparedStore);
    const connectionData = result.ok ? parseConnectedShopifyStoreData(result.data, result.provenance) : null;
    const resolved = result.ok && !connectionData
      ? invalidServiceData(SHOPIFY_FUNCTIONS.connectPreparedStore)
      : result;
    if (resolved.ok) {
      const nextSetup = connectionData.setup_state;
      setState((current) => ({
        ...current,
        status: "ready",
        shopify_setup_state: nextSetup,
        selling_access_state: connectionData.selling_access_state,
        can_publish: true,
        connection: {
          setupState: nextSetup,
          connectionStatus: connectionData.connection_status,
          shopDomain: connectionData.shop_domain,
          apiVersion: connectionData.api_version,
          grantedScopes: connectionData.granted_scopes,
          provenance: resolved.provenance,
        },
        provenance: resolved.provenance,
        error: null,
        sampleMode: false,
      }));
    } else {
      setState((current) => ({
        ...current,
        shopify_setup_state: "unavailable",
        error: resolved.error,
        provenance: resolved.provenance,
      }));
    }
    setBusyAction(null);
    return resolved;
  }, [invokeVendor]);

  const activateVendorSample = useCallback(() => {
    setState((current) => {
      const sample = createSampleActiveState(locale);
      return {
        ...current,
        status: "ready",
        connection: null,
        media: [],
        menuImport: null,
        storefront: null,
        cart: null,
        provenance: sample.provenance,
        error: null,
        sampleMode: true,
      };
    });
  }, [locale]);

  const addLocalFiles = useCallback((files) => {
    const accepted = Array.from(files || []).filter((file) => /^image\//.test(file.type)).slice(0, 8);
    setState((current) => ({
      ...current,
      media: [...current.media, ...accepted.map(localAsset)],
      error: null,
    }));
  }, []);

  const removeMedia = useCallback((id) => {
    setState((current) => {
      const item = current.media.find((asset) => asset.id === id);
      if (item?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      return { ...current, media: current.media.filter((asset) => asset.id !== id) };
    });
  }, []);

  const setMediaKind = useCallback((id, confirmedKind) => {
    setState((current) => ({
      ...current,
      media: current.media.map((asset) => asset.id === id
        ? {
          ...asset,
          confirmedKind,
          approvedForStorefront: false,
        }
        : asset),
    }));
  }, []);

  const setMediaApproved = useCallback((id, approvedForStorefront) => {
    setState((current) => ({
      ...current,
      media: current.media.map((asset) => asset.id === id
        ? { ...asset, approvedForStorefront: approvedForStorefront === true }
        : asset),
    }));
  }, []);

  const loadSampleMedia = useCallback(() => {
    setState((current) => ({
      ...current,
      media: SAMPLE_MEDIA.map((asset) => ({
        ...asset,
        status: "needs_kind_confirmation",
        approvedForStorefront: false,
      })),
      menuImport: null,
      sampleMode: true,
      provenance: makeFixtureProvenance("Bundled fictional SIDEWALK media fixtures"),
      error: null,
    }));
  }, []);

  const confirmMediaAndExtract = useCallback(async () => {
    if (!state.media.length) return { ok: false, error: "empty_media" };
    setBusyAction("media-extraction");
    if (isExactBundledMenuSampleSet(state.media)) {
      const provenance = makeFixtureProvenance("Bundled exact-hash fictional menu extraction");
      setState((current) => ({
        ...current,
        media: current.media.map((asset) => ({ ...asset, status: "confirmed" })),
        menuImport: {
          id: "fixture-menu-import",
          status: "review_required",
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
        provenance,
        error: null,
      }));
      setBusyAction(null);
      return { ok: true, provenance };
    }

    try {
      const uploadedAssets = [];
      for (let index = 0; index < state.media.length; index += 1) {
        const asset = state.media[index];
        if (!asset.file) continue;
        const stripped = await stripImageMetadata(asset.file);
        const upload = await base44.integrations.Core.UploadFile({ file: stripped });
        const uploadData = /** @type {any} */ (upload);
        const fileUrl = uploadData?.file_url;
        if (!fileUrl) throw new Error("media_upload_failed");
        uploadedAssets.push({
          source_file_url: fileUrl,
          source_locale: locale,
          confirmed_kind: asset.confirmedKind,
          source_order: index,
          approved_for_storefront: asset.approvedForStorefront === true,
        });
      }
      if (!uploadedAssets.length) throw new Error("media_upload_failed");
      const uploadResult = await invokeVendor(SHOPIFY_FUNCTIONS.uploadMedia, { assets: uploadedAssets });
      if (!uploadResult.ok) throw Object.assign(new Error(uploadResult.error), { result: uploadResult });
      const uploadedIds = (uploadResult.data.assets || []).map((asset) => asset.id).filter(Boolean);
      if (uploadedIds.length !== uploadedAssets.length) throw new Error("invalid_media_upload_response");
      const classification = await invokeVendor(SHOPIFY_FUNCTIONS.classifyMedia, { media_ids: uploadedIds });
      if (!classification.ok) throw Object.assign(new Error(classification.error), { result: classification });
      if (!Array.isArray(classification.data.suggestions)) throw new Error("invalid_media_classification_response");
      const suggestions = new Map(classification.data.suggestions.map((suggestion) => [suggestion.media_id, suggestion]));
      const menuIds = (uploadResult.data.assets || [])
        .filter((asset) => asset.confirmed_kind === "menu_or_price_board")
        .map((asset) => asset.id);
      if (!menuIds.length) throw new Error("empty_menu_media");
      const extraction = await invokeVendor(SHOPIFY_FUNCTIONS.extractMenu, { media_ids: menuIds });
      if (!extraction.ok) throw Object.assign(new Error(extraction.error), { result: extraction });
      const menuImport = extraction.data.menu_import;
      const extractionProvenance = parseShopifyProvenance(extraction.data.extraction_provenance)
        || extraction.provenance;
      setState((current) => ({
        ...current,
        media: (uploadResult.data.assets || []).map((asset, index) => ({
          ...current.media[index],
          ...asset,
          confirmedKind: asset.confirmed_kind,
          suggestedKind: suggestions.get(asset.id)?.suggested_kind || current.media[index]?.suggestedKind,
          classificationConfidence: suggestions.get(asset.id)?.confidence ?? null,
          classificationProvenance: parseShopifyProvenance(suggestions.get(asset.id)?.extraction_provenance)
            || classification.provenance,
          status: asset.processing_status,
        })),
        menuImport: {
          ...menuImport,
          duplicateGroups: extraction.data.duplicate_groups || [],
          provenance: extractionProvenance,
        },
        provenance: extractionProvenance,
        error: null,
      }));
      setBusyAction(null);
      return extraction;
    } catch (error) {
      const result = error.result || {
        ok: false,
        error: error.message || "media_upload_failed",
        provenance: makeUnavailableProvenance("Media extraction", error.message),
      };
      setState((current) => ({ ...current, error: result.error, provenance: result.provenance }));
      setBusyAction(null);
      return result;
    }
  }, [invokeVendor, locale, state.media, state.sampleMode]);

  const updateMenuItem = useCallback((localItemKey, patch) => {
    setState((current) => ({
      ...current,
      menuImport: current.menuImport ? {
        ...current.menuImport,
        items: current.menuImport.items.map((item) => item.localItemKey === localItemKey
          ? {
            ...item,
            ...patch,
            vendorCorrectedFields: Array.from(new Set([
              ...(item.vendorCorrectedFields || []),
              ...Object.keys(patch).filter((key) => !["priceConfirmed", "duplicateResolution"].includes(key)),
            ])),
          }
          : item),
      } : null,
    }));
  }, []);

  const confirmMenuImport = useCallback(async () => {
    const menuImport = state.menuImport;
    if (!menuImport) return { ok: false, error: "empty_menu" };
    const normalizedItems = menuImport.items.map((item) => ({
      ...item,
      priceAmount: normalizeMoney(item.priceAmount),
    }));
    const invalid = normalizedItems.some((item) => (
      !item.originalName?.trim()
      || !item.priceAmount
      || !item.priceConfirmed
      || (item.likelyDuplicate === true && !item.duplicateResolution)
    ));
    if (invalid) {
      setState((current) => ({ ...current, error: "menu_confirmation_required" }));
      return { ok: false, error: "menu_confirmation_required" };
    }
    setBusyAction("confirm-menu-import");
    if (state.sampleMode) {
      setState((current) => ({
        ...current,
        menuImport: { ...current.menuImport, status: "confirmed", items: normalizedItems },
        error: null,
      }));
      setBusyAction(null);
      return { ok: true, data: { status: "confirmed" }, provenance: makeFixtureProvenance() };
    }
    const items = normalizedItems.map((item) => ({
      localItemKey: item.localItemKey,
      originalName: item.originalName,
      localizedNames: item.localizedNames,
      originalDescription: item.originalDescription,
      localizedDescriptions: item.localizedDescriptions,
      priceAmount: item.priceAmount,
      currency: "USD",
      category: item.category,
      options: item.options,
      sourceImageIds: item.sourceImageIds,
      priceConfirmed: true,
      duplicateResolution: item.duplicateResolution || "keep",
      correctedFields: item.vendorCorrectedFields || [],
    }));
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.confirmMenu, {
      menu_import_id: menuImport.id,
      items,
    });
    const valid = result.ok
      && result.data?.menu_import_id === menuImport.id
      && result.data?.status === "confirmed"
      && Number.isInteger(result.data?.item_count)
      && result.data.item_count > 0;
    const resolved = result.ok && !valid ? invalidServiceData(SHOPIFY_FUNCTIONS.confirmMenu) : result;
    if (resolved.ok) {
      setState((current) => ({
        ...current,
        menuImport: { ...current.menuImport, status: resolved.data.status, items: normalizedItems },
        provenance: resolved.provenance,
        error: null,
      }));
    } else setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    setBusyAction(null);
    return resolved;
  }, [invokeVendor, state.menuImport, state.sampleMode]);

  const publishMenu = useCallback(async () => {
    if (!state.menuImport || state.menuImport.status !== "confirmed") {
      return { ok: false, error: "menu_not_confirmed" };
    }
    setBusyAction("publish-menu");
    if (state.sampleMode) {
      const storefront = sampleStorefront(locale);
      setState((current) => ({
        ...current,
        menuImport: { ...current.menuImport, status: "confirmed", syncState: "sample_preview" },
        storefront,
        provenance: storefront.provenance,
        error: null,
      }));
      setBusyAction(null);
      return { ok: true, data: { sync_state: "sample_preview" }, provenance: storefront.provenance };
    }
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.publishMenu, {
      menu_import_id: state.menuImport.id,
      confirmed: true,
    });
    const expectedKeys = state.menuImport.items.map((item) => item.localItemKey);
    const publishData = result.ok ? parsePublishData(result.data, state.menuImport.id, expectedKeys) : null;
    const resolved = result.ok && (!publishData || result.provenance?.mode !== "shopify_test_store")
      ? invalidServiceData(SHOPIFY_FUNCTIONS.publishMenu)
      : result;
    let storefrontResult = null;
    if (resolved.ok && ["published", "partially_published"].includes(publishData.sync_state) && isDemoSessionId(demoSessionId)) {
      const readResult = await invokeService(SHOPIFY_FUNCTIONS.getStorefront, {
        demo_session_id: demoSessionId,
        locale,
        sample_mode: false,
      });
      storefrontResult = readResult.ok && parseLiveStorefrontData(readResult.data, readResult.provenance)
        ? readResult
        : invalidServiceData(SHOPIFY_FUNCTIONS.getStorefront);
    }
    if (resolved.ok) {
      setState((current) => ({
        ...current,
        menuImport: { ...current.menuImport, status: "confirmed", syncState: publishData.sync_state, publishResults: publishData.results },
        storefront: storefrontResult?.ok ? storefrontResult.data : current.storefront,
        provenance: storefrontResult?.ok ? storefrontResult.provenance : resolved.provenance,
        error: publishData.sync_state === "partially_published"
          ? "partial_publish"
          : publishData.sync_state === "sync_failed"
            ? "sync_failed"
            : storefrontResult && !storefrontResult.ok ? "storefront_refresh_failed" : null,
      }));
    } else setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    setBusyAction(null);
    return resolved;
  }, [demoSessionId, invokeVendor, locale, state.menuImport, state.sampleMode]);

  const loadStorefront = useCallback(async ({ sample = false } = {}) => {
    if (sample) {
      const storefront = sampleStorefront(locale);
      setState((current) => ({ ...current, status: "ready", storefront, sampleMode: true, provenance: storefront.provenance, error: null }));
      return { ok: true, data: storefront, provenance: storefront.provenance };
    }
    if (!isDemoSessionId(demoSessionId)) {
      const provenance = makeUnavailableProvenance("get_vendor_storefront", "demo_session_id_required");
      setState((current) => ({ ...current, status: "unavailable", error: "storefront_unavailable", provenance }));
      return { ok: false, error: "storefront_unavailable", provenance };
    }
    setBusyAction("load-storefront");
    const result = await invokeService(SHOPIFY_FUNCTIONS.getStorefront, {
      demo_session_id: demoSessionId,
      locale,
      sample_mode: false,
    });
    const storefront = result.ok ? parseLiveStorefrontData(result.data, result.provenance) : null;
    const resolved = result.ok && !storefront ? invalidServiceData(SHOPIFY_FUNCTIONS.getStorefront) : result;
    if (resolved.ok) {
      setState((current) => ({ ...current, status: "ready", storefront, sampleMode: false, provenance: resolved.provenance, error: null }));
    } else setState((current) => ({ ...current, status: "unavailable", error: resolved.error, provenance: resolved.provenance }));
    setBusyAction(null);
    return resolved;
  }, [demoSessionId, locale]);

  const setCartQuantity = useCallback(async (variantId, quantity) => {
    const safeQuantity = Math.max(0, Math.min(20, Number(quantity) || 0));
    if (state.sampleMode) {
      setState((current) => {
        const existing = current.cart?.lines || [];
        const without = existing.filter((line) => line.shopify_variant_id !== variantId);
        const item = current.storefront?.items?.find((candidate) =>
          (candidate.shopifyVariantId || candidate.shopify_variant_id) === variantId);
        const lines = safeQuantity > 0 && item
          ? [...without, { shopify_variant_id: variantId, quantity: safeQuantity, item }]
          : without;
        const amount = lines.reduce((total, line) => total + Number(line.item.priceAmount || line.item.price_amount || 0) * line.quantity, 0);
        return {
          ...current,
          cart: {
            cart_handle: "fixture-cart-handle",
            lines,
            subtotal: { amount: amount.toFixed(2), currency: "USD" },
            checkout_available: lines.length > 0,
          },
        };
      });
      return;
    }
    if (/^fixture(?::|-)/.test(String(variantId))) {
      setState((current) => ({ ...current, error: "fixture_variant_rejected" }));
      return;
    }
    if (!isDemoSessionId(demoSessionId)) return;
    const currentLines = state.cart?.lines || [];
    const lines = [
      ...currentLines.filter((line) => line.shopify_variant_id !== variantId),
      ...(safeQuantity > 0 ? [{ shopify_variant_id: variantId, quantity: safeQuantity }] : []),
    ].map(({ shopify_variant_id, quantity: count }) => ({ shopify_variant_id, quantity: count }));
    if (!lines.length) {
      setState((current) => ({ ...current, cart: null, error: null }));
      return;
    }
    setBusyAction("cart");
    const result = await invokeService(SHOPIFY_FUNCTIONS.createCart, {
      demo_session_id: demoSessionId,
      lines,
    });
    const cart = result.ok ? parseCartData(result.data, lines, result.provenance) : null;
    const resolved = result.ok && !cart ? invalidServiceData(SHOPIFY_FUNCTIONS.createCart) : result;
    if (resolved.ok) setState((current) => ({ ...current, cart, provenance: resolved.provenance, error: null }));
    else setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    setBusyAction(null);
  }, [demoSessionId, state.cart?.lines, state.sampleMode]);

  const getCheckoutUrl = useCallback(async () => {
    if (!state.cart?.cart_handle) return { ok: false, error: "cart_required" };
    if (state.sampleMode) {
      return {
        ok: true,
        data: { checkout_url: null, label: "TEST CHECKOUT — NO REAL CHARGE", sample: true },
        provenance: makeFixtureProvenance(),
      };
    }
    if (/^fixture(?::|-)/.test(String(state.cart.cart_handle))) {
      return { ok: false, error: "fixture_cart_rejected" };
    }
    setBusyAction("checkout");
    const result = await invokeService(SHOPIFY_FUNCTIONS.getCheckout, {
      demo_session_id: demoSessionId,
      cart_handle: state.cart.cart_handle,
      confirmed_test_checkout: true,
    });
    let validCheckout = false;
    if (result.ok && result.data?.label === "TEST CHECKOUT — NO REAL CHARGE" && typeof result.data?.checkout_url === "string") {
      try {
        const checkout = new URL(result.data.checkout_url);
        validCheckout = checkout.protocol === "https:" && !checkout.username && !checkout.password;
      } catch {
        validCheckout = false;
      }
    }
    const resolved = result.ok && (!validCheckout || result.provenance?.mode !== "shopify_test_store")
      ? invalidServiceData(SHOPIFY_FUNCTIONS.getCheckout)
      : result;
    setBusyAction(null);
    if (!resolved.ok) setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    return resolved;
  }, [demoSessionId, state.cart, state.sampleMode]);

  const setStoreOrderingStatus = useCallback(async (orderingStatus) => {
    if (!['active', 'paused'].includes(orderingStatus) || state.sampleMode) {
      return { ok: false, error: state.sampleMode ? "sample_store_has_no_live_status" : "invalid_ordering_status" };
    }
    setBusyAction("store-status");
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.setStoreStatus, { ordering_status: orderingStatus });
    const valid = result.ok
      && result.data?.ordering_status === orderingStatus
      && result.data?.selling_access_state === "active_demo";
    const resolved = result.ok && !valid ? invalidServiceData(SHOPIFY_FUNCTIONS.setStoreStatus) : result;
    if (resolved.ok) {
      setState((current) => ({ ...current, ordering_status: orderingStatus, provenance: resolved.provenance, error: null }));
    } else setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    setBusyAction(null);
    return resolved;
  }, [invokeVendor, state.sampleMode]);

  const updatePublishedMenuItem = useCallback(async (localItemKey, patch) => {
    if (state.sampleMode || typeof localItemKey !== "string" || !localItemKey) {
      return { ok: false, error: state.sampleMode ? "sample_catalog_read_only" : "invalid_menu_item" };
    }
    const update = {};
    if (Object.prototype.hasOwnProperty.call(patch || {}, "price_amount")) {
      const price = normalizeMoney(patch.price_amount);
      if (!price) return { ok: false, error: "invalid_price" };
      update.price_amount = price;
    }
    if (Object.prototype.hasOwnProperty.call(patch || {}, "available")) {
      if (typeof patch.available !== "boolean") return { ok: false, error: "invalid_availability" };
      update.available = patch.available;
    }
    if (!Object.keys(update).length) return { ok: false, error: "empty_update" };
    setBusyAction(`update-item:${localItemKey}`);
    setState((current) => ({ ...current, itemSync: { ...current.itemSync, [localItemKey]: "saving" } }));
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.updateMenuItem, {
      local_item_key: localItemKey,
      ...update,
    });
    const validUpdate = result.ok
      && result.provenance?.mode === "shopify_test_store"
      && result.data?.local_item_key === localItemKey
      && result.data?.sync_state === "synced"
      && typeof result.data?.synced_at === "string"
      && !Number.isNaN(Date.parse(result.data.synced_at))
      && (update.price_amount === undefined || normalizeMoney(result.data.price_amount) === update.price_amount)
      && (update.available === undefined || result.data.available === update.available);
    let resolved = result.ok && !validUpdate ? invalidServiceData(SHOPIFY_FUNCTIONS.updateMenuItem) : result;
    let storefront = null;
    if (resolved.ok && isDemoSessionId(demoSessionId)) {
      const readResult = await invokeService(SHOPIFY_FUNCTIONS.getStorefront, {
        demo_session_id: demoSessionId,
        locale,
        sample_mode: false,
      });
      storefront = readResult.ok ? parseLiveStorefrontData(readResult.data, readResult.provenance) : null;
      if (!storefront) resolved = invalidServiceData(SHOPIFY_FUNCTIONS.getStorefront);
      else resolved = { ...result, storefront, storefrontProvenance: readResult.provenance };
    }
    if (resolved.ok && storefront) {
      setState((current) => ({
        ...current,
        storefront,
        itemSync: { ...current.itemSync, [localItemKey]: "synced" },
        provenance: resolved.storefrontProvenance,
        error: null,
      }));
    } else {
      setState((current) => ({
        ...current,
        itemSync: { ...current.itemSync, [localItemKey]: "failed" },
        provenance: resolved.provenance,
        error: resolved.error,
      }));
    }
    setBusyAction(null);
    return resolved;
  }, [demoSessionId, invokeVendor, locale, state.sampleMode]);

  const refreshOrders = useCallback(async () => {
    if (state.sampleMode) return { ok: false, error: "sample_store_has_no_orders" };
    setBusyAction("refresh-orders");
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.refreshOrders);
    const valid = result.ok
      && Array.isArray(result.data?.orders)
      && typeof result.data?.checked_at === "string"
      && !Number.isNaN(Date.parse(result.data.checked_at));
    const resolved = result.ok && !valid ? invalidServiceData(SHOPIFY_FUNCTIONS.refreshOrders) : result;
    if (resolved.ok) {
      setState((current) => ({
        ...current,
        orders: resolved.data.orders,
        ordersStatus: "loaded",
        ordersCheckedAt: resolved.data.checked_at,
        provenance: resolved.provenance,
        error: null,
      }));
    } else {
      setState((current) => ({
        ...current,
        orders: null,
        ordersStatus: "unavailable",
        ordersCheckedAt: null,
        provenance: resolved.provenance,
        error: resolved.error,
      }));
    }
    setBusyAction(null);
    return resolved;
  }, [invokeVendor, state.sampleMode]);

  const resetShopifyDemo = useCallback(async () => {
    if (state.sampleMode) return { ok: false, error: "sample_reset_separate" };
    setBusyAction("reset-shopify-demo");
    const result = await invokeVendor(SHOPIFY_FUNCTIONS.resetDemo);
    const valid = result.ok
      && result.data?.reset === true
      && result.data?.certification_status === "unanswered"
      && result.data?.selling_access_state === "locked_needs_status"
      && result.data?.shopify_setup_state === "not_started"
      && result.data?.external_cleanup_performed === false
      && typeof result.data?.external_cleanup_required === "boolean";
    const resolved = result.ok && !valid ? invalidServiceData(SHOPIFY_FUNCTIONS.resetDemo) : result;
    if (resolved.ok) {
      setState({
        ...createInitialShopifyState(),
        status: "ready",
        provenance: resolved.provenance,
        resetNotice: resolved.data.external_cleanup_required ? "external_cleanup_required" : "reset_complete",
      });
    } else setState((current) => ({ ...current, error: resolved.error, provenance: resolved.provenance }));
    setBusyAction(null);
    return resolved;
  }, [invokeVendor, state.sampleMode]);

  return {
    state,
    setState,
    busyAction,
    loadSellingAccess,
    chooseNeedsHelp,
    confirmAttestation,
    beginSignup,
    connectPreparedStore,
    activateVendorSample,
    addLocalFiles,
    removeMedia,
    setMediaKind,
    setMediaApproved,
    loadSampleMedia,
    confirmMediaAndExtract,
    updateMenuItem,
    confirmMenuImport,
    publishMenu,
    loadStorefront,
    setCartQuantity,
    getCheckoutUrl,
    setStoreOrderingStatus,
    updatePublishedMenuItem,
    refreshOrders,
    resetShopifyDemo,
  };
}
