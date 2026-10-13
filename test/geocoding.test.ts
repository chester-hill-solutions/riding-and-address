import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateGeocodingCacheKey,
  generateReverseGeocodingCacheKey,
  parseGoogleAddressComponents,
  geocodeIfNeeded,
  stageLimit,
  OdaGeocodeError,
} from '../src/geocoding';
import {
  getGeocoderProvider,
  registerGeocoderProvider,
  unregisterGeocoderProvider,
  buildExternalProviderChain,
  runProviderChain,
  ProviderUnavailableError,
  NoResultsError,
  type GeocoderProvider,
  type GeocoderProviderInput,
} from '../src/geocoder-providers';
import { Env, QueryParams } from '../src/types';
import { CircuitBreakerOpenError } from '../src/circuit-breaker';

const nullKv = () =>
  ({
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  }) as unknown as KVNamespace;

/** ODA D1 double that misses every query (returns no rows). */
const missOdaDb = () =>
  ({
    prepare: () => ({
      bind: () => ({
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    }),
  }) as unknown as D1Database;


describe('generateGeocodingCacheKey', () => {
  it('generates a key with provider prefix', () => {
    const key = generateGeocodingCacheKey({ address: '123 Main St' }, 'google');
    expect(key.startsWith('geocoding:v2:google:')).toBe(true);
  });

  it('normalizes address to lowercase', () => {
    const key1 = generateGeocodingCacheKey({ address: 'OTTAWA' }, 'google');
    const key2 = generateGeocodingCacheKey({ address: 'ottawa' }, 'google');
    expect(key1).toBe(key2);
  });

  it('trims whitespace in address', () => {
    const key1 = generateGeocodingCacheKey({ address: '  Ottawa  ' }, 'google');
    const key2 = generateGeocodingCacheKey({ address: 'Ottawa' }, 'google');
    expect(key1).toBe(key2);
  });

  it('removes spaces from postal code', () => {
    const key1 = generateGeocodingCacheKey({ postal: 'K1A 0B1' }, 'google');
    const key2 = generateGeocodingCacheKey({ postal: 'k1a0b1' }, 'google');
    expect(key1).toBe(key2);
  });

  it('includes all query fields in the key', () => {
    const key = generateGeocodingCacheKey({
      address: '123 Main St',
      postal: 'K1A0B1',
      city: 'Ottawa',
      state: 'ON',
      country: 'CA'
    }, 'google');
    expect(key).toContain('123 main st');
    expect(key).toContain('k1a0b1');
    expect(key).toContain('ottawa');
    expect(key).toContain('on');
    expect(key).toContain('ca');
  });

  it('different providers produce different keys', () => {
    const key1 = generateGeocodingCacheKey({ address: 'Ottawa' }, 'google');
    const key2 = generateGeocodingCacheKey({ address: 'Ottawa' }, 'nominatim');
    expect(key1).not.toBe(key2);
  });
});

describe('generateReverseGeocodingCacheKey', () => {
  it('rounds coordinates to 5 decimal places', () => {
    const key = generateReverseGeocodingCacheKey(45.4215299999, -75.6971933333);
    expect(key).toBe('reverse:google:45.42153,-75.69719');
  });

  it('handles negative coordinates', () => {
    const key = generateReverseGeocodingCacheKey(-45.0, -75.0);
    expect(key).toBe('reverse:google:-45,-75');
  });

  it('handles zero coordinates', () => {
    const key = generateReverseGeocodingCacheKey(0, 0);
    expect(key).toBe('reverse:google:0,0');
  });
});

describe('parseGoogleAddressComponents', () => {
  it('returns undefined for missing address_components', () => {
    const result = parseGoogleAddressComponents({});
    expect(result).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    const result = parseGoogleAddressComponents(null as unknown as Record<string, unknown>);
    expect(result).toBeUndefined();
  });

  it('extracts street_number', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: '123', short_name: '123', types: ['street_number'] }
      ]
    });
    expect(result?.street_number).toBe('123');
  });

  it('extracts route (street name)', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Main Street', short_name: 'Main St', types: ['route'] }
      ]
    });
    expect(result?.route).toBe('Main Street');
  });

  it('extracts locality (city)', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] }
      ]
    });
    expect(result?.locality).toBe('Ottawa');
  });

  it('extracts administrative_area_level_1 (province)', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1'] }
      ]
    });
    expect(result?.administrative_area_level_1).toBe('Ontario');
  });

  it('extracts postal_code', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'K1A 0B1', short_name: 'K1A 0B1', types: ['postal_code'] }
      ]
    });
    expect(result?.postal_code).toBe('K1A 0B1');
  });

  it('extracts country', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Canada', short_name: 'CA', types: ['country'] }
      ]
    });
    expect(result?.country).toBe('Canada');
  });

  it('extracts formatted_address and place_id', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] }
      ],
      formatted_address: 'Ottawa, ON, Canada',
      place_id: 'ChIJrxNRX7IFzkwR7RXdMeFRaoo',
      types: ['locality', 'political']
    });
    expect(result?.formatted_address).toBe('Ottawa, ON, Canada');
    expect(result?.place_id).toBe('ChIJrxNRX7IFzkwR7RXdMeFRaoo');
    expect(result?.types).toEqual(['locality', 'political']);
  });

  it('extracts viewport and bounds', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] }
      ],
      geometry: {
        viewport: {
          northeast: { lat: 45.6, lng: -75.4 },
          southwest: { lat: 45.3, lng: -75.8 }
        },
        bounds: {
          northeast: { lat: 45.6, lng: -75.4 },
          southwest: { lat: 45.3, lng: -75.8 }
        }
      }
    });
    expect(result?.viewport).toEqual({
      northeast: { lat: 45.6, lng: -75.4 },
      southwest: { lat: 45.3, lng: -75.8 }
    });
    expect(result?.bounds).toEqual({
      northeast: { lat: 45.6, lng: -75.4 },
      southwest: { lat: 45.3, lng: -75.8 }
    });
  });

  it('prefers long_name over short_name', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1'] }
      ]
    });
    expect(result?.administrative_area_level_1).toBe('Ontario');
  });

  it('falls back to short_name when long_name is missing', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { short_name: 'ON', types: ['administrative_area_level_1'] }
      ]
    });
    expect(result?.administrative_area_level_1).toBe('ON');
  });

  it('extracts neighborhood and sublocality', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Centretown', short_name: 'Centretown', types: ['neighborhood'] }
      ]
    });
    expect(result?.neighborhood).toBe('Centretown');
  });

  it('extracts sublocality from sublocality type', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Downtown', short_name: 'Downtown', types: ['sublocality'] }
      ]
    });
    expect(result?.sublocality).toBe('Downtown');
  });

  it('returns undefined when no components are found', () => {
    const result = parseGoogleAddressComponents({
      address_components: []
    });
    expect(result).toBeUndefined();
  });

  it('extracts plus_code when present', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] }
      ],
      plus_code: {
        compound_code: '87G6M2F3+G4',
        global_code: '87G6M2F3+G4'
      }
    });
    expect(result?.plus_code).toEqual({
      compound_code: '87G6M2F3+G4',
      global_code: '87G6M2F3+G4'
    });
  });

  it('extracts multiple components from a realistic address', () => {
    const result = parseGoogleAddressComponents({
      address_components: [
        { long_name: '123', short_name: '123', types: ['street_number'] },
        { long_name: 'Main Street', short_name: 'Main St', types: ['route'] },
        { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] },
        { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1'] },
        { long_name: 'Canada', short_name: 'CA', types: ['country'] },
        { long_name: 'K1A 0B1', short_name: 'K1A 0B1', types: ['postal_code'] }
      ],
      formatted_address: '123 Main Street, Ottawa, ON K1A 0B1, Canada',
      place_id: 'test_place_id',
      types: ['street_address']
    });

    expect(result?.street_number).toBe('123');
    expect(result?.route).toBe('Main Street');
    expect(result?.locality).toBe('Ottawa');
    expect(result?.administrative_area_level_1).toBe('Ontario');
    expect(result?.country).toBe('Canada');
    expect(result?.postal_code).toBe('K1A 0B1');
    expect(result?.formatted_address).toBe('123 Main Street, Ottawa, ON K1A 0B1, Canada');
  });
});

