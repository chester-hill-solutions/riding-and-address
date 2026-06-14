import type { Env, GeoJSONFeature, GeoJSONFeatureCollection } from '../../src/types';

/** Point inside the Toronto fixture polygon. */
export const TORONTO_LAT = 43.642;
export const TORONTO_LON = -79.398;

const TORONTO_POLYGON: number[][][] = [
  [
    [-79.5, 43.5],
    [-79.2, 43.5],
    [-79.2, 43.8],
    [-79.5, 43.8],
    [-79.5, 43.5],
  ],
];

function feature(properties: Record<string, unknown>): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: TORONTO_POLYGON },
    properties,
  };
}

export function buildLookupTestGeoJson(): Record<string, GeoJSONFeatureCollection> {
  return {
    'federalridings-2024.geojson': {
      type: 'FeatureCollection',
      features: [
        feature({
          FED_NUM: 35100,
          ED_NAMEE: 'Spadina—Harbourfront',
          PROV_CODE: 'ON',
        }),
      ],
    },
    'ontarioridings-2022.geojson': {
      type: 'FeatureCollection',
      features: [
        feature({
          PR_NUM: '082',
          ENGLISH_NA: 'Toronto Centre',
        }),
      ],
    },
  };
}

function createMemoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream') => {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === 'json') return JSON.parse(value);
      return value;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
    getWithMetadata: async () => ({ value: null, metadata: null, cacheStatus: null }),
  } as KVNamespace;
}

export function createLookupTestEnv(
  geoJson = buildLookupTestGeoJson()
): Env {
  const r2Objects = Object.fromEntries(
    Object.entries(geoJson).map(([key, collection]) => [key, JSON.stringify(collection)])
  );

  return {
    RIDINGS: {
      get: async (key: string) => {
        const body = r2Objects[key];
        if (!body) return null;
        return {
          text: async () => body,
          json: async () => JSON.parse(body),
        } as R2ObjectBody;
      },
      head: async () => null,
      put: async () => ({} as R2Object),
      delete: async () => {},
      list: async () => ({ objects: [], truncated: false, delimitedPrefixes: [] }),
    } as R2Bucket,
    GEOCODING_CACHE: createMemoryKv(),
    LOOKUP_CACHE: createMemoryKv(),
    SPATIAL_DB_ENABLED: 'false',
    ODA_GEOCODING_ENABLED: 'false',
    RATE_LIMIT: 10_000,
  };
}

export async function fetchLookup(
  env: Env,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const worker = (await import('../../src/worker')).default;
  const url = path.startsWith('http') ? path : `https://lookup.test${path}`;
  return worker.fetch(new Request(url, init), env);
}
