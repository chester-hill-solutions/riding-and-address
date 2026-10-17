import { describe, it, expect } from 'vitest';
import { getCachedLookupResult, setCachedLookupResult } from '../src/cache';
import { getCachedGeocoding, getCachedReverseGeocoding } from '../src/geocoding';
import type { Env, LookupResult } from '../src/types';

/**
 * The timestamped caches are shape-checked on read (the follow-up to #124). A malformed lookup entry
 * carries a *riding*, and a malformed geocoding entry carries *coordinates* the point-in-polygon runs
 * on — believing either answers the wrong riding, so a mismatch must read as a miss.
 */

function kv(entries: Record<string, unknown>): KVNamespace {
  return {
    get: async (key: string, type?: string) => {
      const value = entries[key];
      if (value === undefined) return null;
      return type === 'json' ? value : JSON.stringify(value);
    },
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
}

const entry = (over: Record<string, unknown> = {}) => ({
  properties: { FED_NUM: 35079, ED_NAMEE: 'Ottawa Centre' },
  riding: 'Ottawa Centre',
  point: { lon: -75.69, lat: 45.42 },
  dataset: 'federalridings-2024.geojson',
  timestamp: Date.now(),
  ...over,
});

describe('lookup cache validation', () => {
  it('returns a well-formed entry, optional fields intact', async () => {
    const env = { LOOKUP_CACHE: kv({ k: entry() }) } as unknown as Env;
    const cached = await getCachedLookupResult(env, 'k');
    expect(cached?.riding).toBe('Ottawa Centre');
    expect(cached?.point).toEqual({ lon: -75.69, lat: 45.42 });
  });

  it('discards an entry whose properties are not an object or null', async () => {
    const env = { LOOKUP_CACHE: kv({ k: entry({ properties: 'Ottawa Centre' }) }) } as unknown as Env;
    expect(await getCachedLookupResult(env, 'k')).toBeNull();
  });

  it('discards an entry with no dataset', async () => {
    const env = { LOOKUP_CACHE: kv({ k: entry({ dataset: undefined }) }) } as unknown as Env;
    expect(await getCachedLookupResult(env, 'k')).toBeNull();
  });

  it('discards an entry with a non-numeric timestamp', async () => {
    const env = { LOOKUP_CACHE: kv({ k: entry({ timestamp: 'soon' }) }) } as unknown as Env;
    expect(await getCachedLookupResult(env, 'k')).toBeNull();
  });

  it('round-trips a written entry', async () => {
    const store: Record<string, unknown> = {};
    const env = {
      LOOKUP_CACHE: {
        get: async (key: string) => store[key] ?? null,
        put: async (key: string, value: string) => {
          store[key] = JSON.parse(value);
        },
        delete: async () => {},
        list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      } as unknown as KVNamespace,
    } as unknown as Env;

    const written: LookupResult = {
      properties: { FED_NUM: 1 },
      riding: 'Ottawa Centre',
    };
    await setCachedLookupResult(env, 'k', written, 'federalridings-2024.geojson');
    expect((await getCachedLookupResult(env, 'k'))?.riding).toBe('Ottawa Centre');
  });
});

describe('geocoding cache validation', () => {
  const geoEntry = (over: Record<string, unknown> = {}) => ({
    lon: -75.69,
    lat: 45.42,
    provider: 'oda',
    timestamp: Date.now(),
    ...over,
  });

  it('returns a well-formed entry', async () => {
    const env = { GEOCODING_CACHE: kv({ k: geoEntry() }) } as unknown as Env;
    expect(await getCachedGeocoding(env, 'k')).toMatchObject({ lon: -75.69, lat: 45.42 });
  });

  it('discards coordinates of the wrong type', async () => {
    // A cached coordinate the point-in-polygon would run on: a string here is not usable.
    const env = { GEOCODING_CACHE: kv({ k: geoEntry({ lat: '45.42' }) }) } as unknown as Env;
    expect(await getCachedGeocoding(env, 'k')).toBeNull();
  });

  it('discards an entry with no provider', async () => {
    const env = { GEOCODING_CACHE: kv({ k: geoEntry({ provider: undefined }) }) } as unknown as Env;
    expect(await getCachedGeocoding(env, 'k')).toBeNull();
  });

  it('discards a malformed reverse-geocoding entry', async () => {
    const env = {
      GEOCODING_CACHE: kv({ k: { formattedAddress: 42, components: {}, timestamp: Date.now() } }),
    } as unknown as Env;
    expect(await getCachedReverseGeocoding(env, 'k')).toBeNull();
  });
});
