import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  CircleUserRound,
  ClipboardList,
  Compass,
  Construction,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPinned,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import SidewalkApp from "./Sidewalk";
import StreetRulesWorkspace, {
  SHOPIFY_CHECKOUT_URL,
  formatOrderTotal,
} from "@/components/marketplace/StreetRulesWorkspace";
import sampleVendorSeed from "@/data/sample-vendors.json";
import sidewalkMark from "@/assets/brand/sidewalk-mark.png";
import sidewalkWordmark from "@/assets/brand/sidewalk-wordmark.png";
import findLocationIcon from "@/assets/brand/find-location.png";
import checkNoticeIcon from "@/assets/brand/checknotice.png";
import progressIcon from "@/assets/brand/progress.png";
import dollarSignIcon from "@/assets/brand/dollarsign.png";
import vendorLicenseIcon from "@/assets/brand/vendor.png";
import { Image } from "@/components/ui/image";
import BuyerStorefront, { BuyerStoreCard } from "@/components/shopify/BuyerStorefront";
import CertificationGate, { CertificationDialog } from "@/components/shopify/CertificationGate";
import VendorOnlineStore from "@/components/shopify/VendorOnlineStore";
import { useShopifyPoc } from "@/components/shopify/useShopifyPoc";
import { SHOPIFY_LOGIN_URL, vendorWorkspacesFor } from "@/lib/shopifyPoc";
import {
  DEFAULT_CONSOLE_LOCALE,
  LOCALE_REGISTRY,
  SUPPORTED_LOCALES,
  localeDirection,
  normalizeLocale,
  useSurfaceTranslation,
} from "@/i18n";
import "../marketplace.css";
import "../marketplace-shopify.css";

const BUYER_ICON_URL = "https://media.base44.com/images/public/6a807abba4a26b462c198c81/b75419f62_cart.png";
const VENDOR_ICON_URL = "https://media.base44.com/images/public/6a807abba4a26b462c198c81/6901804ea_sell.png";
const RoleImage = /** @type {React.ComponentType<any>} */ (Image);

export const ROLE_WORKSPACES = Object.freeze({
  buyer: ["explore", "store", "street-rules", "orders", "account"],
  vendor: ["dashboard", "online-store", "street-rules", "orders", "get-verified", "account"],
});

const WORKSPACE_ALIASES = Object.freeze({
  buyer: "explore",
  marketplace: "explore",
  store: "store",
  seller: "dashboard",
  vendor: "dashboard",
  online: "online-store",
  storefront: "online-store",
  verification: "get-verified",
  verified: "get-verified",
  "get_verified": "get-verified",
  map: "street-rules",
  rules: "street-rules",
  zones: "street-rules",
  "street_rules": "street-rules",
});

function normalizeRole(value) {
  return value === "buyer" || value === "vendor" ? value : null;
}

function roleFromAccount(account) {
  return normalizeRole(account && (account.account_role || account.role));
}

function canonicalWorkspace(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return WORKSPACE_ALIASES[normalized] || normalized.replaceAll("_", "-");
}

export function sanitizeWorkspace(role, requestedWorkspace) {
  const safeRole = normalizeRole(role);
  const fallback = safeRole === "vendor" ? "dashboard" : "explore";
  if (!safeRole) return fallback;
  const requested = canonicalWorkspace(requestedWorkspace);
  return ROLE_WORKSPACES[safeRole].includes(requested) ? requested : fallback;
}

function sanitizeWorkspaceForAccess(role, requestedWorkspace, sellingAccess) {
  const safeRole = normalizeRole(role);
  if (safeRole !== "vendor") return sanitizeWorkspace(safeRole, requestedWorkspace);
  const requested = canonicalWorkspace(requestedWorkspace);
  const allowed = vendorWorkspacesFor(sellingAccess);
  return allowed.includes(requested) ? requested : "dashboard";
}

function Brand() {
  return (
    <div className="marketplace-brand" aria-label="SIDEWALK">
      <img className="marketplace-brand-mark" src={sidewalkMark} alt="" />
      <img className="marketplace-brand-wordmark" src={sidewalkWordmark} alt="" />
    </div>
  );
}

function PrototypeDisclosure({ locale }) {
  const { t } = useSurfaceTranslation(locale, ["common"]);
  return (
    <div
      data-testid="prototype-disclosure"
      className="marketplace-disclosure"
      lang={locale}
      dir={localeDirection(locale)}
    >
      <span className="marketplace-disclosure-dot" aria-hidden="true" />
      <strong>{t("common:prototype")}</strong>
      <span aria-hidden="true"> · </span>
      <span>{t("common:disclosure")}</span>
    </div>
  );
}

