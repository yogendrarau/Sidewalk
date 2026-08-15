import React, { useEffect, useState } from "react";
import { CircleAlert, Pause, RefreshCw, RotateCcw, Save, Store } from "lucide-react";
import { useSurfaceTranslation } from "@/i18n";
import { ShopifyModeBadge } from "./ShopifyDisclosure";

function PublishedItemControl({ locale, item, localItemKey, syncState, onUpdate }) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  const [price, setPrice] = useState(item.price_amount || "");
  useEffect(() => setPrice(item.price_amount || ""), [item.price_amount]);
  const available = item.available === true;
  return (
    <article data-testid={`published-catalog-item-${localItemKey}`} className="published-catalog-item">
      <div><strong>{item.localized_name || item.original_name}</strong><small lang="es">{item.original_name}</small></div>
      <label><span>{t("shopify:price")}</span><span className="price-input-wrap" dir="ltr"><bdi>$</bdi><input data-testid={`published-price-${localItemKey}`} value={price} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} /></span></label>
      <label className="published-availability"><input data-testid={`published-available-${localItemKey}`} type="checkbox" checked={available} disabled={syncState === "saving"} onChange={(event) => onUpdate(localItemKey, { available: event.target.checked })} /><span>{available ? t("shopify:available") : t("shopify:soldOut")}</span></label>
      <button data-testid={`save-published-price-${localItemKey}`} type="button" className="shopify-secondary" disabled={syncState === "saving" || price === item.price_amount} onClick={() => onUpdate(localItemKey, { price_amount: price })}><Save size={14} /> {t("shopify:savePrice")}</button>
      {syncState && <span data-testid={`published-sync-${localItemKey}`} className={`published-sync-state ${syncState}`}>{syncState === "saving" ? t("shopify:saving") : syncState === "synced" ? t("shopify:synced") : t("shopify:syncFailedShort")}</span>}
    </article>
  );
}

export default function StoreOperations({ locale, state, busyAction, onSetStatus, onUpdateItem, onRefreshOrders, onReset }) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  const [confirmReset, setConfirmReset] = useState(false);
  const paused = state.ordering_status === "paused";
  const publishedByProduct = new Map((state.menuImport?.publishResults || [])
    .filter((result) => result.status === "published" && result.shopify_product_id)
    .map((result) => [result.shopify_product_id, result.local_item_key]));
  const publishedItems = (state.storefront?.items || []).flatMap((item) => {
    const localItemKey = publishedByProduct.get(item.shopify_product_id);
    return localItemKey ? [{ item, localItemKey }] : [];
  });
  return (
    <section data-testid="shopify-store-operations" className="shopify-store-operations">
      <header>
        <div><span className="shopify-kicker">04</span><h2>{t("shopify:storeControls")}</h2><p>{t("shopify:storeControlsIntro")}</p></div>
        <ShopifyModeBadge locale={locale} provenance={state.provenance} />
      </header>
      <div className="store-operation-grid">
        <article>
          <Store size={20} />
          <strong>{paused ? t("shopify:orderingPaused") : t("shopify:orderingActive")}</strong>
          <button data-testid="toggle-store-status" type="button" className="shopify-secondary" disabled={Boolean(busyAction)} onClick={() => onSetStatus(paused ? "active" : "paused")}>
            {paused ? <Store size={15} /> : <Pause size={15} />} {paused ? t("shopify:resumeOrdering") : t("shopify:pauseOrdering")}
          </button>
        </article>
        <article>
          <RefreshCw size={20} />
          <strong>{t("shopify:orderRefresh")}</strong>
          <p>{state.ordersStatus === "unavailable" ? t("shopify:ordersUnavailable") : t("shopify:ordersNotLoaded")}</p>
          <button data-testid="refresh-shopify-orders" type="button" className="shopify-secondary" disabled={Boolean(busyAction)} onClick={onRefreshOrders}>
            <RefreshCw size={15} /> {t("shopify:refresh")}
          </button>
        </article>
      </div>
      {publishedItems.length > 0 && (
        <section data-testid="authoritative-published-catalog" className="authoritative-published-catalog">
          <header><div><h3>{t("shopify:publishedCatalog")}</h3><p>{t("shopify:authoritativeCatalogRead")}</p></div></header>
          <div className="published-catalog-grid">
            {publishedItems.map(({ item, localItemKey }) => <PublishedItemControl key={item.shopify_variant_id} locale={locale} item={item} localItemKey={localItemKey} syncState={state.itemSync?.[localItemKey]} onUpdate={onUpdateItem} />)}
          </div>
        </section>
      )}
      <div className="shopify-reset-row">
        <CircleAlert size={17} />
        <span>{t("shopify:resetWarning")}</span>
        <button data-testid="reset-shopify-demo" type="button" className="shopify-secondary" disabled={Boolean(busyAction)} onClick={() => setConfirmReset(true)}>
          <RotateCcw size={15} /> {t("shopify:resetDemo")}
        </button>
      </div>
      {confirmReset && (
        <div className="shopify-dialog-backdrop">
          <section data-testid="reset-shopify-dialog" className="shopify-dialog" role="dialog" aria-modal="true">
            <RotateCcw size={25} />
            <h2>{t("shopify:resetDemo")}</h2>
            <p>{t("shopify:resetConfirmation")}</p>
            <div className="shopify-dialog-actions">
              <button type="button" className="shopify-secondary" onClick={() => setConfirmReset(false)}>{t("shopify:cancel")}</button>
              <button data-testid="confirm-shopify-reset" type="button" className="shopify-primary" onClick={async () => { await onReset(); setConfirmReset(false); }}>{t("shopify:confirm")}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
