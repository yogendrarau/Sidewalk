/**
 * Geocode restricted-street rows against the NYC CSCL centerline.
 *
 * CSCL splits every street at every intersection and shares node coordinates
 * EXACTLY between crossing streets (verified to 6 decimal places), so:
 *   intersection(street, cross) = endpointNodes(street) ∩ allNodes(cross)
 * and the block range between two intersections is a BFS walk over the
 * street's own segment graph. No chord projection, no distance thresholds.
 *
 * Degradation ladder (every step is recorded and disclosed downstream):
 *   A "polyline"      both intersections found, BFS path exists
 *   B "corridor"      both found, street graph disconnected -> chord corridor
 *   C "midpoint_pin"  exactly one intersection found -> point
 *   D "unmatched"     street or both crosses unresolved -> no geometry
 */

import { type CsclSegment, fetchCsclStreet } from "./fetch_sources.ts";
import { type AliasTable, type NormalizedName, normalizeStreetName } from "./normalize_names.ts";
import type { RawRow } from "./parse_pdf.ts";
// The ETL deliberately imports the RUNTIME distance module so build-time and
// render-time geometry can never drift apart.
import { metersBetween, pointToSegmentMeters } from "../../src/lib/legality/geo.js";

const BOROUGH_CODES: Record<string, number> = {
  Manhattan: 1,
  Bronx: 2,
  Brooklyn: 3,
  Queens: 4,
  "Staten Island": 5,
};

/** Roadway types allowed for the restricted street itself. */
const STREET_RW_TYPES = new Set(["1", "2", "5"]); // street, highway, boardwalk

type Part = {
  physicalId: string;
  coords: [number, number][];
  a: string; // node key of first coord
  b: string; // node key of last coord
};

export type MatchTier = "polyline" | "corridor" | "midpoint_pin" | "unmatched";

export type Match = {
  tier: MatchTier;
  method: string;
  street_label: string | null;
  from_label: string | null;
  to_label: string | null;
  physical_ids: string[];
  alias_used: string[];
  note: string | null;
};

export type GeocodedRow = {
  id: string;
  sideNote: string | null;
  match: Match;
  /** GeoJSON geometry or null for unmatched */
  geometry:
    | { type: "MultiLineString"; coordinates: [number, number][][] }
    | { type: "Point"; coordinates: [number, number] }
    | null;
};

function nodeKey(coord: [number, number]): string {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

function keyToPoint(key: string): { lng: number; lat: number } {
  const [lng, lat] = key.split(",").map(Number);
  return { lng, lat };
}

function toParts(segments: CsclSegment[], streetOnly: boolean): Part[] {
  const parts: Part[] = [];
  for (const segment of segments) {
    if (streetOnly && !STREET_RW_TYPES.has(segment.rw_type)) continue;
    const geom = segment.the_geom;
    if (!geom || geom.type !== "MultiLineString") continue;
    for (const coords of geom.coordinates) {
      if (coords.length < 2) continue;
      parts.push({
        physicalId: segment.physicalid,
        coords: coords as [number, number][],
        a: nodeKey(coords[0] as [number, number]),
        b: nodeKey(coords[coords.length - 1] as [number, number]),
      });
    }
  }
  return parts;
}

function allNodes(parts: Part[]): Set<string> {
  const nodes = new Set<string>();
  for (const part of parts) {
    for (const coord of part.coords) nodes.add(nodeKey(coord));
  }
  return nodes;
}

function endpointNodes(parts: Part[]): Set<string> {
  const nodes = new Set<string>();
  for (const part of parts) {
    nodes.add(part.a);
    nodes.add(part.b);
  }
  return nodes;
}

/**
 * Resolve one printed name to CSCL parts, trying candidates in order.
 * Returns the winning label so the match record can disclose it.
 */
async function resolveParts(
  normalized: NormalizedName,
  boroughCode: number,
  streetOnly: boolean,
): Promise<{ label: string | null; parts: Part[]; aliasUsed: string | null }> {
  const merged: Part[] = [];
  const wonLabels: string[] = [];
  const aliasLabels: string[] = [];
  let ruleResolved = false;
  for (const candidate of normalized.candidates) {
    // Every alias hit merges (a printed name may map to several CSCL labels,
    // e.g. "Boardwalk" -> BOARDWALK W + BOARDWALK E). Rule candidates stop at
    // the first hit — except Manhattan bare-number streets, whose W and E
    // halves are separate labels that both belong to the printed street.
    if (candidate.via === "rule" && ruleResolved && !/^[WE] \d+ ST$/.test(candidate.label)) {
      continue;
    }
    const segments = await fetchCsclStreet(boroughCode, candidate.label);
    const parts = toParts(segments, streetOnly);
    if (parts.length > 0) {
      merged.push(...parts);
      wonLabels.push(candidate.label);
      if (candidate.via === "alias") aliasLabels.push(candidate.label);
      else ruleResolved = true;
    }
  }
  return {
    label: wonLabels.join("+") || null,
    parts: merged,
    aliasUsed: aliasLabels.length > 0 ? aliasLabels.join("+") : null,
  };
}

/** BFS over the street's own segments from any node in A to any node in B. */
function walkBlockRange(parts: Part[], aNodes: string[], bNodes: string[]): Part[] | null {
  const bSet = new Set(bNodes);
  const adjacency = new Map<string, Array<{ part: Part; next: string }>>();
  for (const part of parts) {
    if (!adjacency.has(part.a)) adjacency.set(part.a, []);
    if (!adjacency.has(part.b)) adjacency.set(part.b, []);
    adjacency.get(part.a)!.push({ part, next: part.b });
    adjacency.get(part.b)!.push({ part, next: part.a });
  }
  const visited = new Set<string>(aNodes);
  /** @type {Array<{node: string, path: Part[]}>} */
  let frontier = aNodes.map((node) => ({ node, path: [] as Part[] }));
  while (frontier.length > 0) {
    const nextFrontier: Array<{ node: string; path: Part[] }> = [];
    for (const { node, path } of frontier) {
      if (bSet.has(node)) return path;
      for (const edge of adjacency.get(node) ?? []) {
        if (visited.has(edge.next)) continue;
        visited.add(edge.next);
        nextFrontier.push({ node: edge.next, path: [...path, edge.part] });
      }
    }
    frontier = nextFrontier;
  }
  return null;
}

/** Corridor fallback: street parts near the A->B chord (disconnected graphs). */
function corridorParts(parts: Part[], aKey: string, bKey: string): Part[] {
  const a = keyToPoint(aKey);
  const b = keyToPoint(bKey);
  const chordMeters = metersBetween(a, b);
  const tolerance = Math.max(60, chordMeters * 0.15);
  return parts.filter((part) => {
    const mid = part.coords[Math.floor(part.coords.length / 2)];
    const midPoint = { lng: mid[0], lat: mid[1] };
    const distToChord = pointToSegmentMeters(midPoint, a, b);
    return distToChord <= tolerance;
  });
}

/** Pick the (a, b) node pair with the shortest crow-flight separation. */
function closestPair(aNodes: Set<string>, bNodes: Set<string>): [string, string] {
  let best: [string, string] | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const a of aNodes) {
    for (const b of bNodes) {
      const d = metersBetween(keyToPoint(a), keyToPoint(b));
      if (d < bestDist) {
        bestDist = d;
        best = [a, b];
      }
    }
  }
  return best!;
}