function TypewriterText({ texts, typeSpeedMs = 38, deleteSpeedMs = 20, pauseMs = 1600 }) {
  const phrases = useMemo(
    () => (Array.isArray(texts) ? texts : [texts]).filter(Boolean),
    [texts],
  );
  const key = JSON.stringify(phrases);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [phase, setPhase] = useState("typing");

  useEffect(() => {
    setPhraseIndex(0);
    setVisibleCount(0);
    setPhase("typing");
  }, [key]);

  useEffect(() => {
    if (phrases.length === 0) return undefined;
    const current = phrases[phraseIndex % phrases.length];

    if (phase === "typing") {
      if (visibleCount < current.length) {
        const timeout = setTimeout(() => setVisibleCount((count) => count + 1), typeSpeedMs);
        return () => clearTimeout(timeout);
      }
      if (phrases.length > 1) {
        const timeout = setTimeout(() => setPhase("deleting"), pauseMs);
        return () => clearTimeout(timeout);
      }
      return undefined;
    }

    if (visibleCount > 0) {
      const timeout = setTimeout(() => setVisibleCount((count) => count - 1), deleteSpeedMs);
      return () => clearTimeout(timeout);
    }
    setPhraseIndex((index) => (index + 1) % phrases.length);
    setPhase("typing");
    return undefined;
  }, [phase, visibleCount, phraseIndex, phrases, typeSpeedMs, deleteSpeedMs, pauseMs]);

  const current = phrases[phraseIndex % phrases.length] || "";
  return (
    <>
      <span aria-hidden="true">
        {current.slice(0, visibleCount)}
        <span className="marketplace-typewriter-caret" />
      </span>
      <span className="marketplace-sr-only">{current}</span>
    </>
  );
}

function LanguageSelect({ locale, onChange }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  return (
    <label className="marketplace-language">
      <span className="marketplace-sr-only">{t("marketplace:language")}</span>
      <select
        data-testid="marketplace-language-select"
        aria-label={t("marketplace:language")}
        value={locale}
        onChange={(event) => onChange(event.target.value)}
      >
        {SUPPORTED_LOCALES.map((id) => (
          <option key={id} value={id}>{LOCALE_REGISTRY[id].nativeName}</option>
        ))}
      </select>
    </label>
  );
}

function OnboardingFrame({ locale, onLocaleChange, children, className = "" }) {
  return (
    <div className={"marketplace-onboarding" + (className ? " " + className : "")} lang={locale} dir={localeDirection(locale)}>
      <PrototypeDisclosure locale={locale} />
      <header className="marketplace-onboarding-header">
        <Brand />
        <LanguageSelect locale={locale} onChange={onLocaleChange} />
      </header>
      {children}
    </div>
  );
}

function RoleSelection({ locale, onLocaleChange, onSelect }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  return (
    <OnboardingFrame locale={locale} onLocaleChange={onLocaleChange} className="role-selection-onboarding">
      <main data-testid="role-selection" className="role-selection-shell">
        <div className="role-selection-copy">
          <span className="marketplace-eyebrow"><Sparkles size={15} /> SIDEWALK MARKETPLACE</span>
          <h1>{t("marketplace:roleHeading")}</h1>
          <p>
            <TypewriterText
              texts={[
                t("marketplace:roleIntro"),
                t("marketplace:buyDescription"),
                t("marketplace:sellDescription"),
              ]}
            />
          </p>
        </div>
        <div className="role-option-grid">
          <button
            data-testid="role-option-buyer"
            className="role-option-card buyer"
            type="button"
            onClick={() => onSelect("buyer")}
          >
            <span className="role-option-icon has-image"><RoleImage src={BUYER_ICON_URL} className="role-option-image" alt="" /></span>
            <span className="role-option-content">
              <strong>{t("marketplace:buyChoice")}</strong>
              <span>{t("marketplace:buyDescription")}</span>
            </span>
            <ArrowRight className="marketplace-directional" size={21} aria-hidden="true" />
          </button>
          <button
            data-testid="role-option-vendor"
            className="role-option-card vendor"
            type="button"
            onClick={() => onSelect("vendor")}
          >
            <span className="role-option-icon has-image"><RoleImage src={VENDOR_ICON_URL} className="role-option-image" alt="" /></span>
            <span className="role-option-content">
              <strong>{t("marketplace:sellChoice")}</strong>
              <span>{t("marketplace:sellDescription")}</span>
            </span>
            <ArrowRight className="marketplace-directional" size={21} aria-hidden="true" />
          </button>
        </div>
        <p className="role-selection-footnote"><LockKeyhole size={15} /> {t("marketplace:roleLockedHint")}</p>
      </main>
    </OnboardingFrame>
  );
}

