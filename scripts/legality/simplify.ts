/**
 * Geometry simplification for the committed artifacts: Douglas-Peucker with a
 * meter-based epsilon (borough outlines only — restricted-street polylines are
 * already block-scale) plus coordinate quantization to 5 decimals (~1.1m),
 * an order of magnitude finer than the feature's 25m proximity threshold.
 */

import { pointToSegmentMeters } from "../../src/lib/legality/geo.js";

export type Position = [number, number];

export function quantize(coord: Position): Position {
  return [Number(coord[0].toFixed(5)), Number(coord[1].toFixed(5))];
}

export function quantizePath(path: Position[]): Position[] {
  const out: Position[] = [];
  for (const coord of path) {
    const q = quantize(coord);
    const last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  return out;
}

/** Douglas-Peucker on [lng, lat] positions with epsilon in meters. */
export function simplifyPath(path: Position[], epsilonMeters: number): Position[] {
  if (path.length <= 2) return [...path];
  const a = { lng: path[0][0], lat: path[0][1] };
  const b = { lng: path[path.length - 1][0], lat: path[path.length - 1][1] };
  let maxDist = -1;
  let maxIndex = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const d = pointToSegmentMeters({ lng: path[i][0], lat: path[i][1] }, a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }
  if (maxDist <= epsilonMeters) return [path[0], path[path.length - 1]];
  const left = simplifyPath(path.slice(0, maxIndex + 1), epsilonMeters);
  const right = simplifyPath(path.slice(maxIndex), epsilonMeters);
  return [...left.slice(0, -1), ...right];
}

/** Rough ring area in square degrees — used only to drop micro-islands. */
export function ringAreaDeg2(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum / 2);
}

const MIN_RING_AREA_DEG2 = 1e-6;

/**
 * Simplify a GeoJSON MultiPolygon's rings, dropping rings that collapse or
 * were micro-islands to begin with.
 */
export function simplifyMultiPolygon(
  coordinates: Position[][][],
  epsilonMeters: number,
): Position[][][] {
  const polygons: Position[][][] = [];
  for (const polygon of coordinates) {
    const rings: Position[][] = [];
    for (const ring of polygon) {
      if (ringAreaDeg2(ring) < MIN_RING_AREA_DEG2) continue;
      const simplified = quantizePath(simplifyPath(ring, epsilonMeters));
      if (simplified.length < 4) continue;
      // Rings must close after quantization.
      const first = simplified[0];
      const last = simplified[simplified.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) simplified.push([...first]);
      if (simplified.length >= 4) rings.push(simplified);
    }
    if (rings.length > 0) polygons.push(rings);
  }
  return polygons;
}
