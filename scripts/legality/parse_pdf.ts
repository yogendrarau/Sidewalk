/**
 * Deterministic parser for the DOHMH "Mobile Food Vending Restricted Streets
 * Guide" PDF (EHS334503E). Consumes `pdftotext -bbox-layout` XHTML and emits
 * one RawRow per printed table row.
 *
 * Design notes:
 * - The document is a two-page landscape spread; page 2's table is shifted
 *   ~379pt right. Column bands are therefore derived PER PAGE from the
 *   sub-header word positions ("Street", "From", "To", "Start", "End",
 *   7x "From"/"To"), never hardcoded.
 * - Words are assigned to the band containing their x-center, so tokens are
 *   never sliced and page furniture (map captions, the 311 blurb) cannot
 *   bleed into rows: a row only counts as data if its borough-band text is a
 *   real borough name.
 * - Every violated expectation throws. This ETL must fail loudly if the city
 *   republishes the PDF with a different layout — a plausible-but-wrong
 *   legality artifact is worse than no artifact.
 */

export type Word = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
};

export type RawDayCell = { startRaw: string; endRaw: string } | null;

export type RawRow = {
  id: string; // "mfv-0001", assigned in document order
  page: number;
  rowIndex: number; // 1-based within page
  borough: string;
  streetRaw: string;
  fromRaw: string;
  toRaw: string;
  seasonStartRaw: string;
  seasonEndRaw: string;
  /** Sunday..Saturday */
  days: RawDayCell[];
  ruleCiteRaw: string;
};

export type ParseResult = {
  rows: RawRow[];
  documentRevision: string | null;
  pageCount: number;
};

const BOROUGHS = new Set([
  "Manhattan",
  "Brooklyn",
  "Queens",
  "Bronx",
  "Staten Island",
]);

export const EXPECTED_ROW_COUNT = 190;

const TIME_TOKEN = /^\d{1,2}(?::\d{2})? [ap]\.m\.$/;

const WORD_RE =
  /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (m) => XML_ENTITIES[m]);
}

function pageWords(pageXhtml: string): Word[] {
  const words: Word[] = [];
  for (const m of pageXhtml.matchAll(WORD_RE)) {
    words.push({
      x0: Number(m[1]),
      y0: Number(m[2]),
      x1: Number(m[3]),
      y1: Number(m[4]),
      text: decodeEntities(m[5]),
    });
  }
  return words;
}

function xCenter(w: Word): number {
  return (w.x0 + w.x1) / 2;
}

function yCenter(w: Word): number {
  return (w.y0 + w.y1) / 2;
}

/**
 * The 17 column anchors, in left-to-right order:
 * borough, street, from, to, seasonStart, seasonEnd,
 * sunFrom, sunTo, monFrom, monTo, ... satFrom, satTo, rule.
 */
type ColumnKey =
  | "borough"
  | "street"
  | "from"
  | "to"
  | "seasonStart"
  | "seasonEnd"
  | `day${number}From`
  | `day${number}To`
  | "rule";

type Band = { key: ColumnKey; from: number; to: number };

type PageLayout = {
  bands: Band[];
  /**
   * Right edge of the table (the "Relevant Code Section" header's end plus a
   * margin). The landscape sheet carries zone-map captions and a 311 blurb to
   * the RIGHT of the table at the same y as data rows; anything starting
   * beyond this edge is page furniture, not cell content.
   */
  tableRightEdge: number;
  /**
   * Left edges (x0) of the left-aligned TEXT columns (street, from, to, rule).
   * Values in these columns start at the column edge within ~0.2pt, so a word
   * starting here always begins a new cell — even when the previous cell's
   * text runs long enough to close the inter-column gap (e.g. Brooklyn's
   * "Surf Avenue (both sides of the boardwalk)" ends 3.45pt before its From
   * cell). Time/season columns are center-aligned and never spill.
   */
  splitEdges: number[];
};