function PrototypeAccountSetup({ locale, role, onLocaleChange, onBack, onCreate, busy, error }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  const isBuyer = role === "buyer";
  const label = isBuyer ? t("marketplace:buyerRole") : t("marketplace:vendorRole");
  const prototypeName = isBuyer ? t("marketplace:demoBuyerName") : t("marketplace:demoVendorName");

  return (
    <OnboardingFrame locale={locale} onLocaleChange={onLocaleChange}>
      <main data-testid="prototype-account-setup" className="prototype-account-shell">
        <button data-testid="account-setup-back" className="marketplace-back" type="button" onClick={onBack}>
          <ArrowLeft className="marketplace-directional" size={17} /> {t("marketplace:backToRoles")}
        </button>
        <section className="prototype-account-card" aria-labelledby="prototype-account-title">
          <div className="prototype-account-seal"><ShieldCheck size={28} /></div>
          <span className="marketplace-eyebrow">{t("marketplace:prototypeAccount")}</span>
          <h1 id="prototype-account-title">{t("marketplace:accountHeading")}</h1>
          <p className="prototype-account-intro">{t("marketplace:accountIntro")}</p>
          <div className="prototype-warning" role="note">
            <LockKeyhole size={18} />
            <span>{t("marketplace:prototypeWarning")}</span>
          </div>
          <dl className="prototype-account-summary">
            <div>
              <dt>{t("marketplace:selectedRole")}</dt>
              <dd data-testid="prototype-role"><span className={"role-chip " + role}>{label}</span><code>{role}</code></dd>
            </div>
            <div>
              <dt>{t("marketplace:prototypeName")}</dt>
              <dd>{prototypeName}</dd>
            </div>
          </dl>
          {error && <p className="prototype-account-error" role="alert">{t("marketplace:accountError")}</p>}
          <button
            data-testid="create-prototype-account"
            className="marketplace-primary-button"
            type="button"
            disabled={busy}
            onClick={onCreate}
          >
            {busy
              ? t("marketplace:creatingAccount")
              : isBuyer
                ? t("marketplace:createBuyerAccount")
                : t("marketplace:createVendorAccount")}
            {!busy && <ArrowRight className="marketplace-directional" size={18} />}
          </button>
        </section>
      </main>
    </OnboardingFrame>
  );
}

function EmptyState({ testId, icon: Icon = null, image = null, eyebrow, title, body = null, secondary = null }) {
  return (
    <section data-testid={testId} className="marketplace-empty-card">
      <div className="marketplace-empty-icon">
        {image ? <img src={image} alt="" /> : Icon ? <Icon size={26} /> : null}
      </div>
      <span className="marketplace-empty-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {secondary && <small>{secondary}</small>}
    </section>
  );
}

function BuyerExplore({ locale, storefront, onOpenStore, onViewSample, onOpenVendor }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace", "shopify"]);
  return (
    <div data-testid="buyer-explore" className="marketplace-workspace-view">
      <div className="workspace-title-row">
        <div>
          <span className="marketplace-eyebrow">{t("marketplace:buyerWorkspace")}</span>
          <h1>{t("marketplace:buyerExploreTitle")}</h1>
          <p>{t("marketplace:exploreVendorsIntro")}</p>
        </div>
        <span className="not-live-badge"><Construction size={14} /> {t("marketplace:marketplaceNotLive")}</span>
      </div>
      <div className="coming-soon-search" aria-disabled="true">
        <Search size={18} />
        <span>{t("marketplace:searchLabel")}</span>
        <strong>{t("marketplace:comingSoon")}</strong>
      </div>
      {storefront && <BuyerStoreCard locale={locale} storefront={storefront} onOpen={onOpenStore} />}
      <div className="explore-vendor-grid" data-testid="explore-vendor-grid">
        {sampleVendorSeed.vendors.map((vendor) => (
          <button
            key={vendor.id}
            type="button"
            data-sample-vendor={vendor.id}
            className="explore-vendor-card"
            onClick={() => onOpenVendor(vendor)}
          >
            <span className="rules-vendor-emoji" aria-hidden="true">{vendor.emoji}</span>
            <span className="explore-vendor-copy">
              <strong><bdi dir="ltr">{vendor.name}</bdi></strong>
              <small><bdi dir="ltr">{vendor.goods}</bdi></small>
            </span>
            <span className="explore-vendor-cta">{t("marketplace:viewMenu")} <ArrowRight className="marketplace-directional" size={15} /></span>
          </button>
        ))}
      </div>
      {!storefront && (
        <>
          <EmptyState
            testId="marketplace-empty-state"
            image={findLocationIcon}
            eyebrow={t("marketplace:intentionallyEmpty")}
            title={t("marketplace:buyerEmpty")}
            secondary={t("marketplace:buyerEmptySecondary")}
          />
          <button data-testid="view-sample-store" className="shopify-secondary buyer-sample-action" type="button" onClick={onViewSample}>
            {t("shopify:viewSampleStore")}
          </button>
        </>
      )}
    </div>
  );
}

