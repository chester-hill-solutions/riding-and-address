import { Env, GeoJSONFeature, GeoJSONFeatureCollection, LookupResult, SpatialIndex } from './types';
import { isPointInPolygon, ridingNameFromProperties, withTimeout } from './utils';
import { findCandidateFeatures, isPointInBoundingBox } from './spatial';
import { getTimeoutConfig } from './config';
import { incrementMetric, recordTiming } from './metrics';
import { pickDataset } from './datasets';
import { r2DatasetSource, type DatasetSource } from './dataset-source';
import type { LookupRidingFn } from './lookup-expansion';

/**
 * The Riding lookup core: D1 first, then the per-isolate spatial-index LRU, then R2 (fetch +
 * validate + index build). Callers get one interface; retries, circuit breaking, timeouts,
 * metrics and cache fill live behind the `DatasetSource` port.
 *
 * D1-first → LRU → R2 ordering is preserved: the D1 fast path always runs first, then
 * `source.getSpatialIndex` serves from the LRU or loads from R2 on a miss. Sources without a
 * spatial database answer the fast path with `null`.
 */
export async function lookupRidingFromSource(
  source: DatasetSource,
  env: Env,
  pathname: string,
  lon: number,
  lat: number
): Promise<LookupResult> {
  const timeoutConfig = getTimeoutConfig(env);
  const timeoutMs = timeoutConfig.lookup;

  const lookupPromise = (async () => {
    const { r2Key } = pickDataset(pathname);

    // D1 fast path first; a no-op source returns null and we fall through.
    try {
      const properties = await source.querySpatial(r2Key, lon, lat);
      if (properties) {
        return {
          riding: ridingNameFromProperties(properties) ?? 'Unknown',
          properties,
        };
      }
    } catch (error) {
      console.warn('Database lookup failed, falling back to spatial index:', error);
    }

    // LRU-backed spatial index; a miss loads the GeoJSON from R2 and indexes it.
    const spatialIndex = await source.getSpatialIndex(r2Key);
    return lookupRidingWithIndex(spatialIndex, lon, lat);
  })();

  return withTimeout(lookupPromise, timeoutMs, "Riding lookup");
}

/**
 * Bind a `DatasetSource` to the `LookupRidingFn` shape the lookup core threads around. Used by
 * the queue DO so each isolate holds its own source rather than a shared module singleton.
 */
export function createLookupRiding(source: DatasetSource): LookupRidingFn {
  return (env, pathname, lon, lat) => lookupRidingFromSource(source, env, pathname, lon, lat);
}

/**
 * The production `LookupRidingFn`: one R2-backed source over the isolate's shared LRUs.
 */
export const cachedLookupRiding: LookupRidingFn = (env, pathname, lon, lat) =>
  lookupRidingFromSource(r2DatasetSource(env), env, pathname, lon, lat);

/**
 * Load and cache a dataset's GeoJSON. Kept as a thin `DatasetSource` adapter for the cache
 * warming job and the operator cache-warm route.
 */
export function loadGeo(env: Env, key: string): Promise<GeoJSONFeatureCollection> {
  return r2DatasetSource(env).load(key);
}

// Lookup riding using spatial index
function lookupRidingWithIndex(spatialIndex: SpatialIndex, lon: number, lat: number): LookupResult {
  const startTime = Date.now();

  // First check if point is within the overall bounding box
  if (!isPointInBoundingBox(lon, lat, spatialIndex.boundingBox)) {
    incrementMetric('spatialIndexHits');
    recordTiming('totalSpatialIndexTime', Date.now() - startTime);
    return { properties: null };
  }

  // Find candidate features using spatial index
  const candidates = findCandidateFeatures(lon, lat, spatialIndex);

  if (candidates.length === 0) {
    incrementMetric('spatialIndexHits');
    recordTiming('totalSpatialIndexTime', Date.now() - startTime);
    return { properties: null };
  }

  incrementMetric('spatialIndexMisses');

  // Only test point-in-polygon for candidates
  for (const feat of candidates) {
    const props = featurePropertiesIfContains(feat, lon, lat);
    if (props) {
      recordTiming('totalSpatialIndexTime', Date.now() - startTime);
      return {
        properties: props,
        riding: ridingNameFromProperties(props),
      };
    }
  }

  recordTiming('totalSpatialIndexTime', Date.now() - startTime);
  return { properties: null };
}

// Check if point is in polygon and return properties
function featurePropertiesIfContains(ridingFeature: GeoJSONFeature, lon: number, lat: number): Record<string, unknown> | null {
  const geom = ridingFeature?.geometry;
  if (!geom) return null;
  if (isPointInPolygon(lon, lat, geom)) {
    return ridingFeature?.properties || {};
  }
  return null;
}
