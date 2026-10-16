/**
 * Area geometry validation — the W7 contract's §3 and §10, for W9's arbitrary shapes.
 *
 * A caller-supplied Polygon or MultiPolygon is validated **before** anything expensive happens: a
 * malformed ring, an out-of-range coordinate, too many vertices, or a shape covering half the
 * country must be refused up front rather than discovered halfway through a scan. Containment itself
 * is unchanged — the same `isPointInPolygon` the point lookup and riding-bounded queries use.
 *
 * The caps are v1 numbers chosen to bound one request's work; they are the contract's "never leave
 * these unlimited" clause made concrete, and can be revisited with benchmarks.
 */

import type { GeoJSONGeometry } from './types';

/** Total positions across every ring. A shape needing more than this is an export, not a query. */
export const AREA_MAX_VERTICES = 2000;

/**
 * Longest side of the bounding box, in degrees. A cheap proxy for "this is too big to page through
 * in a bounded number of requests": two degrees is roughly 220 km north–south.
 */
export const AREA_MAX_SPAN_DEGREES = 2;

export type AreaGeometryValidation =
  | { ok: true; geometry: GeoJSONGeometry }
  | { ok: false; reason: string };

type Position = [number, number];

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Validate one ring: positions in range, at least four of them, and explicitly closed. Ring winding
 * is not enforced — the containment test tolerates either direction, so requiring one would reject
 * valid input for no benefit.
 */
function validateRing(ring: unknown, label: string): string | null {
  if (!Array.isArray(ring) || ring.length < 4) {
    return `${label} must have at least 4 positions`;
  }
  for (const position of ring) {
    if (!isPosition(position)) {
      return `${label} has a malformed position`;
    }
    const [lon, lat] = position;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return `${label} has a position outside WGS84 range`;
    }
  }
  const first = ring[0] as Position;
  const last = ring[ring.length - 1] as Position;
  if (!samePosition(first, last)) {
    return `${label} is not closed (first and last position must match)`;
  }
  return null;
}

/** Validate a caller-supplied boundary, or say precisely why it is unusable. */
export function validateAreaGeometry(value: unknown): AreaGeometryValidation {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, reason: 'geometry must be an object' };
  }
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    return { ok: false, reason: 'geometry must be a Polygon or MultiPolygon' };
  }
  if (!Array.isArray(geometry.coordinates)) {
    return { ok: false, reason: 'geometry.coordinates must be an array' };
  }

  const polygons: unknown[] =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (polygons.length === 0) {
    return { ok: false, reason: 'geometry has no polygons' };
  }

  let vertices = 0;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (let p = 0; p < polygons.length; p += 1) {
    const rings = polygons[p];
    if (!Array.isArray(rings) || rings.length === 0) {
      return { ok: false, reason: `polygon ${p} has no rings` };
    }
    for (let r = 0; r < rings.length; r += 1) {
      const ring = rings[r];
      const problem = validateRing(ring, `polygon ${p} ring ${r}`);
      if (problem) return { ok: false, reason: problem };

      for (const position of ring as Position[]) {
        vertices += 1;
        minLon = Math.min(minLon, position[0]);
        maxLon = Math.max(maxLon, position[0]);
        minLat = Math.min(minLat, position[1]);
        maxLat = Math.max(maxLat, position[1]);
      }
    }
  }

  if (vertices > AREA_MAX_VERTICES) {
    return { ok: false, reason: `geometry has ${vertices} positions, over the ${AREA_MAX_VERTICES} limit` };
  }

  const span = Math.max(maxLon - minLon, maxLat - minLat);
  if (span > AREA_MAX_SPAN_DEGREES) {
    return {
      ok: false,
      reason: `geometry spans ${span.toFixed(2)} degrees, over the ${AREA_MAX_SPAN_DEGREES} limit`,
    };
  }

  return { ok: true, geometry: geometry as unknown as GeoJSONGeometry };
}
