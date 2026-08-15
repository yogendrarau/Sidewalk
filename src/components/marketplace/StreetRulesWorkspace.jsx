import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Construction, ListChecks, MapPinned } from "lucide-react";
import { useSurfaceTranslation, localeDirection } from "@/i18n";
import { loadLegalityData, rowSchedule, rowSeason } from "@/lib/legality/data.js";
import { nycWallClock } from "@/lib/legality/clock.js";
import { rowStatusAt } from "@/lib/legality/status.js";
import { queryPointReport } from "@/lib/legality/query.js";
import StreetRulesList from "./StreetRulesList";
import StreetRuleReport from "./StreetRuleReport";
import sampleVendorSeed from "@/data/sample-vendors.json";

// Lazy: Leaflet and its stylesheet ship in this chunk only.
const StreetRulesMap = React.lazy(() => import("./StreetRulesMap"));

/** Deterministic demo entry point: the list's first printed row. */
const SAMPLE_ROW_ID = "mfv-0001";

/** Sum "$N" price labels into a "$N" total. */
export function formatOrderTotal(orders) {
  const total = orders.reduce((sum, entry) => {
    const amount = Number(String(entry.priceLabel).replace(/[^0-9.]/g, ""));
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return `$${total}`;
}

/** External demo checkout destination (opens in a new tab, outside the app). */
export const SHOPIFY_CHECKOUT_URL =
  "https://mwc3qd-a1.myshopify.com/products/lamb-skewers-2?pr_prod_strat=collection_fallback&pr_rec_id=c14978d14&pr_rec_pid=8982176432306&pr_ref_pid=8982176465074&pr_seq=uniform";

/**
 * Shared street-rules workspace for the buyer and vendor surfaces. The data
 * is a bundled snapshot of the city's published restricted-streets list; this
 * surface reports what that list says and never adjudicates anything.
 *
 * @param {{locale: string, role: "buyer" | "vendor", onNavigate?: (workspace: string) => void, now?: Date | null, orders?: any[], onAddOrder?: ((order: any) => void) | null, focusVendorId?: string | null, onFocusConsumed?: (() => void) | null}} props
 */
export default function StreetRulesWorkspace({
  locale,
  role,
  onNavigate = null,
  now = null,
  orders = [],
  onAddOrder = null,
  focusVendorId = null,
  onFocusConsumed = null,
}) {
  const { t } = useSurfaceTranslation(locale, ["marketplace", "common"]);
  const [data, setData] = useState(/** @type {any} */ (null));
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState("map");
  const [showVendors, setShowVendors] = useState(true);
  const [selection, setSelection] = useState(
    /** @type {{kind: "row", rowId: string} | {kind: "point", report: any} | {kind: "vendor", vendor: any, report: any} | null} */ (null),
  );
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    let active = true;
    loadLegalityData().then(
      (loaded) => {
        if (active) setData(loaded);
      },
      () => {
        if (active) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [loadFailed]);

  // Status colors follow the NYC wall clock; refresh once a minute.
  useEffect(() => {
    const timer = setInterval(() => setClockTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const wall = useMemo(
    () => nycWallClock(now instanceof Date ? now : new Date()),
    [now, clockTick],
  );

  const statusOf = useMemo(() => {
    if (!data) return () => null;
    const cache = new Map();
    return (row) => {
      if (!cache.has(row.id)) {
        cache.set(row.id, rowStatusAt(rowSchedule(data, row), rowSeason(data, row), wall));
      }
      return cache.get(row.id);
    };
  }, [data, wall]);

  const selectedRow = selection?.kind === "row" && data
    ? data.rows.find((row) => row.id === selection.rowId) ?? null
    : null;

  function selectRow(rowId) {
    setSelection({ kind: "row", rowId });
  }

  function queryPoint(point) {
    if (!data) return;
    setSelection({ kind: "point", report: queryPointReport(point, data, wall) });
  }

  function selectVendor(vendor) {
    if (!data) return;
    setSelection({
      kind: "vendor",
      vendor,
      report: queryPointReport({ lat: vendor.lat, lng: vendor.lng }, data, wall),
    });
  }

  function addToOrder(vendor, item) {
    // Demo order flow: session-only state lifted to the marketplace shell so
    // the Orders workspace sees it too. Real checkout happens off-app.
    onAddOrder?.({ vendorName: vendor.name, itemName: item.name, priceLabel: item.price_label });
  }

  // Entering from an Explore vendor card: open that vendor's profile.
  useEffect(() => {
    if (!data || !focusVendorId) return;
    const vendor = sampleVendorSeed.vendors.find((entry) => entry.id === focusVendorId);
    if (vendor) selectVendor(vendor);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, focusVendorId]);

  const statusCounts = useMemo(() => {
    if (!data) return null;
    const counts = new Map();
    for (const row of data.rows) {
      const status = statusOf(row).status;
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [data, statusOf]);

  return (
    <div
      data-testid={role === "buyer" ? "buyer-street-rules" : "seller-street-rules"}
      className={"marketplace-workspace-view rules-workspace role-" + role}
    >
      <div className="workspace-title-row">
        <div>
          <span className="marketplace-eyebrow">{t("marketplace:rulesEyebrow")}</span>
          <h1>{role === "buyer" ? t("marketplace:buyerRulesTitle") : t("marketplace:vendorRulesTitle")}</h1>
          <p>{role === "buyer" ? t("marketplace:buyerRulesIntro") : t("marketplace:vendorRulesIntro")}</p>
        </div>
      </div>

      {loadFailed && (
        <div className="rules-load-state" role="alert">
          <Construction size={16} />
          <span>{t("marketplace:rulesDataError")}</span>
          <button type="button" className="marketplace-primary-button" onClick={() => setLoadFailed(false)}>
            {t("marketplace:rulesViewList")}
          </button>
        </div>
      )}
      {!data && !loadFailed && (
        <div className="rules-load-state" role="status">
          <span>{t("marketplace:rulesMapLoading")}</span>
        </div>
      )}

      {data && (
        <>
          <div className="rules-view-toggle" role="group" aria-label={t("marketplace:rulesViewLabel")}>
            <button
              type="button"
              data-testid="rules-view-map"
              aria-pressed={view === "map"}
              className={view === "map" ? "active" : ""}
              onClick={() => setView("map")}
            >
              <MapPinned size={16} /> {t("marketplace:rulesViewMap")}
            </button>
            <button
              type="button"
              data-testid="rules-view-list"
              aria-pressed={view === "list"}
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <ListChecks size={16} /> {t("marketplace:rulesViewList")}
            </button>
            {view === "map" && (
              <button
                type="button"
                data-testid="rules-vendors-toggle"
                aria-pressed={showVendors}
                className={showVendors ? "active" : ""}
                onClick={() => setShowVendors((value) => !value)}
              >
                {t("marketplace:sampleVendorsToggle")} · <bdi dir="ltr">{sampleVendorSeed.vendors.length}</bdi>
              </button>
            )}
          </div>

          <div className="rules-legend" aria-label={t("marketplace:rulesLegendLabel")}>
            {[
              ["restricted_now", "restricted-now", t("marketplace:statusRestrictedNow")],
              ["restricted_later_today", "restricted-later", t("marketplace:statusRestrictedLater")],
              ["not_restricted_today", "not-restricted", t("marketplace:statusNotRestrictedToday")],
              ["out_of_season", "out-of-season", t("marketplace:statusOutOfSeason")],
              ["unknown", "status-unknown", t("marketplace:statusUnknown")],
            ].map(([status, className, label]) => (
              (statusCounts?.get(status) ?? 0) > 0 && (
                <span key={status} className={"rules-legend-chip " + className}>
                  <span className="rules-legend-dot" aria-hidden="true" />
                  {label} · <bdi dir="ltr">{statusCounts.get(status)}</bdi>
                </span>
              )
            ))}
          </div>

          <div className="rules-content">
            <div className="rules-view-pane">
              {view === "map"
                ? (
                  <Suspense
                    fallback={
                      <div className="rules-load-state rules-map-skeleton" role="status">
                        <span>{t("marketplace:rulesMapLoading")}</span>
                      </div>
                    }
                  >
                    <StreetRulesMap
                      data={data}
                      statusOf={statusOf}
                      selectedId={selectedRow?.id ?? null}
                      onSelectRow={selectRow}
                      onQueryPoint={queryPoint}
                      vendors={showVendors ? sampleVendorSeed.vendors : null}
                      selectedVendorId={selection?.kind === "vendor" ? selection.vendor.id : null}
                      onSelectVendor={selectVendor}
                      labels={{
                        mapLabel: t("marketplace:rulesMapLabel"),
                        accessNote: t("marketplace:rulesMapAccessNote"),
                        cityView: t("marketplace:rulesCityView"),
                      }}
                    />
                  </Suspense>
                )
                : (
                  <StreetRulesList
                    data={data}
                    locale={locale}
                    statusOf={statusOf}
                    selectedId={selectedRow?.id ?? null}
                    onSelectRow={selectRow}
                  />
                )}
              {data.unmappedRowCount > 0 && view === "map" && (
                <p className="rules-unmapped-note">
                  <Construction size={14} />
                  {t("marketplace:rulesUnmappedNote", { count: data.unmappedRowCount })}
                </p>
              )}
            </div>

            <aside className="rules-report-pane" lang={locale} dir={localeDirection(locale)}>
              {selection === null && (
                <div className="rules-report-placeholder">
                  <p>{t("marketplace:rulesSelectPrompt")}</p>
                  <button
                    type="button"
                    data-testid="rules-sample-block"
                    className="rules-sample-button"
                    onClick={() => selectRow(SAMPLE_ROW_ID)}
                  >
                    {t("marketplace:rulesSampleBlock")}
                  </button>
                </div>
              )}
              {selection?.kind === "vendor" && (
                <div className="rules-vendor-card" data-testid="rules-vendor-card">
                  <div className="rules-vendor-card-head">
                    <span className="rules-vendor-emoji" aria-hidden="true">{selection.vendor.emoji}</span>
                    <div>
                      <span className="marketplace-eyebrow">{t("marketplace:sampleVendorTitle")}</span>
                      <strong><bdi dir="ltr">{selection.vendor.name}</bdi></strong>
                      <small><bdi dir="ltr">{selection.vendor.goods}</bdi></small>
                    </div>
                  </div>
                  <div className="rules-vendor-menu" data-testid="rules-vendor-menu">
                    <h3>{t("marketplace:sampleMenuTitle")}</h3>
                    <ul>
                      {(selection.vendor.menu ?? []).map((item) => (
                        <li key={item.id}>
                          <span className="rules-menu-item">
                            <span aria-hidden="true">{item.emoji}</span>
                            <bdi dir="ltr">{item.name}</bdi>
                            <bdi dir="ltr" className="rules-menu-price">{item.price_label}</bdi>
                          </span>
                          <button
                            type="button"
                            data-testid={"rules-add-" + item.id}
                            className="rules-simulate-button"
                            onClick={() => addToOrder(selection.vendor, item)}
                          >
                            {t("marketplace:simulatedPurchase")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {orders.length > 0 && (
                    <div className="rules-demo-receipts" data-testid="rules-demo-receipts" role="status">
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
                          data-testid="rules-checkout-link"
                          className="rules-checkout-link"
                          href={SHOPIFY_CHECKOUT_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("marketplace:checkoutShopify")} ↗
                        </a>
                      </div>
                    </div>
                  )}
                  <p className="rules-vendor-rules-label">{t("marketplace:sampleVendorRules")}</p>
                </div>
              )}
              {selection !== null && (
                <StreetRuleReport
                  locale={locale}
                  role={role}
                  data={data}
                  selection={selection.kind === "vendor" ? { kind: "point", report: selection.report } : selection}
                  selectedRow={selectedRow}
                  statusOf={statusOf}
                  onNavigate={onNavigate}
                  onShowSample={() => selectRow(SAMPLE_ROW_ID)}
                />
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
