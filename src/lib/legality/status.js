/**
 * Per-row schedule status: what the published list says about a block at a
 * given New York wall-clock instant.
 *
 * Fail-safe direction (deliberate, tested): any unparseable component makes
 * the row "unknown" — shown as "on the list, check with the city" — never
 * "not restricted". The harm is asymmetric: a false "not restricted" can send
 * a vendor into a summons; a false "unknown" costs a phone call. A BLANK day
 * cell is different from an unparseable one: the printed table genuinely
 * leaves days unrestricted, so null cells resolve to "not_restricted_today".
 */

import { parseClockLabel, windowContains } from "./clock.js";
import { resolveSeason } from "./season.js";
import { ROW_STATUS } from "./vocabulary.js";

/** @typedef {import("./clock.js").WallClock} WallClock */
/** @typedef {import("./season.js").Season} Season */

/**
 * @typedef {Object} ScheduleDay
 * @property {string} startRaw
 * @property {string} endRaw
 */

/**
 * @typedef {Object} Schedule
 * @property {Array<ScheduleDay | null>} days Sunday..Saturday, length 7
 */

/**
 * @typedef {Object} RowStatus
 * @property {string} status one of ROW_STATUS
 * @property {"in_season" | "out_of_season" | "unknown"} seasonState
 * @property {{startMin: number | null, endMin: number | null, startRaw: string | null, endRaw: string | null, parseOk: boolean}} today
 * @property {number | null} minutesToChange minutes until the window starts (restricted_later_today) or ends (restricted_now)
 */

/** @type {RowStatus["today"]} */
const NO_WINDOW_TODAY = Object.freeze({
  startMin: null,
  endMin: null,
  startRaw: null,
  endRaw: null,
  parseOk: true,
});

/**
 * @param {Schedule | undefined | null} schedule
 * @param {Season | undefined | null} season
 * @param {WallClock} wall
 * @returns {RowStatus}
 */
export function rowStatusAt(schedule, season, wall) {
  const seasonState = resolveSeason(season, wall);
  if (seasonState === "unknown") {
    return { status: ROW_STATUS.UNKNOWN, seasonState, today: NO_WINDOW_TODAY, minutesToChange: null };
  }
  if (seasonState === "out_of_season") {
    return { status: ROW_STATUS.OUT_OF_SEASON, seasonState, today: NO_WINDOW_TODAY, minutesToChange: null };
  }

  const days = schedule?.days;
  if (!Array.isArray(days) || days.length !== 7) {
    return { status: ROW_STATUS.UNKNOWN, seasonState, today: { ...NO_WINDOW_TODAY, parseOk: false }, minutesToChange: null };
  }

  const day = days[wall.weekday];
  if (day === null) {
    // A blank printed cell: the list names no restricted hours for this day.
    return { status: ROW_STATUS.NOT_RESTRICTED_TODAY, seasonState, today: NO_WINDOW_TODAY, minutesToChange: null };
  }

  const startMin = parseClockLabel(day?.startRaw);
  const endMin = parseClockLabel(day?.endRaw);
  const today = {
    startMin,
    endMin,
    startRaw: day?.startRaw ?? null,
    endRaw: day?.endRaw ?? null,
    parseOk: startMin !== null && endMin !== null,
  };
  if (startMin === null || endMin === null) {
    // Unparseable is NOT "no restriction" — fail toward "check with the city".
    return { status: ROW_STATUS.UNKNOWN, seasonState, today, minutesToChange: null };
  }

  if (windowContains(startMin, endMin, wall.minutes)) {
    const minutesToChange = ((endMin - wall.minutes) % 1440 + 1440) % 1440;
    return { status: ROW_STATUS.RESTRICTED_NOW, seasonState, today, minutesToChange };
  }
  if (wall.minutes < startMin) {
    return {
      status: ROW_STATUS.RESTRICTED_LATER_TODAY,
      seasonState,
      today,
      minutesToChange: startMin - wall.minutes,
    };
  }
  return { status: ROW_STATUS.NOT_RESTRICTED_TODAY, seasonState, today, minutesToChange: null };
}
