/**
 * Exact dates for the floating holidays the restricted-streets table anchors
 * seasons to. These are calendar-date computations (no time zone involved):
 * Date.UTC is used purely as day-of-week arithmetic.
 */

/** Day of week (0=Sunday) for a calendar date. */
function weekdayOf(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** @param {number} year @returns {{m: number, d: number}} first Monday of September */
export function laborDay(year) {
  const firstWeekday = weekdayOf(year, 9, 1);
  return { m: 9, d: 1 + ((8 - firstWeekday) % 7) };
}

/** @param {number} year @returns {{m: number, d: number}} */
export function dayAfterLaborDay(year) {
  const labor = laborDay(year);
  return { m: 9, d: labor.d + 1 }; // Labor Day is Sep 1-7, so +1 stays in September
}

/** @param {number} year @returns {{m: number, d: number}} fourth Thursday of November */
export function thanksgiving(year) {
  const firstWeekday = weekdayOf(year, 11, 1);
  const firstThursday = 1 + ((11 - firstWeekday) % 7);
  return { m: 11, d: firstThursday + 21 };
}

/** @returns {{m: number, d: number}} */
export function newYearsDay() {
  return { m: 1, d: 1 };
}