export async function geocodeRow(row: RawRow, aliases: AliasTable): Promise<GeocodedRow> {
  const boroughCode = BOROUGH_CODES[row.borough];
  const streetName = normalizeStreetName(row.streetRaw, boroughCode, aliases);
  const fromName = normalizeStreetName(row.fromRaw, boroughCode, aliases);
  const toName = normalizeStreetName(row.toRaw, boroughCode, aliases);

  const street = await resolveParts(streetName, boroughCode, true);
  const from = await resolveParts(fromName, boroughCode, false);
  const to = await resolveParts(toName, boroughCode, false);

  const aliasUsed = [street.aliasUsed, from.aliasUsed, to.aliasUsed]
    .filter((v): v is string => v !== null);

  const base = {
    street_label: street.label,
    from_label: from.label,
    to_label: to.label,
    alias_used: aliasUsed,
  };

  if (street.parts.length === 0) {
    return {
      id: row.id,
      sideNote: streetName.sideNote,
      match: { tier: "unmatched", method: "street_not_in_cscl", ...base, physical_ids: [], note: null },
      geometry: null,
    };
  }

  const streetEndpoints = endpointNodes(street.parts);
  const aNodes = from.parts.length > 0
    ? [...streetEndpoints].filter((n) => allNodes(from.parts).has(n))
    : [];
  const bNodes = to.parts.length > 0
    ? [...streetEndpoints].filter((n) => allNodes(to.parts).has(n))
    : [];

  if (aNodes.length > 0 && bNodes.length > 0) {
    const path = walkBlockRange(street.parts, aNodes, bNodes);
    if (path && path.length > 0) {
      return {
        id: row.id,
        sideNote: streetName.sideNote,
        match: {
          tier: "polyline",
          method: "cscl_node_bfs",
          ...base,
          physical_ids: [...new Set(path.map((p) => p.physicalId))],
          note: null,
        },
        geometry: { type: "MultiLineString", coordinates: path.map((p) => p.coords) },
      };
    }
    // Same start and end intersection (a one-node "range") or a disconnected
    // street graph: fall back to the chord corridor.
    const [aKey, bKey] = closestPair(new Set(aNodes), new Set(bNodes));
    if (aKey === bKey) {
      return {
        id: row.id,
        sideNote: streetName.sideNote,
        match: { tier: "midpoint_pin", method: "single_shared_node", ...base, physical_ids: [], note: null },
        geometry: { type: "Point", coordinates: keyToPoint(aKey) && [keyToPoint(aKey).lng, keyToPoint(aKey).lat] },
      };
    }
    const corridor = corridorParts(street.parts, aKey, bKey);
    if (corridor.length > 0) {
      return {
        id: row.id,
        sideNote: streetName.sideNote,
        match: {
          tier: "corridor",
          method: "chord_corridor",
          ...base,
          physical_ids: [...new Set(corridor.map((p) => p.physicalId))],
          note: "street graph disconnected between cross streets; corridor approximation",
        },
        geometry: { type: "MultiLineString", coordinates: corridor.map((p) => p.coords) },
      };
    }
  }

  const foundNodes = aNodes.length > 0 ? aNodes : bNodes;
  if (foundNodes.length > 0) {
    const point = keyToPoint(foundNodes[0]);
    return {
      id: row.id,
      sideNote: streetName.sideNote,
      match: {
        tier: "midpoint_pin",
        method: "single_intersection_node",
        ...base,
        physical_ids: [],
        note: aNodes.length > 0 ? "only the FROM intersection resolved" : "only the TO intersection resolved",
      },
      geometry: { type: "Point", coordinates: [point.lng, point.lat] },
    };
  }

  return {
    id: row.id,
    sideNote: streetName.sideNote,
    match: { tier: "unmatched", method: "no_intersection_nodes", ...base, physical_ids: [], note: null },
    geometry: null,
  };
}
