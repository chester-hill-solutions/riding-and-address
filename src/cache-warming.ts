/**
 * The cache warming job.
 *
 * This is a scheduler job, not a cache: it owns what to warm (popular cities and
 * postal codes), when to run (interval, in-flight lock and next-run gate) and how
 * (fixed-size batches with a pause between them). It also owns its dependencies —
 * the riding lookup and the R2 GeoJSON loader — so the Worker's scheduled handler
 * stays a list of one-line job invocations rather than a wiring site.
 *
 * The cache module (`./cache`) holds only the cache: the LRU, the cache keys and
 * the KV accessors. It has no knowledge of cron.
 */

import { CacheWarmingState, Env, QueryParams } from './types';
import { geocodeIfNeeded } from './geocoding';
import { geocodingExecutor } from './circuit-breaker';
import { getLiveWarmTargets } from './datasets';
import { TIME_CONSTANTS } from './config';
import { generateLookupCacheKey, setCachedLookupResult } from './cache';
import { cachedLookupRiding, loadGeo } from './riding-lookup';

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
  locationName: string
): Promise<boolean> {
  try {
    // Warm live datasets for this location
    const datasets = getLiveWarmTargets();

    for (const dataset of datasets) {
      try {
        // Load the GeoJSON data to populate caches
        await loadGeo(env, dataset.r2Key);

        // Perform a lookup to warm the spatial index
        const result = await cachedLookupRiding(env, dataset.pathname, lon, lat);

        // Store lookup result in cache
        const cacheKey = generateLookupCacheKey({ lat, lon }, dataset.pathname);
        const datasetName = dataset.r2Key.replace('.geojson', '');
        await setCachedLookupResult(env, cacheKey, result, datasetName, { lon, lat });
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
  postalCode: string
): Promise<boolean> {
  try {
    // Geocode the postal code first
    const query: QueryParams = { postal: postalCode };
    const { lon, lat } = await geocodeIfNeeded(env, query, { circuitBreaker: geocodingExecutor() });

    // Warm cache for all datasets (includes lookup cache)
    const locationWarmed = await warmCacheForLocation(env, lat, lon, `Postal Code ${postalCode}`);

    // Also warm lookup cache by postal code directly
    const datasets = getLiveWarmTargets();

    for (const dataset of datasets) {
      try {
        const result = await cachedLookupRiding(env, dataset.pathname, lon, lat);
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

export async function performCacheWarming(env: Env): Promise<void> {
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
    // Calculate total batches
    const totalLocations = CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.length + CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.length;
    cacheWarmingState.totalBatches = Math.ceil(totalLocations / CACHE_WARMING_CONFIG.BATCH_SIZE);

    // Warm popular locations
    for (let i = 0; i < CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.length; i += CACHE_WARMING_CONFIG.BATCH_SIZE) {
      const batch = CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.slice(i, i + CACHE_WARMING_CONFIG.BATCH_SIZE);
      cacheWarmingState.currentBatch++;

      const promises = batch.map(async (location) => {
        const success = await warmCacheForLocation(env, location.lat, location.lon, location.name);
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

      const promises = batch.map(async (postalCode) => {
        const success = await warmCacheForPostalCode(env, postalCode);
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
    // Outcome counts are surfaced via getCacheWarmingStatus() and the [Cron] completion log.
  } catch (error) {
    console.error("Cache warming process failed:", error);
    cacheWarmingState.lastError = error instanceof Error ? error.message : 'Unknown error';
  } finally {
    // Release lock and reset running state
    cacheWarmingState.isRunning = false;
    cacheWarmingLock = false;
  }
}

// Get cache warming status
export function getCacheWarmingStatus(): CacheWarmingState {
  return { ...cacheWarmingState };
}
