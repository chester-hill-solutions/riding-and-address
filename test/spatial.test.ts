import { describe, it, expect } from 'vitest';
import {
  getSpatialDbConfig,
  getSpatialDatasetCleanupOrder,
  calculateBoundingBox,
  createSpatialIndex,
  isPointInBoundingBox,
  findCandidateFeatures,
  calculateCentroid,
  simplifyLineString,
  type BoundingBox
} from '../src/spatial';
import type { GeoJSONFeature, GeoJSONFeatureCollection } from '../src/types';

// Helper to create a simple polygon feature
function createPolygonFeature(coords: number[][][], properties: Record<string, unknown> = {}): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coords },
    properties
  };
}

// Helper to create a multipolygon feature
function createMultiPolygonFeature(coords: number[][][][], properties: Record<string, unknown> = {}): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'MultiPolygon', coordinates: coords },
    properties
  };
}

describe('getSpatialDbConfig', () => {
  it('returns disabled when env is undefined', () => {
    const config = getSpatialDbConfig();
    expect(config.ENABLED).toBe(false);
    expect(config.USE_RTREE_INDEX).toBe(true);
    expect(config.BATCH_INSERT_SIZE).toBe(100);
  });

  it('returns disabled when SPATIAL_DB_ENABLED is false', () => {
    const config = getSpatialDbConfig({ SPATIAL_DB_ENABLED: 'false' });
    expect(config.ENABLED).toBe(false);
  });

  it('returns enabled when SPATIAL_DB_ENABLED is true', () => {
    const config = getSpatialDbConfig({ SPATIAL_DB_ENABLED: 'true' });
    expect(config.ENABLED).toBe(true);
  });

  it('returns enabled when SPATIAL_DB_ENABLED is 1', () => {
    const config = getSpatialDbConfig({ SPATIAL_DB_ENABLED: '1' });
    expect(config.ENABLED).toBe(true);
  });
});

describe('getSpatialDatasetCleanupOrder', () => {
  it('removes rtree rows before feature rows when enabled', () => {
    expect(getSpatialDatasetCleanupOrder(true)).toEqual(['rtree', 'features']);
  });

  it('only removes feature rows when rtree is disabled', () => {
    expect(getSpatialDatasetCleanupOrder(false)).toEqual(['features']);
  });
});

describe('calculateBoundingBox', () => {
  it('calculates bbox for a simple Polygon', () => {
    const polygon = createPolygonFeature([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]);
    const bbox = calculateBoundingBox(polygon.geometry);
    expect(bbox.minX).toBe(0);
    expect(bbox.minY).toBe(0);
    expect(bbox.maxX).toBe(10);
    expect(bbox.maxY).toBe(10);
  });

  it('calculates bbox for a Polygon with negative coordinates', () => {
    const polygon = createPolygonFeature([[[-10, -5], [5, -5], [5, 10], [-10, 10], [-10, -5]]]);
    const bbox = calculateBoundingBox(polygon.geometry);
    expect(bbox.minX).toBe(-10);
    expect(bbox.minY).toBe(-5);
    expect(bbox.maxX).toBe(5);
    expect(bbox.maxY).toBe(10);
  });

  it('calculates bbox for a MultiPolygon', () => {
    const multiPolygon = createMultiPolygonFeature([
      [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
      [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]]
    ]);
    const bbox = calculateBoundingBox(multiPolygon.geometry);
    expect(bbox.minX).toBe(0);
    expect(bbox.minY).toBe(0);
    expect(bbox.maxX).toBe(20);
    expect(bbox.maxY).toBe(20);
  });

  it('throws for missing coordinates', () => {
    expect(() => calculateBoundingBox({ type: 'Polygon', coordinates: undefined as unknown as number[][][] }))
      .toThrow('Geometry missing coordinates');
  });

  it('throws for empty Polygon coordinates', () => {
    expect(() => calculateBoundingBox({ type: 'Polygon', coordinates: [] }))
      .toThrow('Polygon coordinates must be a non-empty array');
  });

  it('throws for empty MultiPolygon coordinates', () => {
    expect(() => calculateBoundingBox({ type: 'MultiPolygon', coordinates: [] }))
      .toThrow('MultiPolygon coordinates must be a non-empty array');
  });

  it('throws for unsupported geometry type', () => {
    expect(() => calculateBoundingBox({ type: 'Point', coordinates: [0, 0] as unknown as number[][][] }))
      .toThrow('Unsupported geometry type: Point');
  });

  it('throws for polygon with no valid coordinates', () => {
    const polygon = createPolygonFeature([[[NaN, NaN], [NaN, NaN], [NaN, NaN], [NaN, NaN], [NaN, NaN]]]);
    expect(() => calculateBoundingBox(polygon.geometry)).toThrow('No valid coordinates found in geometry');
  });

  it('skips invalid coordinates in a ring', () => {
    const polygon = createPolygonFeature([[[0, 0], [NaN, NaN], [10, 10], [0, 10], [0, 0]]]);
    const bbox = calculateBoundingBox(polygon.geometry);
    expect(bbox.minX).toBe(0);
    expect(bbox.minY).toBe(0);
    expect(bbox.maxX).toBe(10);
    expect(bbox.maxY).toBe(10);
  });
});

