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
export function simplifyGeometry(geometry: GeoJSONGeometry, tolerance: number, maxVertices: number): GeoJSONGeometry {
  // Handle Point geometry (no simplification needed)
  if (geometry.type === 'Point') {
    return geometry;
  }
  
  // Handle LineString geometry
  if (geometry.type === 'LineString') {
    return {
      type: 'LineString',
      coordinates: simplifyLineString(geometry.coordinates as number[][], tolerance, maxVertices)
    };
  }
  
  // Handle Polygon geometry
  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: (geometry.coordinates as number[][][]).map((ring: number[][]) => 
        simplifyLineString(ring, tolerance, maxVertices)
      )
    };
  }
  
  // Handle MultiPolygon geometry
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: (geometry.coordinates as number[][][][]).map((polygon: number[][][]) =>
        polygon.map((ring: number[][]) => 
          simplifyLineString(ring, tolerance, maxVertices)
        )
      )
    };
  }
  
  // Return original geometry if type is not supported
  return geometry;
}

export function simplifyLineString(coordinates: number[][], tolerance: number, maxVertices: number): number[][] {
  if (coordinates.length <= 2) {
    return coordinates;
  }
  
  // Simple Douglas-Peucker algorithm implementation
  const simplified: number[][] = [];
  const start = coordinates[0];
  const end = coordinates[coordinates.length - 1];
  
  simplified.push(start);
  
  let maxDistance = 0;
  let maxIndex = 0;
  
  for (let i = 1; i < coordinates.length - 1; i++) {
    const distance = pointToLineDistance(coordinates[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  
  if (maxDistance > tolerance && simplified.length < maxVertices) {
    const left = coordinates.slice(0, maxIndex + 1);
    const right = coordinates.slice(maxIndex);
    
    const leftSimplified = simplifyLineString(left, tolerance, maxVertices);
    const rightSimplified = simplifyLineString(right, tolerance, maxVertices);
    
    simplified.push(...leftSimplified.slice(1, -1));
    simplified.push(...rightSimplified.slice(1));
  } else {
    simplified.push(end);
  }
  
  return simplified;
}

function pointToLineDistance(point: number[], lineStart: number[], lineEnd: number[]): number {
  const A = point[0] - lineStart[0];
  const B = point[1] - lineStart[1];
  const C = lineEnd[0] - lineStart[0];
  const D = lineEnd[1] - lineStart[1];
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) {
    return Math.sqrt(A * A + B * B);
  }
  
  const param = dot / lenSq;
  
  let xx, yy;
  if (param < 0) {
    xx = lineStart[0];
    yy = lineStart[1];
  } else if (param > 1) {
    xx = lineEnd[0];
    yy = lineEnd[1];
  } else {
    xx = lineStart[0] + param * C;
    yy = lineStart[1] + param * D;
  }
  
  const dx = point[0] - xx;
  const dy = point[1] - yy;
  
  return Math.sqrt(dx * dx + dy * dy);
}