function deriveBands(words: Word[], page: number): PageLayout {
  // Sub-header line sits near y=47; the "Borough" and "Relevant Code Section"
  // headers sit near y=40. Locate by text + zone, never by absolute x.
  const headerZone = words.filter((w) => w.y0 > 30 && w.y0 < 56);
  const find = (text: string, all = false): Word[] => {
    const hits = headerZone.filter((w) => w.text === text);
    if (!all && hits.length !== 1) {
      throw new Error(
        `page ${page}: expected exactly one header word "${text}", found ${hits.length}`,
      );
    }
    return hits;
  };

  const borough = find("Borough")[0];
  const section = find("Section")[0];
  const street = find("Street", true).filter((w) => w.y0 > 44); // sub-header row, not "Restricted Street"
  if (street.length !== 1) {
    throw new Error(`page ${page}: ambiguous "Street" sub-header`);
  }
  const start = find("Start")[0];
  const end = find("End")[0];
  const relevant = find("Relevant")[0];
  const froms = find("From", true).sort((a, b) => a.x0 - b.x0);
  const tos = find("To", true).sort((a, b) => a.x0 - b.x0);
  if (froms.length !== 8 || tos.length !== 8) {
    throw new Error(
      `page ${page}: expected 8 "From" and 8 "To" sub-headers, found ${froms.length}/${tos.length}`,
    );
  }

  const anchors: Array<{ key: ColumnKey; x: number }> = [
    { key: "borough", x: xCenter(borough) },
    { key: "street", x: xCenter(street[0]) },
    { key: "from", x: xCenter(froms[0]) },
    { key: "to", x: xCenter(tos[0]) },
    { key: "seasonStart", x: xCenter(start) },
    { key: "seasonEnd", x: xCenter(end) },
  ];
  for (let d = 0; d < 7; d++) {
    anchors.push({ key: `day${d}From`, x: xCenter(froms[d + 1]) });
    anchors.push({ key: `day${d}To`, x: xCenter(tos[d + 1]) });
  }
  anchors.push({ key: "rule", x: xCenter(relevant) });

  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].x <= anchors[i - 1].x) {
      throw new Error(`page ${page}: column anchors out of order at index ${i}`);
    }
  }

  const tableRightEdge = section.x1 + 30;
  const bands: Band[] = anchors.map((anchor, i) => ({
    key: anchor.key,
    from: i === 0 ? 0 : (anchors[i - 1].x + anchor.x) / 2,
    to: i === anchors.length - 1 ? tableRightEdge : (anchor.x + anchors[i + 1].x) / 2,
  }));
  const splitEdges = [street[0].x0, froms[0].x0, tos[0].x0, relevant.x0];
  return { bands, tableRightEdge, splitEdges };
}

/** Cluster words into visual rows by y-center (row pitch is 7.92pt). */
function clusterRows(words: Word[]): Word[][] {
  const sorted = [...words].sort((a, b) => yCenter(a) - yCenter(b));
  const rows: Word[][] = [];
  let current: Word[] = [];
  let currentY = Number.NEGATIVE_INFINITY;
  for (const w of sorted) {
    const y = yCenter(w);
    if (y - currentY > 3) {
      if (current.length > 0) rows.push(current);
      current = [];
    }
    current.push(w);
    currentY = y;
  }
  if (current.length > 0) rows.push(current);
  return rows.map((row) => row.sort((a, b) => a.x0 - b.x0));
}

/**
 * Cell values are left-aligned in their columns, and words within one cell sit
 * ~2pt apart while adjacent columns are 16pt+ apart. So: cluster a row's words
 * into gap-runs, then assign each ENTIRE run to the band containing its first
 * word's x-center. This keeps a long value like "Columbus Avenue (east side)"
 * in the street cell instead of letting its tail spill across the midpoint
 * boundary into the next column.
 */
const INTRA_CELL_GAP_PT = 6;
const COLUMN_EDGE_TOLERANCE_PT = 1.5;

function assignCells(
  row: Word[],
  layout: PageLayout,
  context: string,
): Map<ColumnKey, string> {
  const runs: Word[][] = [];
  let current: Word[] = [];
  for (const w of row) {
    const gapSplit = current.length > 0 &&
      w.x0 - current[current.length - 1].x1 > INTRA_CELL_GAP_PT;
    const edgeSplit = current.length > 0 &&
      layout.splitEdges.some((edge) => Math.abs(w.x0 - edge) <= COLUMN_EDGE_TOLERANCE_PT);
    if (gapSplit || edgeSplit) {
      runs.push(current);
      current = [];
    }
    current.push(w);
  }
  if (current.length > 0) runs.push(current);

  const cells = new Map<ColumnKey, string>();
  for (const run of runs) {
    const first = run[0];
    if (first.x0 >= layout.tableRightEdge) {
      // Page-margin furniture (zone-map captions, the 311 blurb). Only ever
      // legitimate to the RIGHT of the table; anything else must fail loudly.
      continue;
    }
    const x = xCenter(first);
    const band = layout.bands.find((b) => x >= b.from && x < b.to);
    if (!band) {
      throw new Error(
        `${context}: word run "${run.map((w) => w.text).join(" ")}" fits no column band`,
      );
    }
    const text = run.map((w) => w.text).join(" ");
    cells.set(band.key, cells.has(band.key) ? `${cells.get(band.key)} ${text}` : text);
  }
  return cells;
}

