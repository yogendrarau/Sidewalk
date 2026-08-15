import React, { useEffect, useMemo, useState } from "react";
import Marketplace, { sanitizeWorkspace } from "@/pages/Marketplace";
import { localeDirection, normalizeLocale } from "@/i18n";
import {
  clearPendingMarketplaceRole,
  hydrateMarketplaceAccount,
  loadMarketplaceAccount,
  logoutMarketplaceAccount,
  readPendingMarketplaceRole,
  saveMarketplaceAccountRole,
  savePendingMarketplaceRole,
  updateMarketplaceAccountLocale,
} from "@/lib/marketplaceAccount";
import {
  clearShopifyDemoContext,
  ensureShopifyDemoContext,
  isDemoSessionId,
  readShopifyDemoContext,
} from "@/lib/shopifyPoc";

const MARKETPLACE_LOCALE_STORAGE_KEY = "sidewalk-marketplace-locale-v1";

function readStoredLocale() {
  try {
    return normalizeLocale(window.localStorage.getItem(MARKETPLACE_LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function readRoute() {
  const params = new URLSearchParams(window.location.search);
  return {
    workspace: params.get("workspace"),
    locale: normalizeLocale(params.get("lang")),
    demoSessionId: isDemoSessionId(params.get("demo_session_id"))
      ? params.get("demo_session_id")
      : null,
  };
}

function marketplaceUrl(workspace, locale, demoSessionId) {
  const next = new URL(window.location.href);
  next.searchParams.delete("view");
  next.searchParams.delete("ui_lang");
  if (workspace) next.searchParams.set("workspace", workspace);
  else next.searchParams.delete("workspace");
  if (locale) next.searchParams.set("lang", locale);
  else next.searchParams.delete("lang");
  if (demoSessionId) next.searchParams.set("demo_session_id", demoSessionId);
  else next.searchParams.delete("demo_session_id");
  return next;
}

export default function App() {
  const initialRoute = useMemo(readRoute, []);
  const initialAccount = useMemo(() => loadMarketplaceAccount(), []);
  const initialShopifyContext = useMemo(() => readShopifyDemoContext(), []);
  const [account, setAccount] = useState(initialAccount);
  const [selectedRole, setSelectedRole] = useState(() => readPendingMarketplaceRole());
  const [requestedWorkspace, setRequestedWorkspace] = useState(initialRoute.workspace);
  const [demoSessionId, setDemoSessionId] = useState(
    initialRoute.demoSessionId
      || (initialShopifyContext && initialAccount
        && initialShopifyContext.prototype_account_id === initialAccount.prototype_account_id
        ? initialShopifyContext.demo_session_id
        : null),
  );
  const [locale, setLocale] = useState(
    initialRoute.locale || normalizeLocale(initialAccount?.locale) || readStoredLocale() || "en",
  );

  function commitRoute(workspace, nextLocale, { replace = false, sessionId = demoSessionId } = {}) {
    const next = marketplaceUrl(workspace, nextLocale, sessionId);
    const current = window.location.pathname + window.location.search + window.location.hash;
    const destination = next.pathname + next.search + next.hash;
    if (current !== destination) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", next);
    }
    setRequestedWorkspace(workspace || null);
  }

  useEffect(() => {
    let active = true;
    hydrateMarketplaceAccount().then((hydrated) => {
      if (!active || !hydrated) return;
      setAccount(hydrated);
      if (!initialRoute.locale && !readStoredLocale() && normalizeLocale(hydrated.locale)) {
        setLocale(normalizeLocale(hydrated.locale));
      }
      const role = hydrated.account_role || hydrated.role;
      if (role === "vendor") {
        ensureShopifyDemoContext({ account: hydrated, locale: normalizeLocale(hydrated.locale) || locale })
          .then((context) => {
            if (!active || !context) return;
            setDemoSessionId(context.demo_session_id);
          })
          .catch(() => undefined);
      }
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      const route = readRoute();
      setRequestedWorkspace(route.workspace);
      if (route.locale) setLocale(route.locale);
      setDemoSessionId(route.demoSessionId);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  useEffect(() => {
    const role = account?.account_role || account?.role;
    if (!role) {
      if (requestedWorkspace || new URLSearchParams(window.location.search).has("view")) {
        commitRoute(null, locale, { replace: true });
      }
      return;
    }
    const safeWorkspace = sanitizeWorkspace(role, requestedWorkspace);
    if (safeWorkspace !== requestedWorkspace || new URLSearchParams(window.location.search).has("view")) {
      commitRoute(safeWorkspace, locale, { replace: true });
    }
  }, [account, requestedWorkspace, locale]);

  function chooseRole(role) {
    if (!role) {
      clearPendingMarketplaceRole();
      setSelectedRole(null);
      return;
    }
    savePendingMarketplaceRole(role);
    setSelectedRole(role);
  }

  async function createPrototypeAccount({ role }) {
    const saved = saveMarketplaceAccountRole(role, { locale });
    setAccount(saved.account);
    setSelectedRole(null);
    let authoritativeAccount = saved.account;
    try {
      const synced = await saved.sync;
      if (synced?.account_role === role) {
        authoritativeAccount = synced;
        setAccount(synced);
      }
    } catch {
      // The unavailable backend state remains explicit in the Shopify setup flow.
    }
    let nextSessionId = demoSessionId;
    if (role === "vendor") {
      const context = await ensureShopifyDemoContext({ account: authoritativeAccount, locale });
      if (context) {
        nextSessionId = context.demo_session_id;
        setDemoSessionId(context.demo_session_id);
      }
    }
    const landing = sanitizeWorkspace(role, null);
    commitRoute(landing, locale, { replace: true, sessionId: nextSessionId });
    return authoritativeAccount;
  }

  function changeWorkspace(workspace) {
    const role = account?.account_role || account?.role;
    const safeWorkspace = sanitizeWorkspace(role, workspace);
    commitRoute(safeWorkspace, locale);
  }

  function changeLocale(value) {
    const nextLocale = normalizeLocale(value);
    if (!nextLocale) return;
    setLocale(nextLocale);
    try {
      window.localStorage.setItem(MARKETPLACE_LOCALE_STORAGE_KEY, nextLocale);
    } catch {
      // The selected language remains active for this tab.
    }
    commitRoute(requestedWorkspace, nextLocale, { replace: true });
    if (account) {
      const updated = updateMarketplaceAccountLocale(nextLocale);
      if (updated.account) setAccount(updated.account);
      updated.sync.then((synced) => {
        if (synced) setAccount(synced);
      }).catch(() => undefined);
    }
  }

  async function logout() {
    const result = logoutMarketplaceAccount({
      account,
      logoutBase44: account?.persistence === "base44_user",
      redirectUrl: window.location.origin + window.location.pathname,
    });
    setAccount(null);
    setSelectedRole(null);
    clearShopifyDemoContext();
    setDemoSessionId(null);
    commitRoute(null, locale, { replace: true, sessionId: null });
    result.sync.catch(() => undefined);
  }

  return (
    <Marketplace
      account={account}
      selectedRole={selectedRole}
      requestedWorkspace={requestedWorkspace}
      locale={locale}
      demoSessionId={demoSessionId}
      onRoleSelect={chooseRole}
      onCreateAccount={createPrototypeAccount}
      onWorkspaceChange={changeWorkspace}
      onLogout={logout}
      onLocaleChange={changeLocale}
    />
  );
}
