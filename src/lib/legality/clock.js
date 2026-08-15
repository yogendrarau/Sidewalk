/**
 * NYC wall-clock and printed-time helpers for the street-rules feature.
 *
 * The restricted-hours table is written in New York local time; the visitor's
 * browser can be anywhere. All schedule evaluation therefore goes through
 * nycWallClock(), which projects an instant into America/New_York via Intl.
 * Never use Date#getHours()/getDay() here — CI runs in UTC and would evaluate
 * a different day/hour than a New York sidewalk.
 */

/**
 * The printed table uses "11:59 p.m." to mean "through the end of the day".
 * With half-open [start, end) windows, mapping it to 1439 would leave the
 * final minute of a full-day restriction reported as not restricted, so it
 * maps to 1440 instead. This is a deliberate, documented correction of the
 * source's notation, not of its meaning.
 */
export const END_OF_DAY_MINUTES = 1440;

const CLOCK_LABEL = /^(\d{1,2})(?::(\d{2}))? ([ap])\.m\.$/;

/**
 * Parse a printed clock label ("8 a.m.", "6:30 p.m.", "11:59 p.m.") into
 * minutes since midnight. Returns null for anything outside the printed
 * vocabulary — never throws, never guesses.
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseClockLabel(raw) {
  if (typeof raw !== "string") return null;
  const match = raw.match(CLOCK_LABEL);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const base = (hour % 12) * 60 + minute;
  const minutes = match[3] === "p" ? base + 720 : base;
  return minutes === 1439 ? END_OF_DAY_MINUTES : minutes;
}

/**
 * Half-open window test: is `now` inside [start, end)? A window whose end is
 * at or before its start wraps past midnight (the table's "2 p.m." -> "6 a.m."
 * rows), so the test becomes now >= start OR now < end.
 *
 * @param {number} startMin
 * @param {number} endMin
 * @param {number} nowMin
 * @returns {boolean}
 */
export function windowContains(startMin, endMin, nowMin) {
  if (endMin <= startMin) {
    return nowMin >= startMin || nowMin < endMin;
  }
  return nowMin >= startMin && nowMin < endMin;
}

const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * @typedef {Object} WallClock
 * @property {number} y full year in New York
 * @property {number} m 1-12
 * @property {number} d 1-31
 * @property {number} weekday 0=Sunday .. 6=Saturday
 * @property {number} minutes minutes since midnight, New York local
 */

/**
 * Project an instant into New York wall-clock fields.
 *
 * @param {Date} date
 * @returns {WallClock}
 */
export function nycWallClock(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  /** @type {Record<string, string>} */
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  const weekday = WEEKDAY_INDEX[/** @type {keyof typeof WEEKDAY_INDEX} */ (map.weekday)];
  if (weekday === undefined) {
    throw new Error(`Unrecognized weekday from Intl: ${map.weekday}`);
  }
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    weekday,
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}
