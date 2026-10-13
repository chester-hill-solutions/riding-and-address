import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Env, LookupResult } from '../src/types';

const mocks = vi.hoisted(() => ({
  loadGeo: vi.fn(async () => undefined),
  lookupRiding: vi.fn(async () => ({ properties: {}, riding: 'Test Riding' }) as LookupResult),
  geocode: vi.fn(async () => ({ lon: -79.3832, lat: 43.6532 })),
}));

vi.mock('../src/riding-lookup', () => ({
  loadGeo: mocks.loadGeo,
  cachedLookupRiding: mocks.lookupRiding,
}));

vi.mock('../src/geocoding', () => ({
  geocodeIfNeeded: mocks.geocode,
}));

import {
  CACHE_WARMING_CONFIG,
  cacheWarmingState,
  getCacheWarmingStatus,
  performCacheWarming,
  warmCacheForLocation,
  warmCacheForPostalCode,
} from '../src/cache-warming';
import { getLiveWarmTargets } from '../src/datasets';

const env = {} as unknown as Env;
const liveTargets = getLiveWarmTargets();

function resetState(): void {
  cacheWarmingState.isRunning = false;
  cacheWarmingState.lastWarmed = 0;
  cacheWarmingState.warmingCount = 0;
  cacheWarmingState.errorCount = 0;
  cacheWarmingState.currentBatch = 0;
  cacheWarmingState.totalBatches = 0;
  cacheWarmingState.successCount = 0;
  cacheWarmingState.failureCount = 0;
  cacheWarmingState.nextWarmingTime = 0;
  cacheWarmingState.lastError = undefined;
}

beforeEach(() => {
  resetState();
  mocks.loadGeo.mockReset();
  mocks.lookupRiding.mockReset();
  mocks.geocode.mockReset();
  mocks.loadGeo.mockImplementation(async () => undefined);
  mocks.lookupRiding.mockImplementation(
    async () => ({ properties: {}, riding: 'Test Riding' }) as LookupResult
  );
  mocks.geocode.mockImplementation(async () => ({ lon: -79.3832, lat: 43.6532 }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('warmCacheForLocation', () => {
  it('warms every live dataset for a location', async () => {
    const ok = await warmCacheForLocation(env, 43.6532, -79.3832, 'Toronto');

    expect(ok).toBe(true);
    expect(mocks.loadGeo).toHaveBeenCalledTimes(liveTargets.length);
    expect(mocks.lookupRiding).toHaveBeenCalledTimes(liveTargets.length);
    expect(mocks.loadGeo).toHaveBeenCalledWith(env, liveTargets[0].r2Key);
    expect(mocks.lookupRiding).toHaveBeenCalledWith(env, liveTargets[0].pathname, -79.3832, 43.6532);
  });

  it('continues past a dataset that throws and still reports success', async () => {
    mocks.loadGeo.mockRejectedValueOnce(new Error('r2 down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const ok = await warmCacheForLocation(env, 43.6532, -79.3832, 'Toronto');

    expect(ok).toBe(true);
    expect(mocks.lookupRiding).toHaveBeenCalledTimes(liveTargets.length - 1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('warmCacheForPostalCode', () => {
  it('geocodes the postal code and warms both coordinate and postal lookups', async () => {
    const ok = await warmCacheForPostalCode(env, 'M5V 3A8');

    expect(ok).toBe(true);
    expect(mocks.geocode).toHaveBeenCalledTimes(1);
    // One pass for the coordinate lookup, one for the postal-key lookup.
    expect(mocks.lookupRiding).toHaveBeenCalledTimes(liveTargets.length * 2);
  });
});

describe('performCacheWarming', () => {
  it('warms locations and postal codes in batches and records state', async () => {
    vi.useFakeTimers();
    const before = Date.now();

    const run = performCacheWarming(env);
    await vi.runAllTimersAsync();
    await run;

    const total =
      CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.length + CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.length;

    expect(cacheWarmingState.totalBatches).toBe(Math.ceil(total / CACHE_WARMING_CONFIG.BATCH_SIZE));
    expect(cacheWarmingState.currentBatch).toBe(cacheWarmingState.totalBatches);
    expect(cacheWarmingState.successCount).toBe(total);
    expect(cacheWarmingState.failureCount).toBe(0);
    expect(cacheWarmingState.isRunning).toBe(false);
    expect(cacheWarmingState.lastWarmed).toBeGreaterThanOrEqual(before);
    expect(cacheWarmingState.nextWarmingTime).toBe(
      cacheWarmingState.lastWarmed + CACHE_WARMING_CONFIG.WARMING_INTERVAL
    );
    expect(mocks.geocode).toHaveBeenCalledTimes(CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.length);
  });

  it('skips when a run is already in flight', async () => {
    cacheWarmingState.isRunning = true;

    await performCacheWarming(env);

    expect(mocks.lookupRiding).not.toHaveBeenCalled();
    // The in-flight run owns this flag; the skipped call must not clear it.
    expect(cacheWarmingState.isRunning).toBe(true);
  });

  it('skips before the next warming time', async () => {
    cacheWarmingState.nextWarmingTime = Date.now() + 60_000;

    await performCacheWarming(env);

    expect(mocks.lookupRiding).not.toHaveBeenCalled();
    expect(cacheWarmingState.lastWarmed).toBe(0);
  });
});

describe('getCacheWarmingStatus', () => {
  it('returns a snapshot that cannot mutate the live state', () => {
    cacheWarmingState.successCount = 7;

    const status = getCacheWarmingStatus();
    expect(status.successCount).toBe(7);

    status.successCount = 99;
    expect(cacheWarmingState.successCount).toBe(7);
  });
});
