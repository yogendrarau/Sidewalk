import { describe, expect, it } from "vitest";

import { metersBetween, pointToSegmentMeters } from "../../src/lib/legality/geo.js";
import { queryPointReport } from "../../src/lib/legality/query.js";
import { POINT_STATUS, REQUIRED_CAVEAT_KEYS, ROW_STATUS } from "../../src/lib/legality/vocabulary.js";

/**
 * Synthetic dataset: one east-west block near Union Square, one unmatched
 * row, one row with a side note. Distances below are hand-checked against
 * the ~85m/0.001deg longitude scale at 40.73N.
 */
function syntheticData() {
  const rows = [
    {
      id: "mfv-0001",
      borough: "Manhattan",
      borough_code: 1,
      street_display: "Test Street",
      side_note: null,
      from_display: "A Avenue",
      to_display: "B Avenue",
      season_id: 0,
      schedule_id: 0,
      rule_cite_display: "RCNY 2-314",
      vendor_scope: "mobile_food",
      match: { tier: "polyline", method: "cscl_node_bfs", alias_used: [] },
    },
    {
      id: "mfv-0002",
      borough: "Manhattan",
      borough_code: 1,
      street_display: "Side Street",
      side_note: "east side only",
      from_display: "C Avenue",
      to_display: "D Avenue",
      season_id: 0,
      schedule_id: 0,
      rule_cite_display: "RCNY 2-314",
      vendor_scope: "mobile_food",
      match: { tier: "midpoint_pin", method: "single_intersection_node", alias_used: [] },
    },
    {
      id: "mfv-0003",
      borough: "Brooklyn",
      borough_code: 3,
      street_display: "Ghost Street",
      side_note: null,
      from_display: "E Avenue",
      to_display: "F Avenue",
      season_id: 0,
      schedule_id: 0,
      rule_cite_display: "RCNY 2-314",
      vendor_scope: "mobile_food",
      match: { tier: "unmatched", method: "street_not_in_cscl", alias_used: [] },
    },
  ];
  const features = [
    {
      type: "Feature",
      id: "mfv-0001",
      properties: { row_id: "mfv-0001", tier: "polyline", borough_code: 1 },
      geometry: {
        type: "MultiLineString",
        coordinates: [[[-73.99, 40.73], [-73.98, 40.73]]],
      },
    },
    {
      type: "Feature",
      id: "mfv-0002",
      properties: { row_id: "mfv-0002", tier: "midpoint_pin", borough_code: 1 },
      geometry: { type: "Point", coordinates: [-73.97, 40.75] },
    },
  ];
  return {
    meta: {
      provenance: {
        mode: "bundled_public_snapshot",
        source: "Test snapshot",
        retrievedAt: "2026-08-15T00:00:00.000Z",
      },
      scope: { vendor_types: ["mobile_food"], excludes: ["general_vendor_rcny_2_310"] },
      sources: [{ document_revision: "EHS-TEST" }],
      counts: { rows: 3 },
    },
    rows,
    clockLabels: [{ raw: "8 a.m.", min: 480 }, { raw: "7 p.m.", min: 1140 }],
    schedules: [{ days: Array(7).fill({ startRaw: "8 a.m.", endRaw: "7 p.m." }) }],
    seasons: [{ kind: "year_round", start_raw: "Year-round", end_raw: "Year-round" }],
    geometry: { type: "FeatureCollection", features },
    featuresByRowId: new Map(features.map((f) => [f.properties.row_id, f])),
    outlines: { type: "FeatureCollection", features: [] },
    unmappedRowCount: 1,
  };
}

const NOON_MONDAY = { y: 2026, m: 8, d: 17, weekday: 1, minutes: 720 };

/** A point `meters` south of the mfv-0001 centerline's midpoint. */
function pointSouthOfBlock(meters) {
  return { lat: 40.73 - meters / 111_195, lng: -73.985 };
}

describe("geo distance", () => {
  it("computes point-to-segment distance within 1% of hand-checked values", () => {
    const a = { lat: 40.73, lng: -73.99 };
    const b = { lat: 40.73, lng: -73.98 };
    // Perpendicular: 100m south of the segment's interior.
    const d1 = pointToSegmentMeters({ lat: 40.73 - 100 / 111_195, lng: -73.985 }, a, b);
    expect(Math.abs(d1 - 100)).toBeLessThan(1);
    // Beyond an endpoint: clamps to the endpoint, not the infinite line.
    const beyond = { lat: 40.73, lng: -73.995 };
    const d2 = pointToSegmentMeters(beyond, a, b);
    expect(Math.abs(d2 - metersBetween(beyond, a))).toBeLessThan(0.5);
  });
});

