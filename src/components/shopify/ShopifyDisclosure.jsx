import React from "react";
import { CircleAlert, FlaskConical, Store } from "lucide-react";
import { localeDirection, useSurfaceTranslation } from "@/i18n";

export function ShopifyModeBadge({ locale, provenance, testId = "shopify-provenance-badge", scope = "store" }) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  const mode = provenance?.mode || "unavailable";
  const label = mode === "shopify_test_store"
    ? t("shopify:liveBadge")
    : mode === "live_ai"
      ? t("shopify:aiBadge")
      : mode === "simulated"
        ? t("shopify:simulatedBadge")
    : mode === "fixture"
      ? scope === "state" ? t("shopify:demoStateBadge") : t("shopify:sampleBadge")
      : t("shopify:unavailableBadge");
  const Icon = mode === "shopify_test_store" ? Store : mode === "fixture" ? FlaskConical : CircleAlert;
  return (
    <span data-testid={testId} data-provenance-mode={mode} className={`shopify-mode-badge ${mode}`}>
      <Icon size={13} /> {label}
    </span>
  );
}

export default function ShopifyDisclosure({ locale, provenance = null, compact = false }) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  return (
    <aside
      data-testid="shopify-prototype-disclosure"
      className={`shopify-poc-disclosure${compact ? " compact" : ""}`}
      lang={locale}
      dir={localeDirection(locale)}
    >
      <CircleAlert size={16} />
      <span>{t("shopify:persistentDisclosure")}</span>
      {provenance && <ShopifyModeBadge locale={locale} provenance={provenance} />}
    </aside>
  );
}
