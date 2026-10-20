import { z } from 'zod';
import { Env, GeoJSONGeometry, QueryParams, LookupResult, LookupCacheEntry, Suggestion, SuggestQueryParams } from './types';
import { readTimestampedEntry, writeTimestampedEntry } from './kv-cache';
import { TIME_CONSTANTS, TIME_CONSTANTS_SECONDS } from './config';
import { pickDataset } from './datasets';
import { normalizeSearchToken } from './oda-normalize';
import { CACHE_CONFIG, LRUCache } from './dataset-cache';

/**
 * Shape checks for the timestamped cache entries.
 *
 * A cached lookup carries a riding, so believing a corrupted one answers the wrong riding entirely —
 * it is discarded as a miss rather than cast. `.passthrough()` keeps the optional fields the cache
 * stores (geocode, point, addressComponents, …), so validation narrows nothing away.
 */
const LookupCacheEntrySchema = z
  .object({
    properties: z.record(z.string(), z.unknown()).nullable(),
    dataset: z.string(),
    timestamp: z.number(),
  })
  .passthrough();

/**
 * The suggestion elements are validated by the suggest contract's own consumer, not deep-checked
 * here; what this pins is that the entry is an object with the right shape of fields.
 */
const SuggestCacheEntrySchema = z
  .object({
    suggestions: z.array(z.unknown()),
    provinces: z.array(z.string()),
    timestamp: z.number(),
  })
  .passthrough() as unknown as z.ZodType<SuggestCacheEntry>;

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
  const key = `lookup:v3:${dataset}:${type}:${value}:${pathname}:${query.geocodeMethod ?? 'auto'}:${normalizeString(query.state) ?? ''}`;
  if (key.length > 512) {
    // Hash long keys (simple hash for now)
    const hash = key.split('').reduce((acc, char) => {
      const hash = ((acc << 5) - acc) + char.charCodeAt(0);
      return hash & hash;
    }, 0);
    return `lookup:v3:${dataset}:${type}:hash:${Math.abs(hash)}:${pathname}`;
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
    'lookup result',
    LookupCacheEntrySchema
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
    geocode: result.geocode,
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
    'suggestions',
    SuggestCacheEntrySchema
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