describe("queryPointReport", () => {
  const data = syntheticData();

  it("transitions between on-block, nearby, and no-match at the documented thresholds", () => {
    expect(queryPointReport(pointSouthOfBlock(24.9), data, NOON_MONDAY).status)
      .toBe(POINT_STATUS.ON_LISTED_BLOCK);
    expect(queryPointReport(pointSouthOfBlock(25.5), data, NOON_MONDAY).status)
      .toBe(POINT_STATUS.NEAR_LISTED_BLOCK);
    expect(queryPointReport(pointSouthOfBlock(119), data, NOON_MONDAY).status)
      .toBe(POINT_STATUS.NEAR_LISTED_BLOCK);
    expect(queryPointReport(pointSouthOfBlock(125), data, NOON_MONDAY).status)
      .toBe(POINT_STATUS.NO_LISTED_BLOCK_NEARBY);
  });

  it("never contains a permission-shaped key or sentence", () => {
    // Mid-Atlantic point: the strongest "not on the list" answer possible.
    const report = queryPointReport({ lat: 40.6, lng: -73.9 }, data, NOON_MONDAY);
    expect(report.status).toBe(POINT_STATUS.NO_LISTED_BLOCK_NEARBY);

    const keys = [];
    const strings = [];
    (function walk(value) {
      if (typeof value === "string") strings.push(value);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.push(key);
          walk(child);
        }
      }
    })(report);

    for (const key of keys) {
      expect(key).not.toMatch(/allow|legal|permit|can_vend|is_ok|permitted/i);
    }
    for (const value of strings) {
      expect(value).not.toMatch(/you (?:may|can) vend|it is legal|allowed here|free to/i);
    }
  });

  it("keeps the status vocabularies free of permission words", () => {
    for (const value of [...Object.values(POINT_STATUS), ...Object.values(ROW_STATUS)]) {
      expect(value).not.toMatch(/allow|legal|permit|\bok\b|open/i);
    }
  });

  it("discloses the unmapped-row count and scope on every answer", () => {
    for (const point of [pointSouthOfBlock(5), pointSouthOfBlock(60), { lat: 40.6, lng: -73.9 }]) {
      const report = queryPointReport(point, data, NOON_MONDAY);
      expect(report.disclosure.unmapped_row_count).toBe(1);
      expect(report.disclosure.vendor_scope).toEqual(["mobile_food"]);
      expect(report.disclosure.excluded_rule_sets).toContain("general_vendor_rcny_2_310");
      expect(report.disclosure.snapshot.document_revision).toBe("EHS-TEST");
      for (const caveat of REQUIRED_CAVEAT_KEYS) {
        expect(report.caveat_keys).toContain(caveat);
      }
      expect(report.caveat_keys.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("returns matches ascending by distance with per-row status and side notes", () => {
    // A point between the block (nearer) and the pin (farther, ~2km away
    // so out of range) — then a corner-ish point near both synthetic rows.
    const report = queryPointReport(pointSouthOfBlock(40), data, NOON_MONDAY);
    expect(report.matches.length).toBeGreaterThanOrEqual(1);
    const distances = report.matches.map((m) => m.distance_m);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    expect(report.matches[0].row_status.status).toBe(ROW_STATUS.RESTRICTED_NOW);
    expect(report.matches[0].geometry_precision).toBe("block_extent");

    const nearPin = queryPointReport({ lat: 40.7501, lng: -73.97 }, data, NOON_MONDAY);
    expect(nearPin.matches[0].row_id).toBe("mfv-0002");
    expect(nearPin.matches[0].side_note).toBe("east side only");
    expect(nearPin.matches[0].geometry_precision).toBe("approximate_point");
  });

  it("evaluates row status through the wall clock, not the runner's locale", () => {
    const nightReport = queryPointReport(pointSouthOfBlock(5), data, {
      y: 2026,
      m: 8,
      d: 17,
      weekday: 1,
      minutes: 300, // 5 a.m. NYC
    });
    expect(nightReport.matches[0].row_status.status).toBe(ROW_STATUS.RESTRICTED_LATER_TODAY);
  });
});