describe('geocodeIfNeeded with ODA enabled', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('External geocoding should not be called when ODA is enabled');
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('uses ODA and does not call external providers', async () => {
    let callIndex = 0;
    // The exact-match query ranks every candidate city spelling, so it reads via all().
    const exactRow = {
      id: 1,
      province: 'ON',
      civic_number: '123',
      street_name: 'MAIN',
      street_type: 'ST',
      street_direction: '',
      unit: '',
      postal_code: 'M5V 2T6',
      city: 'Toronto',
      lat: 43.6532,
      lon: -79.3832,
      full_address: '123 Main St',
      search_key: '123|MAIN|ST||TORONTO|ON',
    };
    const db = {
      prepare: vi.fn(() => {
        callIndex++;
        return {
          bind: vi.fn(() => ({
            first: vi.fn(async () => (callIndex === 1 ? exactRow : null)),
            all: vi.fn(async () => ({ results: callIndex === 1 ? [exactRow] : [] })),
          })),
        };
      }),
    } as unknown as D1Database;

    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_DB: db,
      ODA_GEOCODING_ENABLED: 'true',
      ODA_PROVINCES: 'ON,QC',
    };

    const result = await geocodeIfNeeded(env, {
      address: '123 Main St',
      city: 'Toronto',
      state: 'ON',
    });

    expect(result.geocodeMethod).toBe('exact');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('falls back to GeoGratis when ODA address is not found', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => null),
          all: vi.fn(async () => ({ results: [] })),
        })),
      })),
    } as unknown as D1Database;

    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('geolocator.api.geo.ca') || String(url).includes('geogratis')) {
        return new Response(
          JSON.stringify([
            {
              geometry: { type: 'Point', coordinates: [-79.3124, 43.6891] },
              qualifier: 'GEOMETRIC_CENTER',
              score: 0.9,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as typeof fetch;

    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_DB: db,
      ODA_GEOCODING_ENABLED: 'true',
      ODA_PROVINCES: 'ON,QC',
      GEOCODING_CACHE: nullKv(),
    };

    const result = await geocodeIfNeeded(env, {
      address: '757 Victoria Park',
      city: 'Toronto',
      state: 'ON',
    });

    expect(result.lon).toBeCloseTo(-79.3124, 3);
    expect(result.lat).toBeCloseTo(43.6891, 3);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses region-filtered GeoGratis result for Victoria Park instead of Alberta', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('geolocator.api.geo.ca') || String(url).includes('geogratis')) {
        return new Response(
          JSON.stringify([
            {
              title: '757 Victoria Park Avenue, City Of Toronto, Ontario',
              qualifier: 'INTERPOLATED_POSITION',
              geometry: { type: 'Point', coordinates: [-79.288688, 43.692101] },
            },
            {
              title: '757 Highway & Route 757, Parkland County, Alberta',
              qualifier: 'LOCATION',
              geometry: { type: 'Point', coordinates: [-114.869564, 53.715415] },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as typeof fetch;

    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_GEOCODING_ENABLED: 'false',
      GEOCODING_CACHE: nullKv(),
    };

    const result = await geocodeIfNeeded(env, {
      address: '757 Victoria Park',
      city: 'Toronto',
      state: 'ON',
    });

    expect(result.lat).toBeCloseTo(43.692101, 3);
    expect(result.lon).toBeCloseTo(-79.288688, 3);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to GeoGratis when ODA circuit breaker is open', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => null),
          all: vi.fn(async () => ({ results: [] })),
        })),
      })),
    } as unknown as D1Database;

    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('geolocator.api.geo.ca') || String(url).includes('geogratis')) {
        return new Response(
          JSON.stringify([
            {
              geometry: { type: 'Point', coordinates: [-79.264, 43.709] },
              qualifier: 'GEOMETRIC_CENTER',
              score: 0.9,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as typeof fetch;

    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_DB: db,
      ODA_GEOCODING_ENABLED: 'true',
      ODA_PROVINCES: 'ON,QC',
      GEOCODING_CACHE: nullKv(),
    };

    const circuitBreaker = {
      execute: vi.fn(async (_key: string, _fn: () => Promise<unknown>) => {
        throw new CircuitBreakerOpenError('geocoding:oda');
      }),
    };

    const result = await geocodeIfNeeded(
      env,
      { address: '901-560 Birchmount Rd', city: 'Toronto', state: 'ON' },
      { circuitBreaker }
    );

    expect(result.lon).toBeCloseTo(-79.264, 3);
    expect(result.lat).toBeCloseTo(43.709, 3);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.execute).toHaveBeenCalledWith(
      'geocoding:oda',
      expect.any(Function),
      expect.objectContaining({ shouldCountFailure: expect.any(Function) })
    );
  });
});

