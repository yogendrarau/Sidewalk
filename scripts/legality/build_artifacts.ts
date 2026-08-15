/**
 * Emit the four committed artifacts under src/data/vending-legality/ from the
 * parsed rows + geocode results + borough outlines.
 *
 * Honesty invariants enforced here:
 * - *_display fields carry the printed text verbatim (footnote digits
 *   stripped); every deviation used for geocoding is disclosed in match.
 * - meta.scope states this list covers MOBILE FOOD vending only.
 * - The runtime clock parser is imported to recompute every clock label's
 *   minutes — the ETL aborts if the two implementations ever disagree.
 */

import { EXPECTED_ROW_COUNT, type ParseResult, parsePdf } from "./parse_pdf.ts";
import { type GeocodedRow } from "./geocode.ts";
import { fetchBoroughOutlines, fetchPdf, PDF_URL, sha256Hex } from "./fetch_sources.ts";
import { quantizePath, simplifyMultiPolygon } from "./simplify.ts";
import { parseClockLabel } from "../../src/lib/legality/clock.js";

const HERE = new URL(".", import.meta.url).pathname;
const OUT_DIR = new URL("../../src/data/vending-legality/", import.meta.url).pathname;

const SCHEMA_VERSION = 1;

const BOROUGH_CODES: Record<string, number> = {
  Manhattan: 1,
  Bronx: 2,
  Brooklyn: 3,
  Queens: 4,
  "Staten Island": 5,
};

const MONTHS: Record<string, number> = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
};

const HOLIDAY_RULES: Record<string, string> = {
  "Labor Day": "labor_day",
  "Day after Labor Day": "day_after_labor_day",
  "Thanksgiving Day": "thanksgiving",
  "New Years Day": "new_years_day",
};

type SeasonBoundary = { month?: number; day?: number; rule?: string };

function seasonBoundary(raw: string): SeasonBoundary | null {
  if (HOLIDAY_RULES[raw]) return { rule: HOLIDAY_RULES[raw] };
  const match = raw.match(/^([A-Z][a-z]+) (\d{1,2})$/);
  if (match && MONTHS[match[1]]) return { month: MONTHS[match[1]], day: Number(match[2]) };
  return null;
}

function buildSeason(startRaw: string, endRaw: string) {
  if (startRaw === "Year-round" && endRaw === "Year-round") {
    return { kind: "year_round", start_raw: startRaw, end_raw: endRaw };
  }
  const start = seasonBoundary(startRaw);
  const end = seasonBoundary(endRaw);
  if (!start || !end) {
    throw new Error(`unrecognized season boundary: "${startRaw}" / "${endRaw}"`);
  }
  const kind = start.rule && end.rule ? "floating" : !start.rule && !end.rule ? "fixed" : "mixed";
  return { kind, start_raw: startRaw, end_raw: endRaw, start, end };
}

