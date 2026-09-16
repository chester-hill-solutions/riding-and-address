import { Env, GeoJSONFeatureCollection, SpatialIndex } from './types';
import { CACHE_CONFIG, LRUCache, geoCacheLRU, spatialIndexCacheLRU } from './cache';
import { createSpatialIndex, getSpatialDbConfig, queryRidingFromDatabase } from './spatial';
import { withRetry } from './utils';
import { getRetryConfig } from './config';
import { incrementMetric, recordTiming } from './metrics';
import { CircuitBreakerOpenError, r2CircuitBreaker } from './circuit-breaker';

/**
 * Where riding GeoJSON comes from.
 *
 * One named seam for the R2 binding, the per-isolate LRUs, the retry/circuit-breaker path and
 * the optional D1 point-in-polygon fast path. Callers ask the source for data by key; they never
 * reach for `env.RIDINGS` or `env.RIDING_DB` themselves.
 *
 * `load` owns exactly what the old `loadGeo` did: R2 fetch → validate → retry → breaker → LRU
 * fill → spatial-index build. `getSpatialIndex` is the LRU read that `cachedLookupRiding` used to
 * do inline. `querySpatial` is only present when the D1 spatial database is configured, so the
 * D1-first → LRU → R2 ordering is preserved without the caller re-checking config.
 */
export interface DatasetSource {
  /** Fetch, validate, retry and LRU-cache a dataset's GeoJSON, building its spatial index. */
  load(key: string): Promise<GeoJSONFeatureCollection>;
  /** The LRU-backed spatial index for a dataset, loading it on a miss. */
  getSpatialIndex(key: string): Promise<SpatialIndex>;
  /** Head-check a dataset without downloading it (`checkRidingDatasets`). */
  head(key: string): Promise<{ size?: number } | null>;
  /** Optional D1 point-in-polygon fast path; absent when the spatial DB is disabled. */
  querySpatial?(key: string, lon: number, lat: number): Promise<Record<string, unknown> | null>;
}

/** The two per-isolate LRUs a source owns. */
export interface DatasetCaches {
  geo: LRUCache<string, GeoJSONFeatureCollection>;
  spatial: LRUCache<string, SpatialIndex>;
}

/**
 * A fresh set of LRUs. The queue DO builds one per isolate so its caches are explicitly its own,
 * rather than an implicit share of whatever module globals the Worker happened to populate.
 */
export function createDatasetCaches(): DatasetCaches {
  return {
    geo: new LRUCache<string, GeoJSONFeatureCollection>(CACHE_CONFIG.MAX_SIZE, CACHE_CONFIG.MAX_AGE),
    spatial: new LRUCache<string, SpatialIndex>(CACHE_CONFIG.MAX_SIZE, CACHE_CONFIG.MAX_AGE),
  };
}

function withR2Breaker<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!r2CircuitBreaker) return fn();
  return r2CircuitBreaker.execute(`r2:${key}`, fn);
}

async function loadGeoFromR2(
  env: Env,
  caches: DatasetCaches,
  key: string
): Promise<GeoJSONFeatureCollection> {
  const startTime = Date.now();
  incrementMetric('r2Requests');

  // Check LRU cache
  const cached = caches.geo.get(key);
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

    // Cache the result and build its spatial index, exactly as the old loadGeo did.
    caches.geo.set(key, geo);
    caches.spatial.set(key, createSpatialIndex(geo));

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

async function getSpatialIndexFromCaches(
  env: Env,
  caches: DatasetCaches,
  key: string
): Promise<SpatialIndex> {
  const cached = caches.spatial.get(key);
  if (cached) return cached;

  await loadGeoFromR2(env, caches, key);
  const spatialIndex = caches.spatial.get(key);
  if (!spatialIndex) throw new Error(`Failed to create spatial index for ${key}`);
  return spatialIndex;
}

async function headFromR2(env: Env, key: string): Promise<{ size?: number } | null> {
  const obj = await env.RIDINGS.head(key);
  return obj ? { size: obj.size } : null;
}

/**
 * D1 spatial decorator. Wraps `env.RIDING_DB` behind the optional `querySpatial` port method so
 * `riding-lookup` never reaches for the binding itself.
 */
export function withD1Spatial(source: DatasetSource, env: Env): DatasetSource {
  return {
    ...source,
    querySpatial: async (key, lon, lat) => {
      const feature = await queryRidingFromDatabase(env, key, lon, lat);
      return feature ? feature.properties ?? {} : null;
    },
  };
}

/**
 * The production adapter: R2 (`env.RIDINGS`) + the isolate's LRUs + retry/breaker.
 *
 * `caches` defaults to the isolate-wide LRUs in `./cache` (the integration tests clear those).
 * Pass `createDatasetCaches()` to give an owner — e.g. the queue DO — caches of its own.
 */
export function r2DatasetSource(env: Env, caches?: DatasetCaches): DatasetSource {
  const resolved = caches ?? { geo: geoCacheLRU, spatial: spatialIndexCacheLRU };
  const base: DatasetSource = {
    load: (key) => loadGeoFromR2(env, resolved, key),
    getSpatialIndex: (key) => getSpatialIndexFromCaches(env, resolved, key),
    head: (key) => headFromR2(env, key),
  };

  return getSpatialDbConfig(env).ENABLED && env.RIDING_DB ? withD1Spatial(base, env) : base;
}

/**
 * The in-memory adapter: tests and the queue DO's first tests. No LRU, retry or breaker — a map
 * lookup is the whole point. The missing-key error matches R2's so callers cannot tell them apart.
 */
export function inMemoryDatasetSource(
  datasets: Record<string, GeoJSONFeatureCollection>
): DatasetSource {
  const store = new Map(Object.entries(datasets));
  return {
    load: async (key) => {
      const geo = store.get(key);
      if (!geo) throw new Error(`R2 object not found: ${key}`);
      return geo;
    },
    getSpatialIndex: async (key) => {
      const geo = store.get(key);
      if (!geo) throw new Error(`R2 object not found: ${key}`);
      return createSpatialIndex(geo);
    },
    head: async (key) => (store.has(key) ? {} : null),
  };
}