function BuyerOrders({ locale, orders }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  return (
    <div data-testid="buyer-orders" className="marketplace-workspace-view">
      <div className="workspace-title-row"><div><span className="marketplace-eyebrow">{t("marketplace:buyerWorkspace")}</span><h1>{t("marketplace:buyerOrdersTitle")}</h1></div></div>
      {orders.length > 0
        ? (
          <section className="rules-demo-receipts buyer-orders-list" data-testid="buyer-orders-list">
            <strong>{t("marketplace:demoReceipts")}</strong>
            <ul>
              {orders.map((entry) => (
                <li key={entry.id}>
                  <bdi dir="ltr">{entry.itemName} · {entry.priceLabel} · {entry.vendorName}</bdi>
                </li>
              ))}
            </ul>
            <div className="rules-order-footer">
              <span className="rules-order-total">
                {t("marketplace:orderTotal")} · <bdi dir="ltr">{formatOrderTotal(orders)}</bdi>
              </span>
              <a
                data-testid="orders-checkout-link"
                className="rules-checkout-link"
                href={SHOPIFY_CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("marketplace:checkoutShopify")} ↗
              </a>
            </div>
          </section>
        )
        : (
          <EmptyState
            testId="buyer-orders-empty"
            image={checkNoticeIcon}
            eyebrow={t("marketplace:intentionallyEmpty")}
            title={t("marketplace:buyerOrdersEmpty")}
            secondary={t("marketplace:buyerOrdersSecondary")}
          />
        )}
    </div>
  );
}

function AccountView({ locale, role, onLogout, sellingAccess = null }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace", "shopify"]);
  const isBuyer = role === "buyer";
  return (
    <div data-testid={isBuyer ? "buyer-account" : "seller-account"} className="marketplace-workspace-view account-workspace">
      <div className="workspace-title-row"><div><span className="marketplace-eyebrow">{t("marketplace:prototypeProfile")}</span><h1>{t("marketplace:accountTitle")}</h1></div></div>
      <section className="account-profile-card">
        <div className="account-avatar"><img src={progressIcon} alt="" /></div>
        <div className="account-profile-heading">
          <span>{t("marketplace:prototypeAccount")}</span>
          <strong>{isBuyer ? t("marketplace:demoBuyerName") : t("marketplace:demoVendorName")}</strong>
          <p>{t("marketplace:accountDescription")}</p>
        </div>
        <dl>
          <div>
            <dt>{t("marketplace:accountRole")}</dt>
            <dd data-testid="account-role"><span className={"role-chip " + role}>{isBuyer ? t("marketplace:buyerRole") : t("marketplace:vendorRole")}</span><code>{role}</code></dd>
          </div>
        </dl>
        <p className="account-role-note"><Check size={16} /> {t("marketplace:roleStored")}</p>
        {!isBuyer && sellingAccess?.certification_status === "self_attested_demo" && (
          <p data-testid="account-self-attested-badge" className="self-attested-badge"><ShieldCheck size={15} /> {t("shopify:selfAttestedBadge")}</p>
        )}
        <p className="account-no-switch">{t("marketplace:noRoleSwitch")}</p>
        <button data-testid="logout" className="marketplace-logout" type="button" onClick={onLogout}>
          <LogOut size={17} /> {t("marketplace:logout")}
        </button>
      </section>
    </div>
  );
}

