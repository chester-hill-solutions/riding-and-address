import { Env, GeoJSONFeatureCollection, GeoJSONGeometry, SpatialIndex, QueryParams, LookupResult, LookupCacheEntry, Suggestion, SuggestQueryParams } from './types';
import { readTimestampedEntry, writeTimestampedEntry } from './kv-cache';
import { TIME_CONSTANTS, TIME_CONSTANTS_SECONDS } from './config';
import { pickDataset } from './datasets';
import { normalizeSearchToken } from './oda-normalize';

// Cache configuration
export const CACHE_CONFIG = {
  MAX_SIZE: 30, // Maximum number of datasets to cache
  MAX_AGE: TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS,
};

// LRU Cache entry structure with timestamp
interface CacheEntry<V> {
  value: V;
  timestamp: number;
}

// LRU Cache implementation
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize: number, maxAge: number) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.moveToEnd(key);
    return entry.value;
  }

  set(key: K, value: V): void {
    const now = Date.now();
    const newEntry: CacheEntry<V> = { value, timestamp: now };

    // If key exists, update and move to end
    if (this.cache.has(key)) {
      this.cache.set(key, newEntry);
      this.moveToEnd(key);
      return;
    }

    // If at capacity, first try to remove expired entries
    if (this.cache.size >= this.maxSize) {
      // Remove expired entries first (oldest first)
      let expiredRemoved = false;
      for (let i = 0; i < this.accessOrder.length; i++) {
        const testKey = this.accessOrder[i];
        const testEntry = this.cache.get(testKey);
        if (testEntry) {
          const age = now - testEntry.timestamp;
          if (age > this.maxAge) {
            this.delete(testKey);
            expiredRemoved = true;
            break; // Only remove one expired entry at a time
          }
        }
      }
      
      // If no expired entries found, remove least recently used
      if (!expiredRemoved) {
        const lruKey = this.accessOrder.shift();
        if (lruKey) {
          this.cache.delete(lruKey);
        }
      }
    }

    this.cache.set(key, newEntry);
    this.accessOrder.push(key);
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  /** Remove all expired entries and return count of removed items. */
  cleanupExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const key of [...this.accessOrder]) {
      const entry = this.cache.get(key);
      if (entry && now - entry.timestamp > this.maxAge) {
        this.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private moveToEnd(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }
}

// LRU cache instances
export const geoCacheLRU = new LRUCache<string, GeoJSONFeatureCollection>(CACHE_CONFIG.MAX_SIZE, CACHE_CONFIG.MAX_AGE);
export const spatialIndexCacheLRU = new LRUCache<string, SpatialIndex>(CACHE_CONFIG.MAX_SIZE, CACHE_CONFIG.MAX_AGE);

// Cache utility functions
export function getCachedGeoJSON(key: string): GeoJSONFeatureCollection | undefined {
  return geoCacheLRU.get(key);
}

export function setCachedGeoJSON(key: string, data: GeoJSONFeatureCollection): void {
  geoCacheLRU.set(key, data);
}

export function getCachedSpatialIndex(key: string): SpatialIndex | undefined {
  return spatialIndexCacheLRU.get(key);
}

export function setCachedSpatialIndex(key: string, data: SpatialIndex): void {
  spatialIndexCacheLRU.set(key, data);
}

// LRU cache for simplified boundaries
export const simplifiedBoundariesCacheLRU = new LRUCache<string, GeoJSONGeometry>(CACHE_CONFIG.MAX_SIZE, CACHE_CONFIG.MAX_AGE);

export function getCachedSimplifiedBoundary(cacheKey: string): GeoJSONGeometry | undefined {
  return simplifiedBoundariesCacheLRU.get(cacheKey);
}

export function setCachedSimplifiedBoundary(cacheKey: string, geometry: GeoJSONGeometry): void {
  simplifiedBoundariesCacheLRU.set(cacheKey, geometry);
}

// Lookup result cache functions

/**
 * Generates a normalized cache key for lookup requests.
 * Normalizes query parameters and coordinates to ensure consistent caching.
 * 
 * @param query - Query parameters (address, postal, city, state, country, lat, lon)
 * @param pathname - API pathname (e.g., "/api", "/api/qc", "/api/on")
 * @returns Cache key string
 */
export function generateLookupCacheKey(query: QueryParams, pathname: string): string {
  const { r2Key } = pickDataset(pathname);
  const dataset = r2Key.replace('.geojson', '');
  
  // Normalize coordinates to 5 decimal places (~1m precision)
  const normalizeCoord = (coord: number | undefined): string | undefined => {
    if (coord === undefined) return undefined;
    return (Math.round(coord * 100000) / 100000).toString();
  };
  
  // Normalize string inputs
  const normalizeString = (str: string | undefined): string | undefined => {
    if (!str) return undefined;
    return str.toLowerCase().trim().replace(/\s+/g, ' ');
  };
  
  // Determine cache key type and value
  let type: string;
  let value: string;
  
  if (query.lat !== undefined && query.lon !== undefined) {
    // Use coordinates
    type = 'coordinate';
    const latNorm = normalizeCoord(query.lat);
    const lonNorm = normalizeCoord(query.lon);
    value = `${lonNorm},${latNorm}`;
  } else if (query.postal) {
    // Use postal code
    type = 'postal';
    value = normalizeString(query.postal)?.replace(/\s+/g, '') || '';
  } else if (query.address) {
    // Use address
    type = 'address';
    const parts: string[] = [];
    if (query.address) parts.push(normalizeString(query.address) || '');
    if (query.city) parts.push(normalizeString(query.city) || '');
    if (query.state) parts.push(normalizeString(query.state) || '');
    if (query.country) parts.push(normalizeString(query.country) || '');
    value = parts.filter(Boolean).join(' ');
  } else {
    // Fallback: use all available parameters
    type = 'query';
    const parts: string[] = [];
    if (query.city) parts.push(normalizeString(query.city) || '');
    if (query.state) parts.push(normalizeString(query.state) || '');
    if (query.country) parts.push(normalizeString(query.country) || '');
    value = parts.filter(Boolean).join(' ') || 'unknown';
  }
  
  // Ensure key doesn't exceed KV 512 byte limit
  const key = `lookup:v2:${dataset}:${type}:${value}:${pathname}`;
  if (key.length > 512) {
    // Hash long keys (simple hash for now)
    const hash = key.split('').reduce((acc, char) => {
      const hash = ((acc << 5) - acc) + char.charCodeAt(0);
      return hash & hash;
    }, 0);
    return `lookup:${dataset}:${type}:hash:${Math.abs(hash)}:${pathname}`;
  }
  
  return key;
}

/**
 * Retrieves a cached lookup result from KV storage.
 * Validates cache entry age (24 hour TTL) and returns null if expired.
 * Does not delete expired entries - they will be cleaned up by KV TTL or when cache reaches limit.
 * 
 * @param env - Environment bindings containing LOOKUP_CACHE KV namespace
 * @param cacheKey - Cache key generated by generateLookupCacheKey
 * @returns Cached lookup result, or null if not found/expired
 */
export async function getCachedLookupResult(env: Env, cacheKey: string): Promise<LookupCacheEntry | null> {
  return readTimestampedEntry<LookupCacheEntry>(
    env.LOOKUP_CACHE,
    cacheKey,
    TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS,
    'lookup result'
  );
}

/**
 * Stores a lookup result in KV cache with 24-hour TTL.
 * 
 * @param env - Environment bindings containing LOOKUP_CACHE KV namespace
 * @param cacheKey - Cache key generated by generateLookupCacheKey
 * @param result - Lookup result to cache
 * @param dataset - Dataset identifier (e.g., "federalridings-2024")
 * @param point - Optional point coordinates (lon, lat) to store with the cache entry
 */
export async function setCachedLookupResult(env: Env, cacheKey: string, result: LookupResult, dataset: string, point?: { lon: number; lat: number }): Promise<void> {
  const entry: LookupCacheEntry = {
    properties: result.properties,
    riding: result.riding,
    point,
    normalizedAddress: result.normalizedAddress,
    addressComponents: result.addressComponents,
    mailingAddress: result.mailingAddress,
    timestamp: Date.now(),
    dataset
  };

  await writeTimestampedEntry(
    env.LOOKUP_CACHE,
    cacheKey,
    entry,
    TIME_CONSTANTS_SECONDS.TWENTY_FOUR_HOURS,
    'lookup result'
  );
}

interface SuggestCacheEntry {
  suggestions: Suggestion[];
  provinces: string[];
  nextCursor?: string;
  timestamp: number;
}

/**
 * Cache key for GET /api/search.
 *
 * Kept separate from generateLookupCacheKey rather than overloading it: the inputs are free text
 * plus hints, not QueryParams, and there is no dataset involved. A locationBias is bucketed to
 * ~1km so nearby keystrokes share an entry instead of each caret position minting a new one.
 */
export function generateSuggestCacheKey(params: SuggestQueryParams): string {
  const q = normalizeSearchToken(params.q);
  const provinces = [...params.provinces].sort().join(',');

  let bias = '';
  if (params.locationBias) {
    const bucket = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
    bias = `${bucket(params.locationBias.lat)},${bucket(params.locationBias.lon)}`;
  }

  let restriction = '';
  if (params.locationRestriction) {
    const r = params.locationRestriction;
    restriction = [r.minLat, r.minLon, r.maxLat, r.maxLon].map((v) => v.toFixed(4)).join(',');
  }

  // The cursor is part of the key: without it page 2 of a container would be served page 1's
  // cached body, since every other input is identical.
  return `suggest:v1:${q}:${provinces}:${params.limit}:${params.containerId || ''}:${params.cursor || ''}:${bias}:${restriction}`;
}

export async function getCachedSuggestions(
  env: Env,
  cacheKey: string,
  ttlSeconds: number
): Promise<SuggestCacheEntry | null> {
  return readTimestampedEntry<SuggestCacheEntry>(
    env.LOOKUP_CACHE,
    cacheKey,
    ttlSeconds * 1000,
    'suggestions'
  );
}

export async function setCachedSuggestions(
  env: Env,
  cacheKey: string,
  suggestions: Suggestion[],
  provinces: string[],
  ttlSeconds: number,
  nextCursor?: string
): Promise<void> {
  const entry: SuggestCacheEntry = { suggestions, provinces, nextCursor, timestamp: Date.now() };
  await writeTimestampedEntry(env.LOOKUP_CACHE, cacheKey, entry, ttlSeconds, 'suggestions');
}
