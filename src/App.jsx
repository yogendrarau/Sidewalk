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
  };
}

function marketplaceUrl(workspace, locale) {
  const next = new URL(window.location.href);
  next.searchParams.delete("view");
  next.searchParams.delete("ui_lang");
  if (workspace) next.searchParams.set("workspace", workspace);
  else next.searchParams.delete("workspace");
  if (locale) next.searchParams.set("lang", locale);
  else next.searchParams.delete("lang");
  return next;
}

export default function App() {
  const initialRoute = useMemo(readRoute, []);
  const initialAccount = useMemo(() => loadMarketplaceAccount(), []);
  const [account, setAccount] = useState(initialAccount);
  const [selectedRole, setSelectedRole] = useState(() => readPendingMarketplaceRole());
  const [requestedWorkspace, setRequestedWorkspace] = useState(initialRoute.workspace);
  const [locale, setLocale] = useState(
    initialRoute.locale || normalizeLocale(initialAccount?.locale) || readStoredLocale() || "en",
  );

  function commitRoute(workspace, nextLocale, { replace = false } = {}) {
    const next = marketplaceUrl(workspace, nextLocale);
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
    const landing = sanitizeWorkspace(role, null);
    commitRoute(landing, locale, { replace: true });
    saved.sync.then((synced) => {
      if (synced?.account_role === role) setAccount(synced);
    }).catch(() => undefined);
    return saved.account;
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
    commitRoute(null, locale, { replace: true });
    result.sync.catch(() => undefined);
  }

  return (
    <Marketplace
      account={account}
      selectedRole={selectedRole}
      requestedWorkspace={requestedWorkspace}
      locale={locale}
      onRoleSelect={chooseRole}
      onCreateAccount={createPrototypeAccount}
      onWorkspaceChange={changeWorkspace}
      onLogout={logout}
      onLocaleChange={changeLocale}
    />
  );
}
