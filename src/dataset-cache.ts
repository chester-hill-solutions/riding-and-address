import { GeoJSONFeatureCollection, SpatialIndex } from './types';
import { TIME_CONSTANTS } from './config';

/**
 * The in-process cache for parsed datasets, and the LRU implementation it uses.
 *
 * **Moved out of `src/cache.ts` because `cache.ts` had become two things.**
 *
 * `cache.ts` was the geocoding cache *and* the warming orchestrator *and* the holder of the
 * parsed-GeoJSON LRU. `dataset-source.ts` needed the LRU, so it imported `cache.ts`, and
 * `cache.ts` imported the dataset registry — which closed the cycle through `datasets.ts`.
 *
 * The parsed-GeoJSON cache is a *dataset-loading* concern, so it lives with the dataset source
 * rather than with the geocoding cache it had nothing to do with.
 *
 * `src/cache.ts` re-exports everything here, so the other importers are unchanged.
 */
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

