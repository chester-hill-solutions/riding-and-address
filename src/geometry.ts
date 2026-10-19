import { GeoJSONGeometry } from './types';

/**
 * Geometry: point-in-polygon and boundary simplification.
 *
 * **Moved out of `src/utils.ts` for a reason, and the reason is not tidiness.**
 *
 * `utils.ts` was meant to be the bottom of the dependency graph — everything could import it and
 * it imported almost nothing. Then `spatial.ts` needed `isPointInPolygon`, so `spatial.ts`
 * imported `utils.ts`, and `utils.ts` re-exported the dataset registry "for backward
 * compatibility", which put `datasets.ts` in the circle. The cycle was not in any one file; it
 * was in the shape.
 *
 * These functions depend on nothing but the geometry types, so they belong in a leaf.
 */
/**
 * Determines if a geographic point is inside a GeoJSON polygon or multipolygon.
 * Uses ray casting algorithm with explicit boundary point handling.
 * 
 * @param lon - Longitude of the point (-180 to 180)
 * @param lat - Latitude of the point (-90 to 90)
 * @param geometry - GeoJSON geometry (Polygon or MultiPolygon)
 * @returns true if point is inside the polygon (including on boundaries), false otherwise
 */
export function isPointInPolygon(lon: number, lat: number, geometry: GeoJSONGeometry): boolean {
  const point = [lon, lat];
  const type = geometry?.type;
  const coords = geometry?.coordinates;
  if (!type || !coords) return false;

  if (type === "Polygon") {
    return polygonContains(point, coords as number[][][]);
  }
  if (type === "MultiPolygon") {
    for (const poly of coords) {
      if (polygonContains(point, poly as number[][][])) return true;
    }
    return false;
  }
  return false;
}

/**
 * Checks if a point is contained within a polygon, handling holes.
 * Points on the outer boundary are considered inside; points inside holes are considered outside.
 * 
 * @param point - [longitude, latitude] coordinates
 * @param polygon - Array of rings: [outerRing, hole1, hole2, ...] where each ring is [[lon, lat], ...]
 * @returns true if point is inside the polygon (not in any holes), false otherwise
 */
export function polygonContains(point: number[], polygon: number[][][]): boolean {
  // polygon: [ [ [lon,lat], ... ] outerRing, hole1, hole2, ... ]
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  
  const outerRing = polygon[0] as number[][];
  if (!outerRing || !Array.isArray(outerRing)) return false;
  
  // Check if point is in outer ring (including boundary)
  const inOuterRing = ringContains(point, outerRing);
  if (!inOuterRing) return false;
  
  // Check if point is in any hole (if point is on hole boundary, it's considered outside)
  for (let i = 1; i < polygon.length; i++) {
    const hole = polygon[i];
    if (!hole || !Array.isArray(hole)) continue;
    
    // Check if point is strictly inside a hole (not on boundary)
    // For holes, we want to exclude points that are inside, but include points on the boundary
    const inHole = ringContains(point, hole);
    if (inHole) {
      // Double-check: if point is exactly on hole boundary, it should be considered inside polygon
      // But if it's strictly inside the hole, it's outside the polygon
      // The ringContains function already handles boundary cases, so if it returns true
      // and the point is on the boundary, we should still consider it inside the polygon
      // For now, we'll be conservative: if inHole is true, exclude it
      return false;
    }
  }
  
  return true;
}

/**
 * Checks if a point is inside a closed ring using ray casting algorithm.
 * Points exactly on the ring boundary are considered inside.
 * 
 * @param point - [longitude, latitude] coordinates
 * @param ring - Array of [longitude, latitude] coordinate pairs forming a closed ring
 * @returns true if point is inside or on the ring boundary, false otherwise
 */
export function ringContains(point: number[], ring: number[][]): boolean {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  
  const [px, py] = point;
  let inside = false;
  
  // First check if point is exactly on the boundary
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    
    // Check if point is on the edge segment
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    // Point is on boundary if it's on the line segment
    if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
      // Check if point is collinear with the segment
      const crossProduct = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
      const tolerance = 1e-10; // Small tolerance for floating point comparison
      if (Math.abs(crossProduct) < tolerance) {
        return true; // Point is on boundary, consider it inside
      }
    }
    
    // Ray casting algorithm for interior points
    const intersect = ((y1 > py) !== (y2 > py)) &&
      (px < (x2 - x1) * (py - y1) / (y2 - y1 + 1e-10) + x1);
    if (intersect) inside = !inside;
  }
  
  return inside;
}

// Geometry simplification

/**
 * Line simplification, by decimation.
 *
 * **This is the simplifier the spatial path uses, and it is now the only one.**
 *
 * There were two functions with this name and this signature in the codebase — one here (a real
 * Douglas-Peucker that honours `tolerance`) and one in `spatial.ts` (a decimation that ignores
 * it). Only the second was ever called, and only the second was tested; the first was dead code
 * that happened to be the better algorithm.
 *
 * The live behaviour is kept: the spatial path simplifies polygon rings with a tolerance of 0 and
 * relies on `maxVertices`, which decimation honours. Swapping in the other algorithm would
 * change the shape of every simplified boundary, and that is a change worth measuring rather than
 * folding into a refactor.
 */
export function simplifyLineString(coordinates: number[][], tolerance: number, maxVertices: number): number[][] {
  if (coordinates.length <= 2) {
    return coordinates;
  }

  // If we're already under the max vertices, return as is
  if (coordinates.length <= maxVertices) {
    return coordinates;
  }

  // Simple decimation for now - take every nth point
  const step = Math.ceil(coordinates.length / maxVertices);
  const simplified: number[][] = [];

  for (let i = 0; i < coordinates.length; i += step) {
    simplified.push(coordinates[i]);
  }

  // Always include the last point
  if (simplified[simplified.length - 1] !== coordinates[coordinates.length - 1]) {
    simplified.push(coordinates[coordinates.length - 1]);
  }

  return simplified;
}
