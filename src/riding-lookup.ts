import { Env, GeoJSONFeature, GeoJSONFeatureCollection, LookupResult, SpatialIndex } from './types';
import {
  geoCacheLRU,
  setCachedGeoJSON,
  setCachedSpatialIndex,
  spatialIndexCacheLRU,
} from './cache';
import {
  createSpatialIndex,
  findCandidateFeatures,
  getSpatialDbConfig,
  isPointInBoundingBox,
  queryRidingFromDatabase,
} from './spatial';
import { isPointInPolygon, ridingNameFromProperties, withRetry, withTimeout } from './utils';
import { getRetryConfig, getTimeoutConfig } from './config';
import { incrementMetric, recordTiming } from './metrics';
import { CircuitBreakerOpenError, r2CircuitBreaker } from './circuit-breaker';
import { pickDataset } from './datasets';

/**
 * The Riding lookup core: D1 first, then the per-isolate spatial-index LRU,
 * then R2 (fetch + validate + index build). Callers get one interface;
 * retries, circuit breaking, timeouts, metrics and cache fill are hidden.
 *
 * Works in any isolate: when the R2 circuit breaker has not been initialised
 * (e.g. inside a Durable Object), fetches proceed without it rather than
 * crashing on the singleton.
 */

function withR2Breaker<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!r2CircuitBreaker) return fn();
  return r2CircuitBreaker.execute(`r2:${key}`, fn);
}

export async function loadGeo(env: Env, key: string): Promise<GeoJSONFeatureCollection> {
  const startTime = Date.now();
  incrementMetric('r2Requests');

  // Check LRU cache
  const cached = geoCacheLRU.get(key);
  if (cached) {
    incrementMetric('r2CacheHits');
    recordTiming('totalR2Time', Date.now() - startTime);
    return cached;
  }

  incrementMetric('r2CacheMisses');

  try {
    const geo = await withR2Breaker(`r2:${key}`, async () => {
      const retryConfig = getRetryConfig();
      return await withRetry(async () => {
        const obj = await env.RIDINGS.get(key);
        if (!obj) throw new Error(`R2 object not found: ${key}`);
        const text = await obj.text();
        const parsed = JSON.parse(text) as GeoJSONFeatureCollection;

        // Validate GeoJSON structure
        if (!parsed || typeof parsed !== 'object') {
          throw new Error(`Invalid GeoJSON: not an object`);
        }
        if (parsed.type !== 'FeatureCollection') {
          throw new Error(`Invalid GeoJSON: expected FeatureCollection, got ${parsed.type}`);
        }
        if (!Array.isArray(parsed.features)) {
          throw new Error(`Invalid GeoJSON: features must be an array`);
        }

        // Validate features structure
        for (let i = 0; i < Math.min(parsed.features.length, 10); i++) {
          const feature = parsed.features[i];
          if (!feature || typeof feature !== 'object') {
            throw new Error(`Invalid GeoJSON: feature ${i} is not an object`);
          }
          if (feature.type !== 'Feature') {
            throw new Error(`Invalid GeoJSON: feature ${i} type is not 'Feature'`);
          }
          if (!feature.geometry || typeof feature.geometry !== 'object') {
            throw new Error(`Invalid GeoJSON: feature ${i} missing or invalid geometry`);
          }
          if (!feature.geometry.coordinates || !Array.isArray(feature.geometry.coordinates)) {
            throw new Error(`Invalid GeoJSON: feature ${i} missing or invalid coordinates`);
          }
        }

        return parsed;
      }, retryConfig, `R2 fetch ${key}`);
    });

    // Cache the result
    setCachedGeoJSON(key, geo);

    // Create spatial index
    const spatialIndex = createSpatialIndex(geo);
    setCachedSpatialIndex(key, spatialIndex);

    incrementMetric('r2Successes');
    recordTiming('totalR2Time', Date.now() - startTime);
    return geo;
  } catch (error) {
    incrementMetric('r2Failures');
    if (error instanceof CircuitBreakerOpenError) {
      incrementMetric('r2CircuitBreakerTrips');
    }
    recordTiming('totalR2Time', Date.now() - startTime);
    throw error;
  }
}

export async function cachedLookupRiding(env: Env, pathname: string, lon: number, lat: number): Promise<LookupResult> {
  const timeoutConfig = getTimeoutConfig(env);
  const timeoutMs = timeoutConfig.lookup;

  const lookupPromise = (async () => {
    const { r2Key } = pickDataset(pathname);

    // Try spatial database first if enabled
    const dbConfig = getSpatialDbConfig(env);
    if (dbConfig.ENABLED && env.RIDING_DB) {
      try {
        const dbResult = await queryRidingFromDatabase(env, r2Key, lon, lat);
        if (dbResult) {
          return {
            riding: ridingNameFromProperties(dbResult.properties) ?? 'Unknown',
            properties: dbResult.properties || {}
          };
        }
      } catch (error) {
        console.warn('Database lookup failed, falling back to spatial index:', error);
      }
    }

    // Check LRU cache
    let spatialIndex = spatialIndexCacheLRU.get(r2Key);

    if (!spatialIndex) {
      // Load GeoJSON to create spatial index
      await loadGeo(env, r2Key);
      spatialIndex = spatialIndexCacheLRU.get(r2Key);
      if (!spatialIndex) throw new Error(`Failed to create spatial index for ${r2Key}`);
    }

    return lookupRidingWithIndex(spatialIndex, lon, lat);
  })();

  return withTimeout(lookupPromise, timeoutMs, "Riding lookup");
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
