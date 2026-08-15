# Legality ETL — restricted-streets snapshot

Build-time pipeline that turns the NYC DOHMH **Mobile Food Vending Restricted
Streets Guide** (a PDF — no machine-readable version exists on NYC Open Data)
into the committed artifacts under `src/data/vending-legality/`.

## Run

```sh
npm run data:legality
```

Add `--refresh` (after `--`) to refetch sources instead of using `cache/`.

Requirements:

- **Deno** (also used by CI for `base44/functions` type checks)
- **pdftotext** from poppler (`brew install poppler`) — dev-machine dependency
  only; CI never re-runs the ETL
- Optional `NYC_OPEN_DATA_APP_TOKEN` env var for Socrata rate-limit relief

## Pipeline

| Stage | File | What it does |
|---|---|---|
| Fetch | `fetch_sources.ts` | PDF (browser UA — nyc.gov 403s bare curl), CSCL centerline rows per street label, borough outlines. Cached under `cache/` (gitignored). One attempt, 9s timeout, no retries — failures abort. |
| Parse | `parse_pdf.ts` | `pdftotext -bbox-layout` → per-page column bands from sub-header word geometry → exactly 190 rows or a hard failure. Never emits a partial artifact. |
| Normalize | `normalize_names.ts` + `street_aliases.json` | Printed name → ordered CSCL label candidates (CSCL abbreviates inconsistently). Everything rules can't reach goes through the committed, human-reviewed alias table. **Never fuzzy-matches.** |
| Geocode | `geocode.ts` | CSCL shares intersection nodes exactly, so: intersection = endpoint-set ∩ node-set; block range = BFS over the street's own segment graph. Tier ladder: `polyline` → `corridor` → `midpoint_pin` → `unmatched` (disclosed, list-only). |
| Simplify | `simplify.ts` | Douglas-Peucker (meters) for borough outlines + 5-decimal quantization. |
| Emit | `build_artifacts.ts` | The four artifacts + provenance/scope/counts. Re-parses every clock label through the RUNTIME parser (`src/lib/legality/clock.js`) and aborts on any disagreement — the ETL↔runtime drift guard. |

`run_all.ts` orchestrates all of it and writes `reports/coverage.json` — the
audit trail and the work queue for growing `street_aliases.json`.

## Honesty rules (do not weaken)

- `*_display` fields carry the printed text verbatim; every rewrite used for
  geocoding is disclosed in `match.alias_used`.
- The dataset covers **mobile food vending only** (`meta.scope`); the
  general-vendor list (RCNY §2-310) is separate and was never machine-readable.
- Unmatched rows stay in the rules artifact and are counted in every runtime
  answer. Coverage is the tunable; honesty is not.
- If the city republishes the PDF and anything shifts, the parser fails loudly
  rather than emitting plausible-but-wrong geometry. Review, fix, re-run.
