import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  CircleDollarSign,
  CircleUserRound,
  ClipboardList,
  Compass,
  Construction,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  PackageOpen,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import SidewalkApp from "./Sidewalk";
import {
  DEFAULT_CONSOLE_LOCALE,
  LOCALE_REGISTRY,
  SUPPORTED_LOCALES,
  localeDirection,
  normalizeLocale,
  useSurfaceTranslation,
} from "@/i18n";
import "../marketplace.css";

export const ROLE_WORKSPACES = Object.freeze({
  buyer: ["explore", "orders", "account"],
  vendor: ["dashboard", "orders", "get-verified", "account"],
});

const WORKSPACE_ALIASES = Object.freeze({
  buyer: "explore",
  marketplace: "explore",
  seller: "dashboard",
  vendor: "dashboard",
  verification: "get-verified",
  verified: "get-verified",
  "get_verified": "get-verified",
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

function Brand({ compact = false }) {
  return (
    <div className={"marketplace-brand" + (compact ? " compact" : "")} aria-label="SIDEWALK">
      <span className="marketplace-brand-mark" aria-hidden="true">S</span>
      <span>SIDEWALK</span>
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

function OnboardingFrame({ locale, onLocaleChange, children }) {
  return (
    <div className="marketplace-onboarding" lang={locale} dir={localeDirection(locale)}>
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
    <OnboardingFrame locale={locale} onLocaleChange={onLocaleChange}>
      <main data-testid="role-selection" className="role-selection-shell">
        <div className="role-selection-copy">
          <span className="marketplace-eyebrow"><Sparkles size={15} /> SIDEWALK MARKETPLACE</span>
          <h1>{t("marketplace:roleHeading")}</h1>
          <p>{t("marketplace:roleIntro")}</p>
        </div>
        <div className="role-option-grid">
          <button
            data-testid="role-option-buyer"
            className="role-option-card buyer"
            type="button"
            onClick={() => onSelect("buyer")}
          >
            <span className="role-option-icon"><ShoppingBag size={26} /></span>
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
            <span className="role-option-icon"><Store size={26} /></span>
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

function EmptyState({ testId, icon: Icon, eyebrow, title, body = null, secondary = null }) {
  return (
    <section data-testid={testId} className="marketplace-empty-card">
      <div className="marketplace-empty-icon"><Icon size={30} /></div>
      <span className="marketplace-empty-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {secondary && <small>{secondary}</small>}
    </section>
  );
}

function BuyerExplore({ locale }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  return (
    <div data-testid="buyer-explore" className="marketplace-workspace-view">
      <div className="workspace-title-row">
        <div>
          <span className="marketplace-eyebrow">{t("marketplace:buyerWorkspace")}</span>
          <h1>{t("marketplace:buyerExploreTitle")}</h1>
        </div>
        <span className="not-live-badge"><Construction size={14} /> {t("marketplace:marketplaceNotLive")}</span>
      </div>
      <div className="coming-soon-search" aria-disabled="true">
        <Search size={18} />
        <span>{t("marketplace:searchLabel")}</span>
        <strong>{t("marketplace:comingSoon")}</strong>
      </div>
      <EmptyState
        testId="marketplace-empty-state"
        icon={Store}
        eyebrow={t("marketplace:intentionallyEmpty")}
        title={t("marketplace:buyerEmpty")}
        secondary={t("marketplace:buyerEmptySecondary")}
      />
    </div>
  );
}

function BuyerOrders({ locale }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  return (
    <div data-testid="buyer-orders" className="marketplace-workspace-view">
      <div className="workspace-title-row"><div><span className="marketplace-eyebrow">{t("marketplace:buyerWorkspace")}</span><h1>{t("marketplace:buyerOrdersTitle")}</h1></div></div>
      <EmptyState
        testId="buyer-orders-empty"
        icon={PackageOpen}
        eyebrow={t("marketplace:intentionallyEmpty")}
        title={t("marketplace:buyerOrdersEmpty")}
        secondary={t("marketplace:buyerOrdersSecondary")}
      />
    </div>
  );
}

function AccountView({ locale, role, onLogout }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  const isBuyer = role === "buyer";
  return (
    <div data-testid={isBuyer ? "buyer-account" : "seller-account"} className="marketplace-workspace-view account-workspace">
      <div className="workspace-title-row"><div><span className="marketplace-eyebrow">{t("marketplace:prototypeProfile")}</span><h1>{t("marketplace:accountTitle")}</h1></div></div>
      <section className="account-profile-card">
        <div className="account-avatar"><CircleUserRound size={34} /></div>
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
        <p className="account-no-switch">{t("marketplace:noRoleSwitch")}</p>
        <button data-testid="logout" className="marketplace-logout" type="button" onClick={onLogout}>
          <LogOut size={17} /> {t("marketplace:logout")}
        </button>
      </section>
    </div>
  );
}

function SellerDashboard({ locale, onContinueVerification }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  return (
    <div data-testid="seller-dashboard" className="marketplace-workspace-view seller-dashboard-view">
      <div className="workspace-title-row">
        <div><span className="marketplace-eyebrow">{t("marketplace:sellerWorkspace")}</span><h1>{t("marketplace:sellerDashboardTitle")}</h1><p>{t("marketplace:sellerDashboardIntro")}</p></div>
        <span className="not-live-badge"><Construction size={14} /> {t("marketplace:zeroState")}</span>
      </div>
      <div className="seller-metric-grid">
        <article data-testid="seller-store-status" className="seller-metric-card store-card">
          <span className="seller-metric-icon"><Store size={19} /></span>
          <div><small>{t("marketplace:storeStatus")}</small><strong>{t("marketplace:storeComingSoon")}</strong></div>
        </article>
        <article className="seller-metric-card">
          <span className="seller-metric-icon"><ClipboardList size={19} /></span>
          <div><small>{t("marketplace:ordersMetric")}</small><strong data-testid="seller-orders-count" dir="ltr">0</strong></div>
        </article>
        <article className="seller-metric-card">
          <span className="seller-metric-icon"><CircleDollarSign size={19} /></span>
          <div><small>{t("marketplace:salesMetric")}</small><strong data-testid="seller-sales-total" dir="ltr">$0.00</strong></div>
        </article>
        <article className="seller-metric-card">
          <span className="seller-metric-icon"><Boxes size={19} /></span>
          <div><small>{t("marketplace:productsMetric")}</small><strong data-testid="seller-products-count" dir="ltr">0</strong></div>
        </article>
        <article data-testid="seller-verification-status" className="seller-metric-card verification-card">
          <span className="seller-metric-icon"><BadgeCheck size={19} /></span>
          <div><small>{t("marketplace:verificationStatus")}</small><strong>{t("marketplace:officialDecisionPending")}</strong></div>
        </article>
      </div>
      <section className="verification-cta-card">
        <div className="verification-cta-icon"><ShieldCheck size={24} /></div>
        <div><h2>{t("marketplace:verificationTitle")}</h2><p>{t("marketplace:dashboardPreparationNote")}</p></div>
        <button data-testid="continue-verification" type="button" onClick={onContinueVerification}>
          {t("marketplace:continueVerification")} <ArrowRight className="marketplace-directional" size={17} />
        </button>
      </section>
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
        icon={ClipboardList}
        eyebrow={t("marketplace:intentionallyEmpty")}
        title={t("marketplace:sellerOrdersEmpty")}
        secondary={t("marketplace:sellerOrdersSecondary")}
      />
    </div>
  );
}

function SellerVerification({ locale, onLocaleChange, verificationProps }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  return (
    <div data-testid="seller-get-verified" className="marketplace-workspace-view seller-verification-view">
      <div className="workspace-title-row verification-title-row">
        <div><span className="marketplace-eyebrow">{t("marketplace:sellerWorkspace")}</span><h1>{t("marketplace:verificationTitle")}</h1><p>{t("marketplace:verificationIntro")}</p></div>
      </div>
      <div className="official-authority-banner"><ShieldCheck size={20} /><div><strong>{t("marketplace:officialAuthority")}</strong><span>{t("marketplace:noOfficialVerification")}</span></div></div>
      <div className="embedded-verification-frame">
        <SidewalkApp embedded initialLocale={locale} onLocaleChange={onLocaleChange} {...verificationProps} />
      </div>
    </div>
  );
}

function WorkspaceNav({ locale, role, workspace, onNavigate }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);
  const buyerItems = [
    { id: "explore", testId: "nav-explore", label: t("marketplace:explore"), icon: Compass },
    { id: "orders", testId: "nav-orders", label: t("marketplace:orders"), icon: ClipboardList },
    { id: "account", testId: "nav-account", label: t("marketplace:account"), icon: UserRound },
  ];
  const vendorItems = [
    { id: "dashboard", testId: "nav-dashboard", label: t("marketplace:sellerDashboard"), icon: LayoutDashboard },
    { id: "orders", testId: "nav-orders", label: t("marketplace:orders"), icon: ClipboardList },
    { id: "get-verified", testId: "nav-get-verified", label: t("marketplace:getVerified"), icon: BadgeCheck },
    { id: "account", testId: "nav-account", label: t("marketplace:account"), icon: UserRound },
  ];
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

function WorkspaceContent({ locale, role, workspace, onNavigate, onLogout, onLocaleChange, verificationProps }) {
  if (role === "buyer") {
    if (workspace === "orders") return <BuyerOrders locale={locale} />;
    if (workspace === "account") return <AccountView locale={locale} role={role} onLogout={onLogout} />;
    return <BuyerExplore locale={locale} />;
  }
  if (workspace === "orders") return <SellerOrders locale={locale} />;
  if (workspace === "get-verified") {
    return <SellerVerification locale={locale} onLocaleChange={onLocaleChange} verificationProps={verificationProps} />;
  }
  if (workspace === "account") return <AccountView locale={locale} role={role} onLogout={onLogout} />;
  return <SellerDashboard locale={locale} onContinueVerification={() => onNavigate("get-verified")} />;
}

function MarketplaceShell({ locale, role, workspace, onNavigate, onLogout, onLocaleChange, verificationProps }) {
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
        <Brand compact />
        <div className="marketplace-header-role"><span className={"role-chip " + role}>{roleLabel}</span></div>
        <div className="marketplace-header-actions">
          <LanguageSelect locale={locale} onChange={onLocaleChange} />
          <button data-testid="account-menu-button" className="marketplace-account-menu" type="button" onClick={() => onNavigate("account")}>
            <CircleUserRound size={20} /> <span>{t("marketplace:accountMenu")}</span>
          </button>
        </div>
      </header>
      <div className="marketplace-shell-layout">
        <WorkspaceNav locale={locale} role={role} workspace={workspace} onNavigate={onNavigate} />
        <main className="marketplace-main">
          <WorkspaceContent
            locale={locale}
            role={role}
            workspace={workspace}
            onNavigate={onNavigate}
            onLogout={onLogout}
            onLocaleChange={onLocaleChange}
            verificationProps={verificationProps}
          />
          {workspace !== "get-verified" && (
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
  const guardedRouteRef = useRef(null);

  const authoritativeRole = roleFromAccount(account);
  const fallbackRole = roleFromAccount(localAccount);
  const activeRole = authoritativeRole || fallbackRole;
  const activeAccount = authoritativeRole ? account : fallbackRole ? localAccount : null;
  const requestedKey = requestedWorkspace == null ? "" : String(requestedWorkspace);

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
    () => sanitizeWorkspace(activeRole, internalWorkspace || requestedWorkspace),
    [activeRole, internalWorkspace, requestedWorkspace],
  );

  useEffect(() => {
    if (!activeAccount || !requestedWorkspace || !onWorkspaceChange) return;
    const canonical = canonicalWorkspace(requestedWorkspace);
    if (canonical === workspace) return;
    const guardKey = activeRole + ":" + requestedKey + ":" + workspace;
    if (guardedRouteRef.current === guardKey) return;
    guardedRouteRef.current = guardKey;
    onWorkspaceChange(workspace);
  }, [activeAccount, activeRole, onWorkspaceChange, requestedKey, requestedWorkspace, workspace]);

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
    if (onRoleSelect) onRoleSelect(null);
  }

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
    </div>
  );
}
