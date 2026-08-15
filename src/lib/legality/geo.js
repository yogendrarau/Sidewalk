/**
 * Planar distance helpers for street-rules geometry.
 *
 * All math runs in a local equirectangular projection (longitude scaled by
 * cos(latitude)) — accurate to well under 0.1% over the sub-kilometre
 * distances this feature evaluates at NYC's latitude. Distances are true
 * point-to-polyline (min over constituent segments with clamped projection),
 * never midpoint heuristics.
 */

const EARTH_RADIUS_M = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;

/**
 * @param {{lat: number, lng: number}} a
 * @param {{lat: number, lng: number}} b
 * @returns {number} meters
 */
export function metersBetween(a, b) {
  const latScale = Math.cos(((a.lat + b.lat) / 2) * DEG_TO_RAD);
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD * latScale;
  return Math.sqrt(dLat * dLat + dLng * dLng) * EARTH_RADIUS_M;
}

/**
 * Distance from a point to a segment, with the projection clamped to the
 * segment's ends.
 *
 * @param {{lat: number, lng: number}} p
 * @param {{lat: number, lng: number}} a
 * @param {{lat: number, lng: number}} b
 * @returns {number} meters
 */
export function pointToSegmentMeters(p, a, b) {
  const latScale = Math.cos(p.lat * DEG_TO_RAD);
  const ax = a.lng * latScale;
  const ay = a.lat;
  const bx = b.lng * latScale;
  const by = b.lat;
  const px = p.lng * latScale;
  const py = p.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ddx = (px - cx) * DEG_TO_RAD;
  const ddy = (py - cy) * DEG_TO_RAD;
  return Math.sqrt(ddx * ddx + ddy * ddy) * EARTH_RADIUS_M;
}

/**
 * Min distance from a point to a path of [lng, lat] coordinate pairs
 * (GeoJSON axis order).
 *
 * @param {{lat: number, lng: number}} p
 * @param {Array<[number, number]>} path
 * @returns {number} meters
 */
export function pointToPathMeters(p, path) {
  if (!Array.isArray(path) || path.length === 0) return Number.POSITIVE_INFINITY;
  if (path.length === 1) {
    return metersBetween(p, { lng: path[0][0], lat: path[0][1] });
  }
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < path.length; i++) {
    const d = pointToSegmentMeters(
      p,
      { lng: path[i - 1][0], lat: path[i - 1][1] },
      { lng: path[i][0], lat: path[i][1] },
    );
    if (d < min) min = d;
  }
  return min;
}

/**
 * Min distance from a point to a GeoJSON geometry of the shapes this feature
 * ships: MultiLineString, LineString, or Point.
 *
 * @param {{lat: number, lng: number}} p
 * @param {{type: string, coordinates: any}} geometry
 * @returns {number} meters
 */
export function pointToGeometryMeters(p, geometry) {
  if (!geometry) return Number.POSITIVE_INFINITY;
  if (geometry.type === "Point") {
    return metersBetween(p, { lng: geometry.coordinates[0], lat: geometry.coordinates[1] });
  }
  if (geometry.type === "LineString") {
    return pointToPathMeters(p, geometry.coordinates);
  }
  if (geometry.type === "MultiLineString") {
    let min = Number.POSITIVE_INFINITY;
    for (const path of geometry.coordinates) {
      const d = pointToPathMeters(p, path);
      if (d < min) min = d;
    }
    return min;
  }
  return Number.POSITIVE_INFINITY;
}
