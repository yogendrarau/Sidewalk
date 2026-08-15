import React from "react";
import { useSurfaceTranslation } from "@/i18n";

/**
 * The accessible content-of-record: every printed row, including the ones
 * that could not be placed on the map, grouped by borough. Selecting a row
 * drives the same report panel as the map.
 */

const STATUS_CLASS = {
  restricted_now: "restricted-now",
  restricted_later_today: "restricted-later",
  not_restricted_today: "not-restricted",
  out_of_season: "out-of-season",
  unknown: "status-unknown",
};

const STATUS_KEY = {
  restricted_now: "marketplace:statusRestrictedNow",
  restricted_later_today: "marketplace:statusRestrictedLater",
  not_restricted_today: "marketplace:statusNotRestrictedToday",
  out_of_season: "marketplace:statusOutOfSeason",
  unknown: "marketplace:statusUnknown",
};

/**
 * @param {{data: any, locale: string, statusOf: (row: any) => any, selectedId: string | null, onSelectRow: (id: string) => void}} props
 */
export default function StreetRulesList({ data, locale, statusOf, selectedId, onSelectRow }) {
  const { t } = useSurfaceTranslation(locale, ["marketplace"]);

  const byBorough = new Map();
  for (const row of data.rows) {
    if (!byBorough.has(row.borough)) byBorough.set(row.borough, []);
    byBorough.get(row.borough).push(row);
  }

  return (
    <div data-testid="rules-list" className="rules-list" role="region" aria-label={t("marketplace:rulesListLabel")}>
      {[...byBorough.entries()].map(([borough, rows]) => (
        <section key={borough} className="rules-list-borough">
          <h2><bdi dir="ltr">{borough}</bdi></h2>
          <ul>
            {rows.map((row) => {
              const status = statusOf(row);
              const today = status.today;
              const hours = today.startRaw !== null
                ? `${today.startRaw} – ${today.endRaw}`
                : null;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    data-rule-segment={row.id}
                    className={"rules-list-row" + (row.id === selectedId ? " selected" : "")}
                    aria-current={row.id === selectedId ? "true" : undefined}
                    onClick={() => onSelectRow(row.id)}
                  >
                    <span className="rules-list-street">
                      <strong><bdi dir="ltr">{row.street_display}</bdi></strong>
                      <small>
                        <bdi dir="ltr">{row.from_display} → {row.to_display}</bdi>
                      </small>
                    </span>
                    <span className="rules-list-meta">
                      <span className={"rules-status-chip " + (STATUS_CLASS[status.status] ?? "status-unknown")}>
                        {t(STATUS_KEY[status.status] ?? "marketplace:statusUnknown")}
                      </span>
                      {hours && (
                        <small>{t("marketplace:rulesHoursToday", { hours })}</small>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
