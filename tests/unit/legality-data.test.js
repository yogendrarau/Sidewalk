import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseClockLabel } from "../../src/lib/legality/clock.js";

const DATA_DIR = fileURLToPath(new URL("../../src/data/vending-legality/", import.meta.url));

const meta = JSON.parse(readFileSync(DATA_DIR + "meta.json", "utf8"));
const rules = JSON.parse(readFileSync(DATA_DIR + "restricted-streets.rules.json", "utf8"));
const geometry = JSON.parse(readFileSync(DATA_DIR + "restricted-streets.geometry.json", "utf8"));
const outlines = JSON.parse(readFileSync(DATA_DIR + "nyc-borough-outlines.json", "utf8"));

const NYC_BBOX = { west: -74.3, south: 40.45, east: -73.68, north: 40.95 };

function walkCoordinates(coordinates, visit) {
  if (typeof coordinates[0] === "number") {
    visit(coordinates);
    return;
  }
  for (const child of coordinates) walkCoordinates(child, visit);
}

describe("vending-legality artifacts", () => {
  it("carries exactly the 190 published rows with unique stable ids", () => {
    expect(rules.rows).toHaveLength(190);
    expect(meta.counts.rows).toBe(190);
    const ids = new Set();
    for (const row of rules.rows) {
      expect(row.id).toMatch(/^mfv-\d{4}$/);
      ids.add(row.id);
    }
    expect(ids.size).toBe(190);
  });

  it("resolves every schedule, season, and clock-label reference", () => {
    for (const row of rules.rows) {
      expect(rules.schedules[row.schedule_id], row.id).toBeDefined();
      expect(rules.seasons[row.season_id], row.id).toBeDefined();
    }
    for (const schedule of rules.schedules) {
      expect(schedule.days).toHaveLength(7);
      for (const day of schedule.days) {
        if (day === null) continue;
        expect(rules.clock_labels[day[0]]).toBeDefined();
        expect(rules.clock_labels[day[1]]).toBeDefined();
      }
    }
  });

  it("keeps the ETL and runtime clock parsers in exact agreement", () => {
    // The artifact stores both raw and min; the runtime re-derives min. If
    // either implementation drifts, this is the test that catches it.
    expect(rules.clock_labels.length).toBeGreaterThan(0);
    for (const label of rules.clock_labels) {
      expect(parseClockLabel(label.raw), label.raw).toBe(label.min);
    }
  });

  it("joins geometry to rules one-to-one by tier", () => {
    const rowsById = new Map(rules.rows.map((row) => [row.id, row]));
    const seen = new Set();
    for (const feature of geometry.features) {
      const rowId = feature.properties.row_id;
      expect(seen.has(rowId), `duplicate feature ${rowId}`).toBe(false);
      seen.add(rowId);
      const row = rowsById.get(rowId);
      expect(row, rowId).toBeDefined();
      expect(row.match.tier).not.toBe("unmatched");
      expect(feature.properties.tier).toBe(row.match.tier);
    }
    for (const row of rules.rows) {
      if (row.match.tier === "unmatched") {
        expect(seen.has(row.id), `unmatched row ${row.id} must have no feature`).toBe(false);
      } else {
        expect(seen.has(row.id), `row ${row.id} missing feature`).toBe(true);
      }
    }
    const tierCounts = { polyline: 0, corridor: 0, midpoint_pin: 0, unmatched: 0 };
    for (const row of rules.rows) tierCounts[row.match.tier] += 1;
    expect(tierCounts).toEqual({
      polyline: meta.counts.polyline,
      corridor: meta.counts.corridor,
      midpoint_pin: meta.counts.midpoint_pin,
      unmatched: meta.counts.unmatched,
    });
  });

  it("pins provenance to the published DOHMH source", () => {
    expect(meta.provenance.mode).toBe("bundled_public_snapshot");
    expect(meta.sources[0].url).toBe(
      "https://www.nyc.gov/assets/doh/downloads/pdf/permit/mfv_restricted_streets.pdf",
    );
    expect(meta.sources[0].content_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.sources[0].document_revision).toMatch(/^EHS\d+/);
  });

  it("locks the scope to mobile food vending and names what is excluded", () => {
    expect(meta.scope.vendor_types).toEqual(["mobile_food"]);
    expect(meta.scope.excludes).toContain("general_vendor_rcny_2_310");
    for (const row of rules.rows) expect(row.vendor_scope).toBe("mobile_food");
  });

  it("keeps every coordinate inside the NYC bounding box", () => {
    for (const collection of [geometry, outlines]) {
      for (const feature of collection.features) {
        walkCoordinates(feature.geometry.coordinates, ([lng, lat]) => {
          expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
          expect(lng).toBeGreaterThanOrEqual(NYC_BBOX.west);
          expect(lng).toBeLessThanOrEqual(NYC_BBOX.east);
          expect(lat).toBeGreaterThanOrEqual(NYC_BBOX.south);
          expect(lat).toBeLessThanOrEqual(NYC_BBOX.north);
        });
      }
    }
  });

  it("ships all five borough outlines with closed rings", () => {
    expect(outlines.features).toHaveLength(5);
    expect(outlines.features.map((f) => f.properties.borough_code)).toEqual([1, 2, 3, 4, 5]);
    for (const feature of outlines.features) {
      for (const polygon of feature.geometry.coordinates) {
        for (const ring of polygon) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring[ring.length - 1]);
        }
      }
    }
  });

  it("stays under the committed byte ceilings", () => {
    // Regenerating without simplification must fail loudly, not bloat the app.
    expect(statSync(DATA_DIR + "restricted-streets.rules.json").size).toBeLessThanOrEqual(130_000);
    expect(statSync(DATA_DIR + "restricted-streets.geometry.json").size).toBeLessThanOrEqual(180_000);
    expect(statSync(DATA_DIR + "nyc-borough-outlines.json").size).toBeLessThanOrEqual(60_000);
    expect(statSync(DATA_DIR + "meta.json").size).toBeLessThanOrEqual(4_000);
  });

  it("preserves printed text verbatim in display fields", () => {
    // Spot-anchor the first printed row; the display fields must match the
    // PDF exactly (footnote digits aside), with rewrites confined to match.*.
    const first = rules.rows[0];
    expect(first.street_display).toBe("53rd Street (West)");
    expect(first.from_display).toBe("Broadway");
    expect(first.to_display).toBe("Eighth Avenue");
    expect(first.rule_cite_display).toBe("Admin Code 17-315");
  });
});
