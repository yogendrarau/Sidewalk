/**
 * Geocode all 190 rows and print the coverage report. The "unmatched rows"
 * section is the work queue for street_aliases.json.
 *
 * Run: deno run --allow-net=data.cityofnewyork.us --allow-read --allow-write scripts/legality/run_coverage.ts
 */

import { parsePdf } from "./parse_pdf.ts";
import { geocodeRow, type GeocodedRow } from "./geocode.ts";
import type { AliasTable } from "./normalize_names.ts";

const HERE = new URL(".", import.meta.url).pathname;
const xhtml = Deno.readTextFileSync(HERE + "cache/mfv.xhtml");
const aliases: AliasTable = JSON.parse(Deno.readTextFileSync(HERE + "street_aliases.json"));

const { rows } = parsePdf(xhtml);
const results: GeocodedRow[] = [];
for (const row of rows) {
  results.push(await geocodeRow(row, aliases));
}

const tiers = { polyline: 0, corridor: 0, midpoint_pin: 0, unmatched: 0 };
const byBorough = new Map<string, Record<string, number>>();
for (let i = 0; i < rows.length; i++) {
  const tier = results[i].match.tier;
  tiers[tier] += 1;
  const b = byBorough.get(rows[i].borough) ?? { polyline: 0, corridor: 0, midpoint_pin: 0, unmatched: 0 };
  b[tier] += 1;
  byBorough.set(rows[i].borough, b);
}

console.log("tier counts:", tiers);
for (const [borough, counts] of byBorough) console.log(" ", borough, counts);

console.log("\nnon-polyline rows (work queue):");
for (let i = 0; i < rows.length; i++) {
  const r = results[i];
  if (r.match.tier === "polyline") continue;
  const row = rows[i];
  console.log(
    `  ${row.id} ${r.match.tier.padEnd(12)} ${row.borough.padEnd(9)} ` +
      `"${row.streetRaw}" [${r.match.street_label}] ` +
      `from "${row.fromRaw}" [${r.match.from_label}] to "${row.toRaw}" [${r.match.to_label}]` +
      (r.match.note ? ` — ${r.match.note}` : ""),
  );
}

Deno.writeTextFileSync(HERE + "reports/geocode_results.json", JSON.stringify(results));
console.log("\nwrote reports/geocode_results.json");
