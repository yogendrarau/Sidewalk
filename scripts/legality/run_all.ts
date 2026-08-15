/**
 * Legality ETL orchestrator: fetch -> parse -> geocode -> artifacts + report.
 *
 * Run via: npm run data:legality
 * Requires: pdftotext (poppler) on PATH. All network fetches cache under
 * cache/ (gitignored); pass --refresh to refetch sources.
 *
 * The committed outputs are the four artifacts under src/data/vending-legality/
 * and reports/coverage.json (the audit trail + alias-table work queue).
 */

import { parsePdf } from "./parse_pdf.ts";
import { geocodeRow, type GeocodedRow } from "./geocode.ts";
import type { AliasTable } from "./normalize_names.ts";
import { fetchPdf } from "./fetch_sources.ts";
import { buildArtifacts } from "./build_artifacts.ts";

const HERE = new URL(".", import.meta.url).pathname;
const refresh = Deno.args.includes("--refresh");

// 1. Source PDF -> bbox XHTML (deterministic pdftotext layout extraction).
await fetchPdf(refresh);
const pdfPath = HERE + "cache/mfv_restricted_streets.pdf";
const xhtmlPath = HERE + "cache/mfv.xhtml";
const pdftotext = new Deno.Command("pdftotext", {
  args: ["-bbox-layout", pdfPath, xhtmlPath],
});
const { code, stderr } = await pdftotext.output();
if (code !== 0) {
  throw new Error(`pdftotext failed: ${new TextDecoder().decode(stderr)}`);
}

// 2. Parse (hard-asserts 190 rows and clean cells).
const parsed = parsePdf(Deno.readTextFileSync(xhtmlPath));
console.log(`parsed ${parsed.rows.length} rows, revision ${parsed.documentRevision}`);

// 3. Geocode against CSCL (cached per street label).
const aliases: AliasTable = JSON.parse(Deno.readTextFileSync(HERE + "street_aliases.json"));
const geocoded: GeocodedRow[] = [];
for (const row of parsed.rows) {
  geocoded.push(await geocodeRow(row, aliases));
}
Deno.writeTextFileSync(HERE + "reports/geocode_results.json", JSON.stringify(geocoded));

// 4. Artifacts + coverage report.
const { sizes, counts } = await buildArtifacts(parsed, geocoded);

const byBorough: Record<string, Record<string, number>> = {};
const workQueue: Array<Record<string, string | null>> = [];
for (let i = 0; i < parsed.rows.length; i++) {
  const row = parsed.rows[i];
  const match = geocoded[i].match;
  byBorough[row.borough] ??= { polyline: 0, corridor: 0, midpoint_pin: 0, unmatched: 0 };
  byBorough[row.borough][match.tier] += 1;
  if (match.tier !== "polyline") {
    workQueue.push({
      id: row.id,
      tier: match.tier,
      borough: row.borough,
      street: row.streetRaw,
      street_label: match.street_label,
      from: row.fromRaw,
      from_label: match.from_label,
      to: row.toRaw,
      to_label: match.to_label,
      note: match.note,
    });
  }
}

const coverage = {
  generated_at: new Date().toISOString(),
  document_revision: parsed.documentRevision,
  counts,
  by_borough: byBorough,
  artifact_bytes: sizes,
  non_polyline_rows: workQueue,
};
Deno.writeTextFileSync(HERE + "reports/coverage.json", JSON.stringify(coverage, null, 2));

console.log("tier counts:", counts);
for (const [borough, tiers] of Object.entries(byBorough)) console.log(" ", borough, tiers);
for (const [name, bytes] of Object.entries(sizes)) {
  console.log(`  ${name}: ${(bytes / 1024).toFixed(1)} kB`);
}
console.log(`non-polyline rows: ${workQueue.length} (see reports/coverage.json)`);