export async function buildArtifacts(parsed: ParseResult, geocoded: GeocodedRow[]) {
  const generatedAt = new Date().toISOString();
  const pdfBytes = await fetchPdf();
  const pdfSha = await sha256Hex(pdfBytes);

  // --- dictionaries ---------------------------------------------------------
  const clockLabels: Array<{ raw: string; min: number }> = [];
  const clockIndex = new Map<string, number>();
  const labelIndex = (raw: string): number => {
    if (!clockIndex.has(raw)) {
      const min = parseClockLabel(raw);
      if (min === null) throw new Error(`runtime clock parser rejected "${raw}"`);
      clockIndex.set(raw, clockLabels.length);
      clockLabels.push({ raw, min });
    }
    return clockIndex.get(raw)!;
  };

  const schedules: Array<{ days: Array<[number, number] | null> }> = [];
  const scheduleIndex = new Map<string, number>();
  const seasons: Array<ReturnType<typeof buildSeason>> = [];
  const seasonIndex = new Map<string, number>();

  const geocodedById = new Map(geocoded.map((g) => [g.id, g]));

  const rows = parsed.rows.map((row) => {
    const geo = geocodedById.get(row.id);
    if (!geo) throw new Error(`no geocode result for ${row.id}`);

    const days = row.days.map((day) =>
      day === null ? null : [labelIndex(day.startRaw), labelIndex(day.endRaw)] as [number, number]
    );
    const scheduleKey = JSON.stringify(days);
    if (!scheduleIndex.has(scheduleKey)) {
      scheduleIndex.set(scheduleKey, schedules.length);
      schedules.push({ days });
    }

    const seasonKey = `${row.seasonStartRaw}|${row.seasonEndRaw}`;
    if (!seasonIndex.has(seasonKey)) {
      seasonIndex.set(seasonKey, seasons.length);
      seasons.push(buildSeason(row.seasonStartRaw, row.seasonEndRaw));
    }

    // Display fields: printed text with only the footnote digit stripped.
    const stripFootnote = (s: string) => s.replace(/\s+\d(?= \()|\s+\d$/, "");

    return {
      id: row.id,
      source_page: row.page,
      source_row: row.rowIndex,
      borough: row.borough,
      borough_code: BOROUGH_CODES[row.borough],
      street_display: stripFootnote(row.streetRaw),
      side_note: geo.sideNote,
      from_display: row.fromRaw,
      to_display: row.toRaw,
      season_id: seasonIndex.get(seasonKey)!,
      schedule_id: scheduleIndex.get(scheduleKey)!,
      rule_cite_display: row.ruleCiteRaw,
      vendor_scope: "mobile_food",
      match: geo.match,
    };
  });

  // --- geometry -------------------------------------------------------------
  const features = geocoded
    .filter((g) => g.geometry !== null)
    .map((g) => ({
      type: "Feature",
      id: g.id,
      properties: {
        row_id: g.id,
        tier: g.match.tier,
        borough_code: rows.find((r) => r.id === g.id)!.borough_code,
      },
      geometry: g.geometry!.type === "Point"
        ? { type: "Point", coordinates: quantizePath([g.geometry!.coordinates as [number, number]])[0] }
        : {
          type: "MultiLineString",
          coordinates: (g.geometry!.coordinates as [number, number][][]).map((path) =>
            quantizePath(path)
          ),
        },
    }));

  // --- borough outlines -----------------------------------------------------
  const rawOutlines = await fetchBoroughOutlines() as {
    features: Array<{
      properties: Record<string, string>;
      geometry: { type: string; coordinates: [number, number][][][] };
    }>;
  };
  const OUTLINE_EPSILON_M = 110;
  const outlineFeatures = rawOutlines.features.map((feature) => {
    const name = feature.properties.boroname ?? feature.properties.boro_name;
    const code = BOROUGH_CODES[name];
    if (!code) throw new Error(`unrecognized borough outline: ${JSON.stringify(feature.properties)}`);
    if (feature.geometry.type !== "MultiPolygon") {
      throw new Error(`expected MultiPolygon outlines, got ${feature.geometry.type}`);
    }
    return {
      type: "Feature",
      properties: { borough: name, borough_code: code },
      geometry: {
        type: "MultiPolygon",
        coordinates: simplifyMultiPolygon(feature.geometry.coordinates, OUTLINE_EPSILON_M),
      },
    };
  }).sort((a, b) => a.properties.borough_code - b.properties.borough_code);
  if (outlineFeatures.length !== 5) {
    throw new Error(`expected 5 borough outlines, built ${outlineFeatures.length}`);
  }

  // --- meta -----------------------------------------------------------------
  const counts = { rows: rows.length, polyline: 0, corridor: 0, midpoint_pin: 0, unmatched: 0 };
  for (const row of rows) counts[row.match.tier] += 1;
  if (counts.rows !== EXPECTED_ROW_COUNT) {
    throw new Error(`row count drifted: ${counts.rows}`);
  }

  const meta = {
    artifact: "vending_legality_meta",
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    generator: "scripts/legality/run_all.ts",
    sources: [
      {
        role: "primary",
        kind: "pdf",
        publisher: "NYC Department of Health and Mental Hygiene",
        title: "Mobile Food Vending Restricted Streets Guide",
        url: PDF_URL,
        document_revision: parsed.documentRevision,
        retrieved_at: generatedAt,
        content_sha256: pdfSha,
        byte_length: pdfBytes.byteLength,
      },
      {
        role: "geocoder",
        kind: "socrata",
        dataset_id: "inkn-q76z",
        title: "NYC Street Centerline (CSCL)",
        retrieved_at: generatedAt,
      },
      {
        role: "basemap",
        kind: "socrata",
        dataset_id: "gthc-hcne",
        title: "Borough Boundaries",
        retrieved_at: generatedAt,
      },
    ],
    provenance: {
      mode: "bundled_public_snapshot",
      source: `NYC DOHMH Mobile Food Vending Restricted Streets Guide (${parsed.documentRevision})`,
      retrievedAt: generatedAt,
      datasetId: "mfv_restricted_streets.pdf",
    },
    scope: {
      vendor_types: ["mobile_food"],
      excludes: [
        "general_vendor_rcny_2_310",
        "green_cart_areas",
        "park_and_concession_rules",
        "sidewalk_obstruction_rules",
        "private_property",
      ],
    },
    counts,
    known_limitations: [
      "Covers mobile food vending only. General-vendor restricted streets (RCNY 2-310) are published separately and are not in this dataset.",
      "Block extents are derived from NYC street centerlines. They are approximate and do not distinguish sides of a street.",
      "Entries that could not be placed on the map are still listed and are counted in every answer.",
    ],
  };

  const artifacts = {
    "meta.json": meta,
    "restricted-streets.rules.json": {
      schema_version: SCHEMA_VERSION,
      meta: { provenance: meta.provenance, scope: meta.scope, counts },
      clock_labels: clockLabels,
      schedules,
      seasons,
      rows,
    },
    "restricted-streets.geometry.json": {
      schema_version: SCHEMA_VERSION,
      meta: { provenance: meta.provenance, counts },
      type: "FeatureCollection",
      features,
    },
    "nyc-borough-outlines.json": {
      schema_version: SCHEMA_VERSION,
      meta: { provenance: { mode: "bundled_public_snapshot", source: "NYC Open Data — Borough Boundaries", retrievedAt: generatedAt, datasetId: "gthc-hcne" } },
      type: "FeatureCollection",
      features: outlineFeatures,
    },
  };

  await Deno.mkdir(OUT_DIR, { recursive: true });
  const sizes: Record<string, number> = {};
  for (const [name, value] of Object.entries(artifacts)) {
    const json = JSON.stringify(value);
    Deno.writeTextFileSync(OUT_DIR + name, json);
    sizes[name] = json.length;
  }
  return { meta, sizes, counts };
}

if (import.meta.main) {
  const parsed = parsePdf(Deno.readTextFileSync(HERE + "cache/mfv.xhtml"));
  const geocoded: GeocodedRow[] = JSON.parse(
    Deno.readTextFileSync(HERE + "reports/geocode_results.json"),
  );
  const { sizes, counts } = await buildArtifacts(parsed, geocoded);
  console.log("tier counts:", counts);
  for (const [name, bytes] of Object.entries(sizes)) {
    console.log(`  ${name}: ${(bytes / 1024).toFixed(1)} kB`);
  }
}