describe('createSpatialIndex', () => {
  it('creates an index with correct overall bounding box', () => {
    const fc: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        createPolygonFeature([[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]], { id: 1 }),
        createPolygonFeature([[[10, 10], [15, 10], [15, 15], [10, 15], [10, 10]]], { id: 2 })
      ]
    };
    const index = createSpatialIndex(fc);
    expect(index.entries.length).toBe(2);
    expect(index.boundingBox.minX).toBe(0);
    expect(index.boundingBox.minY).toBe(0);
    expect(index.boundingBox.maxX).toBe(15);
    expect(index.boundingBox.maxY).toBe(15);
  });

  it('creates an index with individual feature bboxes', () => {
    const fc: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        createPolygonFeature([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], { id: 1 })
      ]
    };
    const index = createSpatialIndex(fc);
    expect(index.entries[0].boundingBox).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });
});

describe('isPointInBoundingBox', () => {
  const bbox: BoundingBox = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it('returns true for point inside', () => {
    expect(isPointInBoundingBox(5, 5, bbox)).toBe(true);
  });

  it('returns true for point on boundary', () => {
    expect(isPointInBoundingBox(0, 5, bbox)).toBe(true);
    expect(isPointInBoundingBox(10, 5, bbox)).toBe(true);
    expect(isPointInBoundingBox(5, 0, bbox)).toBe(true);
    expect(isPointInBoundingBox(5, 10, bbox)).toBe(true);
  });

  it('returns false for point outside', () => {
    expect(isPointInBoundingBox(15, 5, bbox)).toBe(false);
    expect(isPointInBoundingBox(5, 15, bbox)).toBe(false);
    expect(isPointInBoundingBox(-5, 5, bbox)).toBe(false);
    expect(isPointInBoundingBox(5, -5, bbox)).toBe(false);
  });
});

describe('findCandidateFeatures', () => {
  const fc: GeoJSONFeatureCollection = {
    type: 'FeatureCollection',
    features: [
      createPolygonFeature([[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]], { id: 1 }),
      createPolygonFeature([[[10, 10], [15, 10], [15, 15], [10, 15], [10, 10]]], { id: 2 }),
      createPolygonFeature([[[20, 20], [25, 20], [25, 25], [20, 25], [20, 20]]], { id: 3 })
    ]
  };
  const index = createSpatialIndex(fc);

  it('finds features whose bbox contains the point', () => {
    const candidates = findCandidateFeatures(2, 2, index);
    expect(candidates.length).toBe(1);
    expect(candidates[0].properties.id).toBe(1);
  });

  it('finds multiple candidates when point overlaps multiple bboxes', () => {
    const overlappingFc: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        createPolygonFeature([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], { id: 1 }),
        createPolygonFeature([[[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]], { id: 2 })
      ]
    };
    const overlappingIndex = createSpatialIndex(overlappingFc);
    const candidates = findCandidateFeatures(7, 7, overlappingIndex);
    expect(candidates.length).toBe(2);
  });

  it('returns empty array when no bbox contains the point', () => {
    const candidates = findCandidateFeatures(100, 100, index);
    expect(candidates.length).toBe(0);
  });

  it('returns candidate for point on boundary', () => {
    const candidates = findCandidateFeatures(0, 0, index);
    expect(candidates.length).toBe(1);
    expect(candidates[0].properties.id).toBe(1);
  });
});

describe('calculateCentroid', () => {
  it('returns coordinates for Point geometry', () => {
    const point = { type: 'Point' as const, coordinates: [5, 10] };
    const centroid = calculateCentroid(point);
    expect(centroid.lon).toBe(5);
    expect(centroid.lat).toBe(10);
  });

  it('calculates centroid for Polygon', () => {
    const polygon = createPolygonFeature([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]);
    const centroid = calculateCentroid(polygon.geometry);
    expect(centroid.lon).toBe(4);
    expect(centroid.lat).toBe(4);
  });

  it('calculates centroid for MultiPolygon using largest polygon', () => {
    const multiPolygon = createMultiPolygonFeature([
      [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
      [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]]
    ]);
    const centroid = calculateCentroid(multiPolygon.geometry);
    // Both polygons have 5 vertices, so the first one is selected (ties go to first)
    expect(centroid.lon).toBe(2);
    expect(centroid.lat).toBe(2);
  });

  it('returns (0,0) for unsupported geometry', () => {
    const line = { type: 'LineString' as const, coordinates: [[0, 0], [10, 10]] };
    const centroid = calculateCentroid(line);
    expect(centroid.lon).toBe(0);
    expect(centroid.lat).toBe(0);
  });

  it('selects the largest polygon in a MultiPolygon', () => {
    const multiPolygon = createMultiPolygonFeature([
      [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
      [[[10, 10], [20, 10], [20, 20], [15, 25], [10, 20], [10, 10]]]
    ]);
    const centroid = calculateCentroid(multiPolygon.geometry);
    // Second polygon has 6 vertices, so it should be selected
    expect(centroid.lon).toBe(14.166666666666666);
    expect(centroid.lat).toBe(15.833333333333334);
  });
});

describe('simplifyLineString', () => {
  it('returns coordinates as-is when length <= 2', () => {
    const coords = [[0, 0], [10, 10]];
    const result = simplifyLineString(coords, 1, 100);
    expect(result).toEqual(coords);
  });

  it('returns coordinates as-is when under maxVertices', () => {
    const coords = [[0, 0], [1, 1], [2, 2], [3, 3]];
    const result = simplifyLineString(coords, 1, 10);
    expect(result).toEqual(coords);
  });

  it('decimates coordinates when over maxVertices', () => {
    const coords = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9]];
    const result = simplifyLineString(coords, 1, 5);
    expect(result.length).toBeLessThanOrEqual(6); // maxVertices + 1 for last point
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([9, 9]);
  });

  it('always includes the last point', () => {
    const coords = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];
    const result = simplifyLineString(coords, 1, 3);
    expect(result[result.length - 1]).toEqual([4, 4]);
  });
});
