import React, { useState } from "react";
import { Check, Copy, Eye, Send, Store } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useSurfaceTranslation } from "@/i18n";
import MenuPhotoIntake from "./MenuPhotoIntake";
import MenuReview from "./MenuReview";
import ShopifyDisclosure, { ShopifyModeBadge } from "./ShopifyDisclosure";
import ShopifySetup from "./ShopifySetup";
import StoreOperations from "./StoreOperations";

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function BuyerPreview({ locale, items, media }) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  return (
    <section data-testid="buyer-menu-preview" className="buyer-menu-preview">
      <header>
        <div className="buyer-store-photo"><img src={media?.[0]?.previewUrl || "/shopify-fixtures/rosa-cart-photo.svg"} alt="" /></div>
        <div><span className="shopify-kicker">{t("shopify:previewBuyer")}</span><h3>{t("shopify:buyerStoreTitle")}</h3></div>
      </header>
      <div className="buyer-preview-grid">
        {(items || []).map((item) => (
          <article key={item.localItemKey}>
            <div><strong>{item.localizedNames?.[locale] || item.originalName}</strong><small lang="es">{item.originalName}</small></div>
            <bdi dir="ltr">{money(item.priceAmount)}</bdi>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function VendorOnlineStore({ locale, demoSessionId, poc }) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  const { state, busyAction } = poc;
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const connected = ["connected_test_store", "connected_oauth"].includes(state.shopify_setup_state)
    && state.selling_access_state === "active_demo";

  if (!connected && !state.sampleMode) {
    return (
      <div data-testid="vendor-online-store" className="marketplace-workspace-view vendor-online-store">
        <ShopifySetup
          locale={locale}
          state={state}
          busyAction={busyAction}
          onBeginSignup={poc.beginSignup}
          onConnectPrepared={poc.connectPreparedStore}
          onUseSample={poc.activateVendorSample}
        />
      </div>
    );
  }

  const confirmed = state.menuImport?.status === "confirmed";
  const syncState = state.menuImport?.syncState || (confirmed ? "ready" : "draft");
  const publishStatusText = busyAction === "publish-menu"
    ? t("shopify:publishing")
    : state.sampleMode
      ? t("shopify:sampleOnly")
      : syncState === "published"
        ? t("shopify:published")
        : syncState === "partially_published"
          ? t("shopify:partiallyPublished")
          : syncState === "sync_failed"
            ? t("shopify:syncFailed")
            : t("shopify:readyToPublish");
  const mediaForPreview = state.media.filter((asset) => asset.approvedForStorefront);
  const buyerUrl = typeof window === "undefined" ? "" : (() => {
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", "store");
    if (demoSessionId) url.searchParams.set("demo_session_id", demoSessionId);
    url.searchParams.set("lang", locale);
    return url.toString();
  })();

  async function copyBuyerLink() {
    try {
      await navigator.clipboard.writeText(buyerUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div data-testid="vendor-online-store" className="marketplace-workspace-view vendor-online-store">
      <div className="workspace-title-row">
        <div><span className="marketplace-eyebrow">{t("shopify:onlineStore")}</span><h1>{t("shopify:buyerStoreTitle")}</h1></div>
        <div className="shopify-title-badges">
          <span data-testid="selling-access-badge" className={`selling-access-badge ${state.sampleMode ? "locked" : "active"}`}>
            {state.sampleMode ? t("shopify:sellingLocked") : t("shopify:sellingActive")}
          </span>
          <ShopifyModeBadge locale={locale} provenance={state.provenance} />
        </div>
      </div>
      <ShopifyDisclosure locale={locale} provenance={state.provenance} compact />
      {state.sampleMode && <p className="shopify-sample-note">{t("shopify:sampleExplanation")}</p>}
      <MenuPhotoIntake
        locale={locale}
        media={state.media}
        sampleMode={state.sampleMode}
        busy={busyAction === "media-extraction"}
        onFiles={poc.addLocalFiles}
        onRemove={poc.removeMedia}
        onKind={poc.setMediaKind}
        onApprove={poc.setMediaApproved}
        onLoadSample={poc.loadSampleMedia}
        onProcess={poc.confirmMediaAndExtract}
      />
      <MenuReview
        locale={locale}
        menuImport={state.menuImport}
        busy={busyAction === "confirm-menu-import"}
        onUpdate={poc.updateMenuItem}
        onConfirm={poc.confirmMenuImport}
      />
      {state.menuImport && (
        <section className="shopify-publish-panel">
          <div>
            <span className="shopify-kicker">03</span>
            <h2>{t("shopify:previewBuyer")}</h2>
            <p data-testid="publish-status" data-sync-state={syncState}>
              {publishStatusText}
            </p>
          </div>
          <div className="shopify-publish-actions">
            <button type="button" className="shopify-secondary" disabled={!confirmed} onClick={() => setShowPreview((value) => !value)}>
              <Eye size={16} /> {t("shopify:previewBuyer")}
            </button>
            <button
              data-testid="publish-menu"
              type="button"
              className="shopify-primary"
              disabled={!confirmed || busyAction === "publish-menu" || (!connected && !state.sampleMode)}
              onClick={poc.publishMenu}
            >
              <Send size={16} /> {state.sampleMode ? t("shopify:samplePreview") : t("shopify:publish")}
            </button>
          </div>
        </section>
      )}
      {Array.isArray(state.menuImport?.publishResults) && (
        <ul data-testid="publish-results" className="publish-result-list">
          {state.menuImport.publishResults.map((result) => (
            <li key={result.local_item_key} data-publish-status={result.status}>
              <span>{state.menuImport.items.find((item) => item.localItemKey === result.local_item_key)?.originalName || result.local_item_key}</span>
              <strong>{result.status === "published" ? t("shopify:itemPublished") : t("shopify:itemFailed")}</strong>
              {result.error_code && <code>{result.error_code}</code>}
            </li>
          ))}
        </ul>
      )}
      {showPreview && <BuyerPreview locale={locale} items={state.menuImport?.items} media={mediaForPreview} />}
      {(syncState === "published" || syncState === "sample_preview") && buyerUrl && (
        <section className="buyer-link-share">
          <div data-testid="buyer-menu-qr" className="buyer-menu-qr" aria-label={t("shopify:scanBuyerQr")}>
            <QRCodeSVG value={buyerUrl} size={116} marginSize={2} title={t("shopify:scanBuyerQr")} />
            <span>{t("shopify:scanBuyerQr")}</span>
          </div>
          <button data-testid="copy-buyer-menu-link" type="button" className="shopify-secondary copy-link" onClick={copyBuyerLink}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {t("shopify:viewStore")}
          </button>
        </section>
      )}
      {syncState === "published" && !state.sampleMode && (
        <StoreOperations
          locale={locale}
          state={state}
          busyAction={busyAction}
          onSetStatus={poc.setStoreOrderingStatus}
          onUpdateItem={poc.updatePublishedMenuItem}
          onRefreshOrders={poc.refreshOrders}
          onReset={poc.resetShopifyDemo}
        />
      )}
      {state.error && <p className="shopify-error" role="alert"><Store size={15} /> {t("shopify:actionFailed")}</p>}
    </div>
  );
}
