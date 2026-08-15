import React from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { useSurfaceTranslation } from "@/i18n";

/**
 * The report panel: states what the published list says about a selected
 * street or a tapped point, and never adjudicates. Mirrors the OATH lookup
 * card's four affordances: a mode badge, a freshness strip, outcome-keyed
 * caveat prose, and a deterministic sample entry point.
 *
 * RULES_MODE_KEYS deliberately duplicates Sidewalk.jsx's MODE_KEYS (that
 * function must not be moved or renamed — a source contract slices around
 * it); a unit test asserts the two maps stay in agreement.
 */
const RULES_MODE_KEYS = {
  live_public_readonly: "common:modeLivePublic",
  live_ai: "common:modeLiveAi",
  fixture: "common:modeFixture",
  simulated: "common:modeSimulated",
  unavailable: "common:modeUnavailable",
  bundled_public_snapshot: "common:modeBundledSnapshot",
};

const STATUS_BODY_KEY = {
  restricted_now: "marketplace:ruleRestrictedNowBody",
  restricted_later_today: "marketplace:ruleRestrictedLaterBody",
  not_restricted_today: "marketplace:ruleNotRestrictedTodayBody",
  out_of_season: "marketplace:ruleOutOfSeasonBody",
  unknown: "marketplace:ruleUnknownBody",
};

function RulesModeBadge({ mode, locale }) {
  const { t } = useSurfaceTranslation(locale, ["common"]);
  return (
    <span className={"mode-badge mode-" + mode}>
      <span className="mode-dot" />
      {t(RULES_MODE_KEYS[mode] ?? "common:modeUnavailable")}
    </span>
  );
}

function formatDate(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

/**
 * @param {{
 *   locale: string,
 *   role: "buyer" | "vendor",
 *   data: any,
 *   selection: {kind: "row", rowId: string} | {kind: "point", report: any},
 *   selectedRow: any,
 *   statusOf: (row: any) => any,
 *   onNavigate: ((workspace: string) => void) | null,
 *   onShowSample: () => void,
 * }} props
 */
export default function StreetRuleReport({ locale, role, data, selection, selectedRow, statusOf, onNavigate, onShowSample }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace", "common"]);

  const pointReport = selection.kind === "point" ? selection.report : null;
  const rowsById = new Map(data.rows.map((row) => [row.id, row]));
  const focusRow = selection.kind === "row"
    ? selectedRow
    : pointReport.matches.length > 0
    ? rowsById.get(pointReport.matches[0].row_id)
    : null;
  const offList = pointReport !== null && pointReport.status === "no_listed_block_nearby";

  const title = offList
    ? t("marketplace:ruleNotOnListTitle")
    : pointReport !== null && pointReport.status === "near_listed_block"
    ? t("marketplace:ruleNearTitle")
    : t("marketplace:ruleOnListTitle");

  let statusBody = null;
  let rowStatus = null;
  if (focusRow) {
    rowStatus = selection.kind === "row"
      ? statusOf(focusRow)
      : pointReport.matches[0].row_status;
    const hours = rowStatus.today.startRaw !== null
      ? `${rowStatus.today.startRaw} – ${rowStatus.today.endRaw}`
      : "—";
    const season = data.seasons[focusRow.season_id];
    statusBody = t(STATUS_BODY_KEY[rowStatus.status] ?? "marketplace:ruleUnknownBody", {
      hours,
      season: `${season.start_raw} – ${season.end_raw}`,
    });
  }

  const snapshot = data.meta.provenance;
  const revision = data.meta.sources[0].document_revision;

  return (
    <section data-testid="rules-report" className={"rules-report" + (offList ? " off-list" : "")}>
      <div className="rules-report-head">
        {offList && <TriangleAlert size={18} aria-hidden="true" />}
        <h2>{title}</h2>
        <RulesModeBadge mode={snapshot.mode} locale={locale} />
      </div>

      {focusRow && !offList && (
        <div className="rules-report-street">
          <strong><bdi dir="ltr">{focusRow.street_display}</bdi></strong>
          <small><bdi dir="ltr">{focusRow.from_display} → {focusRow.to_display}</bdi></small>
          <small><bdi dir="ltr">{focusRow.rule_cite_display}</bdi></small>
        </div>
      )}

      {statusBody && !offList && <p className="rules-report-body">{statusBody}</p>}
      {/* Genuine side-of-street notes only ("east side only") — a bare
          "(East)"/"(West)" is a direction half of a numbered street. */}
      {focusRow && !offList && focusRow.side_note && /side/i.test(focusRow.side_note) && (
        <p className="rules-report-side">{t("marketplace:ruleSideNote", { side: focusRow.side_note })}</p>
      )}
      {offList && <p className="rules-report-body">{t("marketplace:ruleNotOnListBody")}</p>}

      <p className="rules-report-constant">{t("marketplace:ruleNotADecision")}</p>

      <ul className="rules-report-caveats">
        <li>{t("marketplace:caveatScopeMobileFood")}</li>
        <li>{t("marketplace:caveatCenterline")}</li>
        <li>{t("marketplace:caveatNotOnlyRule")}</li>
        {data.unmappedRowCount > 0 && (
          <li>{t("marketplace:rulesUnmappedNote", { count: data.unmappedRowCount })}</li>
        )}
      </ul>

      <div className="marketplace-freshness">
        <bdi dir="ltr">{t("common:dataset")} · DOHMH {revision}</bdi>
        <span>
          {t("marketplace:rulesSnapshotAge")} · {t("common:asOf")} ·{" "}
          <bdi dir="ltr">{formatDate(snapshot.retrievedAt, locale)}</bdi>
        </span>
      </div>

      {offList && role === "vendor" && onNavigate && (
        <button
          type="button"
          data-testid="rules-go-verify"
          className="rules-sample-button"
          onClick={() => onNavigate("get-verified")}
        >
          {t("marketplace:rulesGoVerify")} <ArrowRight className="marketplace-directional" size={15} />
        </button>
      )}
      {offList && (
        <button type="button" className="rules-sample-button" onClick={onShowSample}>
          {t("marketplace:rulesSampleBlock")}
        </button>
      )}
    </section>
  );
}
