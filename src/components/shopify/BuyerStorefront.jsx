import React, { useState } from "react";
import { ArrowLeft, Minus, Plus, ShoppingBag, Store } from "lucide-react";
import { useSurfaceTranslation } from "@/i18n";
import ShopifyDisclosure, { ShopifyModeBadge } from "./ShopifyDisclosure";

function itemValue(item, camel, snake) {
  return item?.[camel] ?? item?.[snake];
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export function BuyerStoreCard({ locale, storefront, onOpen }) {
  const { t } = useSurfaceTranslation(locale, ["shopify", "marketplace"]);
  return (
    <article data-testid="store-card-rosa" className="buyer-store-card">
      <img src={storefront.media?.[0]?.previewUrl || "/shopify-fixtures/rosa-cart-photo.svg"} alt="" />
      <div>
        <ShopifyModeBadge locale={locale} provenance={storefront.provenance} />
        <h2>{t("shopify:buyerStoreTitle")}</h2>
        <p>{storefront.items?.length || 0} · {t("shopify:menuStep")}</p>
        <button type="button" className="shopify-primary" onClick={onOpen}>{t("shopify:viewStore")}</button>
      </div>
    </article>
  );
}

export default function BuyerStorefront({ locale, state, poc, onBack }) {
  const { t } = useSurfaceTranslation(locale, ["shopify", "marketplace"]);
  const [sampleCheckoutOpen, setSampleCheckoutOpen] = useState(false);
  const storefront = state.storefront;
  if (!storefront) {
    return (
      <div data-testid="buyer-storefront" className="marketplace-workspace-view buyer-storefront unavailable">
        <button className="shopify-back-button" type="button" onClick={onBack}><ArrowLeft className="marketplace-directional" size={17} /> {t("marketplace:explore")}</button>
        <Store size={34} />
        <h1>{t("shopify:storeUnavailable")}</h1>
        <button data-testid="view-sample-store" className="shopify-secondary" type="button" onClick={() => poc.loadStorefront({ sample: true })}>
          {t("shopify:viewSampleStore")}
        </button>
      </div>
    );
  }

  const lines = state.cart?.lines || [];
  const storefrontProvenance = storefront.provenance || state.provenance;
  function quantityFor(variantId) {
    return lines.find((line) => line.shopify_variant_id === variantId)?.quantity || 0;
  }

  async function checkout() {
    const result = await poc.getCheckoutUrl();
    if (!result.ok) return;
    if (result.data.sample || !result.data.checkout_url) {
      setSampleCheckoutOpen(true);
      return;
    }
    window.open(result.data.checkout_url, "_blank", "noopener,noreferrer");
  }

  return (
    <div data-testid="buyer-storefront" className="marketplace-workspace-view buyer-storefront">
      <button className="shopify-back-button" type="button" onClick={onBack}><ArrowLeft className="marketplace-directional" size={17} /> {t("marketplace:explore")}</button>
      <ShopifyDisclosure locale={locale} provenance={storefrontProvenance} compact />
      <header className="buyer-store-hero">
        <img src={storefront.media?.[0]?.previewUrl || "/shopify-fixtures/rosa-cart-photo.svg"} alt="" />
        <div><ShopifyModeBadge locale={locale} provenance={storefrontProvenance} /><h1>{t("shopify:buyerStoreTitle")}</h1>{storefrontProvenance?.mode === "fixture" && <p>{t("shopify:sampleExplanation")}</p>}</div>
      </header>
      <section className="buyer-menu-grid">
        {(storefront.items || []).map((item, index) => {
          const localKey = item.localItemKey || item.handle || `item-${index}`;
          const variantId = itemValue(item, "shopifyVariantId", "shopify_variant_id");
          const originalName = itemValue(item, "originalName", "original_name");
          const localizedName = itemValue(item, "localizedName", "localized_name") || item.localizedNames?.[locale] || originalName;
          const price = itemValue(item, "priceAmount", "price_amount");
          const available = itemValue(item, "availableForSale", "available") !== false;
          const quantity = quantityFor(variantId);
          return (
            <article data-testid={`buyer-menu-item-${localKey}`} key={variantId || localKey}>
              {itemValue(item, "imageUrl", "image_url") && <img src={itemValue(item, "imageUrl", "image_url")} alt="" />}
              <div className="buyer-menu-copy">
                <strong>{localizedName}</strong>
                {localizedName !== originalName && <small lang="es">{originalName}</small>}
                <bdi dir="ltr">{money(price)}</bdi>
              </div>
              {!available ? <span className="sold-out">{t("shopify:soldOut")}</span> : quantity === 0 ? (
                <button data-testid={`add-to-cart-${localKey}`} className="shopify-primary" type="button" onClick={() => poc.setCartQuantity(variantId, 1)}>
                  <Plus size={15} /> {t("shopify:addToCart")}
                </button>
              ) : (
                <div className="cart-stepper" dir="ltr">
                  <button type="button" onClick={() => poc.setCartQuantity(variantId, quantity - 1)} aria-label="−"><Minus size={14} /></button>
                  <bdi>{quantity}</bdi>
                  <button type="button" onClick={() => poc.setCartQuantity(variantId, quantity + 1)} aria-label="+"><Plus size={14} /></button>
                </div>
              )}
            </article>
          );
        })}
      </section>
      <aside data-testid="buyer-cart" className="buyer-cart">
        <div><ShoppingBag size={20} /><strong>{t("shopify:cart")}</strong></div>
        {!lines.length ? <p>{t("shopify:cartEmpty")}</p> : (
          <>
            <div className="buyer-cart-total"><span>{t("shopify:subtotal")}</span><bdi data-testid="cart-subtotal" dir="ltr">{money(state.cart?.subtotal?.amount)}</bdi></div>
            <button data-testid="test-checkout" type="button" className="shopify-primary wide" onClick={checkout}>
              {t("shopify:testCheckout")}
            </button>
          </>
        )}
        <small>{t("shopify:checkoutWarning")}</small>
      </aside>
      {sampleCheckoutOpen && (
        <div className="shopify-dialog-backdrop">
          <section className="shopify-dialog" role="dialog" aria-modal="true">
            <ShoppingBag size={27} />
            <h2>{t("shopify:testCheckout")}</h2>
            <p>{t("shopify:sampleCheckout")}</p>
            <button className="shopify-primary" type="button" onClick={() => setSampleCheckoutOpen(false)}>{t("shopify:confirm")}</button>
          </section>
        </div>
      )}
    </div>
  );
}
