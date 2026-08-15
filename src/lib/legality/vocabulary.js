/**
 * Closed status vocabularies for the street-rules feature — the honesty
 * contract in one file.
 *
 * Every member states what the published list SAYS, never what a vendor MAY
 * DO. A unit test asserts no member ever matches /allow|legal|permit|ok|open/i
 * so a permission-shaped status cannot be introduced silently.
 */

/** @typedef {"restricted_now" | "restricted_later_today" | "not_restricted_today" | "out_of_season" | "unknown"} RowStatusValue */
export const ROW_STATUS = Object.freeze({
  RESTRICTED_NOW: "restricted_now",
  RESTRICTED_LATER_TODAY: "restricted_later_today",
  NOT_RESTRICTED_TODAY: "not_restricted_today",
  OUT_OF_SEASON: "out_of_season",
  UNKNOWN: "unknown",
});

/** @typedef {"on_listed_block" | "near_listed_block" | "no_listed_block_nearby"} PointStatusValue */
export const POINT_STATUS = Object.freeze({
  ON_LISTED_BLOCK: "on_listed_block",
  NEAR_LISTED_BLOCK: "near_listed_block",
  NO_LISTED_BLOCK_NEARBY: "no_listed_block_nearby",
});

/**
 * Caveats that MUST accompany every point-query answer. The scope caveat
 * exists because the source list covers mobile food vending only; a silent
 * negative would wrongly imply general-vendor blocks are clear too.
 */
export const REQUIRED_CAVEAT_KEYS = Object.freeze([
  "scope_mobile_food_only",
  "unmapped_entries",
  "centerline_heuristic",
  "not_the_only_rule",
]);
