import type { Env, GeoJSONFeature, GeoJSONFeatureCollection } from '../../src/types';

/** Point inside the Toronto fixture polygon. */
export const TORONTO_LAT = 43.642;
export const TORONTO_LON = -79.398;

/** Geocoded point for 757 Victoria Park Ave (NRCan geolocator, production). */
export const VICTORIA_PARK_LAT = 43.692101;
export const VICTORIA_PARK_LON = -79.288688;

const TORONTO_POLYGON: number[][][] = [
  [
    [-79.5, 43.5],
    [-79.2, 43.5],
    [-79.2, 43.8],
    [-79.5, 43.8],
    [-79.5, 43.5],
  ],
];

function feature(polygon: number[][][], properties: Record<string, unknown>): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: polygon },
    properties,
  };
}

function featureAt(properties: Record<string, unknown>): GeoJSONFeature {
  return feature(TORONTO_POLYGON, properties);
}

export function buildLookupTestGeoJson(): Record<string, GeoJSONFeatureCollection> {
  return {
    'federalridings-2024.geojson': {
      type: 'FeatureCollection',
      features: [
        featureAt({
          FED_NUM: 35100,
          ED_NAMEE: 'Spadina—Harbourfront',
          PROV_CODE: 'ON',
        }),
      ],
    },
    'ontarioridings-2022.geojson': {
      type: 'FeatureCollection',
      features: [
        featureAt({
          PR_NUM: '082',
          ENGLISH_NA: 'Toronto Centre',
        }),
      ],
    },
    'quebecridings-2025.geojson': {
      type: 'FeatureCollection',
      features: [
        featureAt({
          PR_NUM: '040',
          ENGLISH_NA: 'Laurier—Sainte-Marie',
        }),
      ],
    },
  };
}

/** Polygon containing the geocoded Victoria Park Ave point. */
const VICTORIA_PARK_POLYGON: number[][][] = [
  [
    [-79.295, 43.685],
    [-79.28, 43.685],
    [-79.28, 43.698],
    [-79.295, 43.698],
    [-79.295, 43.685],
  ],
];

const BEACHES_EAST_YORK_DECOY_POLYGON: number[][][] = [
  [
    [-79.28, 43.67],
    [-79.25, 43.67],
    [-79.25, 43.70],
    [-79.28, 43.70],
    [-79.28, 43.67],
  ],
];

export function buildVictoriaParkGeoJson(): Record<string, GeoJSONFeatureCollection> {
  return {
    'federalridings-2024.geojson': {
      type: 'FeatureCollection',
      features: [
        feature(VICTORIA_PARK_POLYGON, {
          FED_NUM: 35082,
          ED_NAMEE: 'Scarborough Southwest',
          PROV_CODE: 'ON',
        }),
      ],
    },
    'ontarioridings-2022.geojson': {
      type: 'FeatureCollection',
      features: [
        feature(VICTORIA_PARK_POLYGON, {
          PR_NUM: '086',
          ENGLISH_NA: 'Scarborough Southwest',
        }),
        feature(BEACHES_EAST_YORK_DECOY_POLYGON, {
          PR_NUM: '020',
          ENGLISH_NA: 'Beaches—East York',
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