function SellerDashboard({ locale, state, busyAction, onNeedHelp, onOpenAttestation, onContinueVerification, onOpenStore, onRetry }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace", "shopify"]);
  const unanswered = state.certification_status === "unanswered";
  const needsHelp = state.certification_status === "not_verified";
  const selfAttested = state.certification_status === "self_attested_demo";
  const active = state.selling_access_state === "active_demo";
  const liveStorefront = (state.storefront?.provenance || state.provenance)?.mode === "shopify_test_store"
    ? state.storefront
    : null;
  const productCount = Array.isArray(liveStorefront?.items) ? String(liveStorefront.items.length) : null;
  const unavailableMetric = t("shopify:unavailableBadge");
  return (
    <div data-testid="seller-dashboard" className="marketplace-workspace-view seller-dashboard-view">
      <div className="workspace-title-row">
        <div><span className="marketplace-eyebrow">{t("marketplace:sellerWorkspace")}</span><h1>{t("marketplace:sellerDashboardTitle")}</h1><p>{t("marketplace:sellerDashboardIntro")}</p></div>
        <span data-testid="selling-access-badge" className={`not-live-badge ${active ? "active" : ""}`}>
          {active ? <BadgeCheck size={14} /> : <LockKeyhole size={14} />} {active ? t("shopify:sellingActive") : t("shopify:sellingLocked")}
        </span>
      </div>
      <div className="seller-metric-grid">
        <article data-testid="seller-store-status" className="seller-metric-card store-card">
          <span className="seller-metric-icon"><Store size={19} /></span>
          <div><small>{t("marketplace:storeStatus")}</small><strong>{active ? t("shopify:connectedTestStore") : t("shopify:notConnected")}</strong></div>
        </article>
        <article className="seller-metric-card">
          <span className="seller-metric-icon"><ClipboardList size={19} /></span>
          <div><small>{t("marketplace:ordersMetric")}</small><strong data-testid="seller-orders-count">{unavailableMetric}</strong></div>
        </article>
        <article className="seller-metric-card">
          <span className="seller-metric-icon"><img src={dollarSignIcon} alt="" /></span>
          <div><small>{t("marketplace:salesMetric")}</small><strong data-testid="seller-sales-total">{unavailableMetric}</strong></div>
        </article>
        <article className="seller-metric-card">
          <span className="seller-metric-icon"><Boxes size={19} /></span>
          <div><small>{t("marketplace:productsMetric")}</small><strong data-testid="seller-products-count" dir={productCount == null ? undefined : "ltr"}>{productCount ?? unavailableMetric}</strong></div>
        </article>
        <article data-testid="seller-verification-status" className="seller-metric-card verification-card">
          <span className="seller-metric-icon"><BadgeCheck size={19} /></span>
          <div><small>{t("marketplace:verificationStatus")}</small><strong>{selfAttested ? t("shopify:selfAttestedBadge") : needsHelp ? t("marketplace:officialDecisionPending") : t("shopify:sellingLocked")}</strong></div>
        </article>
      </div>
      {unanswered && (
        <CertificationGate
          locale={locale}
          state={state}
          busyAction={busyAction}
          onNeedHelp={onNeedHelp}
          onOpenAttestation={onOpenAttestation}
          onRetry={onRetry}
        />
      )}
      {needsHelp && (
        <section className="verification-cta-card">
          <div className="verification-cta-icon"><img src={vendorLicenseIcon} alt="" /></div>
          <div><h2>{t("marketplace:verificationTitle")}</h2><p>{t("marketplace:dashboardPreparationNote")}</p></div>
          <button data-testid="continue-verification" type="button" onClick={onContinueVerification}>
            {t("marketplace:continueVerification")} <ArrowRight className="marketplace-directional" size={17} />
          </button>
        </section>
      )}
      {selfAttested && (
        <section className="verification-cta-card shopify-next-card">
          <div className="verification-cta-icon"><Store size={24} /></div>
          <div><h2>{active ? t("shopify:connectedTestStore") : t("shopify:setupTitle")}</h2><p>{t("shopify:shopifyRequirement")}</p></div>
          <button data-testid="continue-shopify-setup" type="button" onClick={onOpenStore}>
            {t("shopify:onlineStore")} <ArrowRight className="marketplace-directional" size={17} />
          </button>
        </section>
      )}
      <p className="dashboard-no-activity"><Construction size={15} /> {t("marketplace:noActivityNote")}</p>
    </div>
  );
}

function SellerOrders({ locale }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  return (
    <div data-testid="seller-orders" className="marketplace-workspace-view">
      <div className="workspace-title-row"><div><span className="marketplace-eyebrow">{t("marketplace:sellerWorkspace")}</span><h1>{t("marketplace:sellerOrdersTitle")}</h1></div></div>
      <EmptyState
        testId="seller-orders-empty"
        image={checkNoticeIcon}
        eyebrow={t("marketplace:intentionallyEmpty")}
        title={t("marketplace:sellerOrdersEmpty")}
        secondary={t("marketplace:sellerOrdersSecondary")}
      />
    </div>
  );
}

function SellerVerification({ locale, onLocaleChange, verificationProps, onOpenAttestation }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace", "shopify"]);
  return (
    <div data-testid="seller-get-verified" className="marketplace-workspace-view seller-verification-view">
      <div className="workspace-title-row verification-title-row">
        <div><span className="marketplace-eyebrow">{t("marketplace:sellerWorkspace")}</span><h1>{t("marketplace:verificationTitle")}</h1><p>{t("marketplace:verificationIntro")}</p></div>
      </div>
      <div className="official-authority-banner"><ShieldCheck size={20} /><div><strong>{t("marketplace:officialAuthority")}</strong><span>{t("marketplace:noOfficialVerification")}</span></div></div>
      <div className="embedded-verification-frame">
        <SidewalkApp embedded initialLocale={locale} onLocaleChange={onLocaleChange} {...verificationProps} />
      </div>
      <section className="certification-completion-card">
        <ShieldCheck size={23} />
        <div><strong>{t("shopify:certifiedNow")}</strong><p>{t("shopify:certifiedNowIntro")}</p></div>
        <button data-testid="certification-complete-button" type="button" className="shopify-primary" onClick={onOpenAttestation}>
          {t("shopify:certifiedNow")}
        </button>
      </section>
    </div>
  );
}

