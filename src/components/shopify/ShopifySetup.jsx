import React, { useState } from "react";
import { ArrowUpRight, CircleAlert, Link2, Store, StoreIcon } from "lucide-react";
import { useSurfaceTranslation } from "@/i18n";
import { SHOPIFY_LOGIN_URL, normalizeShopDomain } from "@/lib/shopifyPoc";
import ShopifyDisclosure, { ShopifyModeBadge } from "./ShopifyDisclosure";

export default function ShopifySetup({
  locale,
  state,
  busyAction,
  onBeginSignup,
  onConnectPrepared,
  onUseSample,
}) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  const [returned, setReturned] = useState(false);
  const [domain, setDomain] = useState("");
  const normalizedDomain = normalizeShopDomain(domain);
  const signupOpened = ["signup_started", "merchant_action_required"].includes(state.shopify_setup_state);

  async function openSignup() {
    const signupWindow = window.open("about:blank", "_blank");
    if (signupWindow) signupWindow.opener = null;
    const result = await onBeginSignup();
    if (result?.ok) {
      if (signupWindow) signupWindow.location.replace(SHOPIFY_LOGIN_URL);
    } else signupWindow?.close();
  }

  return (
    <section
      data-testid="shopify-setup"
      data-shopify-setup-state={state.shopify_setup_state}
      className="shopify-setup"
    >
      <ShopifyDisclosure locale={locale} />
      <div className="shopify-setup-heading">
        <div>
          <span className="shopify-kicker">{t("shopify:onlineStore")}</span>
          <h2>{t("shopify:setupTitle")}</h2>
          <p>{t("shopify:setupIntro")}</p>
        </div>
        <ShopifyModeBadge locale={locale} provenance={state.provenance} scope="state" />
      </div>
      <aside className="shopify-requirement-note"><CircleAlert size={17} /><span>{t("shopify:shopifyRequirement")}</span></aside>
      <div className="shopify-setup-options">
        <article>
          <span className="shopify-card-icon"><Link2 size={23} /></span>
          <h3>{t("shopify:linkStore")}</h3>
          <p>{t("shopify:linkStoreCopy")}</p>
          <span className="shopify-connection-state">
            {state.shopify_setup_state === "prepared_test_store_available"
              ? t("shopify:preparedAvailable")
              : t("shopify:notConnected")}
          </span>
          <button
            data-testid="connect-prepared-store"
            type="button"
            className="shopify-primary"
            disabled={Boolean(busyAction)}
            onClick={onConnectPrepared}
          >
            <Store size={17} /> {t("shopify:connectPrepared")}
          </button>
        </article>
        <article>
          <span className="shopify-card-icon coral"><StoreIcon size={23} /></span>
          <h3>{t("shopify:createStore")}</h3>
          <p>{t("shopify:createStoreCopy")}</p>
          <button
            data-testid="shopify-create-store"
            type="button"
            className="shopify-secondary"
            disabled={Boolean(busyAction)}
            onClick={openSignup}
          >
            {t("shopify:createStore")} <ArrowUpRight size={16} />
          </button>
          {signupOpened && (
            <div data-testid="shopify-signup-return" className="shopify-signup-return">
              <strong>{t("shopify:signupOpened")}</strong>
              {!returned ? (
                <button type="button" onClick={() => setReturned(true)}>{t("shopify:createdStore")}</button>
              ) : (
                <label>
                  <span>{t("shopify:domainLabel")}</span>
                  <input
                    data-testid="shopify-domain-input"
                    dir="ltr"
                    inputMode="url"
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                    placeholder="your-store.myshopify.com"
                    aria-invalid={domain.length > 0 && !normalizedDomain}
                  />
                  <small>{t("shopify:productionPilot")}</small>
                </label>
              )}
            </div>
          )}
        </article>
      </div>
      {state.error && (
        <div className="shopify-unavailable-panel" role="alert">
          <CircleAlert size={21} />
          <div><strong>{t("shopify:unavailable")}</strong><p>{t("shopify:actionFailed")}</p></div>
          <button data-testid="view-sample-store" type="button" className="shopify-secondary" onClick={onUseSample}>
            {t("shopify:useSample")}
          </button>
        </div>
      )}
    </section>
  );
}
