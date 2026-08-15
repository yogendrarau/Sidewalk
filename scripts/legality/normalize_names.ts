/**
 * Street-name normalization: printed PDF text -> CSCL stname_label candidates.
 *
 * CSCL's labels are internally inconsistent ("AVE Z" but "BRIGHTON BEACH
 * AVENUE"; "W END AVE" but "WEST ST"; "FLATBUSH AVE EXTENSION"), so a single
 * canonical rewrite cannot work. Instead each printed name yields an ORDERED
 * list of deterministic variants (direction x suffix-abbreviation combos),
 * tried against CSCL until one returns rows. Exactly one variant exists per
 * real street, so first-hit is unambiguous.
 *
 * Anything rules cannot reach goes through the committed, human-reviewed
 * street_aliases.json. NEVER fuzzy-match — an unmatched row is reported and
 * stays list-only, which is the honest failure mode for a legality dataset.
 * Printed text is preserved verbatim in the artifacts; candidates exist only
 * to query CSCL.
 */

export type AliasEntry = {
  borough_code: number;
  printed: string;
  cscl_label: string;
  reason: "source_typo" | "informal_name" | "abbreviation" | "contextual_terminus" | "renamed";
  note?: string;
  reviewed_at?: string;
};

export type AliasTable = { schema_version: number; entries: AliasEntry[] };

export type NameCandidate = { label: string; via: "rule" | "alias" };

export type NormalizedName = {
  /** printed text, footnote digit stripped, parenthetical kept */
  displayName: string;
  /** parenthetical content, e.g. "east side only", or null */
  sideNote: string | null;
  /** ordered CSCL label candidates; tried in order until one returns rows */
  candidates: NameCandidate[];
};

const SPELLED_NUMBERS: Record<string, string> = {
  FIRST: "1",
  SECOND: "2",
  THIRD: "3",
  FOURTH: "4",
  FIFTH: "5",
  SIXTH: "6",
  SEVENTH: "7",
  EIGHTH: "8",
  NINTH: "9",
  TENTH: "10",
  ELEVENTH: "11",
  TWELFTH: "12",
};

const SUFFIXES: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  PLACE: "PL",
  PARKWAY: "PKWY",
  EXPRESSWAY: "EXPY",
  PLAZA: "PLZ",
  SQUARE: "SQ",
  LANE: "LN",
  TERRACE: "TER",
  ROAD: "RD",
  DRIVE: "DR",
  COURT: "CT",
  CONCOURSE: "CONC",
  HIGHWAY: "HWY",
  EXTENSION: "EXT",
};

function extractSideNote(raw: string): { name: string; sideNote: string | null } {
  const match = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!match) return { name: raw.trim(), sideNote: null };
  return { name: match[1].trim(), sideNote: match[2].trim() };
}

/** Strip a trailing bare footnote digit ("Broadway 2" -> "Broadway"). */
function stripFootnote(raw: string): string {
  return raw.replace(/\s+\d$/, "").trim();
}

function abbreviateWords(words: string[], which: "all" | "final" | "mid"): string[] {
  return words.map((word, i) => {
    const abbr = SUFFIXES[word];
    if (!abbr) return word;
    const isFinal = i === words.length - 1;
    if (which === "all") return abbr;
    if (which === "final") return isFinal ? abbr : word;
    return isFinal ? word : abbr; // "mid": all but the final word
  });
}

/** Deterministic ordered variants for one printed name. */
function ruleVariants(name: string, sideNote: string | null): string[] {
  let base = name.toUpperCase();

  // Ordinal suffixes: 53RD -> 53.
  base = base.replace(/\b(\d+)(?:ST|ND|RD|TH)\b/g, "$1");
  // Spelled ordinals anywhere: EIGHTH -> 8, WEST FIFTH -> WEST 5.
  base = base.replace(/\b[A-Z]+\b/g, (word) => SPELLED_NUMBERS[word] ?? word);
  base = base.replace(/\s+/g, " ").trim();

  // "(East)"/"(West)" parentheticals on numbered streets mean the E/W half.
  const sideDir = sideNote?.toUpperCase() === "EAST"
    ? "E"
    : sideNote?.toUpperCase() === "WEST"
    ? "W"
    : null;
  let oppositeHalf: string | null = null;
  if (sideDir && /^\d/.test(base)) {
    // A printed range on "(West)" can still start at a cross street east of
    // 5th Avenue (e.g. "14th Street (West), from Broadway"), so the opposite
    // half is offered as a trailing candidate; the resolver merges both
    // halves exactly like bare-number streets.
    oppositeHalf = `${sideDir === "W" ? "E" : "W"} ${base}`;
    base = `${sideDir} ${base}`;
  }

  // CSCL abbreviates a leading direction word on some streets (W END AVE,
  // W BROADWAY) and not others (WEST ST) — emit both forms.
  const directionVariants = [base];
  const dirMatch = base.match(/^(EAST|WEST|NORTH|SOUTH) (.+)$/);
  if (dirMatch) directionVariants.unshift(`${dirMatch[1][0]} ${dirMatch[2]}`);

  const variants: string[] = [];
  for (const variant of directionVariants) {
    const words = variant.split(" ");
    for (const which of ["all", "final", "mid"] as const) {
      variants.push(abbreviateWords(words, which).join(" "));
    }
    variants.push(variant); // unabbreviated (BRIGHTON BEACH AVENUE)
  }
  if (oppositeHalf) {
    variants.push(abbreviateWords(oppositeHalf.split(" "), "all").join(" "));
  }
  return [...new Set(variants)];
}

export function normalizeStreetName(
  raw: string,
  boroughCode: number,
  aliases: AliasTable,
): NormalizedName {
  const { name: nameWithFootnote, sideNote } = extractSideNote(raw.trim());
  const name = stripFootnote(nameWithFootnote);
  const displayName = sideNote === null ? name : `${name} (${sideNote})`;

  const candidates: NameCandidate[] = [];
  const seen = new Set<string>();
  const push = (label: string, via: NameCandidate["via"]) => {
    if (label && !seen.has(label)) {
      seen.add(label);
      candidates.push({ label, via });
    }
  };

  // Aliases first: they encode a human's judgment that the printed text does
  // not resolve by rule (source typos, informal names). All alias hits merge.
  for (const entry of aliases.entries) {
    if (
      entry.borough_code === boroughCode &&
      (entry.printed === displayName || entry.printed === name)
    ) {
      push(entry.cscl_label, "alias");
    }
  }

  for (const label of ruleVariants(name, sideNote)) push(label, "rule");

  // Manhattan's numbered cross streets exist in CSCL only as their E/W
  // halves; a bare "32 ST" must try both.
  const bare = candidates.find((c) => c.via === "rule" && /^\d+ ST$/.test(c.label));
  if (boroughCode === 1 && bare) {
    push(`W ${bare.label}`, "rule");
    push(`E ${bare.label}`, "rule");
  }

  return { displayName, sideNote, candidates };
}