function WorkspaceNav({ locale, role, workspace, onNavigate, sellingAccess }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace", "shopify"]);
  const buyerItems = [
    { id: "explore", testId: "nav-explore", label: t("marketplace:explore"), icon: Compass },
    { id: "street-rules", testId: "nav-street-rules", label: t("marketplace:rulesNav"), icon: MapPinned },
    { id: "orders", testId: "nav-orders", label: t("marketplace:orders"), icon: ClipboardList },
    { id: "account", testId: "nav-account", label: t("marketplace:account"), icon: UserRound },
  ];
  const possibleVendorItems = [
    { id: "dashboard", testId: "nav-dashboard", label: t("marketplace:sellerDashboard"), icon: LayoutDashboard },
    { id: "online-store", testId: "nav-online-store", label: t("shopify:onlineStore"), icon: Store },
    { id: "street-rules", testId: "nav-street-rules", label: t("marketplace:rulesNav"), icon: MapPinned },
    { id: "orders", testId: "nav-orders", label: t("marketplace:orders"), icon: ClipboardList },
    { id: "get-verified", testId: "nav-get-verified", label: t("marketplace:getVerified"), icon: BadgeCheck },
    { id: "account", testId: "nav-account", label: t("marketplace:account"), icon: UserRound },
  ];
  const allowedVendorWorkspaces = vendorWorkspacesFor(sellingAccess);
  const vendorItems = possibleVendorItems.filter((item) => allowedVendorWorkspaces.includes(item.id));
  const items = role === "buyer" ? buyerItems : vendorItems;
  return (
    <nav
      data-testid={role === "buyer" ? "buyer-navigation" : "vendor-navigation"}
      className={"marketplace-nav " + role}
      aria-label={t("marketplace:mainNavigation")}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const selected = workspace === item.id;
        return (
          <button
            data-testid={item.testId}
            key={item.id}
            type="button"
            aria-current={selected ? "page" : undefined}
            className={selected ? "active" : ""}
            onClick={() => onNavigate(item.id)}
          >
            <Icon size={19} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function WorkspaceContent({ locale, role, workspace, onNavigate, onLogout, onLocaleChange, verificationProps, demoSessionId, poc, onOpenAttestation, commerce }) {
  if (workspace === "street-rules") {
    return (
      <StreetRulesWorkspace
        locale={locale}
        role={role}
        onNavigate={onNavigate}
        orders={commerce.orders}
        onAddOrder={commerce.addOrder}
        focusVendorId={commerce.focusVendorId}
        onFocusConsumed={commerce.consumeFocus}
      />
    );
  }
  if (role === "buyer") {
    if (workspace === "orders") return <BuyerOrders locale={locale} orders={commerce.orders} />;
    if (workspace === "account") return <AccountView locale={locale} role={role} onLogout={onLogout} />;
    if (workspace === "store") {
      return <BuyerStorefront locale={locale} state={poc.state} poc={poc} onBack={() => onNavigate("explore")} />;
    }
    return (
      <BuyerExplore
        locale={locale}
        storefront={poc.state.storefront}
        onOpenStore={() => onNavigate("store")}
        onViewSample={async () => {
          await poc.loadStorefront({ sample: true });
          onNavigate("store");
        }}
        onOpenVendor={commerce.openVendor}
      />
    );
  }
  if (workspace === "orders") return <SellerOrders locale={locale} />;
  if (workspace === "online-store") return <VendorOnlineStore locale={locale} demoSessionId={demoSessionId} poc={poc} />;
  if (workspace === "get-verified") {
    return <SellerVerification locale={locale} onLocaleChange={onLocaleChange} verificationProps={verificationProps} onOpenAttestation={onOpenAttestation} />;
  }
  if (workspace === "account") return <AccountView locale={locale} role={role} onLogout={onLogout} sellingAccess={poc.state} />;
  return (
    <SellerDashboard
      locale={locale}
      state={poc.state}
      busyAction={poc.busyAction}
      onNeedHelp={async () => {
        const result = await poc.chooseNeedsHelp();
        if (result.ok) onNavigate("get-verified");
      }}
      onOpenAttestation={onOpenAttestation}
      onContinueVerification={() => onNavigate("get-verified")}
      onOpenStore={() => onNavigate("online-store")}
      onRetry={poc.loadSellingAccess}
    />
  );
}

function MarketplaceShell({ locale, role, workspace, onNavigate, onLogout, onLocaleChange, verificationProps, demoSessionId, poc, onOpenAttestation, commerce }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  const roleLabel = role === "buyer" ? t("marketplace:buyerWorkspace") : t("marketplace:sellerWorkspace");
  return (
    <div
      data-testid="marketplace-shell"
      data-role={role}
      data-workspace={workspace}
      className={"marketplace-shell role-" + role}
      lang={locale}
      dir={localeDirection(locale)}
    >
      <PrototypeDisclosure locale={locale} />
      <header data-testid="marketplace-header" className="marketplace-header">
        <Brand />
        <div className="marketplace-header-role"><span className={"role-chip " + role}>{roleLabel}</span></div>
        <div className="marketplace-header-actions">
          <LanguageSelect locale={locale} onChange={onLocaleChange} />
          <button data-testid="account-menu-button" className="marketplace-account-menu" type="button" onClick={() => onNavigate("account")}>
            <CircleUserRound size={20} /> <span>{t("marketplace:accountMenu")}</span>
          </button>
        </div>
      </header>
      <div className="marketplace-shell-layout">
        <WorkspaceNav locale={locale} role={role} workspace={workspace} onNavigate={onNavigate} sellingAccess={poc.state} />
        <main className="marketplace-main">
          <WorkspaceContent
            locale={locale}
            role={role}
            workspace={workspace}
            onNavigate={onNavigate}
            onLogout={onLogout}
            onLocaleChange={onLocaleChange}
            verificationProps={verificationProps}
            demoSessionId={demoSessionId}
            poc={poc}
            onOpenAttestation={onOpenAttestation}
            commerce={commerce}
          />
          {!['get-verified', 'online-store', 'store'].includes(workspace) && (
            <footer className="marketplace-scope-note">
              <Construction size={16} />
              <span><strong>{t("marketplace:marketplaceNotLive")}</strong> · {t("marketplace:noActivityNote")}</span>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}

export default function Marketplace({
  account = null,
  selectedRole = null,
  requestedWorkspace = null,
  locale = DEFAULT_CONSOLE_LOCALE,
  demoSessionId = null,
  onRoleSelect = null,
  onCreateAccount = null,
  onWorkspaceChange = null,
  onLogout = null,
  onLocaleChange = null,
  verificationProps = {},
}) {
  const propLocale = normalizeLocale(locale) || DEFAULT_CONSOLE_LOCALE;
  const [surfaceLocale, setSurfaceLocale] = useState(propLocale);
  const [chosenRole, setChosenRole] = useState(normalizeRole(selectedRole));
  const [localAccount, setLocalAccount] = useState(null);
  const [internalWorkspace, setInternalWorkspace] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [attestationOpen, setAttestationOpen] = useState(false);
  const [attestationLaunching, setAttestationLaunching] = useState(false);
  const attestationLaunchRef = useRef(false);
  const guardedRouteRef = useRef(null);
  const buyerStoreLoadRef = useRef(null);
  // Session-only demo commerce state shared by Explore, Street rules, and
  // Orders. Never persisted or transmitted; checkout hands off to an
  // external page. Seeded with one order so the history reads lived-in.
  const [demoOrders, setDemoOrders] = useState(/** @type {any[]} */ ([
    {
      id: "do-seed-1",
      vendorName: "Ming's Chinese Skewers",
      itemName: "Lamb skewers (2)",
      priceLabel: "$5",
    },
  ]));
  const [focusVendorId, setFocusVendorId] = useState(/** @type {string | null} */ (null));

  const authoritativeRole = roleFromAccount(account);
  const fallbackRole = roleFromAccount(localAccount);
  const activeRole = authoritativeRole || fallbackRole;
  const activeAccount = authoritativeRole ? account : fallbackRole ? localAccount : null;
  const requestedKey = requestedWorkspace == null ? "" : String(requestedWorkspace);
  const poc = useShopifyPoc({
    account: activeAccount,
    demoSessionId,
    locale: surfaceLocale,
    role: activeRole,
  });

  useEffect(() => {
    setSurfaceLocale(propLocale);
  }, [propLocale]);

  useEffect(() => {
    document.documentElement.lang = surfaceLocale;
    document.documentElement.dir = localeDirection(surfaceLocale);
  }, [surfaceLocale]);

  useEffect(() => {
    const next = normalizeRole(selectedRole);
    if (next) setChosenRole(next);
  }, [selectedRole]);

  useEffect(() => {
    if (authoritativeRole) setChosenRole(authoritativeRole);
  }, [authoritativeRole]);

  useEffect(() => {
    setInternalWorkspace(null);
  }, [requestedKey, activeRole]);

  const workspace = useMemo(
    () => sanitizeWorkspaceForAccess(activeRole, internalWorkspace || requestedWorkspace, poc.state),
    [activeRole, internalWorkspace, poc.state.certification_status, poc.state.selling_access_state, requestedWorkspace],
  );

  useEffect(() => {
    if (!activeAccount || !requestedWorkspace || !onWorkspaceChange) return;
    if (activeRole === "vendor" && poc.state.status === "loading") return;
    const canonical = canonicalWorkspace(requestedWorkspace);
    if (canonical === workspace) return;
    const guardKey = activeRole + ":" + requestedKey + ":" + workspace;
    if (guardedRouteRef.current === guardKey) return;
    guardedRouteRef.current = guardKey;
    onWorkspaceChange(workspace);
  }, [activeAccount, activeRole, onWorkspaceChange, poc.state.status, requestedKey, requestedWorkspace, workspace]);

  useEffect(() => {
    if (activeRole !== "buyer" || !demoSessionId || poc.state.storefront) return;
    const key = `${demoSessionId}:${surfaceLocale}`;
    if (buyerStoreLoadRef.current === key) return;
    buyerStoreLoadRef.current = key;
    poc.loadStorefront({ sample: false });
  }, [activeRole, demoSessionId, poc.loadStorefront, poc.state.storefront, surfaceLocale]);

  function changeLocale(value) {
    const next = normalizeLocale(value);
    if (!next) return;
    setSurfaceLocale(next);
    if (onLocaleChange) onLocaleChange(next);
  }

  function selectRole(role) {
    const next = normalizeRole(role);
    if (!next) return;
    setChosenRole(next);
    setCreateError(false);
    if (onRoleSelect) onRoleSelect(next);
  }

  function returnToRoles() {
    setChosenRole(null);
    setCreateError(false);
    if (onRoleSelect) onRoleSelect(null);
  }

  async function createPrototypeAccount() {
    if (!chosenRole || creating) return;
    setCreating(true);
    setCreateError(false);
    const payload = { role: chosenRole, locale: surfaceLocale, is_prototype: true };
    try {
      const result = onCreateAccount ? await onCreateAccount(payload) : null;
      const createdAccount = result && result.account ? result.account : result;
      const resultRole = roleFromAccount(createdAccount) || chosenRole;
      setLocalAccount({
        id: createdAccount && createdAccount.id ? createdAccount.id : "local-prototype-account",
        account_role: resultRole,
        role: resultRole,
        is_prototype: true,
        is_fictional: true,
      });
      const landing = sanitizeWorkspace(resultRole, null);
      setInternalWorkspace(landing);
      if (onWorkspaceChange) onWorkspaceChange(landing);
    } catch {
      setCreateError(true);
    } finally {
      setCreating(false);
    }
  }

  function navigate(workspaceName) {
    const next = sanitizeWorkspace(activeRole, workspaceName);
    setInternalWorkspace(next);
    if (onWorkspaceChange) onWorkspaceChange(next);
  }

  async function logout() {
    if (onLogout) await onLogout();
    setLocalAccount(null);
    setChosenRole(null);
    setInternalWorkspace(null);
    setCreateError(false);
    setAttestationOpen(false);
    if (onRoleSelect) onRoleSelect(null);
  }

  async function confirmAttestationAndOpenShopify() {
    if (attestationLaunchRef.current) return;
    attestationLaunchRef.current = true;
    // Create the tab in the submit gesture so browsers do not treat the
    // eventual Shopify navigation as an asynchronous popup.
    const loginWindow = window.open("about:blank", "_blank");
    if (loginWindow) loginWindow.opener = null;
    let completed = false;
    setAttestationLaunching(true);
    try {
      const attestation = await poc.confirmAttestation();
      if (!attestation.ok) return;
      // Persist the merchant-action-required state before leaving SIDEWALK.
      const signup = await poc.beginSignup();
      if (!signup.ok) return;
      setAttestationOpen(false);
      navigate("online-store");
      if (loginWindow) loginWindow.location.replace(SHOPIFY_LOGIN_URL);
      completed = true;
    } finally {
      if (!completed) loginWindow?.close();
      attestationLaunchRef.current = false;
      setAttestationLaunching(false);
    }
  }

  const commerce = {
    orders: demoOrders,
    addOrder: (entry) =>
      setDemoOrders((previous) =>
        [{ id: `do-${Date.now()}-${previous.length}`, ...entry }, ...previous].slice(0, 12)
      ),
    focusVendorId,
    consumeFocus: () => setFocusVendorId(null),
    openVendor: (vendor) => {
      setFocusVendorId(vendor.id);
      navigate("street-rules");
    },
  };

  let content;
  if (activeAccount && activeRole) {
    content = (
      <MarketplaceShell
        locale={surfaceLocale}
        role={activeRole}
        workspace={workspace}
        onNavigate={navigate}
        onLogout={logout}
        onLocaleChange={changeLocale}
        verificationProps={verificationProps}
        demoSessionId={demoSessionId}
        poc={poc}
        onOpenAttestation={() => setAttestationOpen(true)}
        commerce={commerce}
      />
    );
  } else if (chosenRole) {
    content = (
      <PrototypeAccountSetup
        locale={surfaceLocale}
        role={chosenRole}
        onLocaleChange={changeLocale}
        onBack={returnToRoles}
        onCreate={createPrototypeAccount}
        busy={creating}
        error={createError}
      />
    );
  } else {
    content = <RoleSelection locale={surfaceLocale} onLocaleChange={changeLocale} onSelect={selectRole} />;
  }

  return (
    <div data-testid="marketplace-root" className="marketplace-root">
      {content}
      <CertificationDialog
        locale={surfaceLocale}
        open={attestationOpen}
        busy={attestationLaunching || poc.busyAction === "certification-submit"}
        onCancel={() => setAttestationOpen(false)}
        onConfirm={confirmAttestationAndOpenShopify}
      />
    </div>
  );
}
