import type { Env, GeoJSONFeature, GeoJSONFeatureCollection } from '../../src/types';
import { createMemoryKv } from './memory-kv';
import { fakeUsageNamespace } from './fake-usage-do';

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
    } as unknown as R2Bucket,
    GEOCODING_CACHE: createMemoryKv(),
    LOOKUP_CACHE: createMemoryKv(),
    SPATIAL_DB_ENABLED: 'false',
    ODA_GEOCODING_ENABLED: 'false',
    RATE_LIMIT: 10_000,
  };
}

/**
 * An environment with the bindings the credential and billing surfaces need.
 *
 * `createLookupTestEnv` binds the caches and R2, because that is what a *lookup* reads. The
 * projection surfaces — minting a key, reading a Customer's usage — read `API_KEYS` and the usage
 * Durable Object instead, so this binds those.
 *
 * It exists because the projection handlers were at 12% line coverage, and the reason was not that
 * they are hard to reach: it was that no environment bound what they read.
 */
export function createProjectionTestEnv(): Env {
  const env = createLookupTestEnv();
  env.API_KEYS = createMemoryKv();
  env.API_KEY_USAGE = fakeUsageNamespace();
  env.FREE_MONTHLY_ALLOWANCE = '1000';
  return env;
}

export async function fetchLookup(
  env: Env,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const worker = (await import('../../src/worker')).default;
  const url = path.startsWith('http') ? path : `https://lookup.test${path}`;
  const mockCtx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  return worker.fetch(new Request(url, init), env, mockCtx);
}