function cellText(cells: Map<ColumnKey, string>, key: ColumnKey): string {
  return (cells.get(key) ?? "").trim();
}

function parseDayCell(
  cells: Map<ColumnKey, string>,
  day: number,
  context: string,
): RawDayCell {
  const startRaw = cellText(cells, `day${day}From`);
  const endRaw = cellText(cells, `day${day}To`);
  if (startRaw === "" && endRaw === "") return null;
  if (startRaw === "" || endRaw === "") {
    throw new Error(
      `${context}: day ${day} has a start or end but not both ("${startRaw}" / "${endRaw}")`,
    );
  }
  for (const value of [startRaw, endRaw]) {
    if (!TIME_TOKEN.test(value)) {
      throw new Error(`${context}: unrecognized time token "${value}"`);
    }
  }
  return { startRaw, endRaw };
}

export function parsePdf(xhtml: string): ParseResult {
  const pages = xhtml.split("<page ").slice(1);
  if (pages.length !== 2) {
    throw new Error(`expected a 2-page document, found ${pages.length} pages`);
  }

  const rows: RawRow[] = [];
  let documentRevision: string | null = null;

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pi + 1;
    const words = pageWords(pages[pi]);
    const layout = deriveBands(words, page);
    const body = words.filter((w) => w.y0 >= 52);
    let rowIndex = 0;

    for (const rowWords of clusterRows(body)) {
      const cells = assignCells(rowWords, layout, `page ${page}`);
      const borough = cellText(cells, "borough");
      if (!BOROUGHS.has(borough)) {
        // Furniture: title, zone-map captions, the 311 blurb, revision code.
        const joined = rowWords.map((w) => w.text).join(" ");
        const revision = joined.match(/EHS\d+\w*(?:\s*[–-]\s*[\d.]+)?/);
        if (revision) documentRevision = revision[0];
        continue;
      }
      rowIndex += 1;
      const id = `mfv-${String(rows.length + 1).padStart(4, "0")}`;
      const context = `${id} (page ${page} row ${rowIndex})`;

      const row: RawRow = {
        id,
        page,
        rowIndex,
        borough,
        streetRaw: cellText(cells, "street"),
        fromRaw: cellText(cells, "from"),
        toRaw: cellText(cells, "to"),
        seasonStartRaw: cellText(cells, "seasonStart"),
        seasonEndRaw: cellText(cells, "seasonEnd"),
        days: [0, 1, 2, 3, 4, 5, 6].map((d) => parseDayCell(cells, d, context)),
        ruleCiteRaw: cellText(cells, "rule"),
      };

      for (
        const [field, value] of [
          ["street", row.streetRaw],
          ["from", row.fromRaw],
          ["to", row.toRaw],
          ["season start", row.seasonStartRaw],
          ["season end", row.seasonEndRaw],
          ["rule cite", row.ruleCiteRaw],
        ] as const
      ) {
        if (value === "") {
          throw new Error(`${context}: empty ${field} cell`);
        }
      }
      rows.push(row);
    }
  }

  if (rows.length !== EXPECTED_ROW_COUNT) {
    throw new Error(
      `expected exactly ${EXPECTED_ROW_COUNT} data rows, parsed ${rows.length} — ` +
        `the source PDF layout may have changed; review before regenerating artifacts`,
    );
  }

  return { rows, documentRevision, pageCount: pages.length };
}

if (import.meta.main) {
  const path = Deno.args[0] ??
    new URL("./cache/mfv.xhtml", import.meta.url).pathname;
  const result = parsePdf(Deno.readTextFileSync(path));
  const byBorough = new Map<string, number>();
  for (const row of result.rows) {
    byBorough.set(row.borough, (byBorough.get(row.borough) ?? 0) + 1);
  }
  console.log(`rows: ${result.rows.length}`);
  console.log(`revision: ${result.documentRevision}`);
  for (const [b, n] of byBorough) console.log(`  ${b}: ${n}`);
  console.log("sample first row:", JSON.stringify(result.rows[0], null, 2));
  console.log(
    "sample seasonal row:",
    JSON.stringify(
      result.rows.find((r) => r.seasonStartRaw !== "Year-round"),
      null,
      2,
    ),
  );
}