describe('stageLimit budget', () => {
  it('caps at the configured stage ceiling when budget remains', () => {
    const now = Date.now();
    expect(stageLimit(10000, now, 3000)).toBe(3000);
    expect(stageLimit(10000, now, 5000)).toBe(5000);
  });

  it('shrinks to the remaining budget below the stage ceiling', () => {
    const start = Date.now() - 8000;
    // ~2000ms left: below the 3000ms ceiling but above the 500ms floor.
    const limit = stageLimit(10000, start, 3000);
    expect(limit).toBeGreaterThan(500);
    expect(limit).toBeLessThan(3000);
  });

  it('floors at 500ms even when the budget is exhausted', () => {
    expect(stageLimit(10000, Date.now() - 60000, 5000)).toBe(500);
  });
});

describe('stage cache ownership', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('keeps one provider-scoped key per stage (ODA miss writes GeoGratis only)', async () => {
    const reads: string[] = [];
    const writes: string[] = [];
    const kv = {
      get: async (key: string) => {
        reads.push(key);
        return null;
      },
      put: async (key: string) => {
        writes.push(key);
      },
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
    } as unknown as KVNamespace;

    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('geolocator.api.geo.ca')) {
        return new Response(
          JSON.stringify([
            {
              geometry: { type: 'Point', coordinates: [-79.3124, 43.6891] },
              qualifier: 'GEOMETRIC_CENTER',
              score: 0.9,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as typeof fetch;

    const qp: QueryParams = { address: '757 Victoria Park', city: 'Toronto', state: 'ON' };
    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_DB: missOdaDb(),
      ODA_GEOCODING_ENABLED: 'true',
      ODA_PROVINCES: 'ON,QC',
      GEOCODING_CACHE: kv,
    };

    await geocodeIfNeeded(env, qp);

    const odaKey = generateGeocodingCacheKey(qp, 'oda');
    const geogratisKey = generateGeocodingCacheKey(qp, 'geogratis');
    expect(reads).toContain(odaKey);
    expect(reads).toContain(geogratisKey);
    // Only the winning stage writes, and it writes under its own provider key.
    expect(writes).toEqual([geogratisKey]);
  });

  it('names the external stage cache by the configured provider', async () => {
    const reads: string[] = [];
    const writes: string[] = [];
    const kv = {
      get: async (key: string) => {
        reads.push(key);
        return null;
      },
      put: async (key: string) => {
        writes.push(key);
      },
      delete: async () => {},
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
    } as unknown as KVNamespace;

    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.includes('geolocator.api.geo.ca')) {
        // GeoGratis returns nothing -> the external stage owns the resolution.
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (target.includes('nominatim.openstreetmap.org')) {
        return new Response(JSON.stringify([{ lat: '43.7', lon: '-79.3' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;

    const qp: QueryParams = { address: '757 Victoria Park', city: 'Toronto', state: 'ON' };
    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_GEOCODING_ENABLED: 'false',
      GEOCODING_CACHE: kv,
    };

    await geocodeIfNeeded(env, qp);

    const geogratisKey = generateGeocodingCacheKey(qp, 'geogratis');
    const nominatimKey = generateGeocodingCacheKey(qp, 'nominatim');
    expect(reads).toContain(geogratisKey);
    expect(reads).toContain(nominatimKey);
    expect(writes).toEqual([nominatimKey]);
  });
});

describe('cascade miss/throw semantics', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('the external cascade is terminal when its circuit breaker is open', async () => {
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      if (String(url).includes('geolocator.api.geo.ca')) {
        // GeoGratis misses so the external cascade is the one that runs.
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as typeof fetch;

    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_GEOCODING_ENABLED: 'false',
      GEOCODING_CACHE: nullKv(),
    };
    const circuitBreaker = {
      execute: vi.fn(async () => {
        throw new CircuitBreakerOpenError('geocoding:nominatim');
      }),
    };

    await expect(
      geocodeIfNeeded(env, { address: '1 Main St' }, { circuitBreaker })
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });

  it('postal-centroid-only is terminal through the whole cascade', async () => {
    const env: Env = {
      RIDINGS: {} as R2Bucket,
      ODA_DB: missOdaDb(),
      ODA_GEOCODING_ENABLED: 'true',
      ODA_PROVINCES: 'ON,QC',
      GEOCODING_CACHE: nullKv(),
    };

    await expect(
      geocodeIfNeeded(env, { postal: 'M5V2T6', state: 'ON', geocodeMethod: 'postal_centroid' })
    ).rejects.toBeInstanceOf(OdaGeocodeError);
  });
});

// ---------------------------------------------------------------------------
// GeocoderProvider contract suite
//
// One fixture set, run against every adapter, plus a stub provider registered at
// runtime and exercised through the real fallback chain.
// ---------------------------------------------------------------------------

type ProviderFixture = {
  name: string;
  provider: GeocoderProvider;
  env: Env;
  response: unknown;
  emptyResponse: unknown;
  expected: { lon: number; lat: number; normalizedAddress?: string };
};

const CONTRACT_QUERY: QueryParams = { address: '123 Main St', city: 'Ottawa', state: 'ON', country: 'CA' };

function providerFixtures(): ProviderFixture[] {
  return [
    {
      name: 'google',
      provider: getGeocoderProvider('google')!,
      env: { RIDINGS: {} as R2Bucket, GOOGLE_MAPS_KEY: 'test-key' } as Env,
      response: {
        status: 'OK',
        results: [
          {
            geometry: { location: { lat: 45.4215, lng: -75.6972 } },
            formatted_address: '123 Main St, Ottawa, Ontario, Canada',
            address_components: [
              { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] },
              { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1'] },
            ],
          },
        ],
      },
      emptyResponse: { status: 'ZERO_RESULTS', results: [] },
      expected: {
        lon: -75.6972,
        lat: 45.4215,
        normalizedAddress: '123 Main St, Ottawa, Ontario, Canada',
      },
    },
    {
      name: 'nominatim',
      provider: getGeocoderProvider('nominatim')!,
      env: { RIDINGS: {} as R2Bucket } as Env,
      response: [{ lat: '45.4215', lon: '-75.6972', display_name: '123 Main St, Ottawa' }],
      emptyResponse: [],
      expected: { lon: -75.6972, lat: 45.4215 },
    },
    {
      name: 'mapbox',
      provider: getGeocoderProvider('mapbox')!,
      env: { RIDINGS: {} as R2Bucket, MAPBOX_TOKEN: 'test-token' } as Env,
      response: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', center: [-75.6972, 45.4215], place_name: '123 Main St, Ottawa' }],
      },
      emptyResponse: { type: 'FeatureCollection', features: [] },
      expected: { lon: -75.6972, lat: 45.4215 },
    },
    {
      name: 'geogratis',
      provider: getGeocoderProvider('geogratis')!,
      env: { RIDINGS: {} as R2Bucket } as Env,
      response: [
        {
          title: '123 Main St, Ottawa, Ontario',
          qualifier: 'GEOMETRIC_CENTER',
          score: 0.9,
          geometry: { type: 'Point', coordinates: [-75.6972, 45.4215] },
        },
      ],
      emptyResponse: [],
      expected: { lon: -75.6972, lat: 45.4215 },
    },
  ];
}

describe('GeocoderProvider contract', () => {
  const originalFetch = globalThis.fetch;
  const input = (env: Env): GeocoderProviderInput => ({
    env,
    qp: CONTRACT_QUERY,
    query: '123 Main St',
    timeoutMs: 2000,
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  for (const fixture of providerFixtures()) {
    describe(fixture.name, () => {
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      it('resolves a canonical response to a typed candidate', async () => {
        globalThis.fetch = vi.fn(async () => json(fixture.response)) as typeof fetch;
        const candidates = await fixture.provider.geocode(input(fixture.env));
        expect(candidates).toHaveLength(1);
        expect(candidates[0].lon).toBeCloseTo(fixture.expected.lon, 3);
        expect(candidates[0].lat).toBeCloseTo(fixture.expected.lat, 3);
        if (fixture.expected.normalizedAddress) {
          expect(candidates[0].normalizedAddress).toBe(fixture.expected.normalizedAddress);
        }
      });

      it('fails unavailable on a non-OK status', async () => {
        globalThis.fetch = vi.fn(async () => new Response('down', { status: 503 })) as typeof fetch;
        await expect(fixture.provider.geocode(input(fixture.env))).rejects.toBeInstanceOf(
          ProviderUnavailableError
        );
      });

      it('fails with NoResultsError on an empty result set', async () => {
        globalThis.fetch = vi.fn(async () => json(fixture.emptyResponse)) as typeof fetch;
        await expect(fixture.provider.geocode(input(fixture.env))).rejects.toBeInstanceOf(
          NoResultsError
        );
      });
    });
  }
});

describe('GeocoderProvider registry and chain', () => {
  const chainInput: GeocoderProviderInput = {
    env: { RIDINGS: {} as R2Bucket } as Env,
    qp: { address: '1 Main St' },
    query: '1 Main St',
    timeoutMs: 2000,
  };

  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('derives fallback order from data', () => {
    expect(buildExternalProviderChain({ GEOCODER: 'google' } as Env).map((p) => p.name)).toEqual([
      'google',
      'nominatim',
    ]);
    expect(buildExternalProviderChain({ GEOCODER: 'mapbox' } as Env).map((p) => p.name)).toEqual([
      'mapbox',
    ]);
    expect(buildExternalProviderChain({} as Env).map((p) => p.name)).toEqual(['nominatim']);
  });

  it('falls through NoResultsError but stops at ProviderUnavailableError', async () => {
    const miss: GeocoderProvider = {
      name: 'miss',
      geocode: async () => {
        throw new NoResultsError('miss', 'none');
      },
    };
    const down: GeocoderProvider = {
      name: 'down',
      geocode: async () => {
        throw new ProviderUnavailableError('down', 'down');
      },
    };
    const hit: GeocoderProvider = {
      name: 'hit',
      geocode: async () => [{ lon: 5, lat: 6 }],
    };

    await expect(runProviderChain([miss, hit], chainInput)).resolves.toEqual([{ lon: 5, lat: 6 }]);
    await expect(runProviderChain([down, hit], chainInput)).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
  });

  it('treats an empty candidate array as a miss, with a clear no-results error', async () => {
    const empty: GeocoderProvider = {
      name: 'empty',
      geocode: async () => [],
    };

    await expect(runProviderChain([empty], chainInput)).rejects.toBeInstanceOf(NoResultsError);
  });

  it('registers a stub provider and exercises it through the real cascade', async () => {
    const stub: GeocoderProvider = {
      name: 'stub-contract',
      geocode: vi.fn(async () => [{ lon: -1, lat: 2 }]),
    };
    registerGeocoderProvider(stub);
    try {
      globalThis.fetch = vi.fn(async (url: string | URL) => {
        if (String(url).includes('geolocator.api.geo.ca')) {
          // GeoGratis misses so the registered stub heads the external cascade.
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected fetch: ${String(url)}`);
      }) as typeof fetch;

      const env: Env = {
        RIDINGS: {} as R2Bucket,
        GEOCODER: 'stub-contract',
        GEOCODING_CACHE: nullKv(),
      };
      const result = await geocodeIfNeeded(env, { address: '1 St' });
      expect(result).toEqual({ lon: -1, lat: 2 });
      expect(stub.geocode).toHaveBeenCalledTimes(1);
    } finally {
      unregisterGeocoderProvider('stub-contract');
    }
  });

  it('google adapter does not call Nominatim itself', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    await expect(
      getGeocoderProvider('google')!.geocode({
        env: { RIDINGS: {} as R2Bucket, GOOGLE_MAPS_KEY: 'k' } as Env,
        qp: { address: '757 Victoria Park', city: 'Toronto', state: 'ON' },
        query: '757 Victoria Park',
        timeoutMs: 2000,
      })
    ).rejects.toBeInstanceOf(NoResultsError);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('maps.googleapis.com');
    expect(urls.some((u) => u.includes('nominatim'))).toBe(false);
  });

  it('merges Google → Nominatim as chain data (google miss, nominatim hit)', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const target = String(url);
      urls.push(target);
      if (target.includes('geolocator.api.geo.ca')) {
        // GeoGratis misses so the external chain owns the resolution.
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (target.includes('maps.googleapis.com')) {
        return new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (target.includes('nominatim.openstreetmap.org')) {
        return new Response(JSON.stringify([{ lat: '43.7', lon: '-79.3' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;

    const env: Env = {
      RIDINGS: {} as R2Bucket,
      GEOCODER: 'google',
      GOOGLE_MAPS_KEY: 'k',
      GEOCODING_CACHE: nullKv(),
    };

    const result = await geocodeIfNeeded(env, {
      address: '757 Victoria Park',
      city: 'Toronto',
      state: 'ON',
    });

    expect(result.lon).toBeCloseTo(-79.3, 3);
    expect(result.lat).toBeCloseTo(43.7, 3);

    const externalUrls = urls.filter((u) => !u.includes('geolocator'));
    expect(externalUrls).toHaveLength(2);
    expect(externalUrls[0]).toContain('maps.googleapis.com');
    expect(externalUrls[1]).toContain('nominatim.openstreetmap.org');
  });
});

describe('external provider cache consistency', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('a cache hit returns the same full shape as a fresh lookup', async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (key: string, type?: string) => {
        const raw = store.get(key);
        if (raw === undefined) return null;
        return type === 'json' ? JSON.parse(raw) : raw;
      },
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
    } as unknown as KVNamespace;

    const jsonResponse = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const googleBody = {
      status: 'OK',
      results: [
        {
          geometry: { location: { lat: 45.4215, lng: -75.6972 } },
          formatted_address: '123 Main St, Ottawa, Ontario, Canada',
          address_components: [
            { long_name: 'Ottawa', short_name: 'Ottawa', types: ['locality'] },
            { long_name: 'Ontario', short_name: 'ON', types: ['administrative_area_level_1'] },
          ],
        },
      ],
    };

    const env: Env = {
      RIDINGS: {} as R2Bucket,
      GEOCODER: 'google',
      GOOGLE_MAPS_KEY: 'k',
      GEOCODING_CACHE: kv,
    };
    const qp: QueryParams = { address: '123 Main St', city: 'Ottawa', state: 'ON' };

    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.includes('geolocator.api.geo.ca')) return jsonResponse([]);
      if (target.includes('maps.googleapis.com')) return jsonResponse(googleBody);
      throw new Error(`Unexpected fetch: ${target}`);
    }) as typeof fetch;
    const fresh = await geocodeIfNeeded(env, qp);

    expect(fresh.normalizedAddress).toBe('123 Main St, Ottawa, Ontario, Canada');
    expect(fresh.addressComponents?.locality).toBe('Ottawa');

    // Second run: Google is off the network entirely; only the cache can answer.
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.includes('geolocator.api.geo.ca')) return jsonResponse([]);
      throw new Error(`Google must not be called on a cache hit: ${target}`);
    }) as typeof fetch;
    const cached = await geocodeIfNeeded(env, qp);

    expect(cached).toEqual(fresh);
  });
});
