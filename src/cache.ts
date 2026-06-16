import { Env, GeoJSONFeatureCollection, GeoJSONGeometry, SpatialIndex, CacheWarmingState, QueryParams, LookupResult, LookupCacheEntry } from './types';
import { geocodeIfNeeded } from './geocoding';
import { TIME_CONSTANTS, TIME_CONSTANTS_SECONDS } from './config';
import { geocodingCircuitBreaker } from './circuit-breaker';
import { pickDataset, getLiveWarmTargets } from './datasets';

// Cache configuration
export const CACHE_CONFIG = {
  MAX_SIZE: 30, // Maximum number of datasets to cache
  MAX_AGE: TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS,
};

// Cache warming configuration
export const CACHE_WARMING_CONFIG = {
  ENABLED: true,
  WARMING_INTERVAL: TIME_CONSTANTS.SIX_HOURS_MS,
  BATCH_SIZE: 5,
  POPULAR_LOCATIONS: [
    { name: "Toronto", lat: 43.6532, lon: -79.3832 },
    { name: "Vancouver", lat: 49.2827, lon: -123.1207 },
    { name: "Montreal", lat: 45.5017, lon: -73.5673 },
    { name: "Calgary", lat: 51.0447, lon: -114.0719 },
    { name: "Ottawa", lat: 45.4215, lon: -75.6972 },
    { name: "Edmonton", lat: 53.5461, lon: -113.4938 },
    { name: "Winnipeg", lat: 49.8951, lon: -97.1384 },
    { name: "Quebec City", lat: 46.8139, lon: -71.2080 },
    { name: "Hamilton", lat: 43.2557, lon: -79.8711 },
    { name: "London", lat: 42.9849, lon: -81.2453 }
  ],
  POPULAR_POSTAL_CODES: [
    "M5V 3A8", // Toronto
    "V6B 1A1", // Vancouver
    "H2Y 1C6", // Montreal
    "T2P 1J9", // Calgary
    "K1A 0A6", // Ottawa
    "T5J 2R2", // Edmonton
    "R3C 1A5", // Winnipeg
    "G1R 2B5", // Quebec City
    "L8P 4X3", // Hamilton
    "N6A 3K7"  // London
  ]
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

// Cache warming state
export const cacheWarmingState: CacheWarmingState = {
  isRunning: false,
  lastWarmed: 0,
  warmingCount: 0,
  errorCount: 0,
  currentBatch: 0,
  totalBatches: 0,
  successCount: 0,
  failureCount: 0,
  nextWarmingTime: 0,
  lastError: undefined
};

// Lock for atomic cache warming state management
let cacheWarmingLock = false;

// Cache warming functions
export async function warmCacheForLocation(
  env: Env, 
  lat: number, 
  lon: number, 
  locationName: string,
  loadGeo: (env: Env, r2Key: string) => Promise<void>,
  lookupRiding: (env: Env, pathname: string, lon: number, lat: number) => Promise<LookupResult>
): Promise<boolean> {
  try {
    // Warm live datasets for this location
    const datasets = getLiveWarmTargets();

    for (const dataset of datasets) {
      try {
        // Load the GeoJSON data to populate caches
        await loadGeo(env, dataset.r2Key);
        
        // Perform a lookup to warm the spatial index
        const result = await lookupRiding(env, dataset.pathname, lon, lat);
        
        // Store lookup result in cache
        const cacheKey = generateLookupCacheKey({ lat, lon }, dataset.pathname);
        const datasetName = dataset.r2Key.replace('.geojson', '');
        await setCachedLookupResult(env, cacheKey, result, datasetName, { lon, lat });
        
        console.log(`Cache warmed for ${locationName} on ${dataset.pathname}`);
      } catch (error) {
        console.warn(`Failed to warm cache for ${locationName} on ${dataset.pathname}:`, error);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`Cache warming failed for ${locationName}:`, error);
    return false;
  }
}

export async function warmCacheForPostalCode(
  env: Env, 
  postalCode: string,
  loadGeo: (env: Env, r2Key: string) => Promise<void>,
  lookupRiding: (env: Env, pathname: string, lon: number, lat: number) => Promise<LookupResult>
): Promise<boolean> {
  try {
    // Geocode the postal code first
    const query: QueryParams = { postal: postalCode };
    const { lon, lat } = await geocodeIfNeeded(env, query, undefined, undefined, geocodingCircuitBreaker ? {
      execute: (key: string, fn: () => Promise<unknown>) => geocodingCircuitBreaker.execute(key, fn)
    } : undefined);
    
    // Warm cache for all datasets (includes lookup cache)
    const locationWarmed = await warmCacheForLocation(env, lat, lon, `Postal Code ${postalCode}`, loadGeo, lookupRiding);
    
    // Also warm lookup cache by postal code directly
    const datasets = getLiveWarmTargets();
    
    for (const dataset of datasets) {
      try {
        const result = await lookupRiding(env, dataset.pathname, lon, lat);
        const cacheKey = generateLookupCacheKey({ postal: postalCode }, dataset.pathname);
        const datasetName = dataset.r2Key.replace('.geojson', '');
        await setCachedLookupResult(env, cacheKey, result, datasetName, { lon, lat });
      } catch (error) {
        console.warn(`Failed to warm lookup cache for postal code ${postalCode} on ${dataset.pathname}:`, error);
      }
    }
    
    return locationWarmed;
  } catch (error) {
    console.error(`Cache warming failed for postal code ${postalCode}:`, error);
    return false;
  }
}

export async function performCacheWarming(
  env: Env,
  loadGeo: (env: Env, r2Key: string) => Promise<void>,
  lookupRiding: (env: Env, pathname: string, lon: number, lat: number) => Promise<LookupResult>
): Promise<void> {
  if (!CACHE_WARMING_CONFIG.ENABLED) {
    return;
  }

  // Atomic check and set using lock to prevent race conditions
  if (cacheWarmingLock || cacheWarmingState.isRunning) {
    return;
  }
  
  const now = Date.now();
  if (now < cacheWarmingState.nextWarmingTime) {
    return;
  }

  // Acquire lock atomically
  cacheWarmingLock = true;
  if (cacheWarmingState.isRunning) {
    cacheWarmingLock = false;
    return;
  }
  
  cacheWarmingState.isRunning = true;
  cacheWarmingLock = false;
  cacheWarmingState.currentBatch = 0;
  cacheWarmingState.successCount = 0;
  cacheWarmingState.failureCount = 0;

  try {
    console.log("Starting cache warming process...");

    // Calculate total batches
    const totalLocations = CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.length + CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.length;
    cacheWarmingState.totalBatches = Math.ceil(totalLocations / CACHE_WARMING_CONFIG.BATCH_SIZE);

    // Warm popular locations
    for (let i = 0; i < CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.length; i += CACHE_WARMING_CONFIG.BATCH_SIZE) {
      const batch = CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.slice(i, i + CACHE_WARMING_CONFIG.BATCH_SIZE);
      cacheWarmingState.currentBatch++;

      console.log(`Warming batch ${cacheWarmingState.currentBatch}/${cacheWarmingState.totalBatches} (locations)`);

      const promises = batch.map(async (location) => {
        const success = await warmCacheForLocation(env, location.lat, location.lon, location.name, loadGeo, lookupRiding);
        if (success) {
          cacheWarmingState.successCount++;
        } else {
          cacheWarmingState.failureCount++;
        }
        return success;
      });

      await Promise.allSettled(promises);

      // Small delay between batches to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Warm popular postal codes
    for (let i = 0; i < CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.length; i += CACHE_WARMING_CONFIG.BATCH_SIZE) {
      const batch = CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.slice(i, i + CACHE_WARMING_CONFIG.BATCH_SIZE);
      cacheWarmingState.currentBatch++;

      console.log(`Warming batch ${cacheWarmingState.currentBatch}/${cacheWarmingState.totalBatches} (postal codes)`);

      const promises = batch.map(async (postalCode) => {
        const success = await warmCacheForPostalCode(env, postalCode, loadGeo, lookupRiding);
        if (success) {
          cacheWarmingState.successCount++;
        } else {
          cacheWarmingState.failureCount++;
        }
        return success;
      });

      await Promise.allSettled(promises);

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    cacheWarmingState.lastWarmed = now;
    cacheWarmingState.nextWarmingTime = now + CACHE_WARMING_CONFIG.WARMING_INTERVAL;

    console.log(`Cache warming completed. Success: ${cacheWarmingState.successCount}, Failures: ${cacheWarmingState.failureCount}`);
  } catch (error) {
    console.error("Cache warming process failed:", error);
    cacheWarmingState.lastError = error instanceof Error ? error.message : 'Unknown error';
  } finally {
    // Release lock and reset running state
    cacheWarmingState.isRunning = false;
    cacheWarmingLock = false;
  }
}

// Start cache warming on worker initialization
export async function initializeCacheWarming(
  env: Env,
  loadGeo: (env: Env, r2Key: string) => Promise<void>,
  lookupRiding: (env: Env, pathname: string, lon: number, lat: number) => Promise<LookupResult>
): Promise<void> {
  if (!CACHE_WARMING_CONFIG.ENABLED) {
    return;
  }

  // Start warming immediately
  performCacheWarming(env, loadGeo, lookupRiding).catch(error => {
    console.error("Initial cache warming failed:", error);
  });

  // Set up periodic warming
  setInterval(() => {
    performCacheWarming(env, loadGeo, lookupRiding).catch(error => {
      console.error("Periodic cache warming failed:", error);
    });
  }, CACHE_WARMING_CONFIG.WARMING_INTERVAL);
}

// Get cache warming status
export function getCacheWarmingStatus(): CacheWarmingState {
  return { ...cacheWarmingState };
}

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
  if (!env.LOOKUP_CACHE) return null;
  
  try {
    const cached = await env.LOOKUP_CACHE.get(cacheKey, 'json') as LookupCacheEntry | null;
    if (!cached) return null;
    
    // Check if cache entry is still valid (24 hours TTL)
    // Don't delete expired entries - let KV TTL handle cleanup
    const maxAge = TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS;
    if (Date.now() - cached.timestamp > maxAge) {
      return null;
    }
    
    return cached;
  } catch (error) {
    console.warn('Failed to get cached lookup result:', error);
    return null;
  }
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
  if (!env.LOOKUP_CACHE) return;
  
  try {
    const entry: LookupCacheEntry = {
      properties: result.properties,
      riding: result.riding,
      point,
      normalizedAddress: result.normalizedAddress,
      timestamp: Date.now(),
      dataset
    };
    
    // Store with 24 hour TTL
    await env.LOOKUP_CACHE.put(cacheKey, JSON.stringify(entry), {
      expirationTtl: TIME_CONSTANTS_SECONDS.TWENTY_FOUR_HOURS
    });
  } catch (error) {
    console.warn('Failed to cache lookup result:', error);
    // Don't throw - cache errors should never fail requests
  }
}
