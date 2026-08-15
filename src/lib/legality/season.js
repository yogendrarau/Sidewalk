/**
 * Season resolution for restricted-street rows.
 *
 * The printed table's full season vocabulary (verified against the parsed
 * PDF): "Year-round", fixed dates ("November 1", "January 15", "May 1",
 * "September 30", "April 30"), and the floating anchors "Labor Day",
 * "Day after Labor Day", "Thanksgiving Day", "New Years Day". Every anchor is
 * exactly computable — seasons are never approximated. Anything outside this
 * closed vocabulary resolves to "unknown", never a guess.
 */

import { dayAfterLaborDay, laborDay, newYearsDay, thanksgiving } from "./holidays.js";

/** @typedef {import("./clock.js").WallClock} WallClock */

/**
 * @typedef {Object} SeasonBoundary
 * @property {number} [month]
 * @property {number} [day]
 * @property {string} [rule] "labor_day" | "day_after_labor_day" | "thanksgiving" | "new_years_day"
 */

/**
 * @typedef {Object} Season
 * @property {string} kind "year_round" | "fixed" | "floating" | "mixed"
 * @property {string} start_raw
 * @property {string} end_raw
 * @property {SeasonBoundary} [start]
 * @property {SeasonBoundary} [end]
 */

const HOLIDAY_RULES = {
  labor_day: laborDay,
  day_after_labor_day: dayAfterLaborDay,
  thanksgiving: thanksgiving,
  new_years_day: newYearsDay,
};

/**
 * @param {SeasonBoundary | undefined} boundary
 * @param {number} year
 * @returns {{m: number, d: number} | null}
 */
function resolveBoundary(boundary, year) {
  if (!boundary) return null;
  if (typeof boundary.rule === "string") {
    const rule = HOLIDAY_RULES[/** @type {keyof typeof HOLIDAY_RULES} */ (boundary.rule)];
    return rule ? rule(year) : null;
  }
  if (
    typeof boundary.month === "number" && boundary.month >= 1 && boundary.month <= 12 &&
    typeof boundary.day === "number" && boundary.day >= 1 && boundary.day <= 31
  ) {
    return { m: boundary.month, d: boundary.day };
  }
  return null;
}

/** Month/day ordinal for same-year comparison. */
function ordinal(md) {
  return md.m * 100 + md.d;
}

/**
 * @param {Season | undefined | null} season
 * @param {WallClock} wall
 * @returns {"in_season" | "out_of_season" | "unknown"}
 */
export function resolveSeason(season, wall) {
  if (!season || typeof season.kind !== "string") return "unknown";
  if (season.kind === "year_round") return "in_season";
  if (!["fixed", "floating", "mixed"].includes(season.kind)) return "unknown";

  const start = resolveBoundary(season.start, wall.y);
  const end = resolveBoundary(season.end, wall.y);
  if (!start || !end) return "unknown";

  const today = ordinal({ m: wall.m, d: wall.d });
  const startOrd = ordinal(start);
  const endOrd = ordinal(end);

  // End dates are inclusive: "November 1 - January 15" restricts THROUGH
  // January 15. A start after its end wraps across the year boundary.
  const inSeason = startOrd <= endOrd
    ? today >= startOrd && today <= endOrd
    : today >= startOrd || today <= endOrd;
  return inSeason ? "in_season" : "out_of_season";
}
