import { describe, it, expect } from 'vitest';
import { handleLookupRequest } from '../src/lookup-handler';
import { createRouteContext, type RouteContext } from '../src/route-context';
import { isLookupPath, pickDataset, checkDatasetsFromSource } from '../src/datasets';
import { GEO_DATASETS, getAllGeoPaths, getGeoDatasetByCode, getGeoDatasetByPath } from '../src/geo-datasets';
import { inMemoryDatasetSource } from '../src/dataset-source';
import { createOpenAPISpec } from '../src/docs';
import { ROUTES } from '../src/routes';
import { Env } from '../src/types';

function mockR2(present: Set<string>): Env['RIDINGS'] {
  return {
    head: async (key: string) => (present.has(key) ? ({} as R2Object) : null),
    get: async (key: string) => (present.has(key) ? ({} as R2Object) : null),
    put: async () => ({} as R2Object),
    delete: async () => {},
    list: async () => ({ objects: [], truncated: false, delimitedPrefixes: [] }),
  } as unknown as R2Bucket;
}

function makeContext(env: Env, request: Request): RouteContext {
  return createRouteContext({
    request,
    env,
    ctx: {
      waitUntil: () => {},
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext,
    correlationId: 'corr',
    startTime: Date.now(),
  });
}

describe('geo route registration', () => {
  it('accepts every geo path as a lookup path', () => {
    for (const path of getAllGeoPaths()) {
      expect(isLookupPath(path), path).toBe(true);
    }
  });

  it('resolves every geo path to its own dataset', () => {
    for (const dataset of GEO_DATASETS) {
      expect(pickDataset(dataset.path).r2Key, dataset.path).toBe(dataset.r2Key);
    }
  });

  it('does not disturb the riding routes', () => {
    expect(pickDataset('/api/federal').r2Key).toBe('federalridings-2024.geojson');
    expect(pickDataset('/api/on').r2Key).toBe('ontarioridings-2022.geojson');
    expect(pickDataset('/api/combined').r2Key).toBe('federalridings-2024.geojson');
  });

  it('finds a dataset by path and by code', () => {
    expect(getGeoDatasetByPath('/api/csd')?.code).toBe('csd');
    expect(getGeoDatasetByCode('csd')?.path).toBe('/api/csd');
    expect(getGeoDatasetByCode('MUNICIPALITY')?.path).toBe('/api/csd');
    expect(getGeoDatasetByCode('nope')).toBeUndefined();
  });
});

describe('geo dataset availability', () => {
  it('reports a registered but unacquired dataset as unavailable rather than failing', async () => {
    const env = { RIDINGS: mockR2(new Set()) } as Env;
    const request = new Request('https://x.test/api/csd?lat=45.42&lon=-75.69');
    const response = await handleLookupRequest(makeContext(env, request));

    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string; error: string };
    expect(body.code).toBe('DATASET_UNAVAILABLE');
    expect(body.error).toContain('census-subdivisions-2016.geojson');
  });

  it('rejects a dataset pin that does not match the level’s vintage', async () => {
    const env = { RIDINGS: mockR2(new Set()) } as Env;
    const request = new Request('https://x.test/api/pd?lat=45.42&lon=-75.69&dataset=2019');
    const response = await handleLookupRequest(makeContext(env, request));

    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string; error: string };
    expect(body.code).toBe('DATASET_UNAVAILABLE');
    // The pin is rejected by the guard, not by the missing R2 object: the message names
    // the pin, not the dataset key.
    expect(body.error).toContain('2019');
    expect(body.error).not.toContain('federal-polling-divisions-2025.geojson');
  });

  it('accepts a pin that matches the level’s vintage', async () => {
    const env = { RIDINGS: mockR2(new Set()) } as Env;
    const request = new Request('https://x.test/api/pd?lat=45.42&lon=-75.69&dataset=2025');
    const response = await handleLookupRequest(makeContext(env, request));

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    // The pin passed, so the failure is now the absent dataset.
    expect(body.error).toContain('federal-polling-divisions-2025.geojson');
  });

  it('includes the geo datasets in the health check without making them required', async () => {
    const source = inMemoryDatasetSource({});
    const datasets = await checkDatasetsFromSource(source);
    const geo = datasets.filter((d) => d.route.startsWith('/api/') && GEO_DATASETS.some((g) => g.path === d.route));
    expect(geo).toHaveLength(GEO_DATASETS.length);
    expect(geo.every((d) => d.status === 'registered' || d.status === 'live')).toBe(true);
  });
});

describe('geo endpoints in the public surface', () => {
  it('serves every geo path from the route table', () => {
    const lookupEntry = ROUTES.find((entry) => Array.isArray(entry.path) && entry.path.includes('/api/csd'));
    expect(lookupEntry).toBeDefined();
    expect(lookupEntry?.visibility).toBe('public');
    for (const path of getAllGeoPaths()) {
      expect(ROUTES.some((entry) => Array.isArray(entry.path) && entry.path.includes(path)), path).toBe(true);
    }
  });

  it('documents every geo path in the OpenAPI spec', () => {
    const spec = createOpenAPISpec('https://lookup.test');
    const paths = spec.paths as Record<string, unknown>;
    for (const path of getAllGeoPaths()) {
      expect(paths[path], path).toBeDefined();
    }
  });

  it('documents the geo paths under their own tag', () => {
    const spec = createOpenAPISpec('https://lookup.test');
    const paths = spec.paths as unknown as Record<string, { get: { tags: string[] } }>;
    for (const path of getAllGeoPaths()) {
      expect(paths[path].get.tags, path).toContain('Municipal & Sub-Municipal');
    }
  });
});
