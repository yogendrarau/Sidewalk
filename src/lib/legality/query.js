/**
 * Report-only point query: given a location, report what the city's published
 * restricted-street list says nearby.
 *
 * This module never adjudicates. The result carries no permission-shaped
 * field; its statuses describe the QUERY against the LIST ("no listed block
 * nearby"), never the location's legality. Every answer — including a
 * negative one — discloses the dataset's scope, its unmapped entries, and the
 * geometry's limits, because a silent negative would read as "you're fine".
 */

import { pointToGeometryMeters } from "./geo.js";
import { rowSchedule, rowSeason } from "./data.js";
import { rowStatusAt } from "./status.js";
import { POINT_STATUS, REQUIRED_CAVEAT_KEYS } from "./vocabulary.js";

/** @typedef {import("./clock.js").WallClock} WallClock */
/** @typedef {import("./data.js").LegalityData} LegalityData */

export const ON_BLOCK_METERS = 25;
export const NEARBY_METERS = 120;
const MAX_MATCHES = 5;

const GEOMETRY_PRECISION = {
  polyline: "block_extent",
  corridor: "approximate_extent",
  midpoint_pin: "approximate_point",
};

/**
 * @param {{lat: number, lng: number}} point
 * @param {LegalityData} data
 * @param {WallClock} wall
 * @param {{onBlockMeters?: number, nearbyMeters?: number}} [opts]
 */
export function queryPointReport(point, data, wall, opts = {}) {
  const onBlockMeters = opts.onBlockMeters ?? ON_BLOCK_METERS;
  const nearbyMeters = opts.nearbyMeters ?? NEARBY_METERS;

  const candidates = [];
  for (const row of data.rows) {
    const feature = data.featuresByRowId.get(row.id);
    if (!feature) continue; // unmatched rows have no geometry; counted below
    const distance = pointToGeometryMeters(point, feature.geometry);
    if (distance <= nearbyMeters) {
      candidates.push({ row, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);

  const matches = candidates.slice(0, MAX_MATCHES).map(({ row, distance }) => ({
    row_id: row.id,
    distance_m: Math.round(distance * 10) / 10,
    geometry_tier: row.match.tier,
    geometry_precision: GEOMETRY_PRECISION[
      /** @type {keyof typeof GEOMETRY_PRECISION} */ (row.match.tier)
    ] ?? "approximate_point",
    side_note: row.side_note,
    row_status: rowStatusAt(rowSchedule(data, row), rowSeason(data, row), wall),
  }));

  const status = matches.length === 0
    ? POINT_STATUS.NO_LISTED_BLOCK_NEARBY
    : matches[0].distance_m <= onBlockMeters
    ? POINT_STATUS.ON_LISTED_BLOCK
    : POINT_STATUS.NEAR_LISTED_BLOCK;

  return Object.freeze({
    schema_version: 1,
    point: { lat: point.lat, lng: point.lng },
    status,
    matches,
    disclosure: {
      vendor_scope: data.meta.scope.vendor_types,
      excluded_rule_sets: data.meta.scope.excludes,
      unmapped_row_count: data.unmappedRowCount,
      snapshot: {
        source: data.meta.provenance.source,
        document_revision: data.meta.sources[0].document_revision,
        retrieved_at: data.meta.provenance.retrievedAt,
      },
    },
    caveat_keys: [...REQUIRED_CAVEAT_KEYS],
  });
}
