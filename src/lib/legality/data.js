/**
 * Loader for the bundled vending-legality snapshot.
 *
 * The artifacts are dynamic-imported so they ship as their own chunks and
 * cost the main bundle nothing until the street-rules surface opens. The
 * loader memoizes a single in-flight promise and runs a shape guard — a
 * half-loaded legality dataset must never render, so guard failures reject.
 */

/** @typedef {import("./status.js").Schedule} Schedule */
/** @typedef {import("./season.js").Season} Season */

/**
 * @typedef {Object} LegalityRow
 * @property {string} id
 * @property {string} borough
 * @property {number} borough_code
 * @property {string} street_display
 * @property {string | null} side_note
 * @property {string} from_display
 * @property {string} to_display
 * @property {number} season_id
 * @property {number} schedule_id
 * @property {string} rule_cite_display
 * @property {string} vendor_scope
 * @property {{tier: string, method: string, alias_used: string[]}} match
 */

/**
 * @typedef {Object} LegalityData
 * @property {any} meta
 * @property {LegalityRow[]} rows
 * @property {Array<{raw: string, min: number}>} clockLabels
 * @property {Schedule[]} schedules hydrated: days as {startRaw, endRaw} | null
 * @property {Season[]} seasons
 * @property {any} geometry GeoJSON FeatureCollection
 * @property {Map<string, any>} featuresByRowId
 * @property {any} outlines GeoJSON FeatureCollection (borough polygons)
 * @property {number} unmappedRowCount
 */

/** @type {Promise<LegalityData> | null} */
let loadPromise = null;

/** @returns {Promise<LegalityData>} */
export function loadLegalityData() {
  if (!loadPromise) {
    loadPromise = importAndValidate().catch((error) => {
      loadPromise = null; // allow a retry after a transient chunk-load failure
      throw error;
    });
  }
  return loadPromise;
}

export function isLegalityDataLoaded() {
  return loadPromise !== null;
}

async function importAndValidate() {
  const [metaModule, rulesModule, geometryModule, outlinesModule] = await Promise.all([
    import("../../data/vending-legality/meta.json"),
    import("../../data/vending-legality/restricted-streets.rules.json"),
    import("../../data/vending-legality/restricted-streets.geometry.json"),
    import("../../data/vending-legality/nyc-borough-outlines.json"),
  ]);
  const meta = metaModule.default;
  const rules = rulesModule.default;
  const geometry = geometryModule.default;
  const outlines = outlinesModule.default;

  if (rules.schema_version !== 1 || meta.schema_version !== 1) {
    throw new Error("legality_data_schema_mismatch");
  }
  if (!Array.isArray(rules.rows) || rules.rows.length !== meta.counts.rows) {
    throw new Error("legality_data_row_count_mismatch");
  }
  if (!Array.isArray(geometry.features)) {
    throw new Error("legality_data_geometry_invalid");
  }

  // Hydrate compact [startIdx, endIdx] day entries into the shape the status
  // engine consumes, re-reading every label through the runtime parser's
  // vocabulary (indexes into clock_labels).
  const clockLabels = rules.clock_labels;
  /** @type {Schedule[]} */
  const schedules = rules.schedules.map((schedule) => ({
    days: schedule.days.map((day) =>
      day === null ? null : {
        startRaw: clockLabels[day[0]].raw,
        endRaw: clockLabels[day[1]].raw,
      }
    ),
  }));

  const featuresByRowId = new Map();
  for (const feature of geometry.features) {
    featuresByRowId.set(feature.properties.row_id, feature);
  }

  const unmappedRowCount = rules.rows.filter((row) => row.match.tier === "unmatched").length;

  return {
    meta,
    rows: rules.rows,
    clockLabels,
    schedules,
    seasons: rules.seasons,
    geometry,
    featuresByRowId,
    outlines,
    unmappedRowCount,
  };
}

/**
 * @param {LegalityData} data
 * @param {LegalityRow} row
 * @returns {Schedule}
 */
export function rowSchedule(data, row) {
  return data.schedules[row.schedule_id];
}

/**
 * @param {LegalityData} data
 * @param {LegalityRow} row
 * @returns {Season}
 */
export function rowSeason(data, row) {
  return data.seasons[row.season_id];
}
